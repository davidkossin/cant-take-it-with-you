/**
 * Children as wandering NPCs in the Decision Room (same movement area as the spouse).
 * The baby (age 0-3) crawls slowly in short bursts; the child (age 4-12) walks at a modest
 * pace with pauses and now and then breaks into a short run. Both stop when the player is in
 * the way and turn to face the player when close. Purely visual: nothing is
 * saved, and movement uses Math.random, never the seeded simulation RNG.
 *
 * Positions are the sprite's top-left corner in world pixels.
 */
import { TILE } from '../config.js';
import { npcBounds, NPC_FACE_RANGE } from './SpouseNpc.js';
import {
  makeBabySprite, makeChildSprite, kidLook, childLook,
  BABY_SPRITE_W, BABY_SPRITE_H, BABY_FRAMES, CHILD_SPRITE_W, CHILD_SPRITE_H, CHILD_FRAMES,
} from './KidSprites.js';
import { drawCrispSprite } from './Player.js';

const TICKS_PER_SECOND = 60;
/** Oldest age shown as a crawling baby. */
export const BABY_MAX_AGE = 3;
/** A baby crawls at this fraction of the player's walk speed. */
export const BABY_SPEED_FACTOR = 0.3;
/** One crawl burst is 1-3 half-tiles (never far). */
export const BABY_STEP = TILE / 2;
export const BABY_MIN_STEPS = 1;
export const BABY_MAX_STEPS = 3;
const BABY_MIN_PAUSE_S = 1.5;
const BABY_MAX_PAUSE_S = 5;
/** Crawl animation advances one frame every this many ticks of movement. */
const BABY_FRAME_TICKS = 9;

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** True when a kid of this age is shown as the crawling baby. */
export function isBabyAge(age) {
  const a = Number(age);
  return Number.isFinite(a) && a >= 0 && a <= BABY_MAX_AGE;
}

export class BabyNpc {
  /**
   * @param {object} world Decision Room
   * @param {{name?:string,age?:number}} kid entry from the household's kids list
   * @param {number} index position in the kids list (seeds the colors)
   * @param {object} [opts]
   * @param {number} [opts.walkSpeed] the player's walk speed (world px per tick)
   * @param {{x:number,y:number,w:number,h:number}|null} [opts.avoid] rect to spawn away from
   * @param {() => number} [opts.random]
   */
  constructor(world, kid, index, { walkSpeed = 1.35, avoid = null, random = Math.random } = {}) {
    this.world = world;
    this.kid = kid;
    this.look = kidLook(kid, index);
    this.speed = walkSpeed * BABY_SPEED_FACTOR;
    this.random = random;
    this.bounds = npcBounds(world);
    this.facing = 'down';
    this.moving = false;
    this.target = null;
    this.frame = 0;
    this.animTimer = 0;
    this.spawn(avoid);
    this.pauseTicks = this._pause();
  }

  _pause() {
    const s = BABY_MIN_PAUSE_S + this.random() * (BABY_MAX_PAUSE_S - BABY_MIN_PAUSE_S);
    return Math.max(1, Math.round(s * TICKS_PER_SECOND));
  }

  /** Solid feet box (lower half of the sprite). */
  box(x = this.x, y = this.y) {
    return { x: x + 3, y: y + 7, w: 10, h: 7 };
  }

  _inBounds(x, y) {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
  }

  spawn(avoid = null) {
    const b = this.bounds;
    let spot = null;
    for (let i = 0; i < 40; i++) {
      const x = Math.round(b.minX + this.random() * (b.maxX - b.minX));
      const y = Math.round(b.minY + this.random() * (b.maxY - b.minY));
      spot = { x, y };
      if (!avoid) break;
      if (Math.hypot(x - avoid.x, y - avoid.y) >= 3 * TILE) break;
    }
    this.x = spot ? spot.x : Math.round((b.minX + b.maxX) / 2);
    this.y = spot ? spot.y : Math.round((b.minY + b.maxY) / 2);
  }

  _startBurst() {
    const order = Object.keys(DIRS);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const dir of order) {
      const [dx, dy] = DIRS[dir];
      const steps = BABY_MIN_STEPS + Math.floor(this.random() * (BABY_MAX_STEPS - BABY_MIN_STEPS + 1));
      for (let k = steps; k >= 1; k--) {
        const x = this.x + dx * k * BABY_STEP;
        const y = this.y + dy * k * BABY_STEP;
        if (this._inBounds(x, y)) {
          this.target = { x, y };
          this.facing = dir;
          this.moving = true;
          return true;
        }
      }
    }
    return false;
  }

  /**
   * One fixed 60 Hz tick.
   * @param {{x:number,y:number,w:number,h:number}|null} [player] player's feet box
   */
  update(player = null) {
    if (!this.moving) {
      this.animTimer = 0;
      if (player) {
        const dx = player.x + player.w / 2 - (this.x + BABY_SPRITE_W / 2);
        const dy = player.y + player.h / 2 - (this.y + BABY_SPRITE_H / 2);
        if (Math.hypot(dx, dy) < NPC_FACE_RANGE) {
          this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
        }
      }
      if (--this.pauseTicks > 0) return;
      if (!this._startBurst()) { this.pauseTicks = this._pause(); return; }
    }
    const t = this.target;
    const ddx = t.x - this.x;
    const ddy = t.y - this.y;
    if (Math.abs(ddx) + Math.abs(ddy) <= this.speed) {
      this.x = t.x;
      this.y = t.y;
      this.moving = false;
      this.target = null;
      this.pauseTicks = this._pause();
      return;
    }
    const nx = this.x + Math.sign(ddx) * Math.min(this.speed, Math.abs(ddx));
    const ny = this.y + Math.sign(ddy) * Math.min(this.speed, Math.abs(ddy));
    if (player && overlaps(this.box(nx, ny), player) && !overlaps(this.box(), player)) {
      this.moving = false;
      this.target = null;
      this.pauseTicks = this._pause();
      return;
    }
    this.x = nx;
    this.y = ny;
    if (++this.animTimer >= BABY_FRAME_TICKS) {
      this.animTimer = 0;
      this.frame = (this.frame + 1) % BABY_FRAMES;
    }
  }

  draw(ctx) {
    const spr = makeBabySprite(this.look.hair, this.look.shirt, this.facing, this.moving ? this.frame : -1);
    drawCrispSprite(ctx, spr, this.x, this.y);
  }
}

/** Child ages 4-12 get the small child sprite. */
export const CHILD_MIN_AGE = 4;
export const CHILD_MAX_AGE = 12;
/** Walking and running speed as a fraction of the player's walk speed. */
export const CHILD_WALK_FACTOR = 0.6;
export const CHILD_RUN_FACTOR = 1.15;
/** About one move in six is a run. */
export const CHILD_RUN_CHANCE = 1 / 6;
const CHILD_STEP = TILE;
const CHILD_MIN_PAUSE_S = 1;
const CHILD_MAX_PAUSE_S = 6;
const CHILD_WALK_FRAME_TICKS = 8;
const CHILD_RUN_FRAME_TICKS = 4;

/** True when a kid of this age is shown as the small child. */
export function isChildAge(age) {
  const a = Number(age);
  return Number.isFinite(a) && a >= CHILD_MIN_AGE && a <= CHILD_MAX_AGE;
}

export class ChildNpc {
  /**
   * @param {object} world Decision Room
   * @param {{name?:string,age?:number}} kid entry from the household's kids list
   * @param {number} index position in the kids list (seeds the look)
   * @param {object} [opts] same as BabyNpc
   */
  constructor(world, kid, index, { walkSpeed = 1.35, avoid = null, random = Math.random } = {}) {
    this.world = world;
    this.kid = kid;
    this.look = childLook(kid, index);
    this.walkSpeed = walkSpeed * CHILD_WALK_FACTOR;
    this.runSpeed = walkSpeed * CHILD_RUN_FACTOR;
    this.random = random;
    this.bounds = npcBounds(world);
    this.facing = 'down';
    this.moving = false;
    this.running = false;
    this.target = null;
    this.frame = 0;
    this.animTimer = 0;
    this.spawn(avoid);
    this.pauseTicks = this._pause();
  }

  get speed() { return this.running ? this.runSpeed : this.walkSpeed; }

  _pause() {
    const s = CHILD_MIN_PAUSE_S + this.random() * (CHILD_MAX_PAUSE_S - CHILD_MIN_PAUSE_S);
    return Math.max(1, Math.round(s * TICKS_PER_SECOND));
  }

  /** Solid feet box (lower part of the sprite). */
  box(x = this.x, y = this.y) {
    return { x: x + 4, y: y + 9, w: 8, h: 6 };
  }

  _inBounds(x, y) {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
  }

  spawn(avoid = null) {
    const b = this.bounds;
    let spot = null;
    for (let i = 0; i < 40; i++) {
      const x = Math.round(b.minX + this.random() * (b.maxX - b.minX));
      const y = Math.round(b.minY + this.random() * (b.maxY - b.minY));
      spot = { x, y };
      if (!avoid) break;
      if (Math.hypot(x - avoid.x, y - avoid.y) >= 3 * TILE) break;
    }
    this.x = spot ? spot.x : Math.round((b.minX + b.maxX) / 2);
    this.y = spot ? spot.y : Math.round((b.minY + b.maxY) / 2);
  }

  _startMove() {
    const order = Object.keys(DIRS);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const run = this.random() < CHILD_RUN_CHANCE;
    const maxSteps = run ? 6 : 4;
    const minSteps = run ? 3 : 1;
    for (const dir of order) {
      const [dx, dy] = DIRS[dir];
      const want = minSteps + Math.floor(this.random() * (maxSteps - minSteps + 1));
      for (let k = want; k >= 1; k--) {
        const x = this.x + dx * k * CHILD_STEP;
        const y = this.y + dy * k * CHILD_STEP;
        if (this._inBounds(x, y)) {
          this.target = { x, y };
          this.facing = dir;
          this.moving = true;
          this.running = run && k >= 2;
          return true;
        }
      }
    }
    return false;
  }

  /** One fixed 60 Hz tick; `player` is the player's feet box. */
  update(player = null) {
    if (!this.moving) {
      this.animTimer = 0;
      if (player) {
        const dx = player.x + player.w / 2 - (this.x + CHILD_SPRITE_W / 2);
        const dy = player.y + player.h / 2 - (this.y + CHILD_SPRITE_H / 2);
        if (Math.hypot(dx, dy) < NPC_FACE_RANGE) {
          this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
        }
      }
      if (--this.pauseTicks > 0) return;
      if (!this._startMove()) { this.pauseTicks = this._pause(); return; }
    }
    const t = this.target;
    const ddx = t.x - this.x;
    const ddy = t.y - this.y;
    if (Math.abs(ddx) + Math.abs(ddy) <= this.speed) {
      this.x = t.x;
      this.y = t.y;
      this.moving = false;
      this.running = false;
      this.target = null;
      this.pauseTicks = this._pause();
      return;
    }
    const nx = this.x + Math.sign(ddx) * Math.min(this.speed, Math.abs(ddx));
    const ny = this.y + Math.sign(ddy) * Math.min(this.speed, Math.abs(ddy));
    if (player && overlaps(this.box(nx, ny), player) && !overlaps(this.box(), player)) {
      this.moving = false;
      this.running = false;
      this.target = null;
      this.pauseTicks = this._pause();
      return;
    }
    this.x = nx;
    this.y = ny;
    if (++this.animTimer >= (this.running ? CHILD_RUN_FRAME_TICKS : CHILD_WALK_FRAME_TICKS)) {
      this.animTimer = 0;
      this.frame = (this.frame + 1) % CHILD_FRAMES;
    }
  }

  draw(ctx) {
    const spr = makeChildSprite(this.look, this.facing, this.moving ? this.frame : -1, this.running);
    drawCrispSprite(ctx, spr, this.x, this.y);
  }
}
