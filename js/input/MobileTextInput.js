/**
 * Invisible HTML <input> overlaid on Dialog prompt fields so mobile OS
 * keyboards can type into canvas prompts. Desktop keyboard path stays intact
 * when this input is not focused.
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
      if (!this._open) return;
      this._syncing = true;
      this.input.value = String(this.dialog.promptValue ?? '');
      this._syncing = false;
    });
    // Stop pad/page from treating our taps as game gestures incorrectly
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

    const origPrompt = this.dialog.prompt.bind(this.dialog);
    this.dialog.prompt = (text, opts = {}) => {
      const p = origPrompt(text, opts);
      // Defer until layout (chrome) is ready for the new prompt
      requestAnimationFrame(() => this.show());
      return p;
    };

    const origClose = this.dialog.close.bind(this.dialog);
    this.dialog.close = (result) => {
      this.hide();
      origClose(result);
    };

    const reposition = () => {
      if (this._open) this.reposition();
    };
    window.addEventListener('resize', reposition);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', reposition);
      window.visualViewport.addEventListener('scroll', reposition);
    }

    this.hide();
  }

  show() {
    if (!this.input || !this.dialog.active || this.dialog.mode !== 'prompt') return;

    const type = this.dialog.promptType || 'text';
    this.input.value = String(this.dialog.promptValue ?? '');

    if (type === 'money' || type === 'number' || type === 'percent') {
      this.input.type = 'text';
      this.input.inputMode = 'decimal';
      this.input.removeAttribute('maxlength');
    } else {
      this.input.type = 'text';
      this.input.inputMode = 'text';
      this.input.maxLength = 28;
    }

    this._open = true;
    this.input.hidden = false;
    this.input.setAttribute('aria-hidden', 'false');
    this.input.classList.add('is-active');
    this.reposition();
    // Do NOT auto-focus — tap the field to summon the OS keyboard.
  }

  hide() {
    this._open = false;
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

  reposition() {
    if (!this.input || !this._open) return;
    const field = this.dialog.getPromptFieldRect?.();
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
    el.style.fontSize = `${Math.max(10, 8 * scaleY)}px`;
    el.tabIndex = 0;
  }

  _onInput() {
    if (!this._open || this._syncing) return;
    const type = this.dialog.promptType || 'text';
    let v = this.input.value;

    if (type === 'money') {
      v = formatMoneyInput(v);
    } else if (type === 'number' || type === 'percent') {
      v = sanitizeNumberInput(v);
    } else {
      v = sanitizeTextInput(v);
    }

    this.dialog.promptValue = v;

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
    // Enter / Escape while focused: let the bubbled window handler Accept/Cancel.
    // Prevent duplicate newline / default form behavior.
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
    }
  }
}
