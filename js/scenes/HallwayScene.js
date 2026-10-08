import { FRAME_W, WORLD_SCALE, VIEW_W, VIEW_H, HUD_H, MAX_AGE, TILE, KEYS, RUN_MULTIPLIER } from '../config.js';
import { Player } from '../render/Player.js';
import { Hud, drawActionPrompt, actionPromptBox } from '../render/Hud.js';
import {
  buildHallway,
  drawWorld,
  isSolid,
  findFacingInteractable,
} from '../render/World.js';
import { computeWorth, cloneState, findBankInsolvencyIndex } from '../finance/Engine.js';
import { projectJourney, isCurrentJourneyScenario, HALLWAY_PATHS } from '../finance/Journey.js';
import { ForecastClient } from '../finance/ForecastClient.js';
import { currentTimeline, getTimelineForecast, storeTimelineForecast, storeTimelineActualPath, timelineForecastOptions } from '../state/TimelineSystem.js';
import { currentNode, enterYearRoom, commitHallwayNode, returnToLeftDecisionRoom, completeJourney } from '../state/GameState.js';
import { autoSave } from '../state/SaveSystem.js';
import { log as debugLog, setHallwayStash } from '../debug/Logger.js';
import { virtualStick } from '../input/VirtualPad.js';
import { drawFutureSplash, SPLASH_FADE_MS } from '../render/FutureSplash.js';
import { financialEventMessages } from '../render/FinancialMessages.js';

const nowMs = () => globalThis.performance?.now?.() ?? Date.now();

export class HallwayScene {
  constructor({ forecast = new ForecastClient() } = {}) {
    this.forecast = forecast;
    this.ready = false;
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
    /** True while the full-screen "Generating Your Future" splash replaces the Hallway. */
    this.splashing = false;
    /** performance.now() when the splash began fading into the Hallway, else null. */
    this.splashFadeStart = null;
  }

  enter(game) {
    // A map visit requests a location, never a different portfolio baseline.
    // Consume immediately so a subsequent Decision Room cannot inherit it.
    this.mapJumpYear = game.timeline.mapJumpYear ?? null;
    delete game.timeline.mapJumpYear;
    this.mapJumpNotice = null;
    const node = currentNode(game);
    // Prefer committed end-of-room baseline; fall back to live portfolio
    this.baseline = node?.baseline
      ? node.baseline
      : node?.snapshotId
        ? game.timeline.snapshots[node.snapshotId]
        : cloneState(game.portfolio);
    this.baseline = cloneState(this.baseline || game.portfolio);

    // Display preferences follow the player while saved economic inputs remain immutable.
    const inflationAdjusted = game.settings?.inflationAdjusted ?? game.portfolio.inflationAdjusted;
    game.portfolio = cloneState(this.baseline);
    game.portfolio.inflationAdjusted = inflationAdjusted !== false;

    this.leaveYear = this.baseline.year;
    this.leaveAge = this.baseline.age;

    // The first east door is the year of the Decision Room just left, with no
    // time elapsed (door i = leave year + i ↔ snapshots[i]).
    const doorCount = Math.max(0, MAX_AGE - this.leaveAge); // ages leaveAge .. 99

    this.world = buildHallway(doorCount, this.leaveYear, this.leaveAge);
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
    game.scene = 'hallway';

    this.ready = false;
    this.snapshots = [{ state: cloneState(this.baseline), worth: computeWorth(this.baseline), events: [] }];
    this.visual = this.snapshots[0];
    this.eventAuras = [];
    this.eventBanner = null;
    this.glassWall = null;
    this._glassMsgQueued = false;
    this._glassDialogShowing = false;
    this._glassCanShow = true;
    this.setInputBlocked(true);
    this.splashing = false;
    this.splashFadeStart = null;
    const timeline = currentTimeline(game);
    this.forecastOptions = timelineForecastOptions(game);
    if (getTimelineForecast(game, timeline) && timeline.scenario) {
      this._installProjection(game, timeline.scenario);
    } else if (isCurrentJourneyScenario(timeline?.scenario)) {
      // Legacy saves can replay their chosen path, even without an old ensemble.
      this._installProjection(game, timeline.scenario);
    } else {
      this.forecast.request(this.baseline, HALLWAY_PATHS, null, { ...this.forecastOptions, force: true });
      if (this.forecast.result) this._installProjection(game, this.forecast.result.scenario, this.forecast.result);
      else autoSave(game, 'end');
    }
    // Saved path or cached forecast: straight into the Hallway, no splash.
    this.splashing = !this.ready;
  }

  _installProjection(game, scenario, result = null) {
    if (result) storeTimelineForecast(game, result);
    const timeline = currentTimeline(game);
    if (timeline && !timeline.scenario) timeline.scenario = cloneState(scenario);
    const savedPath = game.timeline.actualPaths?.[timeline?.actualPathId];
    this.snapshots = savedPath ? cloneState(savedPath) : projectJourney(this.baseline, scenario, { compact: true });
    if (!savedPath) {
      storeTimelineActualPath(game, this.snapshots);
      this.snapshots = cloneState(game.timeline.actualPaths[timeline.actualPathId]);
    }
    for (const snapshot of this.snapshots) {
      if (snapshot.statement) snapshot.state.lastStatement = snapshot.statement;
    }
    // Keep the scenario outside portfolio snapshots so rewinding cannot reroll the future.
    game.hallwayScenario = cloneState(scenario);
    this.eventAuras = buildEventAuras(this.world, this.snapshots, this.leaveYear);
    this.eventBanner = null;
    this.visual = this.snapshots[0];
    this.glassWall = buildGlassWall(this.world, this.snapshots);
    this._restoreMapPosition();
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
      scenario: game.hallwayScenario,
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
    this.ready = true;
    if (this.splashing) {
      this.splashing = false;
      this.splashFadeStart = nowMs();
    }
    this.setInputBlocked(false);
    autoSave(game, 'end');
  }

  leave() {
    this.player?.unbindInput();
    this.forecast.cancel();
  }

  _restoreMapPosition() {
    if (!Number.isFinite(this.mapJumpYear)) return;
    const requested = Math.max(0, Math.min(this.snapshots.length - 1, Math.round(this.mapJumpYear - this.leaveYear)));
    // Inspection may include an unfunded future, but a map jump must not bypass
    // the bill-funding barrier. The selected year remains selected in Charts.
    const lastSafe = this.glassWall ? Math.max(0, this.glassWall.yearIndex - 1) : this.snapshots.length - 1;
    const index = Math.min(requested, lastSafe);
    if (index > 0 && index < this.snapshots.length - 1) {
      // Door i is snapshots[i]; index 0 (the leave year) keeps the south spawn.
      const door = this.world.doors[index];
      if (door) this.player.y = door.y + (door.h - this.player.h) / 2;
    } else if (index === this.snapshots.length - 1) {
      const door = this.world.interactables.find(obj => obj.kind === 'end-door');
      if (door) this.player.y = door.y + door.h + 3;
    }
    this.player.facing = 'up';
    this.visual = this.snapshots[index];
    if (index !== requested) {
      this.mapJumpNotice = `Raise Cash in ${this.snapshots[index].state.year} first · selected future remains available in Charts`;
      this.eventBanner = this.mapJumpNotice;
    }
    this.mapJumpYear = null;
  }

  setInputBlocked(blocked) {
    if (!this.player) return;
    blocked = blocked || !this.ready;
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
    if (!this.ready) {
      if (this.forecast.result) this._installProjection(game, this.forecast.result.scenario, this.forecast.result);
      else { this.setInputBlocked(true); return; }
    }
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

    const idx = hallwaySnapshotIndex(this.world, this.player, this.snapshots.length);
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
    this.eventBanner = best ? [...best.messages, ...financialEventMessages(best.eventDetails, {
      ...game.portfolio, inflationAdjusted: game.settings?.inflationAdjusted ?? game.portfolio.inflationAdjusted,
    })].join(' · ') : this.animTime < 300 ? this.mapJumpNotice : null;
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
    await dialog.show(glassWallMessage(y - 1), { title: 'Funding shortfall' });
    this._glassDialogShowing = false;
    // Stay disarmed until player steps away from the wall (avoids instant re-fire)
    this._glassCanShow = false;
    this.player?.clearKeys();
    this.setInputBlocked(false);
  }

  stateAtDoor(yearIndex) {
    // yearIndex is years from the leave year (see World.buildHallway); 0 is the
    // first door, which opens on the Hallway's start state.
    const idx = Math.max(0, Math.min(this.snapshots.length - 1, yearIndex));
    return this.snapshots[idx];
  }

  async tryInteract(game, dialog) {
    if (!this.ready) {
      if (this.forecast.error) this.forecast.retry(this.baseline, HALLWAY_PATHS, null, this.forecastOptions);
      return null;
    }
    if (this._canInteractGlassWall()) {
      await this.showGlassWallMessage(dialog);
      return null;
    }
    const obj = findFacingInteractable(this.player, this.world, 22);
    if (!obj) return null;
    this.player?.clearKeys();
    this.setInputBlocked(true);

    if (obj.kind === 'year-door') {
      // The first door is this Hallway's own year: its full start state, with
      // nothing simulated. Later doors use the selected path's year snapshot.
      const sameYear = obj.yearIndex === 0;
      const snap = sameYear ? { state: this.baseline } : this.stateAtDoor(obj.yearIndex);
      const state = cloneState(snap.state);
      state.year = obj.year;
      state.age = obj.age;

      const ok = await dialog.confirm(
        `Enter Decision Room for ${obj.year} (age ${obj.age})?${sameYear ? ' No time passes.' : ''}\nKeep this timeline for comparison. Leaving this room north generates a new projection.`,
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
      return { goto: 'room', arrival: 'west-door' };
    }

    if (obj.kind === 'south-door') {
      // Going back erases this timeline (and the timelines branching from it)
      // and returns to the Decision Room it was opened from.
      const year = obj.year ?? this.leaveYear;
      const age = obj.age ?? this.leaveAge;
      const ok = await dialog.menu(
        southDoorMessage(game, year, age),
        [{ label: 'Yes', value: true }, { label: 'No', value: false }],
        { title: 'Are you sure?', selected: 1 }
      );
      if (!ok) {
        this.setInputBlocked(false);
        return null;
      }
      const erased = returnToLeftDecisionRoom(game);
      if (!erased) {
        await dialog.show('This Hallway could not be erased.', { title: 'Hallway of Time' });
        this.setInputBlocked(false);
        return null;
      }
      debugLog('south_door_erase', {
        year,
        age,
        timeline: erased.timelineNumber,
        reset: erased.reset,
        erased: erased.erasedTimelineIds,
        active: erased.activeTimelineId,
        cash: game.portfolio.cash,
        salary: game.portfolio.salary,
      });
      autoSave(game, 'begin');
      this.leave();
      return { goto: 'room', arrival: 'north-door', timelineErased: true };
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

  /** Splash opacity for the cross-fade into the Hallway; 0 once it is done. */
  splashAlpha(now = nowMs()) {
    if (this.splashing) return 1;
    if (this.splashFadeStart == null) return 0;
    const a = 1 - (now - this.splashFadeStart) / SPLASH_FADE_MS;
    if (a <= 0) { this.splashFadeStart = null; return 0; }
    return a;
  }

  _drawSplash(ctx, alpha) {
    drawFutureSplash(ctx, {
      progress: this.ready ? 1 : this.forecast.progress,
      paths: HALLWAY_PATHS,
      error: this.ready ? null : this.forecast.error,
      alpha,
      time: this.animTime / 60,
    });
  }

  render(ctx, game) {
    // Full-frame loading screen while the Monte Carlo journey is generated.
    if (!this.ready) {
      this._drawSplash(ctx, 1);
      return;
    }
    const rawCamX = Math.max(
      0,
      Math.min(this.world.width - VIEW_W, this.player.x + 6 - VIEW_W / 2)
    );
    const rawCamY = Math.max(
      0,
      Math.min(this.world.height - VIEW_H, this.player.y - VIEW_H / 2)
    );
    const camX = Math.round(rawCamX * WORLD_SCALE) / WORLD_SCALE;
    const camY = Math.round(rawCamY * WORLD_SCALE) / WORLD_SCALE;

    ctx.save();
    ctx.setTransform(WORLD_SCALE, 0, 0, WORLD_SCALE, 0, HUD_H);
    ctx.imageSmoothingEnabled = false;
    drawWorld(ctx, this.world, camX, camY, this.animTime);
    drawEventAuras(ctx, this.world, this.eventAuras, camX, camY, this.animTime);
    drawGlassWall(ctx, this.glassWall, camX, camY, this.animTime);
    ctx.save();
    ctx.translate(-camX, -camY);
    const vis = this.visual?.state || game.portfolio;
    this.player.draw(ctx, vis.hairColor, vis.hairLength, vis.age, vis.shirtColor);
    ctx.restore();
    ctx.restore();

    const portfolio = this.visual?.state || game.portfolio;
    const worth = this.visual?.worth || computeWorth(portfolio);
    this.hud.draw(ctx, { ...portfolio,
      inflationAdjusted: game.settings?.inflationAdjusted ?? game.portfolio.inflationAdjusted,
      dollarBaseYear: game.timeline.startYear,
    }, worth);

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

    const fade = this.splashAlpha();
    if (fade > 0) this._drawSplash(ctx, fade);
  }
}

/** Match the displayed financial year to the nearby labelled door. */
export function hallwaySnapshotIndex(world, player, snapshotCount) {
  const last = Math.max(0, snapshotCount - 1);
  if (!last) return 0;
  const center = player.y + player.h / 2;
  const firstDoor = world.doors?.[0];
  if (!firstDoor) return center <= (world.endPad || 7) * TILE ? last : 0;
  const firstCenter = firstDoor.y + firstDoor.h / 2;
  // Door i shows snapshots[i]; the south foyer below the first door is the leave year too.
  const index = Math.round((firstCenter - center) / ((world.segment || 5) * TILE));
  return Math.max(0, Math.min(last, index));
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
    else if (/ retired$/i.test(e)) out.push(e);
    else if (/goes to college/i.test(e)) out.push(e);
  }
  return out;
}

export function buildEventAuras(world, snapshots, leaveYear) {
  const auras = [];
  const foyer = world.foyer || 5;
  const segment = world.segment || 3;
  const rows = world.rows;
  const byYear = new Map();

  const addMsgs = (yearOffset, year, age, msgs, eventDetails = []) => {
    if (!msgs?.length && !eventDetails.length) return;
    const key = yearOffset;
    if (!byYear.has(key)) byYear.set(key, { year, age, messages: [], eventDetails: [] });
    const slot = byYear.get(key);
    for (const m of msgs) {
      if (!slot.messages.includes(m)) slot.messages.push(m);
    }
    slot.eventDetails.push(...eventDetails);
  };

  // Slot i sits at door i (the leave year + i), which shows snapshots[i].
  for (let k = 1; k < snapshots.length; k++) {
    const msgs = portalMessages(snapshots[k].events);
    const st = snapshots[k].state || {};
    addMsgs(k, st.year, st.age, msgs, snapshots[k].statement?.eventDetails || []);
  }

  // Named purchases recorded on the leave-year baseline
  const baseline = snapshots[0]?.state || {};
  for (const m of baseline.milestones || []) {
    const msg = m.message || m;
    const y = m.year ?? leaveYear;
    if (typeof msg !== 'string') continue;
    if (y === leaveYear) {
      // At the first (leave-year) door, just past the foyer
      addMsgs(0, leaveYear, baseline.age, portalMessages([msg]));
    } else if (y > leaveYear) {
      const offset = y - leaveYear;
      addMsgs(offset, y, (baseline.age || 0) + (y - leaveYear), portalMessages([msg]));
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
      eventDetails: slot.eventDetails,
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
 * South-door confirmation. Timeline 1 is reset rather than removed, so say what
 * actually disappears.
 */
export function southDoorMessage(game, year, age) {
  const record = currentTimeline(game);
  const tree = game.timeline || {};
  const branches = Object.values(tree.records || {}).some(r => r.parentTimelineId === record?.id);
  const what = record?.parentTimelineId
    ? `Timeline ${record.number}${branches ? ' and every timeline that branches from it' : ''}`
    : `this Hallway's future for Timeline ${record?.number ?? 1}${branches ? ' and every timeline that branches from it' : ''}`;
  return `Going back will erase ${what}. This cannot be undone.\n` +
    `You'll return to the Decision Room for ${year} (age ${age}) with your finances as you left it.`;
}

/**
 * Glass-wall dialog: only Cash pays bills, so the player must raise Cash by hand.
 * @param {number} shortfallYear calendar year whose bills Cash could not pay
 */
export function glassWallMessage(shortfallYear) {
  // Paragraphs only — Dialog wraps each paragraph at 40 chars, so no mid-sentence breaks here.
  return `Not enough Cash to pay ${shortfallYear}'s bills — enter a Decision Room to raise cash.\n` +
    `Use the ${shortfallYear} door or an earlier one: move Savings to Cash, withdraw from your ` +
    `401(k)/Roth, sell stock or a home, borrow, or cut spending.\n` +
    `Nothing is sold for you.`;
}

/**
 * Corridor-wide glass barrier past the last enterable year-door.
 *
 * CASH-ONLY FUNDING (do not regress):
 * 1) Every month, Cash alone pays the bills (after that month's pay, benefits and the
 *    player's standing withdrawal arrive). Nothing is sold, transferred or withdrawn for the
 *    player; any bill Cash cannot cover marks the year unfunded (planFailed).
 * 2) findBankInsolvencyIndex returns the first snapshot k whose year left a bill unpaid.
 *    snapshots[k] is Jan 1 of year Y, so the shortfall happened in Y-1.
 * 3) Door i ↔ snapshots[i] (yearIndex = i; door 0 is the leave year). The last enterable
 *    door is yearIndex k-1, i.e. Jan 1 of the shortfall year, where the player can still
 *    raise Cash. k >= 1, so the first (leave-year) door always stays usable.
 * The wall sits north of that door's collider (hallway gap), not overlapping it.
 */
function buildGlassWall(world, snapshots) {
  // First year with an unpaid bill (see comment above + projectOneYear).
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
  const iSafe = Math.max(0, k - 1); // door index for Jan 1 of the shortfall year
  const yTile = world.rows - 1 - foyer - iSafe * segment - 1;
  // North of last safe door (smaller y); clear of its 22px-tall collider
  const y = yTile * TILE - 10;
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
