import { FRAME_W, WORLD_SCALE, VIEW_W, VIEW_H, HUD_H, MAX_AGE, TILE, KEYS, RUN_MULTIPLIER } from '../config.js';
import { Player } from '../render/Player.js';
import { Hud, drawActionPrompt, actionPromptBox } from '../render/Hud.js';
import {
  buildHallway,
  drawWorld,
  isSolid,
  findFacingInteractable,
} from '../render/World.js';
import { projectYears, computeWorth, cloneState, findBankInsolvencyIndex } from '../finance/Engine.js';
import { currentNode, enterYearRoom, commitHallwayNode, returnToLeftDecisionRoom, completeJourney } from '../state/GameState.js';
import { autoSave } from '../state/SaveSystem.js';
import { log as debugLog, setHallwayStash } from '../debug/Logger.js';
import { virtualStick } from '../input/VirtualPad.js';

export class HallwayScene {
  constructor() {
    this.world = null;
    this.player = null;
    this.hud = new Hud();
    this.prompt = null;
    this.baseline = null;
    /** @type {Array<{state:object, worth:object, events?:string[]}>} */
    this.snapshots = [];
    /** @type {Array<{y:number, year:number, age:number, messages:string[]}>} */
    this.eventAuras = [];
    this.eventBanner = null;
    this.visual = null;
    this.animTime = 0;
    this.leaveYear = 0;
    this.leaveAge = 0;
    /** @type {{x:number,y:number,w:number,h:number,year:number,age:number,yearIndex:number}|null} */
    this.glassWall = null;
    this._glassMsgQueued = false;
    this._glassDialogShowing = false;
    /** After a bump dialog (or while still touching), require stepping away before re-show. */
    this._glassCanShow = true;
  }

  enter(game) {
    const node = currentNode(game);
    // Prefer committed end-of-room baseline; fall back to live portfolio
    this.baseline = node?.baseline
      ? node.baseline
      : node?.snapshotId
        ? game.timeline.snapshots[node.snapshotId]
        : cloneState(game.portfolio);
    if (!this.baseline) this.baseline = cloneState(game.portfolio);

    // Sync portfolio to baseline when entering hallway
    game.portfolio = cloneState(this.baseline);

    this.leaveYear = this.baseline.year;
    this.leaveAge = this.baseline.age;

    // Doors always start at last Decision Room year + 1
    const firstDoorYear = this.leaveYear + 1;
    const firstDoorAge = this.leaveAge + 1;
    const doorCount = Math.max(0, MAX_AGE - this.leaveAge - 1); // ages firstDoorAge .. 99

    this.world = buildHallway(doorCount, firstDoorYear, firstDoorAge);
    // Faster movement in hallway
    this.player = new Player(this.world.spawn.x, this.world.spawn.y, { speed: 2.4 });
    this.player.bindInput();
    this.prompt = null;
    this.animTime = 0;

    // Timeline node for pause-map jump-back (skip if already on this hallway node)
    const cur = currentNode(game);
    if (!(cur && cur.type === 'hallway' && cur.year === this.leaveYear && cur.age === this.leaveAge)) {
      commitHallwayNode(game);
    }

    // Deterministic projection — no noise so HUD doesn't jitter
    const yearsToProject = Math.max(0, MAX_AGE - this.leaveAge);
    this.snapshots = [
      { state: cloneState(this.baseline), worth: computeWorth(this.baseline), events: [] },
    ];
    if (yearsToProject > 0) {
      const snaps = projectYears(
        this.baseline,
        yearsToProject,
        game.portfolio.difficulty || this.baseline.difficulty,
        { deterministic: true }
      );
      for (const s of snaps) {
        this.snapshots.push({ state: s.state, worth: s.worth, events: s.events || [], statement: s.statement });
      }
    }
    this.eventAuras = buildEventAuras(this.world, this.snapshots, this.leaveYear);
    this.eventBanner = null;
    this.visual = this.snapshots[0];
    this.glassWall = buildGlassWall(this.world, this.snapshots);
    {
      const g = this.glassWall;
      const cashAtYears = this.snapshots.slice(0, 12).map((s, i) => ({
        i,
        year: s.state?.year,
        age: s.state?.age,
        cash: s.state?.cash,
        savings: s.state?.savings,
        stocks: s.state?.stocksTotal,
        salary: s.state?.salary,
        spending: s.state?.annualSpending,
      }));
      setHallwayStash({
        leaveYear: this.leaveYear,
        leaveAge: this.leaveAge,
        baseline: {
          cash: this.baseline?.cash,
          savings: this.baseline?.savings,
          stocks: this.baseline?.stocksTotal,
          salary: this.baseline?.salary,
          spending: this.baseline?.annualSpending,
          employed: this.baseline?.employed,
          retired: this.baseline?.retired,
        },
        glassYear: g?.year ?? null,
        glassYearIndex: g?.yearIndex ?? null,
        cashAtYears,
      });
    }

    this._glassMsgQueued = false;
    this._glassDialogShowing = false;
    this._glassCanShow = true;
    const gIdx = this.glassWall?.yearIndex ?? -1;
    debugLog('hallway_enter', {
      leaveYear: this.leaveYear,
      leaveAge: this.leaveAge,
      baselineCash: this.baseline?.cash ?? null,
      baselineSalary: this.baseline?.salary ?? null,
      baselineSpending: this.baseline?.annualSpending ?? null,
      snapshotCount: this.snapshots.length,
      glassYear: this.glassWall?.year ?? null,
      glassYearIndex: gIdx >= 0 ? gIdx : null,
      cashAtLastSafeDoor:
        gIdx >= 2
          ? this.snapshots[gIdx - 1]?.state?.cash ?? null
          : gIdx >= 1
            ? this.snapshots[0]?.state?.cash ?? null
            : null,
      cashAtInsolventYear: gIdx >= 1 ? this.snapshots[gIdx]?.state?.cash ?? null : null,
      cashAtYears: this.snapshots.slice(0, 8).map((s, i) => ({
        i,
        year: s.state?.year,
        cash: s.state?.cash,
        salary: s.state?.salary,
      })),
    });
    autoSave(game, 'end');
  }

  leave() {
    this.player?.unbindInput();
  }

  setInputBlocked(blocked) {
    if (!this.player) return;
    if (blocked) {
      if (this.player.inputEnabled) this.player.clearKeys();
      this.player.inputEnabled = false;
    } else {
      this.player.clearKeys();
      this.player.inputEnabled = true;
    }
  }

  update(game, dialog) {
    this.animTime += 1;
    const blocked = !!dialog?.active || this._glassDialogShowing;
    if (blocked) {
      this.setInputBlocked(true);
    } else {
      if (!this.player.inputEnabled) {
        this.player.clearKeys();
        this.player.inputEnabled = true;
      }
      this.player.update((x, y, w, h) => {
        if (isSolid(this.world, x, y, w, h)) return true;
        return hitsGlassWall(this.glassWall, x, y, w, h);
      });
      this.prompt = findFacingInteractable(this.player, this.world, 22);
      if (!this.prompt && this._canInteractGlassWall()) {
        this.prompt = { label: 'Glass wall', kind: 'glass-wall' };
      }
      this._detectGlassWallBump();
    }

    const progress = this.world.progressAtY(this.player.y);
    const maxIdx = this.snapshots.length - 1;
    const idx = Math.max(0, Math.min(maxIdx, Math.floor(progress * maxIdx)));
    this.visual = this.snapshots[idx];

    // Aura portal banner when player crosses an event band
    const py = this.player.y + this.player.h / 2;
    let best = null;
    let bestDist = 28;
    for (const aura of this.eventAuras) {
      const d = Math.abs(py - aura.y);
      if (d < bestDist) {
        bestDist = d;
        best = aura;
      }
    }
    this.eventBanner = best ? best.messages.join(' · ') : null;
  }

  /**
   * True when the player is trying to move north (keyboard/D-pad or joystick).
   * Joystick motion does not set ArrowUp in virtualKeys, so pressed(KEYS.up)
   * alone missed glass bumps after the on-screen stick replaced the walk D-pad.
   */
  _wantingNorth() {
    const p = this.player;
    if (p?.pressed(KEYS.up)) return true;
    // Match VirtualPad stick deadzone: only count a clear northward deflect.
    return virtualStick.y < -0.18;
  }

  /** Standing just south of the glass, overlapping its X span. */
  _abuttingGlassSouth() {
    const g = this.glassWall;
    const p = this.player;
    if (!g || !p) return false;
    const inX = p.x + p.w > g.x && p.x < g.x + g.w;
    return inX && p.y <= g.y + g.h + 6 && p.y + p.h >= g.y - 2;
  }

  /** Close enough and facing the barrier for A / confirm to open the description. */
  _canInteractGlassWall() {
    const g = this.glassWall;
    const p = this.player;
    if (!g || !p || this._glassDialogShowing) return false;
    const inX = p.x + p.w > g.x && p.x < g.x + g.w;
    const near = inX && p.y <= g.y + g.h + 28 && p.y + p.h >= g.y - 8;
    return near && p.facing === 'up';
  }

  /**
   * Queue funding-shortfall dialog when the player is blocked by the glass while
   * moving north (keys or stick). Debounce: re-arm only after stepping away (or
   * after dialog closes and the player leaves contact).
   */
  _detectGlassWallBump() {
    if (!this.glassWall || this._glassDialogShowing) return;
    const g = this.glassWall;
    const p = this.player;
    const wantingNorth = this._wantingNorth();
    // Corridor: smaller y = north. Player approaches from south; blocked when a
    // northward step would overlap the glass AABB.
    const step = Math.max((p.speed || 1) * (p.runHeld ? RUN_MULTIPLIER : 1), 1);
    const blockedByGlass =
      wantingNorth && hitsGlassWall(g, p.x, p.y - step, p.w, p.h);
    const abutSouth = this._abuttingGlassSouth();

    if (!abutSouth && !blockedByGlass) {
      this._glassCanShow = true;
      return;
    }
    if ((blockedByGlass || (abutSouth && wantingNorth)) && this._glassCanShow) {
      this._glassMsgQueued = true;
      this._glassCanShow = false;
    }
  }

  wantsGlassWallMessage() {
    return !!this._glassMsgQueued && !this._glassDialogShowing;
  }

  async showGlassWallMessage(dialog) {
    if (!this.glassWall) {
      this._glassMsgQueued = false;
      return;
    }
    this._glassMsgQueued = false;
    this._glassDialogShowing = true;
    this.player?.clearKeys();
    this.setInputBlocked(true);
    const y = this.glassWall.year;
    debugLog('glass_wall', {
      year: y,
      yearIndex: this.glassWall.yearIndex,
      age: this.glassWall.age,
    });
    await dialog.show(
      `The reference path cannot fund all required costs in ${y - 1}.\n` +
        `You cannot continue until you make a financial decision:\n` +
        `enter an earlier year’s Decision Room to change income, spending, assets or borrowing.`,
      { title: 'Funding shortfall' }
    );
    this._glassDialogShowing = false;
    // Stay disarmed until player steps away from the wall (avoids instant re-fire)
    this._glassCanShow = false;
    this.player?.clearKeys();
    this.setInputBlocked(false);
  }

  stateAtDoor(yearIndex) {
    // yearIndex is 1-based years from leave (see World.buildHallway)
    const idx = Math.max(0, Math.min(this.snapshots.length - 1, yearIndex));
    return this.snapshots[idx];
  }

  async tryInteract(game, dialog) {
    if (this._canInteractGlassWall()) {
      await this.showGlassWallMessage(dialog);
      return null;
    }
    const obj = findFacingInteractable(this.player, this.world, 22);
    if (!obj) return null;
    this.player?.clearKeys();
    this.setInputBlocked(true);

    if (obj.kind === 'year-door') {
      const snap = this.stateAtDoor(obj.yearIndex);
      const state = cloneState(snap.state);
      state.year = obj.year;
      state.age = obj.age;

      const ok = await dialog.confirm(
        `Enter Decision Room for ${obj.year} (age ${obj.age})?\nContinues the reference path; view uncertainty in Pause → Charts.`,
        { title: 'Year Door', yes: 'Enter', no: 'Stay' }
      );
      if (!ok) {
        this.setInputBlocked(false);
        return null;
      }
      debugLog('door_enter', {
        year: obj.year,
        age: obj.age,
        yearIndex: obj.yearIndex,
        cash: state.cash,
        salary: state.salary,
        spending: state.annualSpending,
      });
      enterYearRoom(game, state, this.snapshots.slice(1, obj.yearIndex + 1));
      autoSave(game, 'begin');
      this.leave();
      return { goto: 'room' };
    }

    if (obj.kind === 'south-door') {
      // Return to the Decision Room just left — leave baseline / current portfolio
      const year = obj.year ?? this.leaveYear;
      const age = obj.age ?? this.leaveAge;
      const ok = await dialog.confirm(
        `Return to Decision Room for ${year} (age ${age})?\nRestores your finances from when you left that room.`,
        { title: 'Decision Room', yes: 'Return', no: 'Stay' }
      );
      if (!ok) {
        this.setInputBlocked(false);
        return null;
      }
      const state = cloneState(this.baseline || game.portfolio);
      state.year = year;
      state.age = age;
      debugLog('south_door_return', {
        year,
        age,
        cash: state.cash,
        salary: state.salary,
      });
      // Same room again — not a year-door split, so no new begin node.
      returnToLeftDecisionRoom(game, state);
      autoSave(game, 'begin');
      this.leave();
      return { goto: 'room' };
    }

    if (obj.kind === 'end-door') {
      const ok = await dialog.confirm('Are you prepared to leave this world?', {
        title: 'End of the Line',
        yes: "I'm not afraid",
        no: 'Not yet',
      });
      if (!ok) {
        await dialog.show('The hallway waits.', { title: 'End of the Line' });
        this.setInputBlocked(false);
        return null;
      }
      completeJourney(game, this.snapshots.at(-1).state, this.snapshots.slice(1));
      autoSave(game, 'end');
      this.leave();
      return { goto: 'ending' };
    }

    this.setInputBlocked(false);
    return null;
  }

  render(ctx, game) {
    const camX = Math.max(
      0,
      Math.min(this.world.width - VIEW_W, this.player.x + 6 - VIEW_W / 2)
    );
    const camY = Math.max(
      0,
      Math.min(this.world.height - VIEW_H, this.player.y - VIEW_H / 2)
    );

    ctx.save();
    ctx.setTransform(WORLD_SCALE, 0, 0, WORLD_SCALE, 0, HUD_H);
    ctx.imageSmoothingEnabled = false;
    drawWorld(ctx, this.world, camX, camY, this.animTime);
    drawEventAuras(ctx, this.world, this.eventAuras, camX, camY, this.animTime);
    drawGlassWall(ctx, this.glassWall, camX, camY, this.animTime);
    ctx.save();
    ctx.translate(-camX, -camY);
    const vis = this.visual?.state || game.portfolio;
    this.player.draw(ctx, vis.hairColor, vis.hairLength, vis.age);
    ctx.restore();
    ctx.restore();

    const portfolio = this.visual?.state || game.portfolio;
    const worth = this.visual?.worth || computeWorth(portfolio);
    this.hud.draw(ctx, portfolio, worth);

    // Life-event banner (playfield bottom); prompt sits just below if both active
    if (this.eventBanner) {
      ctx.font = '18px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const promptTop = actionPromptBox().top;
      const by = this.prompt ? promptTop - 36 : HUD_H + VIEW_H * WORLD_SCALE - 40;
      let msg = this.eventBanner;
      while (msg.length > 1 && ctx.measureText(msg).width > FRAME_W - 80) msg = msg.slice(0, -1);
      const tw = ctx.measureText(msg).width;
      ctx.fillStyle = 'rgba(10,8,24,0.72)';
      ctx.fillRect(FRAME_W / 2 - tw / 2 - 16, by - 6, tw + 32, 28);
      ctx.fillStyle = '#e8d8ff';
      ctx.fillText(msg, FRAME_W / 2, by);
      ctx.textAlign = 'left';
    }

    if (this.prompt) {
      drawActionPrompt(ctx, this.prompt.label);
    }
  }
}

/** Major one-shot life/finance events → hallway aura portals. */
function portalMessages(events) {
  const out = [];
  for (const e of events || []) {
    if (/Mortgage paid off/i.test(e)) out.push(e.replace(/\.$/, ''));
    else if (/Loan paid off/i.test(e)) out.push(e.replace(/\.$/, ''));
    else if (/^Paid off:/i.test(e)) out.push(e.replace(/\.$/, ''));
    else if (/^Purchased /i.test(e)) out.push(e.replace(/\.$/, ''));
    else if (/^Retired/i.test(e)) out.push('Retired');
    else if (/goes to college/i.test(e)) out.push(e);
  }
  return out;
}

function buildEventAuras(world, snapshots, leaveYear) {
  const auras = [];
  const foyer = world.foyer || 5;
  const segment = world.segment || 3;
  const rows = world.rows;
  const byYear = new Map();

  const addMsgs = (yearOffset, year, age, msgs) => {
    if (!msgs?.length) return;
    const key = yearOffset;
    if (!byYear.has(key)) byYear.set(key, { year, age, messages: [] });
    const slot = byYear.get(key);
    for (const m of msgs) {
      if (!slot.messages.includes(m)) slot.messages.push(m);
    }
  };

  for (let k = 1; k < snapshots.length; k++) {
    const msgs = portalMessages(snapshots[k].events);
    const st = snapshots[k].state || {};
    addMsgs(k - 1, st.year, st.age, msgs);
  }

  // Named purchases recorded on the leave-year baseline
  const baseline = snapshots[0]?.state || {};
  for (const m of baseline.milestones || []) {
    const msg = m.message || m;
    const y = m.year ?? leaveYear;
    if (typeof msg !== 'string') continue;
    if (y === leaveYear) {
      // Just past the foyer — player sees it as they enter the corridor
      addMsgs(0, leaveYear, baseline.age, portalMessages([msg]));
    } else if (y > leaveYear) {
      const offset = y - leaveYear - 1;
      if (offset >= 0) addMsgs(offset, y, (baseline.age || 0) + (y - leaveYear), portalMessages([msg]));
    }
  }

  for (const [i, slot] of byYear.entries()) {
    const yTile = rows - 1 - foyer - i * segment - 1;
    const y = yTile * TILE + TILE / 2;
    auras.push({
      y,
      year: slot.year,
      age: slot.age,
      messages: slot.messages,
    });
  }
  return auras;
}

/**
 * Soft ethereal band across walkable floor + onto E/W wall faces.
 */
function drawEventAuras(ctx, world, auras, camX, camY, animTime) {
  if (!auras?.length) return;
  const walkLeft = world.walkLeft ?? 5;
  const walkRight = world.walkRight ?? 8;
  // Span deep into E/W walls so the portal reads as a slice through the corridor
  const x0 = walkLeft * TILE - 18;
  const x1 = (walkRight + 1) * TILE + 18;
  const w = x1 - x0;

  for (const aura of auras) {
    const sy = aura.y - camY;
    if (sy < -24 || sy > VIEW_H + 24) continue;
    const pulse = 0.55 + 0.35 * Math.sin(animTime / 12 + aura.y * 0.03);
    const sx = x0 - camX;

    // Soft bloom
    ctx.fillStyle = `rgba(160,100,255,${0.2 + pulse * 0.25})`;
    ctx.fillRect(sx, sy - 8, w, 17);
    // Violet outer band
    ctx.fillStyle = `rgba(140,90,255,${0.35 + pulse * 0.35})`;
    ctx.fillRect(sx, sy - 5, w, 11);
    // Cyan mid
    ctx.fillStyle = `rgba(80,220,255,${0.45 + pulse * 0.4})`;
    ctx.fillRect(sx, sy - 2, w, 5);
    // Hot white-gold core
    ctx.fillStyle = `rgba(255,245,200,${0.75 + pulse * 0.2})`;
    ctx.fillRect(sx, sy, w, 2);
    // Vertical wall streaks (west + east edges of band)
    const streakH = 14;
    ctx.fillStyle = `rgba(180,220,255,${0.35 + pulse * 0.3})`;
    ctx.fillRect(sx, sy - streakH / 2, 3, streakH);
    ctx.fillRect(sx + w - 3, sy - streakH / 2, 3, streakH);
  }
}


/**
 * Corridor-wide glass barrier past the last enterable year-door.
 *
 * SALARY-INCLUSIVE ORDER (do not regress):
 * 1) projectOneYear ages the year, then applies salary (+ SS) in cashflow, then
 *    writes Cash on the snapshot — salary is already in Cash before insolvency.
 * 2) findBankInsolvencyIndex tests those post-salary snapshots (Cash ≤ 0).
 * 3) This wall is placed from that index only — never on pre-salary cash.
 * Door = Jan 1; salary for that year is in the step that produces the door snapshot.
 *
 * Door i ↔ snapshots[i+1] (yearIndex = i+1). Last enterable door = yearIndex k-1;
 * wall sits north of that door's collider (hallway gap), not overlapping it.
 */
function buildGlassWall(world, snapshots) {
  // Insolvency index is salary-inclusive (see comment above + projectOneYear).
  const k = findBankInsolvencyIndex(snapshots);
  if (k < 1) return null;
  const foyer = world.foyer || 5;
  const segment = world.segment || 3;
  const walkLeft = world.walkLeft ?? 5;
  const walkRight = world.walkRight ?? 8;
  const st = snapshots[k].state || {};
  const cashInsolvent = st.cash ?? null;
  const cashSafe =
    k >= 2 ? snapshots[k - 1]?.state?.cash ?? null : snapshots[0]?.state?.cash ?? null;
  // Door collider: y ∈ [yTile*TILE, yTile*TILE+22] (see World.buildHallway)
  const iSafe = k - 2; // door index for last year with Cash > 0; -1 if none
  let y;
  if (iSafe >= 0) {
    const yTile = world.rows - 1 - foyer - iSafe * segment - 1;
    // North of last safe door (smaller y); clear of its 22px-tall collider
    y = yTile * TILE - 10;
  } else {
    // Even the first door is insolvent — block approach from the south
    const yTile0 = world.rows - 1 - foyer - 1;
    y = yTile0 * TILE + 24;
  }
  debugLog('glass_wall_place', {
    year: st.year,
    age: st.age,
    yearIndex: k,
    cashAtLastSafeDoor: cashSafe,
    cashAtInsolventYear: cashInsolvent,
    wallY: y,
  });
  return {
    x: walkLeft * TILE,
    y,
    w: (walkRight - walkLeft + 1) * TILE,
    h: 8,
    year: st.year,
    age: st.age,
    yearIndex: k,
  };
}

function hitsGlassWall(wall, x, y, w, h) {
  if (!wall) return false;
  return x < wall.x + wall.w && x + w > wall.x && y < wall.y + wall.h && y + h > wall.y;
}

/** Pixel-art friendly translucent cyan/blue barrier across the corridor. */
function drawGlassWall(ctx, wall, camX, camY, animTime) {
  if (!wall) return;
  const sx = wall.x - camX;
  const sy = wall.y - camY;
  if (sy < -20 || sy > VIEW_H + 20) return;
  const pulse = 0.55 + 0.25 * Math.sin((animTime || 0) / 10);

  // Soft outer glow
  ctx.fillStyle = `rgba(40,180,255,${0.12 + pulse * 0.1})`;
  ctx.fillRect(sx - 2, sy - 4, wall.w + 4, wall.h + 8);

  // Main glass slab (translucent cyan)
  ctx.fillStyle = `rgba(60,200,255,${0.28 + pulse * 0.18})`;
  ctx.fillRect(sx, sy, wall.w, wall.h);

  // Bright top edge
  ctx.fillStyle = `rgba(200,245,255,${0.55 + pulse * 0.25})`;
  ctx.fillRect(sx, sy, wall.w, 2);

  // Bright bottom edge
  ctx.fillStyle = `rgba(100,210,255,${0.4 + pulse * 0.2})`;
  ctx.fillRect(sx, sy + wall.h - 2, wall.w, 2);

  // Vertical shimmer stripes (pixel-art panes)
  ctx.fillStyle = `rgba(180,240,255,${0.2 + pulse * 0.15})`;
  for (let px = sx + 4; px < sx + wall.w - 2; px += 8) {
    ctx.fillRect(px, sy + 2, 2, wall.h - 4);
  }

  // Side pillars into walls
  ctx.fillStyle = `rgba(120,220,255,${0.45 + pulse * 0.2})`;
  ctx.fillRect(sx, sy - 6, 3, wall.h + 12);
  ctx.fillRect(sx + wall.w - 3, sy - 6, 3, wall.h + 12);
}
