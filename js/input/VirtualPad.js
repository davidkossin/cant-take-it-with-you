/**
 * On-screen joystick + A/B/Run/Menu for smartphones.
 * The stick writes virtualStick (analog). It never confirms or opens a menu.
 * A strong deflection can nudge menu arrows only; those events are ignored
 * by the player so keyboard movement stays digital and unchanged.
 * Action buttons dispatch synthetic KeyboardEvents so existing handlers work.
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

/** True only while a stick-driven menu arrow is being dispatched. */
export let virtualStickEvent = false;

/** Fraction of the travel radius that does not move (light touch). */
const STICK_DEADZONE = 0.18;

/** Remapped deflection (0 at the deadzone edge, 1 at the rim) before a menu nudge. */
const STICK_MENU_AT = 0.55;

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

function fireKey(key, type = 'keydown') {
  window.dispatchEvent(
    new KeyboardEvent(type, {
      key,
      code: key,
      bubbles: true,
      cancelable: true,
    })
  );
}

function fireStickArrow(key) {
  virtualStickEvent = true;
  try {
    fireKey(key, 'keydown');
  } finally {
    virtualStickEvent = false;
  }
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
    this._menuKey = null;
    this._menuTimer = 0;
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
      if (this._stickId != null) return;
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

    // Run: hold only. Does not dispatch a key, so it cannot confirm or open a menu.
    const runBtn = this.root.querySelector('[data-run]');
    if (runBtn) {
      const runDown = (e) => {
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

    // Actions: tap. Joystick never uses this path.
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
   * Knob center follows the finger, clamped so the knob stays inside the base.
   * Full travel = full walk speed. Inside STICK_DEADZONE, speed is zero.
   */
  _applyStick(e) {
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
      this._setMenuKey(null);
      return;
    }
    const scale = (len - STICK_DEADZONE) / (1 - STICK_DEADZONE);
    virtualStick.x = (nx / len) * scale;
    virtualStick.y = (ny / len) * scale;

    let menuKey = null;
    if (scale >= STICK_MENU_AT) {
      if (Math.abs(virtualStick.x) >= Math.abs(virtualStick.y)) {
        menuKey = virtualStick.x < 0 ? DIR_KEYS.left : DIR_KEYS.right;
      } else {
        menuKey = virtualStick.y < 0 ? DIR_KEYS.up : DIR_KEYS.down;
      }
    }
    this._setMenuKey(menuKey);
  }

  _setMenuKey(key) {
    if (key === this._menuKey) {
      if (key && performance.now() - this._menuTimer >= 180) {
        this._menuTimer = performance.now();
        fireStickArrow(key);
      }
      return;
    }
    this._menuKey = key;
    this._menuTimer = performance.now();
    if (key) fireStickArrow(key);
  }

  _releaseStick() {
    this._stickId = null;
    virtualStick.x = 0;
    virtualStick.y = 0;
    this._menuKey = null;
    if (this._knob) this._knob.style.transform = 'translate(0px, 0px)';
    this._base?.classList.remove('is-down');
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

  hide() {
    if (!this.visible && this.root.hidden) return;
    this.visible = false;
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-virtual-pad');
    window.dispatchEvent(new Event('resize'));
    virtualRunHeld = false;
    this._releaseStick();
    for (const key of [...virtualKeys]) {
      virtualKeys.delete(key);
      fireKey(key, 'keyup');
    }
    this.root.querySelectorAll('.is-down').forEach((el) => el.classList.remove('is-down'));
  }
}
