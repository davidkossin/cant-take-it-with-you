import { KEYS, TILE, RUN_MULTIPLIER } from '../config.js';
import { makePlayerSprite } from './Assets.js';
import { virtualKeys, virtualRunHeld, virtualStick } from '../input/VirtualPad.js';

/** Movement keys only — typing never pollutes the pressed set. */
const MOVE_KEYS = new Set([
  ...KEYS.up,
  ...KEYS.down,
  ...KEYS.left,
  ...KEYS.right,
]);


/**
 * How white the hair is. 0 through age 50, then a straight line to 1 at age 100.
 * `age` is the live portfolio age (room) or the hallway snapshot age, not a constant.
 * @param {number} age
 */
export function hairWhiteAmount(age) {
  const n = Number(age);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, (n - 50) / 50));
}

/**
 * Blit a small pixel-art sprite so every source pixel lands on a whole
 * block of frame pixels: nearest-neighbor, integer scale, and a draw origin
 * snapped to the frame (device) pixel grid. Only the drawn position is
 * snapped; the caller's world x/y stay fractional, so movement keeps its
 * sub-pixel feel. Smoothing is scoped to this call, so the painted hi-res
 * environment (drawn with smoothing on) is untouched.
 * @param {CanvasRenderingContext2D} ctx current transform maps world → frame
 * @param {HTMLCanvasElement} spr
 * @param {number} wx world-space left
 * @param {number} wy world-space top
 */
export function drawCrispSprite(ctx, spr, wx, wy) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  if (m && m.b === 0 && m.c === 0 && m.a > 0 && m.d > 0) {
    // Camera offsets are fractional (the hallway camera tracks the player),
    // so map to frame pixels first, then round once.
    const sx = Math.max(1, Math.round(m.a));
    const sy = Math.max(1, Math.round(m.d));
    const dx = Math.round(m.a * wx + m.e);
    const dy = Math.round(m.d * wy + m.f);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(spr, dx, dy, spr.width * sx, spr.height * sy);
  } else {
    ctx.drawImage(spr, Math.round(wx), Math.round(wy));
  }
  ctx.restore();
}

export class Player {
  constructor(x, y, { speed = 1.35 } = {}) {
    this.x = x;
    this.y = y;
    this.w = 12;
    this.h = 12;
    this.speed = speed;
    this.facing = 'down';
    this.moving = false;
    this.frame = 0;
    this.animTimer = 0;
    this.keys = new Set();
    /** Space held. Run only applies while a direction is also held. */
    this.runHeld = false;
    /** When false, keydown does not add keys (dialogs / locked / pause). */
    this.inputEnabled = true;
  }

  bindInput(target = window) {
    this._kd = (e) => {
      if (e.key === ' ') {
        if (this.inputEnabled && !e.repeat) this.runHeld = true;
        return;
      }
      if (!this.inputEnabled) return;
      if (!MOVE_KEYS.has(e.key)) return;
      this.keys.add(e.key);
    };
    this._ku = (e) => {
      if (e.key === ' ') this.runHeld = false;
      // Always process keyup so held keys don't stick after re-enable
      this.keys.delete(e.key);
      if (e.key.length === 1) {
        this.keys.delete(e.key.toLowerCase());
        this.keys.delete(e.key.toUpperCase());
      }
    };
    target.addEventListener('keydown', this._kd);
    target.addEventListener('keyup', this._ku);
    this._blur = () => this.clearKeys();
    target.addEventListener('blur', this._blur);
  }

  unbindInput(target = window) {
    if (this._kd) target.removeEventListener('keydown', this._kd);
    if (this._ku) target.removeEventListener('keyup', this._ku);
    if (this._blur) target.removeEventListener('blur', this._blur);
  }

  clearKeys() {
    this.keys.clear();
    this.runHeld = false;
  }

  pressed(dirs) {
    for (const k of dirs) {
      if (this.keys.has(k)) return true;
      if (virtualKeys.has(k)) return true;
    }
    return false;
  }

  /**
   * @param {(nx:number,ny:number,w:number,h:number)=>boolean} solidAt
   */
  update(solidAt) {
    let dx = 0;
    let dy = 0;
    const keyX = (this.pressed(KEYS.right) ? 1 : 0) - (this.pressed(KEYS.left) ? 1 : 0);
    const keyY = (this.pressed(KEYS.down) ? 1 : 0) - (this.pressed(KEYS.up) ? 1 : 0);
    const stickMag = Math.hypot(virtualStick.x, virtualStick.y);
    // Keyboard stays digital full-speed, even if the stick is also deflected.
    const usingKeys = keyX !== 0 || keyY !== 0;
    if (usingKeys) {
      dx = keyX;
      dy = keyY;
    } else if (stickMag > 0) {
      dx = virtualStick.x;
      dy = virtualStick.y;
    }

    this.moving = dx !== 0 || dy !== 0;
    if (!this.moving) {
      this.animTimer = 0;
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx < 0 ? 'left' : 'right';
    else this.facing = dy < 0 ? 'up' : 'down';

    const len = Math.hypot(dx, dy) || 1;
    // Keyboard Space or the touch Run button. Run does not confirm dialogs.
    const running = this.runHeld || virtualRunHeld;
    const speed = this.speed * (running ? RUN_MULTIPLIER : 1);
    if (usingKeys) {
      dx = (dx / len) * speed;
      dy = (dy / len) * speed;
    } else {
      // Stick x/y already has length 0..1 (1 = full walk). Do not renormalize.
      dx = dx * speed;
      dy = dy * speed;
    }

    const tryMove = (mx, my) => {
      const nx = this.x + mx;
      const ny = this.y + my;
      if (!solidAt(nx, ny, this.w, this.h)) {
        this.x = nx;
        this.y = ny;
        return true;
      }
      return false;
    };

    if (!tryMove(dx, dy)) {
      if (!tryMove(dx, 0)) tryMove(0, dy);
    }

    // Eight-frame cycle. Run uses the same poses, stepped faster.
    this.animTimer += 1;
    const frameEvery = (this.runHeld || virtualRunHeld) ? 2 : 3;
    if (this.animTimer >= frameEvery) {
      this.animTimer = 0;
      this.frame = (this.frame + 1) % 8;
    }
  }

  draw(ctx, hairColor, hairLength, age) {
    const spr = makePlayerSprite(
      hairColor,
      hairLength,
      hairWhiteAmount(age),
      this.facing,
      this.moving ? this.frame : -1
    );
    drawCrispSprite(ctx, spr, this.x - 2, this.y - 12);
  }

  center() {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }

  overlaps(rx, ry, rw, rh) {
    return this.x < rx + rw && this.x + this.w > rx && this.y < ry + rh && this.y + this.h > ry;
  }
}
