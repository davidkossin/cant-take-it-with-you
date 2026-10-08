/**
 * The spouse as a wandering NPC in the Decision Room.
 *
 * Purely visual: no collision with the player, no interaction, nothing saved,
 * and the wander uses Math.random so it never touches the seeded simulation
 * RNG or any forecast. RoomScene calls update() on the fixed 60 Hz clock only
 * while no dialog is open and the pause menu is closed, so the spouse freezes
 * whenever the player does, and draws the spouse before (under) the player.
 *
 * Units are world pixels (the room is 20×14 tiles of 16 px, scaled 4× on
 * screen). Positions here are the sprite's top-left corner.
 */
import { TILE } from '../config.js';
import { makePlayerSprite } from './Assets.js';
import { drawCrispSprite, hairWhiteAmount } from './Player.js';
import { ownerAge } from '../finance/Household.js';

/** Player / spouse sprite size in world pixels. */
export const NPC_SPRITE_W = 16;
export const NPC_SPRITE_H = 24;
/** One step = one sprite width (16 px, which is also one floor tile). */
export const NPC_STEP = NPC_SPRITE_W;
/** Keep the whole sprite at least two sprite widths from every wall. */
export const NPC_WALL_GAP = 2 * NPC_SPRITE_W;
export const NPC_MIN_STEPS = 1;
export const NPC_MAX_STEPS = 10;
/** The spouse walks at 65% of the player's normal (not running) walk speed. */
export const NPC_SPEED_FACTOR = 0.65;
/** Player walk cycle: one of eight frames every PLAYER_FRAME_TICKS ticks at full walk speed. */
const PLAYER_FRAME_TICKS = 3;
export const NPC_MIN_PAUSE_S = 1;
export const NPC_MAX_PAUSE_S = 10;
const TICKS_PER_SECOND = 60;
const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/** True when the household has a current spouse to show. */
export function hasSpouseNpc(p) {
  return !!(p && p.married);
}

/**
 * Allowed range for the sprite's top-left corner: the floor inside the
 * one-tile wall ring, inset by NPC_WALL_GAP on every side, minus the sprite
 * size on the right and bottom so the whole sprite stays inside.
 * Decision Room (320×224): interior x 16–304, y 16–208 →
 * minX 48, maxX 304 − 32 − 16 = 256, minY 48, maxY 208 − 32 − 24 = 152.
 */
export function npcBounds(world) {
  const minX = TILE + NPC_WALL_GAP;
  const minY = TILE + NPC_WALL_GAP;
  const maxX = world.width - TILE - NPC_WALL_GAP - NPC_SPRITE_W;
  const maxY = world.height - TILE - NPC_WALL_GAP - NPC_SPRITE_H;
  return { minX, minY, maxX, maxY };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Room objects the spouse must not stop on (tellers, doors, corner decor).
 * In the current Decision Room none of them reach into npcBounds, so this
 * only matters if the layout changes.
 */
function obstacles(world) {
  return (world.interactables || []).filter((o) => o.kind !== 'marker' && o.kind !== 'spawn' && o.kind !== 'lamp');
}

export class SpouseNpc {
  /**
   * @param {object} world Decision Room from buildDecisionRoom
   * @param {object} [opts]
   * @param {number} [opts.walkSpeed] the player's normal walk speed (world px per tick);
   *   the spouse moves at NPC_SPEED_FACTOR of it
   * @param {{x:number,y:number,w:number,h:number}|null} [opts.avoid] sprite rect to spawn away from
   * @param {() => number} [opts.random] uniform [0, 1); Math.random by default
   * @param {(d:object) => void} [opts.onDecision] called with each wander decision
   */
  constructor(world, { walkSpeed = 1.5, avoid = null, random = Math.random, onDecision = null } = {}) {
    this.world = world;
    this.speed = walkSpeed * NPC_SPEED_FACTOR;
    this.random = random;
    this.onDecision = onDecision;
    this.bounds = npcBounds(world);
    this._obstacles = obstacles(world);
    this.facing = 'down';
    this.moving = false;
    this.frame = 0;
    this.animTimer = 0;
    this.target = null;
    this.decision = null;
    this.spawn(avoid);
    this.pauseTicks = this._randomPauseTicks();
  }

  _randInt(lo, hi) {
    return lo + Math.floor(this.random() * (hi - lo + 1));
  }

  _randomPauseTicks() {
    const seconds = NPC_MIN_PAUSE_S + this.random() * (NPC_MAX_PAUSE_S - NPC_MIN_PAUSE_S);
    return Math.max(1, Math.round(seconds * TICKS_PER_SECOND));
  }

  _rect(x, y) {
    return { x, y, w: NPC_SPRITE_W, h: NPC_SPRITE_H };
  }

  _clear(x, y) {
    const b = this.bounds;
    if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return false;
    const r = this._rect(x, y);
    return !this._obstacles.some((o) => overlaps(r, o));
  }

  /** Random clear spot inside the bounds, a few steps from `avoid` (the player). */
  spawn(avoid = null) {
    const b = this.bounds;
    let best = null;
    for (let i = 0; i < 60; i++) {
      const x = Math.round(b.minX + this.random() * (b.maxX - b.minX));
      const y = Math.round(b.minY + this.random() * (b.maxY - b.minY));
      if (!this._clear(x, y)) continue;
      best = { x, y };
      if (!avoid) break;
      const d = Math.hypot(x + NPC_SPRITE_W / 2 - (avoid.x + avoid.w / 2), y + NPC_SPRITE_H / 2 - (avoid.y + avoid.h / 2));
      if (d >= 3 * NPC_STEP) break;
    }
    // Fallback: center of the allowed rectangle (by the rug).
    const spot = best || { x: Math.round((b.minX + b.maxX) / 2), y: Math.round((b.minY + b.maxY) / 2) };
    this.x = spot.x;
    this.y = spot.y;
    this.moving = false;
    this.target = null;
  }

  /** Whole steps that fit in `dir` from the current spot, each ending clear. */
  _fittingSteps(dir) {
    const { dx, dy } = DIRS[dir];
    const out = [];
    for (let k = NPC_MIN_STEPS; k <= NPC_MAX_STEPS; k++) {
      const x = this.x + dx * k * NPC_STEP;
      const y = this.y + dy * k * NPC_STEP;
      const b = this.bounds;
      if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) break; // farther only gets worse
      if (this._clear(x, y)) out.push(k);
    }
    return out;
  }

  /**
   * Pick a random 4-way direction (uniform among those that fit at least one
   * step), then a random whole number of steps, uniform over the 1–10 steps
   * that fit that way. The target never leaves the bounds. Inside the wall
   * gap the room is 13 steps wide and 6 tall, so long moves are horizontal.
   */
  _startMove() {
    const order = Object.keys(DIRS);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const dir of order) {
      const fits = this._fittingSteps(dir);
      if (!fits.length) continue; // cannot fit one step this way: try another
      const steps = fits[Math.floor(this.random() * fits.length)];
      const { dx, dy } = DIRS[dir];
      this.target = { x: this.x + dx * steps * NPC_STEP, y: this.y + dy * steps * NPC_STEP };
      this.facing = dir;
      this.moving = true;
      this.decision = { dir, steps, from: { x: this.x, y: this.y }, to: { ...this.target }, maxSteps: fits[fits.length - 1] };
      return true;
    }
    return false;
  }

  /** One fixed 60 Hz tick (only while the room is not blocked). */
  update() {
    if (!this.moving) {
      this.animTimer = 0;
      if (--this.pauseTicks > 0) return;
      if (!this._startMove()) {
        this.pauseTicks = this._randomPauseTicks();
        return;
      }
    }
    const t = this.target;
    const ddx = t.x - this.x;
    const ddy = t.y - this.y;
    const dist = Math.abs(ddx) + Math.abs(ddy); // one axis at a time (4-way)
    if (dist <= this.speed) {
      this.x = t.x;
      this.y = t.y;
      this.moving = false;
      this.target = null;
      this.pauseTicks = this._randomPauseTicks();
      if (this.decision) {
        this.decision.pauseS = Math.round((this.pauseTicks / TICKS_PER_SECOND) * 100) / 100;
        this.decision.end = { x: this.x, y: this.y };
        if (this.onDecision) this.onDecision({ ...this.decision, bounds: { ...this.bounds } });
      }
      return;
    }
    this.x += Math.sign(ddx) * Math.min(this.speed, Math.abs(ddx));
    this.y += Math.sign(ddy) * Math.min(this.speed, Math.abs(ddy));
    // Same eight-frame walk cycle as the player, slowed by the same factor as
    // the speed, so each frame covers the same distance (no foot sliding).
    this.animTimer += NPC_SPEED_FACTOR;
    if (this.animTimer >= PLAYER_FRAME_TICKS) {
      this.animTimer -= PLAYER_FRAME_TICKS;
      this.frame = (this.frame + 1) % 8;
    }
  }

  /**
   * Draw with the spouse's look; hair whitens with the spouse's age the same
   * way the player's does (hairWhiteAmount).
   * @param {CanvasRenderingContext2D} ctx world transform already applied
   * @param {object} p portfolio
   */
  draw(ctx, p) {
    const spr = makePlayerSprite(
      p.spouseHairColor,
      p.spouseHairLength,
      hairWhiteAmount(ownerAge(p, 'spouse')),
      this.facing,
      this.moving ? this.frame : -1,
      p.spouseShirtColor
    );
    drawCrispSprite(ctx, spr, this.x, this.y);
  }
}
