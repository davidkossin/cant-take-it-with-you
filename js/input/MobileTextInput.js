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
 *
 * Touch devices: once the input has focus, it becomes a visible entry panel
 * (pixel style, double gold border) pinned to the top of window.visualViewport
 * so the OS keyboard never covers it: the question / label, the real input,
 * and Cancel / Done. Landscape uses a compact one-row layout. Desktop (mouse)
 * never opens the panel; the input stays invisible over the canvas field.
 */

import { FRAME_W, FRAME_H } from '../config.js';
import { sanitizeNumberInput, sanitizeTextInput } from '../render/Dialog.js';
import { formatMoneyWithCaret, formatMoneyInput } from '../ui/TextEdit.js';

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
    /** pointerType of the last press on the input (mouse presses are routed to the canvas) */
    this._lastPointerType = null;
    this._press = null;
    /** set by main.js: a mouse press on the overlay, handled like a canvas press */
    this.onMousePointer = null;
    /** touch-style device: focusing the input opens the entry panel */
    this._touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.panel = null;
    this._panelOpen = false;
    /** field value when the panel opened (Cancel restores it) */
    this._before = null;
    /** prompt question text (plain) */
    this._promptText = '';
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
    input.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this._lastPointerType = e.pointerType;
      if (e.pointerType === 'mouse') {
        // Desktop: the canvas field is the editor (caret, drag selection,
        // double click); keep the mouse from focusing this overlay.
        e.preventDefault();
        this.onMousePointer?.(e);
        return;
      }
      this._press = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    input.addEventListener('mousedown', (e) => {
      if (this._lastPointerType === 'mouse') e.preventDefault();
    });
    input.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      const p = this._press;
      this._press = null;
      // A quick tap places the caret where the canvas text is (the overlay's
      // own font metrics do not match the canvas). Long presses keep the
      // native selection handles; selectionchange mirrors them.
      if (this._panelOpen) return; // the visible panel input places its own caret
      if (!p || performance.now() - p.t > 450 || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) return;
      this._placeCaretAtClient(e.clientX);
    });
    input.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    // Mirror the native caret / selection into the canvas field.
    const mirror = () => this._mirrorSelection();
    input.addEventListener('select', mirror);
    input.addEventListener('keyup', mirror);
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === input) mirror();
    });

    // A new prompt shows its field on the next frame (layout is ready then).
    const origPrompt = this.dialog.prompt.bind(this.dialog);
    this.dialog.prompt = (text, opts = {}) => {
      this._promptText = plainText(text);
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
    // Last pointer kind decides touch vs desktop (hybrid laptops, emulators).
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') this._touch = true;
      else if (e.pointerType === 'mouse') this._touch = false;
    }, true);
    this._buildPanel();
    input.addEventListener('focus', () => {
      if (this._touch && this._open) this._openPanel();
    });
    input.addEventListener('blur', () => {
      // Done / Cancel keep focus (pointerdown is prevented); a blur from
      // elsewhere (keyboard hidden, tap outside) keeps the typed value.
      setTimeout(() => { if (!this.isFocused()) this._closePanel(); }, 0);
    });
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
    if (!this._open || t.owner !== this._owner || t.key !== this._key) {
      this._bind(t);
      if (this._panelOpen) this._fillPanel(t, true);
    }
    if (this._panelOpen) this._layoutPanel();
    else this.reposition(t.rect);
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
    this._pushSelection();
    this._syncing = false;
  }

  /** Copy the canvas field's caret / selection into the hidden input. */
  _pushSelection() {
    const sel = this.dialog.getTextSelection?.();
    if (!sel || !this.input) return;
    try {
      this.input.setSelectionRange(sel.start, sel.end, sel.direction);
    } catch (_) {
      /* ignore: not focusable yet */
    }
  }

  /** Copy the hidden input's selectionStart / End into the canvas field. */
  _mirrorSelection() {
    if (!this._open || this._syncing || !this.input || !this.isFocused()) return;
    const pending = this._pendingCaret;
    if (pending && performance.now() < pending.until) {
      // Just tapped: the browser places its own caret (its font metrics differ
      // from the canvas); put back the one under the finger.
      this._applyPendingCaret();
      return;
    }
    this._pendingCaret = null;
    const t = this._target();
    if (!t || this.input.value !== t.get()) return;
    const { selectionStart: s, selectionEnd: e, selectionDirection: dir } = this.input;
    if (s == null || e == null) return;
    this.dialog.setTextSelection?.(s, e, dir === 'backward' ? 'backward' : 'forward');
  }

  /** Caret at the canvas character under client x (tap on the field). */
  _placeCaretAtClient(clientX) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const lx = ((clientX - rect.left) / rect.width) * FRAME_W;
    const idx = this.dialog.caretIndexAt?.(lx);
    if (idx == null) return;
    this._pendingCaret = { idx, until: performance.now() + 150 };
    this._applyPendingCaret();
    // The browser moves its own caret after pointerup; set ours again after it.
    setTimeout(() => this._applyPendingCaret(), 0);
    setTimeout(() => this._applyPendingCaret(), 60);
  }

  _applyPendingCaret() {
    const pending = this._pendingCaret;
    if (!pending || !this._open) return;
    this.dialog.setTextSelection(pending.idx, pending.idx);
    this._syncing = true;
    this._pushSelection();
    this._syncing = false;
  }

  /** Kept for callers of the old API: show the input for the active field. */
  show() {
    this.sync();
  }

  hide() {
    this._closePanel();
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
    // Same caret / selection as the canvas field (e.g. where the field was tapped).
    this._syncing = true;
    this._pushSelection();
    this._syncing = false;
    setTimeout(() => {
      if (!this._open || !this.isFocused()) return;
      this._syncing = true;
      this._pushSelection();
      this._syncing = false;
    }, 0);
    return this.isFocused();
  }

  reposition(field) {
    if (!this.input || !this._open) return;
    if (this._panelOpen) { this._layoutPanel(); return; }
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
    this._pendingCaret = null;
    const t = this._target();
    if (!this._open || this._syncing || !t) return;
    const rawValue = this.input.value;
    const pos = this.input.selectionStart ?? rawValue.length;
    let v = rawValue;
    let caret = pos;

    if (t.type === 'money') {
      // Keep the caret beside the same digit when commas move.
      const out = formatMoneyWithCaret(rawValue.replace(/[^\d.,\-]/g, ''), pos - (rawValue.slice(0, pos).match(/[^\d.,\-]/g) || []).length);
      if (out) { v = out.value; caret = out.caret; }
      else { v = formatMoneyInput(rawValue); caret = v.length; }
    } else if (t.type === 'number' || t.type === 'percent') {
      v = sanitizeNumberInput(rawValue);
      caret = Math.min(v.length, sanitizeNumberInput(rawValue.slice(0, pos)).length);
    } else {
      v = sanitizeTextInput(rawValue);
      caret = Math.min(v.length, pos);
    }

    t.set(v);

    this._syncing = true;
    if (this.input.value !== v) this.input.value = v;
    try {
      this.input.setSelectionRange(caret, caret);
    } catch (_) {
      /* ignore */
    }
    this._syncing = false;
    this.dialog.setTextSelection?.(caret, caret);
  }

  _onKeyDown(e) {
    this._pendingCaret = null;
    if (this._panelOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this._cancel();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        this._stepField(e.shiftKey ? -1 : 1, true);
        return;
      }
    }
    // Return on a form field that is not the last one moves to the next
    // field and keeps the keyboard up. Otherwise Enter / Escape bubble to the
    // window handler (Accept / Cancel); prevent the input's default action.
    if (e.key === 'Enter' && this.dialog.active && this.dialog.mode === 'form'
        && this.dialog.fieldIndex < this.dialog.fields.length - 1) {
      e.preventDefault();
      e.stopPropagation();
      this._stepField(1, false);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
    }
  }

  /** Next / previous form field, keeping the keyboard (and panel) up. */
  _stepField(dir, wrap) {
    const d = this.dialog;
    if (!d.active || d.mode !== 'form') return false;
    const n = d.fields.length;
    let next = d.fieldIndex + dir;
    if (wrap) next = (next + n) % n;
    if (next < 0 || next >= n) return false;
    if (d.focusField) d.focusField(next, 'all');
    else d.fieldIndex = next;
    this.sync();
    if (this._panelOpen) {
      const t = this._target();
      if (t) this._fillPanel(t, true);
      try { this.input.select(); } catch (_) { /* ignore */ }
    }
    return true;
  }

  // ── Entry panel (touch) ───────────────────────────────────────────────

  _buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'mobile-entry-panel';
    panel.className = 'mobile-entry';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.innerHTML =
      '<div class="me-text"><div class="me-title"></div><div class="me-q"></div><div class="me-hint"></div></div>' +
      '<div class="me-slot"></div>' +
      '<div class="me-btns"><button type="button" class="me-cancel">Cancel</button>' +
      '<button type="button" class="me-done">Done</button></div>';
    document.body.appendChild(panel);
    this.panel = panel;
    this._els = {
      title: panel.querySelector('.me-title'),
      q: panel.querySelector('.me-q'),
      hint: panel.querySelector('.me-hint'),
      slot: panel.querySelector('.me-slot'),
      done: panel.querySelector('.me-done'),
      cancel: panel.querySelector('.me-cancel'),
    };
    // Keep focus in the input (and the keyboard up) while a button is pressed.
    for (const b of [this._els.done, this._els.cancel]) {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    }
    this._els.done.addEventListener('click', (e) => { e.stopPropagation(); this._done(); });
    this._els.cancel.addEventListener('click', (e) => { e.stopPropagation(); this._cancel(); });
    // Taps on the panel itself are not game taps.
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }

  _openPanel() {
    const t = this._target();
    if (!t || !this.panel) return;
    this._panelOpen = true;
    this.panel.hidden = false;
    this.input.classList.add('in-panel');
    document.body.classList.add('mobile-entry-open');
    this._fillPanel(t, true);
    this._layoutPanel();
  }

  _closePanel() {
    if (!this._panelOpen) return;
    this._panelOpen = false;
    this._before = null;
    if (this.panel) this.panel.hidden = true;
    this.input?.classList.remove('in-panel');
    document.body.classList.remove('mobile-entry-open');
    const t = this._open ? this._target() : null;
    if (t?.rect) this.reposition(t.rect);
  }

  /** Text for the panel: dialog title, question / field label, hint. */
  _fillPanel(t, resetBefore) {
    const d = this.dialog;
    if (resetBefore) this._before = t.get();
    let q = '', hint = '', prefix = '';
    if (t.key === 'prompt') {
      q = this._promptText || '';
      hint = d.subtitle || '';
      prefix = d.promptPrefix || '';
    } else {
      const i = d.fieldIndex;
      const f = d.fields[i] || {};
      q = f.label || '';
      hint = f.subtitle || d.subtitle || '';
      prefix = f.prefix || '';
      if (d.fields.length > 1) hint = `Field ${i + 1}/${d.fields.length}` + (hint ? ` · ${hint}` : '');
    }
    this._els.title.textContent = plainText(d.title || 'Enter');
    this._els.q.textContent = plainText(q);
    this._els.hint.textContent = plainText(hint);
    this._els.hint.hidden = !hint;
    this._els.slot.dataset.prefix = prefix;
    this._els.done.textContent = t.last || t.key === 'prompt' ? 'Done' : 'Next';
  }

  /** Pin the panel to the top of the visual viewport, input over its slot. */
  _layoutPanel() {
    if (!this._panelOpen || !this.panel) return;
    const vv = window.visualViewport;
    const vx = vv ? vv.offsetLeft : 0, vy = vv ? vv.offsetTop : 0;
    const vw = vv ? vv.width : window.innerWidth, vh = vv ? vv.height : window.innerHeight;
    const compact = vw > vh;
    const p = this.panel;
    p.classList.toggle('is-compact', compact);
    // Short visible strip (landscape with the keyboard up): drop the hint.
    p.classList.toggle('no-hint', compact && vh < 200);
    const m = 8;
    p.style.left = `${vx + m}px`;
    p.style.top = `${vy + m}px`;
    p.style.width = `${Math.max(200, vw - m * 2)}px`;
    p.style.maxHeight = `${Math.max(80, vh - m * 2)}px`;
    const r = this._els.slot.getBoundingClientRect();
    const el = this.input;
    const pre = this._els.slot.dataset.prefix ? 22 : 0;
    el.style.left = `${r.left + pre}px`;
    el.style.top = `${r.top}px`;
    el.style.width = `${Math.max(40, r.width - pre)}px`;
    el.style.height = `${r.height}px`;
    el.style.fontSize = '16px';
    el.tabIndex = 0;
  }

  /** Done / Next: the value is already live in the game field. */
  _done() {
    if (!this._panelOpen) return;
    const t = this._target();
    if (t && t.key !== 'prompt' && !t.last && this._stepField(1, false)) return;
    this._before = null;
    this.input.blur();
    this._closePanel();
  }

  /** Cancel: put back the value from when the panel opened. */
  _cancel() {
    const t = this._target();
    if (t && this._before != null) {
      t.set(this._before);
      this._seed(t);
      const n = this._before.length;
      this.dialog.setTextSelection?.(n, n);
    }
    this._before = null;
    this.input.blur();
    this._closePanel();
  }
}

/** Plain text from a dialog string (drops **bold** / _italic_ markers and newlines). */
function plainText(s) {
  return String(s ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)_(.+?)_(?=\s|$|[.,!?])/g, '$1$2').replace(/\s*\n\s*/g, ' ').trim();
}
