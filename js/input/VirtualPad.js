/**
 * On-screen D-pad + A/B/Menu for smartphones.
 * Holds virtualKeys (same strings as KEYS) for movement;
 * action buttons dispatch synthetic KeyboardEvents so existing handlers work.
 */

export const virtualKeys = new Set();

/** True while the touch Run button is held. Not a confirm key. */
export let virtualRunHeld = false;

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

export class VirtualPad {
  /**
   * @param {HTMLElement} root
   */
  constructor(root) {
    this.root = root;
    this.visible = false;
    this._held = new Map(); // pointerId -> key
    this._bound = false;
  }

  mount() {
    if (this._bound) return;
    this._bound = true;

    this.root.innerHTML = `
      <div class="vp-dpad" aria-label="Direction pad">
        <button type="button" class="vp-btn vp-dir" data-dir="up" aria-label="Up">▲</button>
        <button type="button" class="vp-btn vp-dir" data-dir="left" aria-label="Left">◀</button>
        <button type="button" class="vp-btn vp-dir vp-center" disabled tabindex="-1" aria-hidden="true"></button>
        <button type="button" class="vp-btn vp-dir" data-dir="right" aria-label="Right">▶</button>
        <button type="button" class="vp-btn vp-dir" data-dir="down" aria-label="Down">▼</button>
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

    // Direction: hold
    this.root.querySelectorAll('[data-dir]').forEach((btn) => {
      const dir = btn.getAttribute('data-dir');
      const key = DIR_KEYS[dir];
      if (!key) return;

      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled) return;
        const pid = e.pointerId ?? 'mouse';
        if (this._held.has(pid)) return;
        this._held.set(pid, key);
        virtualKeys.add(key);
        btn.classList.add('is-down');
        fireKey(key, 'keydown');
        try {
          btn.setPointerCapture?.(e.pointerId);
        } catch (_) {
          /* ignore */
        }
      };
      const up = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pid = e.pointerId ?? 'mouse';
        const held = this._held.get(pid);
        if (held) {
          this._held.delete(pid);
          // Only release if no other pointer holds the same key
          let still = false;
          for (const k of this._held.values()) {
            if (k === held) {
              still = true;
              break;
            }
          }
          if (!still) {
            virtualKeys.delete(held);
            fireKey(held, 'keyup');
          }
        }
        btn.classList.remove('is-down');
      };

      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      // Avoid context menu / focus scroll
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });


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

    // Actions: tap
    this.root.querySelectorAll('[data-action]').forEach((btn) => {
      const action = btn.getAttribute('data-action');
      const key = ACTION_KEYS[action];
      if (!key) return;

      const press = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('is-down');
        fireKey(key, 'keydown');
        // brief visual + keyup so keys don't stick
        window.setTimeout(() => {
          btn.classList.remove('is-down');
          fireKey(key, 'keyup');
        }, 80);
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // Block page scroll on the overlay itself
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
    // First real touch: always show
    window.addEventListener(
      'touchstart',
      () => {
        this.show();
      },
      { once: true, passive: true }
    );
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
    // Release any held dirs
    for (const key of [...virtualKeys]) {
      virtualKeys.delete(key);
      fireKey(key, 'keyup');
    }
    this._held.clear();
    this.root.querySelectorAll('.is-down').forEach((el) => el.classList.remove('is-down'));
  }
}
