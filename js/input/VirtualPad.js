/**
 * On-screen controls for smartphones.
 * Walking (Decision Room / Hallway, no discrete menu) shows a joystick.
 * The stick writes virtualStick (analog). It never confirms, never opens a
 * menu, and never sends arrow keys.
 * Menus, the pause menu, title/setup choices, the ending menu, and dialog
 * choice lists hide the joystick and show a 4-way D-pad in the same corner.
 * D-pad presses dispatch the same Arrow keys the keyboard uses. A tap is one
 * step. Holding repeats. Releasing stops. The D-pad never confirms.
 * A, B, Run, and Menu dispatch the same actions as before. Run is hidden
 * when it would not move the player.
 */

export const virtualKeys = new Set();

/** True while the touch Run button is held. Not a confirm key. */
export let virtualRunHeld = false;

/**
 * Stick vector after the deadzone, each axis in -1..1.
 * Length is 0 inside the deadzone and 1 at full deflection.
 * Full deflection is full walk speed. Shorter deflection scales speed.
 */
export const virtualStick = { x: 0, y: 0 };

/** Fraction of the travel radius that does not move (light touch). */
const STICK_DEADZONE = 0.18;

/**
 * Hold-to-repeat for the D-pad. Keyboard menus already step on each keydown
 * (including the browser's key-repeat). A tap fires once. After a short
 * delay, holding fires again at a menu-friendly rate, and pointer-up stops it.
 */
const DPAD_REPEAT_DELAY = 420;
const DPAD_REPEAT_EVERY = 140;

const DIR_KEYS = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

const ACTION_KEYS = {
  confirm: 'Enter',
  cancel: 'x',
  menu: 'Escape',
};

function isTouchish() {
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) return true;
  if (window.innerWidth <= 900) return true;
  return false;
}

function fireKey(key, type = 'keydown', repeat = false) {
  window.dispatchEvent(
    new KeyboardEvent(type, {
      key,
      code: key,
      bubbles: true,
      cancelable: true,
      repeat,
    })
  );
}

export class VirtualPad {
  /**
   * @param {HTMLElement} root
   */
  constructor(root) {
    this.root = root;
    this.visible = false;
    this._bound = false;
    this._stickId = null;
    this._discrete = false;
    this._showRun = false;
    this._dirPointer = null;
    this._dirKey = null;
    this._dirBtn = null;
    this._dirDelay = 0;
    this._dirRepeat = 0;
    this._dirWatch = (e) => {
      if (this._dirPointer == null || e.pointerId !== this._dirPointer) return;
      e.preventDefault();
      this._releaseDir();
    };
  }

  mount() {
    if (this._bound) return;
    this._bound = true;

    this.root.innerHTML = `
      <div class="vp-stick" aria-label="Move joystick">
        <div class="vp-stick-base">
          <div class="vp-stick-knob" aria-hidden="true"></div>
        </div>
      </div>
      <div class="vp-dpad" aria-label="Menu directions">
        <button type="button" class="vp-btn vp-dpad-btn vp-dpad-up" data-dir="up" aria-label="Up"><span class="vp-arrow vp-arrow-up" aria-hidden="true"></span></button>
        <button type="button" class="vp-btn vp-dpad-btn vp-dpad-left" data-dir="left" aria-label="Left"><span class="vp-arrow vp-arrow-left" aria-hidden="true"></span></button>
        <button type="button" class="vp-btn vp-dpad-btn vp-dpad-right" data-dir="right" aria-label="Right"><span class="vp-arrow vp-arrow-right" aria-hidden="true"></span></button>
        <button type="button" class="vp-btn vp-dpad-btn vp-dpad-down" data-dir="down" aria-label="Down"><span class="vp-arrow vp-arrow-down" aria-hidden="true"></span></button>
      </div>
      <div class="vp-actions" aria-label="Action buttons">
        <button type="button" class="vp-btn vp-action vp-menu" data-action="menu" aria-label="Menu">Menu</button>
        <button type="button" class="vp-btn vp-action vp-run" data-run="1" aria-label="Run">Run</button>
        <div class="vp-ab">
          <button type="button" class="vp-btn vp-action vp-b" data-action="cancel" aria-label="B cancel">B</button>
          <button type="button" class="vp-btn vp-action vp-a" data-action="confirm" aria-label="A confirm">A</button>
        </div>
      </div>
    `;

    this._base = this.root.querySelector('.vp-stick-base');
    this._knob = this.root.querySelector('.vp-stick-knob');

    const stickDown = (e) => {
      if (this._discrete || this._stickId != null) return;
      e.preventDefault();
      e.stopPropagation();
      this._stickId = e.pointerId;
      try {
        this._base.setPointerCapture?.(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      this._base.classList.add('is-down');
      this._applyStick(e);
    };
    const stickMove = (e) => {
      if (e.pointerId !== this._stickId) return;
      e.preventDefault();
      this._applyStick(e);
    };
    const stickUp = (e) => {
      if (e.pointerId !== this._stickId) return;
      e.preventDefault();
      this._releaseStick();
    };

    this._base.addEventListener('pointerdown', stickDown);
    this._base.addEventListener('pointermove', stickMove);
    this._base.addEventListener('pointerup', stickUp);
    this._base.addEventListener('pointercancel', stickUp);
    this._base.addEventListener('lostpointercapture', stickUp);
    this._base.addEventListener('contextmenu', (e) => e.preventDefault());

    this.root.querySelectorAll('[data-dir]').forEach((btn) => {
      const dir = btn.getAttribute('data-dir');
      const key = DIR_KEYS[dir];
      if (!key) return;
      btn.addEventListener('pointerdown', (e) => {
        if (!this._discrete) return;
        e.preventDefault();
        e.stopPropagation();
        this._pressDir(key, btn, e.pointerId);
      });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // Run: hold only. Does not dispatch a key, so it cannot confirm or open a menu.
    const runBtn = this.root.querySelector('[data-run]');
    if (runBtn) {
      const runDown = (e) => {
        if (!this._showRun) return;
        e.preventDefault();
        e.stopPropagation();
        virtualRunHeld = true;
        runBtn.classList.add('is-down');
        try {
          runBtn.setPointerCapture?.(e.pointerId);
        } catch (_) {
          /* ignore */
        }
      };
      const runUp = (e) => {
        e.preventDefault();
        e.stopPropagation();
        virtualRunHeld = false;
        runBtn.classList.remove('is-down');
      };
      runBtn.addEventListener('pointerdown', runDown);
      runBtn.addEventListener('pointerup', runUp);
      runBtn.addEventListener('pointercancel', runUp);
      runBtn.addEventListener('lostpointercapture', runUp);
      runBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Actions: tap. Joystick and D-pad never use this path.
    this.root.querySelectorAll('[data-action]').forEach((btn) => {
      const action = btn.getAttribute('data-action');
      const key = ACTION_KEYS[action];
      if (!key) return;

      const press = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('is-down');
        fireKey(key, 'keydown');
        window.setTimeout(() => {
          btn.classList.remove('is-down');
          fireKey(key, 'keyup');
        }, 80);
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    this.root.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
      },
      { passive: false }
    );

    this.setLayout({ discrete: false, showRun: false });
    this.refreshVisibility();
    window.addEventListener('resize', () => this.refreshVisibility());
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.refreshVisibility());
    }
    window.addEventListener(
      'touchstart',
      () => {
        this.show();
      },
      { once: true, passive: true }
    );
  }

  /**
   * Switch the lower-left control immediately.
   * @param {{ discrete?: boolean, showRun?: boolean }} layout
   *   discrete — 4-way D-pad (menus). Otherwise the walk joystick.
   *   showRun — Run button. Hidden in menus and whenever the player is not walking.
   */
  setLayout({ discrete = false, showRun = false } = {}) {
    if (!this._bound) return;
    if (discrete !== this._discrete) {
      this._discrete = discrete;
      this.root.classList.toggle('is-discrete', discrete);
      if (discrete) this._releaseStick();
      else this._releaseDir();
    }
    if (showRun !== this._showRun) {
      this._showRun = showRun;
      this.root.classList.toggle('is-walking', showRun);
      if (!showRun) {
        virtualRunHeld = false;
        this.root.querySelector('[data-run]')?.classList.remove('is-down');
      }
    }
  }

  _pressDir(key, btn, pointerId) {
    if (this._dirPointer != null && this._dirPointer !== pointerId) return;
    if (this._dirKey === key && this._dirPointer === pointerId) return;
    this._releaseDir();
    this._dirPointer = pointerId;
    this._dirKey = key;
    this._dirBtn = btn;
    btn.classList.add('is-down');
    try {
      btn.setPointerCapture?.(pointerId);
    } catch (_) {
      /* ignore */
    }
    fireKey(key, 'keydown', false);
    window.addEventListener('pointerup', this._dirWatch);
    window.addEventListener('pointercancel', this._dirWatch);
    this._dirDelay = window.setTimeout(() => {
      this._dirDelay = 0;
      if (this._dirKey !== key) return;
      this._dirRepeat = window.setInterval(() => {
        if (this._dirKey !== key) return;
        fireKey(key, 'keydown', true);
      }, DPAD_REPEAT_EVERY);
    }, DPAD_REPEAT_DELAY);
  }

  _releaseDir() {
    if (this._dirDelay) {
      window.clearTimeout(this._dirDelay);
      this._dirDelay = 0;
    }
    if (this._dirRepeat) {
      window.clearInterval(this._dirRepeat);
      this._dirRepeat = 0;
    }
    window.removeEventListener('pointerup', this._dirWatch);
    window.removeEventListener('pointercancel', this._dirWatch);
    const key = this._dirKey;
    const btn = this._dirBtn;
    const pointerId = this._dirPointer;
    this._dirKey = null;
    this._dirBtn = null;
    this._dirPointer = null;
    btn?.classList.remove('is-down');
    if (pointerId != null && btn?.hasPointerCapture?.(pointerId)) {
      try {
        btn.releasePointerCapture(pointerId);
      } catch (_) {
        /* ignore */
      }
    }
    if (key) fireKey(key, 'keyup', false);
  }

  /**
   * Knob center follows the finger, clamped so the knob stays inside the base.
   * Full travel = full walk speed. Inside STICK_DEADZONE, speed is zero.
   * Does not dispatch arrow keys.
   */
  _applyStick(e) {
    if (this._discrete) {
      this._releaseStick();
      return;
    }
    const rect = this._base.getBoundingClientRect();
    const radius = rect.width / 2;
    const knobRect = this._knob.getBoundingClientRect();
    const knobR = knobRect.width / 2;
    const maxTravel = Math.max(8, radius - knobR);
    let dx = e.clientX - (rect.left + radius);
    let dy = e.clientY - (rect.top + radius);
    const dist = Math.hypot(dx, dy);
    if (dist > maxTravel && dist > 0) {
      dx *= maxTravel / dist;
      dy *= maxTravel / dist;
    }
    this._knob.style.transform = `translate(${dx}px, ${dy}px)`;

    let nx = dx / maxTravel;
    let ny = dy / maxTravel;
    let len = Math.hypot(nx, ny);
    if (len > 1) {
      nx /= len;
      ny /= len;
      len = 1;
    }
    if (len <= STICK_DEADZONE || len === 0) {
      virtualStick.x = 0;
      virtualStick.y = 0;
      return;
    }
    const scale = (len - STICK_DEADZONE) / (1 - STICK_DEADZONE);
    virtualStick.x = (nx / len) * scale;
    virtualStick.y = (ny / len) * scale;
  }

  _releaseStick() {
    const id = this._stickId;
    this._stickId = null;
    virtualStick.x = 0;
    virtualStick.y = 0;
    if (this._knob) this._knob.style.transform = 'translate(0px, 0px)';
    this._base?.classList.remove('is-down');
    if (id != null && this._base?.hasPointerCapture?.(id)) {
      try {
        this._base.releasePointerCapture(id);
      } catch (_) {
        /* ignore */
      }
    }
  }

  refreshVisibility() {
    if (isTouchish()) this.show();
    else this.hide();
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-virtual-pad');
    window.dispatchEvent(new Event('resize'));
  }

  clearHeldInput() {
    virtualRunHeld = false;
    this._releaseStick();
    this._releaseDir();
    for (const key of [...virtualKeys]) {
      virtualKeys.delete(key);
      fireKey(key, 'keyup');
    }
    this.root.querySelectorAll('.is-down').forEach((el) => el.classList.remove('is-down'));
  }

  hide() {
    if (!this.visible && this.root.hidden) return;
    this.visible = false;
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-virtual-pad');
    window.dispatchEvent(new Event('resize'));
    this.clearHeldInput();
  }
}
