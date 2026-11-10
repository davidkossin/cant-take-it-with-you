/**
 * Birthday cat NPCs in the Decision Room. Same movement rules as the infant:
 * slow short bursts with pauses, solid collision, turn to face the player when
 * close. Sitting sprite while paused; walking frames while moving.
 */
import { TILE } from '../config.js';
import { npcBounds, NPC_WALL_GAP, NPC_FACE_RANGE, npcBlocked, npcOverlapsAt, npcBumpPauseTicks } from './SpouseNpc.js';
import { makeCatSprite, CAT_SPRITE_W, CAT_SPRITE_H, CAT_WALK_FRAMES } from './CatSprites.js';
import { drawCrispSprite } from './Player.js';

const TICKS_PER_SECOND = 60;
const SPEED_FACTOR = 0.3;
const STEP = TILE / 2;
const MIN_STEPS = 1;
const MAX_STEPS = 3;
const MIN_PAUSE_S = 1.5;
const MAX_PAUSE_S = 5;
const FRAME_TICKS = 9;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class CatNpc {
  /**
   * @param {object} world
   * @param {{id:string,name:string,coat:string}} cat
   * @param {object} [opts]
   */
  constructor(world, cat, { walkSpeed = 1.35, avoid = null, random = Math.random, others = null } = {}) {
    this.world = world;
    this.others = others;
    this.cat = cat;
    this.name = cat.name;
    this.coat = cat.coat === 'chenchen' ? 'chenchen' : 'yangyang';
    this.speed = walkSpeed * SPEED_FACTOR;
    this.random = random;
    const room = npcBounds(world);
    this.bounds = {
      minX: room.minX,
      minY: room.minY,
      maxX: world.width - TILE - NPC_WALL_GAP - CAT_SPRITE_W,
      maxY: world.height - TILE - NPC_WALL_GAP - CAT_SPRITE_H,
    };
    this.facing = 'down';
    this.moving = false;
    this.target = null;
    this.frame = 0;
    this.animTimer = 0;
    this.spawn(avoid);
    this.pauseTicks = this._pause();
  }

  _pause() {
    const s = MIN_PAUSE_S + this.random() * (MAX_PAUSE_S - MIN_PAUSE_S);
    return Math.max(1, Math.round(s * TICKS_PER_SECOND));
  }

  box(x = this.x, y = this.y) {
    // Feet under the torso of the 24×16 sprite.
    return { x: x + 5, y: y + 10, w: 14, h: 6 };
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
      if (npcOverlapsAt(this, x, y)) continue;
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
      const steps = MIN_STEPS + Math.floor(this.random() * (MAX_STEPS - MIN_STEPS + 1));
      for (let k = steps; k >= 1; k--) {
        const x = this.x + dx * k * STEP;
        const y = this.y + dy * k * STEP;
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

  update(player = null) {
    if (!this.moving) {
      this.animTimer = 0;
      if (player) {
        const dx = player.x + player.w / 2 - (this.x + CAT_SPRITE_W / 2);
        const dy = player.y + player.h / 2 - (this.y + CAT_SPRITE_H / 2);
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
      if (npcBlocked(this, t.x, t.y)) {
        this.moving = false;
        this.target = null;
        this.pauseTicks = npcBumpPauseTicks(this.random);
        return;
      }
      this.x = t.x;
      this.y = t.y;
      this.moving = false;
      this.target = null;
      this.pauseTicks = this._pause();
      return;
    }
    const nx = this.x + Math.sign(ddx) * Math.min(this.speed, Math.abs(ddx));
    const ny = this.y + Math.sign(ddy) * Math.min(this.speed, Math.abs(ddy));
    if (npcBlocked(this, nx, ny)) {
      this.moving = false;
      this.target = null;
      this.pauseTicks = npcBumpPauseTicks(this.random);
      return;
    }
    if (player && overlaps(this.box(nx, ny), player) && !overlaps(this.box(), player)) {
      this.moving = false;
      this.target = null;
      this.pauseTicks = this._pause();
      return;
    }
    this.x = nx;
    this.y = ny;
    if (++this.animTimer >= FRAME_TICKS) {
      this.animTimer = 0;
      this.frame = (this.frame + 1) % CAT_WALK_FRAMES;
    }
  }

  draw(ctx) {
    const spr = makeCatSprite(this.coat, this.facing, this.moving ? this.frame : -1);
    drawCrispSprite(ctx, spr, this.x, this.y);
  }
}
