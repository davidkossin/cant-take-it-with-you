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
  }

  unbindInput(target = window) {
    if (this._kd) target.removeEventListener('keydown', this._kd);
    if (this._ku) target.removeEventListener('keyup', this._ku);
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
    ctx.drawImage(spr, Math.round(this.x - 2), Math.round(this.y - 12));
  }

  center() {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }

  overlaps(rx, ry, rw, rh) {
    return this.x < rx + rw && this.x + this.w > rx && this.y < ry + rh && this.y + this.h > ry;
  }
}
