/**
 * Invisible HTML <input> laid over the active Dialog text field (a prompt
 * field or the focused form field) so mobile OS keyboards can type into the
 * canvas. Desktop keyboard typing into the canvas stays intact while this
 * input is not focused.
 *
 * Opening the keyboard: iOS Safari (and Android Chrome) only show it when
 * focus() runs synchronously inside a user-activation handler. For touch,
 * pointerdown/touchstart do not count; pointerup, touchend and click do.
 * So: a tap on the overlay focuses it natively; a tap on another form field
 * is focused from the canvas pointerup/touchend (main.js); the on-screen A
 * button focuses from its pointerup/touchend (VirtualPad). None auto-focus.
 */

import { FRAME_W, FRAME_H } from '../config.js';
import { formatMoneyInput, sanitizeNumberInput, sanitizeTextInput } from '../render/Dialog.js';

export class MobileTextInput {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../render/Dialog.js').Dialog} dialog
   */
  constructor(canvas, dialog) {
    this.canvas = canvas;
    this.dialog = dialog;
    this.input = null;
    this._open = false;
    this._syncing = false;
    this._bound = false;
    /** identity of the field the input is bound to (dialog instance + field) */
    this._owner = null;
    this._key = null;
  }

  mount() {
    if (this._bound) return;
    this._bound = true;

    const input = document.createElement('input');
    input.id = 'mobile-text-input';
    input.className = 'mobile-text-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Dialog text entry');
    input.tabIndex = -1;
    document.body.appendChild(input);
    this.input = input;

    input.addEventListener('input', () => this._onInput());
    input.addEventListener('keydown', (e) => this._onKeyDown(e));
    // Re-seed on focus so desktop typing into the canvas stays in sync
    input.addEventListener('focus', () => {
      const t = this._target();
      if (!this._open || !t) return;
      this._seed(t);
    });
    // Stop pad/page from treating our taps as game gestures incorrectly
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

    // A new prompt shows its field on the next frame (layout is ready then).
    const origPrompt = this.dialog.prompt.bind(this.dialog);
    this.dialog.prompt = (text, opts = {}) => {
      const p = origPrompt(text, opts);
      requestAnimationFrame(() => this.sync());
      return p;
    };

    const origClose = this.dialog.close.bind(this.dialog);
    this.dialog.close = (result) => {
      this.hide();
      origClose(result);
    };

    const reposition = () => {
      if (this._open) this.sync();
    };
    window.addEventListener('resize', reposition);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', reposition);
      window.visualViewport.addEventListener('scroll', reposition);
    }

    this.hide();
  }

  /**
   * The text field the input should cover now, or null.
   * @returns {{key:string, owner:object, type:string, rect:object|null, last:boolean,
   *   get:() => string, set:(v:string) => void}|null}
   */
  _target() {
    const d = this.dialog;
    if (!d.active) return null;
    if (d.mode === 'prompt') {
      return {
        key: 'prompt',
        owner: d.resolve,
        type: d.promptType || 'text',
        rect: d.getPromptFieldRect?.() || null,
        last: true,
        get: () => String(d.promptValue ?? ''),
        set: (v) => { d.promptValue = v; },
      };
    }
    if (d.mode === 'form') {
      const i = d.fieldIndex;
      const f = d.fields[i];
      if (!f) return null; // cursor is on Accept / Back
      return {
        key: `form:${i}`,
        owner: d.fields,
        type: f.type || 'text',
        rect: d.getFormFieldRect?.(i) || null,
        last: i >= d.fields.length - 1,
        get: () => String(f.value ?? ''),
        set: (v) => { d.setFieldValue(i, v); },
      };
    }
    return null;
  }

  /**
   * Keep the input over the active field. Called every rendered frame from
   * main.js and on viewport changes. Rebinds when the field or dialog changes.
   */
  sync(enabled = true) {
    if (!this.input) return;
    const t = enabled ? this._target() : null;
    if (!t || !t.rect) {
      if (this._open) this.hide();
      return;
    }
    if (!this._open || t.owner !== this._owner || t.key !== this._key) this._bind(t);
    this.reposition(t.rect);
  }

  /** Point the input at a new field: value, keyboard type, Return key label. */
  _bind(t) {
    this._owner = t.owner;
    this._key = t.key;
    this._seed(t);
    if (t.type === 'money' || t.type === 'number' || t.type === 'percent') {
      this.input.type = 'text';
      this.input.inputMode = 'decimal';
      this.input.removeAttribute('maxlength');
    } else {
      this.input.type = 'text';
      this.input.inputMode = 'text';
      this.input.maxLength = 28;
    }
    this.input.enterKeyHint = t.last ? 'done' : 'next';
    this._open = true;
    this.input.hidden = false;
    this.input.setAttribute('aria-hidden', 'false');
    this.input.classList.add('is-active');
    // Do NOT auto-focus: a tap or the A button summons the OS keyboard.
  }

  _seed(t) {
    this._syncing = true;
    this.input.value = t.get();
    this._syncing = false;
  }

  /** Kept for callers of the old API: show the input for the active field. */
  show() {
    this.sync();
  }

  hide() {
    this._open = false;
    this._owner = null;
    this._key = null;
    if (!this.input) return;
    if (document.activeElement === this.input) {
      this.input.blur();
    }
    this.input.value = '';
    this.input.hidden = true;
    this.input.setAttribute('aria-hidden', 'true');
    this.input.classList.remove('is-active');
    this.input.style.left = '-9999px';
    this.input.style.top = '-9999px';
    this.input.style.width = '1px';
    this.input.style.height = '1px';
    this.input.tabIndex = -1;
  }

  /** @returns {boolean} */
  isFocused() {
    return !!(this.input && document.activeElement === this.input);
  }

  /**
   * True when the A button should open the keyboard instead of confirming:
   * a prompt with Accept highlighted, or a form with a field (not the
   * Accept / Back row) selected, and the keyboard input not focused yet.
   */
  wantsFocus() {
    const t = this._target();
    if (!t || !t.rect || this.isFocused()) return false;
    if (t.key === 'prompt') return this.dialog.selected === 0;
    return true;
  }

  /**
   * Focus the input over the active field. Must be called synchronously from
   * a pointerup / touchend / click handler for the keyboard to open on iOS.
   * @returns {boolean} whether the input now has focus
   */
  focusActiveField() {
    this.sync();
    if (!this._open || !this.input) return false;
    try {
      this.input.focus({ preventScroll: true });
    } catch (_) {
      this.input.focus();
    }
    try {
      const n = this.input.value.length;
      this.input.setSelectionRange(n, n);
    } catch (_) {
      /* ignore */
    }
    return this.isFocused();
  }

  reposition(field) {
    if (!this.input || !this._open) return;
    if (!field) {
      this.hide();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / FRAME_W;
    const scaleY = rect.height / FRAME_H;

    const left = rect.left + field.x * scaleX;
    const top = rect.top + field.y * scaleY;
    const width = Math.max(8, field.w * scaleX);
    const height = Math.max(14, field.h * scaleY);

    const el = this.input;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    // iOS zooms the page when a focused input's font is under 16 px.
    el.style.fontSize = '16px';
    el.tabIndex = 0;
  }

  _onInput() {
    const t = this._target();
    if (!this._open || this._syncing || !t) return;
    let v = this.input.value;

    if (t.type === 'money') {
      v = formatMoneyInput(v);
    } else if (t.type === 'number' || t.type === 'percent') {
      v = sanitizeNumberInput(v);
    } else {
      v = sanitizeTextInput(v);
    }

    t.set(v);

    if (this.input.value !== v) {
      this._syncing = true;
      const pos = this.input.selectionStart;
      this.input.value = v;
      try {
        const next = Math.min(v.length, pos ?? v.length);
        this.input.setSelectionRange(next, next);
      } catch (_) {
        /* ignore */
      }
      this._syncing = false;
    }
  }

  _onKeyDown(e) {
    // Return on a form field that is not the last one moves to the next
    // field and keeps the keyboard up. Otherwise Enter / Escape bubble to the
    // window handler (Accept / Cancel); prevent the input's default action.
    if (e.key === 'Enter' && this.dialog.active && this.dialog.mode === 'form'
        && this.dialog.fieldIndex < this.dialog.fields.length - 1) {
      e.preventDefault();
      e.stopPropagation();
      this.dialog.fieldIndex += 1;
      this.sync();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
    }
  }
}
