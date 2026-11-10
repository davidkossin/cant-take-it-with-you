/**
 * Birthday Hallway replacement. Gated on flags.special === 'birthday'.
 * Fake Monte Carlo splash → glitch → "BIRTHDAY DETECTED" → hub with 3 doors
 * and puzzle rooms. Progress persists on game.flags.birthday.
 */
import { FRAME_W, FRAME_H, TILE, KEYS, HUD_H, WORLD_SCALE, VIEW_W, VIEW_H, PALETTE } from '../config.js';
import { Player } from '../render/Player.js';
import { Hud, drawActionPrompt } from '../render/Hud.js';
import { drawWorld, isSolid, findFacingInteractable } from '../render/World.js';
import { drawFutureSplash } from '../render/FutureSplash.js';
import {
  buildBirthdayHub, buildPuzzle1Room, buildPuzzle2Room, buildPuzzle3Room,
} from '../render/BirthdayWorlds.js';
import {
  ensureBirthdayProgress, birthdayCode, checkBirthdayCode,
  PUZZLE1, PUZZLE2, PUZZLE3, FINAL_CLUE,
} from '../data/birthday.js';
import { autoSave } from '../state/SaveSystem.js';
import { virtualStick } from '../input/VirtualPad.js';

const nowMs = () => globalThis.performance?.now?.() ?? Date.now();
const FONT = '"Press Start 2P", monospace';

/** Splash climbs to ~50% over this many ms, then glitches. */
const SPLASH_MS = 2800;
const GLITCH_MS = 1400;
const DETECTED_MS = 1600;

export class BirthdayScene {
  constructor() {
    this.phase = 'splash'; // splash | glitch1 | detected | glitch2 | hub | puzzle | keypad
    this.phaseStart = 0;
    this.world = null;
    this.player = null;
    this.hud = new Hud();
    this.prompt = null;
    this.animTime = 0;
    this.puzzleId = 0;
    /** @type {number[]} puzzle 1 pad sequence so far */
    this.padSeq = [];
    /** @type {number[]} puzzle 2 bowl states 0..3 */
    this.bowls = [0, 0, 0];
    /** @type {{id:string,x:number,y:number,w:number,h:number}[]} */
    this.gifts = [];
    this.keypadDoor = 0;
    this.keypadValue = '';
    this.keypadError = '';
    this.keypadFlash = 0;
    this._introDone = false;
    this.locked = false;
  }

  enter(game, { skipIntro = false } = {}) {
    ensureBirthdayProgress(game);
    this.animTime = 0;
    this.prompt = null;
    this.locked = false;
    this.keypadDoor = 0;
    this.keypadValue = '';
    this.keypadError = '';
    // Returning from a save mid-birthday, or back from Decision Room after intro.
    if (skipIntro || this._introDone || game.flags.birthday?.introDone) {
      this._introDone = true;
      game.flags.birthday.introDone = true;
      this._enterHub(game);
      return;
    }
    this.phase = 'splash';
    this.phaseStart = nowMs();
    this.world = null;
    this.player = null;
    game.scene = 'birthday';
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

  _progress(game) {
    return ensureBirthdayProgress(game);
  }

  _enterHub(game) {
    const b = this._progress(game);
    this.phase = 'hub';
    this.world = buildBirthdayHub({
      unlocked2: !!b.unlocked[2],
      unlocked3: !!b.unlocked[3],
    });
    this._spawnPlayer(this.world.spawn.x, this.world.spawn.y);
    this.puzzleId = 0;
    game.scene = 'birthday';
    autoSave(game, 'end');
  }

  _enterPuzzle(game, id) {
    this.puzzleId = id;
    this.phase = 'puzzle';
    if (id === 1) {
      this.world = buildPuzzle1Room();
      this.padSeq = [];
    } else if (id === 2) {
      this.world = buildPuzzle2Room();
      this.bowls = [0, 0, 0];
    } else {
      this.world = buildPuzzle3Room();
      this.gifts = (this.world.gifts || []).map((g) => ({ ...g }));
    }
    this._spawnPlayer(this.world.spawn.x, this.world.spawn.y);
    game.scene = 'birthday';
  }

  _spawnPlayer(x, y) {
    this.player?.unbindInput();
    this.player = new Player(x, y, { speed: 1.5 });
    this.player.bindInput();
    this.prompt = null;
  }

  // --- Intro phases --------------------------------------------------------

  _advanceIntro(game) {
    const t = nowMs() - this.phaseStart;
    if (this.phase === 'splash' && t >= SPLASH_MS) {
      this.phase = 'glitch1';
      this.phaseStart = nowMs();
    } else if (this.phase === 'glitch1' && t >= GLITCH_MS) {
      this.phase = 'detected';
      this.phaseStart = nowMs();
    } else if (this.phase === 'detected' && t >= DETECTED_MS) {
      this.phase = 'glitch2';
      this.phaseStart = nowMs();
    } else if (this.phase === 'glitch2' && t >= GLITCH_MS) {
      this._introDone = true;
      this._progress(game).introDone = true;
      this._enterHub(game);
    }
  }

  // --- Update --------------------------------------------------------------

  update(game, dialog) {
    this.animTime += 1;
    if (this.phase === 'splash' || this.phase === 'glitch1' || this.phase === 'detected' || this.phase === 'glitch2') {
      this._advanceIntro(game);
      return null;
    }
    if (this.phase === 'keypad') {
      this._updateKeypad(game);
      return null;
    }
    if (dialog?.active || this.locked) {
      this.setInputBlocked(true);
      return null;
    }
    if (!this.player) return null;
    if (!this.player.inputEnabled) {
      this.player.clearKeys();
      this.player.inputEnabled = true;
    }

    // Puzzle 3: tile-based crate pushes (one tile per bump).
    const giftBoxes = this.puzzleId === 3 ? this.gifts : [];

    this.player.update((x, y, w, h) => {
      if (isSolid(this.world, x, y, w, h)) return true;
      for (const g of giftBoxes) {
        if (overlaps(x, y, w, h, g.x, g.y, g.w, g.h)) {
          const dx = x - this.player.x;
          const dy = y - this.player.y;
          if (!this._tryPushGift(g, dx, dy, giftBoxes)) return true;
          this._checkPuzzle3Solve(game);
          return false;
        }
      }
      return false;
    });

    // Puzzle 1: standing on pads advances the sequence
    if (this.puzzleId === 1) this._pollPads(game);

    this.prompt = findFacingInteractable(this.player, this.world);
    // Walk-on pads should not steal the action prompt.
    if (this.prompt?.kind === 'pad') this.prompt = null;
    return null;
  }

  /** Push `gift` one tile if the bump is head-on and the destination is free. */
  _tryPushGift(gift, dx, dy, gifts) {
    let pdx = 0, pdy = 0;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) pdx = Math.sign(dx);
    else if (dy !== 0) pdy = Math.sign(dy);
    else return false;
    const destTx = gift.tx + pdx;
    const destTy = gift.ty + pdy;
    if (this._giftTileBlocked(destTx, destTy, gift, gifts)) return false;
    gift.tx = destTx;
    gift.ty = destTy;
    gift.x = destTx * TILE;
    gift.y = destTy * TILE;
    return true;
  }

  _giftTileBlocked(tx, ty, self, gifts) {
    if (!this.world) return true;
    if (ty < 0 || tx < 0 || ty >= this.world.rows || tx >= this.world.cols) return true;
    const t = this.world.map[ty][tx];
    if (t === 'wall' || t === 'wallPurple' || t === 'void') return true;
    if (this.world.noCrate && this.world.noCrate.has(`${tx},${ty}`)) return true;
    for (const g of gifts) {
      if (g !== self && g.tx === tx && g.ty === ty) return true;
    }
    return false;
  }

  _pollPads(game) {
    const feet = { x: this.player.x, y: this.player.y, w: this.player.w, h: this.player.h };
    for (const obj of this.world.interactables) {
      if (obj.kind !== 'pad') continue;
      if (!overlaps(feet.x, feet.y, feet.w, feet.h, obj.x, obj.y, obj.w, obj.h)) {
        obj._stood = false;
        continue;
      }
      if (obj._stood) continue;
      obj._stood = true;
      this.padSeq.push(obj.padId);
      if (this.padSeq.length > PUZZLE1.order.length) this.padSeq.shift();
      const ok = PUZZLE1.order.every((id, i) => this.padSeq[i] === id);
      if (ok && this.padSeq.length === PUZZLE1.order.length) {
        this._solvePuzzle(game, 1);
      }
    }
  }

  _checkPuzzle2Solve(game) {
    if (this.bowls.every((v, i) => v === PUZZLE2.solution[i])) this._solvePuzzle(game, 2);
  }

  _checkPuzzle3Solve(game) {
    const plates = this.world.interactables.filter((o) => o.kind === 'plate');
    if (plates.length < 3) return;
    const ok = plates.every((p) => {
      const g = this.gifts.find((box) => box.tx === p.tx && box.ty === p.ty);
      return g && g.id === p.needs;
    });
    if (ok) this._solvePuzzle(game, 3);
  }

  _solvePuzzle(game, id) {
    const b = this._progress(game);
    if (b.solved[id]) return;
    b.solved[id] = true;
    if (id === 1) b.unlocked[2] = b.unlocked[2] || false; // code known; still needs entry
    if (id === 2) b.unlocked[3] = b.unlocked[3] || false;
    autoSave(game, 'end');
  }

  // --- Interact ------------------------------------------------------------

  async tryInteract(game, dialog) {
    if (dialog.active || this.locked) return null;
    if (this.phase === 'keypad') return null;
    if (this.phase !== 'hub' && this.phase !== 'puzzle') return null;
    this.player?.clearKeys();
    this.setInputBlocked(true);
    const obj = findFacingInteractable(this.player, this.world);
    if (!obj) { this.setInputBlocked(false); return null; }

    if (obj.kind === 'plaque') {
      await dialog.show(obj.text || '', { title: 'Note' });
      this.setInputBlocked(false);
      return null;
    }

    if (obj.kind === 'reset') {
      if (this.puzzleId === 1) this.padSeq = [];
      if (this.puzzleId === 2) this.bowls = [0, 0, 0];
      if (this.puzzleId === 3) this.gifts = (this.world.gifts || []).map((g) => ({ ...g }));
      await dialog.show('Puzzle reset.', { title: 'Reset' });
      this.setInputBlocked(false);
      return null;
    }

    if (obj.kind === 'bowl') {
      const i = obj.bowlIndex;
      this.bowls[i] = (this.bowls[i] + 1) % PUZZLE2.labels.length;
      this._checkPuzzle2Solve(game);
      this.setInputBlocked(false);
      return null;
    }

    if (obj.kind === 'reveal') {
      const b = this._progress(game);
      const id = obj.puzzle;
      if (!b.solved[id]) {
        await dialog.show('Nothing here yet.\nSolve the puzzle first.', { title: 'Note' });
      } else if (id === 1) {
        await dialog.show(PUZZLE1.success(birthdayCode(2)), { title: 'Unlocked' });
      } else if (id === 2) {
        await dialog.show(PUZZLE2.success(birthdayCode(3)), { title: 'Unlocked' });
      } else {
        await dialog.show(FINAL_CLUE, { title: 'Sealed Note' });
      }
      this.setInputBlocked(false);
      return null;
    }

    if (obj.kind === 'south-door' || obj.id === 'door-back') {
      if (this.phase === 'hub') {
        this.leave();
        this.setInputBlocked(false);
        return { goto: 'room', arrival: 'north-door' };
      }
      this._enterHub(game);
      this.setInputBlocked(false);
      return null;
    }

    if (obj.kind === 'door' && obj.birthdayDoor) {
      const n = Number(String(obj.birthdayDoor).replace(/\D/g, ''));
      const b = this._progress(game);
      if (n === 1 || b.unlocked[n]) {
        this._enterPuzzle(game, n);
        this.setInputBlocked(false);
        return null;
      }
      // Needs code
      this.phase = 'keypad';
      this.keypadDoor = n;
      this.keypadValue = '';
      this.keypadError = '';
      this.keypadFlash = 0;
      this.setInputBlocked(true);
      return null;
    }

    this.setInputBlocked(false);
    return null;
  }

  // --- Keypad --------------------------------------------------------------

  _updateKeypad(game) {
    // Keyboard digits handled via onKey; touch via hit testing in pointer handler.
    if (this.keypadFlash > 0) this.keypadFlash -= 1;
  }

  /** Called from main.js keydown while birthday keypad is open. */
  onKey(e, game) {
    if (this.phase !== 'keypad') return false;
    if (e.key === 'Escape' || KEYS.cancel.includes(e.key)) {
      this.phase = 'hub';
      this.setInputBlocked(false);
      e.preventDefault();
      return true;
    }
    if (/^[0-9]$/.test(e.key)) {
      this._keypadDigit(e.key, game);
      e.preventDefault();
      return true;
    }
    if (e.key === 'Backspace') {
      this.keypadValue = this.keypadValue.slice(0, -1);
      this.keypadError = '';
      e.preventDefault();
      return true;
    }
    if (e.key === 'Enter' || KEYS.confirm.includes(e.key)) {
      this._keypadSubmit(game);
      e.preventDefault();
      return true;
    }
    return false;
  }

  /** Logical-frame pointer tap for the on-screen keypad. */
  onPointer(lx, ly, game) {
    if (this.phase !== 'keypad') return false;
    const layout = this._keypadLayout();
    for (const btn of layout.buttons) {
      if (lx >= btn.x && lx < btn.x + btn.w && ly >= btn.y && ly < btn.y + btn.h) {
        if (btn.id === 'ok') this._keypadSubmit(game);
        else if (btn.id === 'del') { this.keypadValue = this.keypadValue.slice(0, -1); this.keypadError = ''; }
        else if (btn.id === 'cancel') { this.phase = 'hub'; this.setInputBlocked(false); }
        else this._keypadDigit(btn.id, game);
        return true;
      }
    }
    return false;
  }

  _keypadDigit(d, game) {
    if (this.keypadValue.length >= 2) this.keypadValue = '';
    this.keypadValue += d;
    this.keypadError = '';
    if (this.keypadValue.length === 2) this._keypadSubmit(game);
  }

  _keypadSubmit(game) {
    const n = this.keypadDoor;
    if (checkBirthdayCode(n, this.keypadValue)) {
      const b = this._progress(game);
      b.unlocked[n] = true;
      autoSave(game, 'end');
      this._enterPuzzle(game, n);
      this.setInputBlocked(false);
    } else {
      this.keypadError = 'Wrong code';
      this.keypadValue = '';
      this.keypadFlash = 30;
    }
  }

  _keypadLayout() {
    const boxW = 420, boxH = 520;
    const x = Math.round((FRAME_W - boxW) / 2);
    const y = Math.round((FRAME_H - boxH) / 2);
    const keys = ['1','2','3','4','5','6','7','8','9','del','0','ok'];
    const buttons = [];
    const bw = 100, bh = 72, gap = 16;
    const ox = x + 50, oy = y + 160;
    keys.forEach((id, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      buttons.push({
        id,
        x: ox + col * (bw + gap),
        y: oy + row * (bh + gap),
        w: bw, h: bh,
        label: id === 'del' ? 'DEL' : id === 'ok' ? 'OK' : id,
      });
    });
    buttons.push({ id: 'cancel', x: x + 50, y: y + boxH - 70, w: boxW - 100, h: 48, label: 'Cancel' });
    return { x, y, boxW, boxH, buttons };
  }

  // --- Render --------------------------------------------------------------

  render(ctx, game) {
    if (this.phase === 'splash') {
      const t = (nowMs() - this.phaseStart) / SPLASH_MS;
      const progress = Math.min(0.5, t * 0.5);
      drawFutureSplash(ctx, { progress, paths: 1000, time: this.animTime / 60 });
      return;
    }
    if (this.phase === 'glitch1' || this.phase === 'glitch2') {
      this._drawGlitch(ctx, this.phase === 'glitch1' ? 'splash' : 'hub');
      return;
    }
    if (this.phase === 'detected') {
      this._drawDetected(ctx);
      return;
    }

    // Room / hub / puzzle
    if (this.world && this.player) {
      const rawCamX = this.world.width <= VIEW_W
        ? (this.world.width - VIEW_W) / 2
        : Math.max(0, Math.min(this.world.width - VIEW_W, this.player.x + 6 - VIEW_W / 2));
      const rawCamY = this.world.height <= VIEW_H
        ? (this.world.height - VIEW_H) / 2
        : Math.max(0, Math.min(this.world.height - VIEW_H, this.player.y - VIEW_H / 2));
      const camX = Math.round(rawCamX * WORLD_SCALE) / WORLD_SCALE;
      const camY = Math.round(rawCamY * WORLD_SCALE) / WORLD_SCALE;
      ctx.save();
      ctx.setTransform(WORLD_SCALE, 0, 0, WORLD_SCALE, 0, HUD_H);
      ctx.imageSmoothingEnabled = false;
      drawWorld(ctx, this.world, camX, camY, this.animTime);
      this._drawPuzzleOverlays(ctx, camX, camY, game);
      ctx.save();
      ctx.translate(-camX, -camY);
      const p = game.portfolio;
      this.player.draw(ctx, p.hairColor, p.hairLength, p.age, p.shirtColor);
      ctx.restore();
      ctx.restore();
      this.hud.draw(ctx, game.portfolio);
      if (this.prompt && this.phase !== 'keypad') {
        drawActionPrompt(ctx, this.prompt.label || 'Interact');
      }
    }

    if (this.phase === 'keypad') this._drawKeypad(ctx);
  }

  _drawPuzzleOverlays(ctx, camX, camY, game) {
    const b = this._progress(game);
    // Pads
    for (const obj of this.world.interactables) {
      const sx = obj.x - camX, sy = obj.y - camY;
      if (obj.kind === 'pad') {
        const lit = this.padSeq.includes(obj.padId) && this.padSeq[this.padSeq.length - 1] === obj.padId;
        ctx.fillStyle = lit ? '#e8c84a' : '#6a5a3a';
        ctx.fillRect(sx, sy, obj.w, obj.h);
        ctx.fillStyle = '#f0e8c8';
        ctx.font = '8px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText(String(obj.num), sx + obj.w / 2, sy + 11);
      } else if (obj.kind === 'bowl') {
        const state = this.bowls[obj.bowlIndex] || 0;
        const colors = ['#555', '#3a3a3a', '#c4a030', '#2a2a2a'];
        ctx.fillStyle = '#222';
        ctx.fillRect(sx, sy, obj.w, obj.h);
        ctx.fillStyle = colors[state];
        ctx.fillRect(sx + 3, sy + 3, obj.w - 6, obj.h - 6);
        // Labels sit on the cream floor, so give them a dark plate like the READ signs.
        // Size the plate from glyph metrics plus padding so descenders stay inside.
        const label = PUZZLE2.labels[state].slice(0, 8);
        ctx.font = '5px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        let ascent = 0, descent = 0;
        for (const raw of PUZZLE2.labels) {
          const mm = ctx.measureText(raw.slice(0, 8));
          ascent = Math.max(ascent, Math.ceil(mm.actualBoundingBoxAscent || mm.fontBoundingBoxAscent || 5));
          descent = Math.max(descent, Math.ceil(mm.actualBoundingBoxDescent || mm.fontBoundingBoxDescent || 1));
        }
        const m = ctx.measureText(label);
        const tw = Math.ceil(Math.max(
          m.width,
          (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0),
        ));
        const padX = 3, padY = 2;
        const pw = tw + padX * 2;
        const plateH = ascent + descent + padY * 2;
        const lx = sx + obj.w / 2;
        const py = Math.round(sy + obj.h + 2);
        const px = Math.round(lx - pw / 2);
        const ly = py + padY + ascent;
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(px, py, pw, plateH);
        ctx.strokeStyle = '#100c08';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, plateH - 1);
        ctx.fillStyle = '#f0e8c8';
        ctx.fillText(label, lx, ly);
      } else if (obj.kind === 'plate') {
        ctx.fillStyle = '#3a3228';
        ctx.fillRect(sx, sy, obj.w, obj.h);
        ctx.strokeStyle = '#c4a030';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, obj.w - 1, obj.h - 1);
        // "Window" / "Plant" sit on the wall above the pad, with the same
        // contrast plate used for the Cat Bowls labels. Mid is unlabeled.
        if (obj.plateId === 'window' || obj.plateId === 'plant') {
          this._drawFloorLabel(ctx, sx + obj.w / 2, sy - 12, obj.label);
        }
      } else if (obj.kind === 'plaque' || obj.kind === 'reset' || obj.kind === 'reveal') {
        ctx.fillStyle = obj.kind === 'reset' ? '#6a3030' : obj.kind === 'reveal' ? '#30506a' : '#5a4a30';
        ctx.fillRect(sx, sy, obj.w, obj.h);
        ctx.fillStyle = '#f0e8c8';
        ctx.font = '5px ' + FONT;
        ctx.textAlign = 'center';
        const tag = obj.kind === 'reset' ? 'RESET' : obj.kind === 'reveal' ? (b.solved[obj.puzzle] ? 'NOTE!' : 'NOTE') : 'READ';
        ctx.fillText(tag, sx + obj.w / 2, sy + obj.h / 2 + 2);
      }
    }
    // West-wall window, immediately left of the Window plate (puzzle 3).
    if (this.puzzleId === 3) {
      this._drawWindow(ctx, 3 * TILE - camX, 1 * TILE - camY);
    }
    // Gifts
    for (const g of this.gifts) {
      const sx = g.x - camX, sy = g.y - camY;
      ctx.fillStyle = g.wrap || '#b43232';
      ctx.fillRect(sx, sy, g.w, g.h);
      ctx.strokeStyle = '#100c08';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, g.w - 1, g.h - 1);
      ctx.fillStyle = g.ribbon || '#e8c84a';
      const band = 4;
      ctx.fillRect(sx + (g.w - band) / 2, sy, band, g.h);
      ctx.fillRect(sx, sy + (g.h - band) / 2, g.w, band);
      if (g.letter) {
        ctx.font = '6px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = g.ink || '#f0e8c8';
        ctx.fillText(g.letter, sx + g.w / 2, sy + g.h / 2 + 1);
      }
    }
    // Solved banner hint
    if (this.puzzleId && b.solved[this.puzzleId]) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(4, 4, 120, 14);
      ctx.fillStyle = PALETTE.gold || '#e8c84a';
      ctx.font = '6px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText('Solved — check NOTE', 8, 14);
    }
  }

  _drawKeypad(ctx) {
    const L = this._keypadLayout();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    ctx.fillStyle = 'rgba(16,10,28,0.96)';
    ctx.fillRect(L.x, L.y, L.boxW, L.boxH);
    ctx.strokeStyle = PALETTE.gold || '#e8c84a';
    ctx.lineWidth = 4;
    ctx.strokeRect(L.x + 8, L.y + 8, L.boxW - 16, L.boxH - 16);
    ctx.fillStyle = PALETTE.gold || '#e8c84a';
    ctx.font = '28px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(`Door ${this.keypadDoor}`, L.x + L.boxW / 2, L.y + 48);
    ctx.fillStyle = '#f0e8c8';
    ctx.font = '22px ' + FONT;
    const shown = (this.keypadValue + '__').slice(0, 2).split('').join(' ');
    ctx.fillText(shown, L.x + L.boxW / 2, L.y + 100);
    if (this.keypadError) {
      ctx.fillStyle = '#ff9a8a';
      ctx.font = '16px ' + FONT;
      ctx.fillText(this.keypadError, L.x + L.boxW / 2, L.y + 130);
    }
    for (const btn of L.buttons) {
      ctx.fillStyle = btn.id === 'ok' ? '#3a6a3a' : btn.id === 'cancel' ? '#6a3030' : '#2a2438';
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      ctx.fillStyle = '#f0e8c8';
      ctx.font = '22px ' + FONT;
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 8);
    }
    ctx.restore();
  }

  _drawDetected(ctx) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0810';
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    // Mild scanlines
    ctx.fillStyle = 'rgba(0,255,120,0.08)';
    for (let y = 0; y < FRAME_H; y += 4) ctx.fillRect(0, y, FRAME_W, 2);
    const t = (nowMs() - this.phaseStart) / DETECTED_MS;
    const jitter = Math.sin(t * 40) * 6;
    ctx.font = '48px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4060';
    ctx.fillText('BIRTHDAY DETECTED', FRAME_W / 2 + jitter, FRAME_H / 2 - 10);
    ctx.fillStyle = '#40f0ff';
    ctx.fillText('BIRTHDAY DETECTED', FRAME_W / 2 - jitter, FRAME_H / 2 - 10);
    ctx.fillStyle = '#f0e8c8';
    ctx.fillText('BIRTHDAY DETECTED', FRAME_W / 2, FRAME_H / 2 - 10);
    ctx.restore();
  }

  _drawGlitch(ctx, under) {
    // Draw a base then tear/RGB split/flicker.
    if (under === 'splash') {
      drawFutureSplash(ctx, { progress: 0.5, paths: 1000, time: this.animTime / 60 });
    } else if (this.world && this.player) {
      // Will rarely hit; glitch2 starts before hub exists — use void.
      ctx.fillStyle = '#0a0810';
      ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    } else {
      ctx.fillStyle = '#0a0810';
      ctx.fillRect(0, 0, FRAME_W, FRAME_H);
      drawFutureSplash(ctx, { progress: 0.5, paths: 1000, time: this.animTime / 60 });
    }
    const t = nowMs() * 0.001;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Horizontal tear bands
    for (let i = 0; i < 8; i++) {
      const y = Math.floor(((t * 300 + i * 97) % FRAME_H));
      const h = 4 + (i % 3) * 6;
      const shift = Math.floor(Math.sin(t * 20 + i) * 40);
      try {
        const slice = ctx.getImageData(0, y, FRAME_W, h);
        ctx.putImageData(slice, shift, y);
      } catch (_) { /* ignore tainted */ }
      ctx.fillStyle = `rgba(255,0,80,${0.15 + (i % 2) * 0.1})`;
      ctx.fillRect(0, y, FRAME_W, 2);
      ctx.fillStyle = `rgba(0,220,255,${0.12})`;
      ctx.fillRect(shift, y + 2, FRAME_W, 2);
    }
    // Flicker
    if (Math.sin(t * 30) > 0.7) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    }
    ctx.restore();
  }

  wantsGlassWallMessage() { return false; }

  _drawFloorLabel(ctx, cx, topY, text) {
    ctx.font = '5px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text);
    const ascent = Math.ceil(m.actualBoundingBoxAscent || m.fontBoundingBoxAscent || 5);
    const descent = Math.ceil(m.actualBoundingBoxDescent || m.fontBoundingBoxDescent || 1);
    const tw = Math.ceil(Math.max(
      m.width,
      (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0),
    ));
    const padX = 3, padY = 2;
    const pw = tw + padX * 2;
    const plateH = ascent + descent + padY * 2;
    const py = Math.round(topY);
    const px = Math.round(cx - pw / 2);
    const ly = py + padY + ascent;
    ctx.fillStyle = '#2a2018';
    ctx.fillRect(px, py, pw, plateH);
    ctx.strokeStyle = '#100c08';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, plateH - 1);
    ctx.fillStyle = '#f0e8c8';
    ctx.fillText(text, cx, ly);
  }

  _drawWindow(ctx, x, y) {
    // Two tiles tall, one tile wide, cream panes in a wood frame.
    ctx.fillStyle = '#5a4a30';
    ctx.fillRect(x + 1, y + 2, 14, 28);
    ctx.fillStyle = '#c8d8e8';
    ctx.fillRect(x + 3, y + 4, 4, 10);
    ctx.fillRect(x + 9, y + 4, 4, 10);
    ctx.fillRect(x + 3, y + 16, 4, 10);
    ctx.fillRect(x + 9, y + 16, 4, 10);
    ctx.strokeStyle = '#2a2018';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 2.5, 13, 27);
  }

}

function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
