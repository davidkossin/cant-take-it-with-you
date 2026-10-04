/**
 * SNES / LTTP-styled dialog & menu boxes (logical canvas space).
 */

import { PALETTE, FRAME_W, FRAME_H, KEYS } from '../config.js';
import { makeDialogChrome } from './Assets.js';

export function formatMoneyInput(raw) {
  const neg = String(raw).trim().startsWith('-');
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  if (!cleaned) return neg ? '-' : '';
  const parts = cleaned.split('.');
  const intPart = parts[0].replace(/^0+(?=\d)/, '') || '0';
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let out = (neg ? '-' : '') + withCommas;
  if (parts.length > 1) out += '.' + parts[1].replace(/\D/g, '').slice(0, 2);
  return out;
}

export function parseMoneyInput(raw) {
  const n = parseFloat(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function formatMoneyDisplay(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(v).toLocaleString('en-US');
}

/** Sanitize a full number/percent string (mobile HTML input sync). */
export function sanitizeNumberInput(raw) {
  let s = String(raw ?? '').replace(/[^\d.\-]/g, '');
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const parts = s.split('.');
  s = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('').replace(/\./g, '') : '');
  return (neg ? '-' : '') + s;
}

/** Cap free-text prompts at 28 chars (same as desktop handleKeyDown). */
export function sanitizeTextInput(raw) {
  return String(raw ?? '').slice(0, 28);
}

export class Dialog {
  constructor() {
    this.active = false;
    this.title = '';
    this.lines = [];
    this.options = []; // { label, value, subtext? }
    this.selected = 0;
    this.mode = 'text'; // text | menu | prompt | confirm
    this.promptValue = '';
    this.promptType = 'text'; // text | number | money | percent
    this.resolve = null;
    this.chrome = null;
    this.flash = 0;
  }

  show(text, { title = '' } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'text';
      this.title = title;
      this.lines = wrapText(text, 40);
      this.options = [{ label: 'OK', value: true }];
      this.selected = 0;
      this.resolve = resolve;
      this.chrome = null;
    });
  }

  /**
   * Show menu; resolves with option value.
   * Options may include { subtext } drawn under the label.
   */
  menu(text, options, { title = '', selected = 0 } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'menu';
      this.title = title;
      this.lines = wrapText(text, 40);
      this.options = options;
      this.selected = Math.max(0, Math.min(options.length - 1, selected));
      this.resolve = resolve;
      this.chrome = null;
    });
  }

  confirm(text, { title = 'Confirm', yes = 'Yes', no = 'No' } = {}) {
    return this.menu(
      text,
      [
        { label: yes, value: true },
        { label: no, value: false },
      ],
      { title }
    );
  }

  /**
   * @param {object} opts
   * @param {'text'|'number'|'money'|'percent'} [opts.type]
   *   money — commas while typing; returns number
   *   percent — user enters 3.2 for 3.2%; returns the percent number (caller /100)
   */
  prompt(text, { title = '', defaultValue = '', type = 'text' } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'prompt';
      this.title = title;
      this.lines = wrapText(text, 40);
      this.promptType = type;
      let initial = String(defaultValue ?? '');
      if (type === 'money') initial = formatMoneyInput(initial);
      this.promptValue = initial;
      this.options = [
        { label: 'Accept', value: '__accept' },
        { label: 'Back', value: '__back' },
      ];
      this.selected = 0;
      this.resolve = resolve;
      this.chrome = null;
    });
  }

  close(result) {
    const r = this.resolve;
    this.active = false;
    this.resolve = null;
    if (r) r(result);
  }

  /**
   * Logical-canvas rect of the prompt value field (black box), or null.
   * Must match draw() layout math.
   */
  getPromptFieldRect() {
    if (!this.active || this.mode !== 'prompt') return null;
    const layout = this._layout();
    return {
      x: layout.x + layout.pad,
      y: layout.promptY,
      w: layout.boxW - layout.pad * 2,
      h: 44,
    };
  }

  _layout() {
    const boxW = Math.min(1500, FRAME_W - 120);
    const lineH = 28;
    const hasSub = this.options.some((o) => o.subtext);
    const optH = hasSub ? 58 : 40;
    const pad = 36;
    const textH = this.lines.length * lineH;
    const promptH = this.mode === 'prompt' ? 64 : 0;
    const optsH = this.options.length * optH + 8;
    const titleH = this.title ? 44 : 0;
    const boxH = Math.min(FRAME_H - 80, pad * 2 + titleH + textH + promptH + optsH + 16);
    const x = Math.floor((FRAME_W - boxW) / 2);
    const y = Math.floor((FRAME_H - boxH) / 2);
    let ty = y + pad;
    if (this.title) ty += titleH;
    ty += textH;
    let promptY = ty;
    if (this.mode === 'prompt') {
      promptY = ty + 8;
    }
    return { boxW, boxH, pad, lineH, optH, titleH, textH, x, y, promptY };
  }

  handleKeyDown(e) {
    if (!this.active) return false;
    // Space confirms on the initial press only, so holding it to run
    // cannot step through a dialog that opened underneath.
    if (e.key === ' ' && e.repeat) {
      e.preventDefault();
      return true;
    }

    // When the mobile HTML input is focused, let it own typing / Backspace.
    // Letter shortcuts (z/x/wasd/space) must NOT Accept/Cancel — only Enter/Escape.
    // Virtual-pad synthetic keys target window, so they still flow through normally.
    const fromNativeInput =
      e.target &&
      (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');

    if (fromNativeInput && this.mode === 'prompt') {
      if (e.key === 'Enter') {
        const opt = this.options[this.selected];
        if (opt.value === '__back' || opt.value === '__cancel') this.close(null);
        else {
          let v = this.promptValue;
          if (this.promptType === 'money') {
            v = parseMoneyInput(v);
          } else if (this.promptType === 'number' || this.promptType === 'percent') {
            const n = parseFloat(String(v).replace(/,/g, ''));
            v = Number.isFinite(n) ? n : 0;
          }
          this.close(v);
        }
        e.preventDefault();
        return true;
      }
      if (e.key === 'Escape') {
        this.close(null);
        e.preventDefault();
        return true;
      }
      // All other keys: ignore for dialog navigation (input handles them)
      return true;
    }

    if (this.mode === 'prompt' && !fromNativeInput) {
      if (e.key === 'Backspace') {
        this.promptValue = this.promptValue.slice(0, -1);
        if (this.promptType === 'money') {
          this.promptValue = formatMoneyInput(this.promptValue);
        }
        e.preventDefault();
        return true;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        const ch = e.key;
        if (this.promptType === 'money') {
          if (/[0-9.,\-]/.test(ch)) {
            const raw = (this.promptValue + ch).replace(/,/g, '');
            // keep only one dot / leading minus
            if (/^-?\d*\.?\d*$/.test(raw) || raw === '-' || raw === '.') {
              this.promptValue = formatMoneyInput(raw);
            }
          }
        } else if (this.promptType === 'number' || this.promptType === 'percent') {
          if (/[0-9.\-]/.test(ch)) this.promptValue += ch;
        } else if (this.promptValue.length < 28) {
          this.promptValue += ch;
        }
        e.preventDefault();
        return true;
      }
    }

    if (KEYS.up.includes(e.key)) {
      this.selected = (this.selected - 1 + this.options.length) % this.options.length;
      e.preventDefault();
      return true;
    }
    if (KEYS.down.includes(e.key)) {
      this.selected = (this.selected + 1) % this.options.length;
      e.preventDefault();
      return true;
    }
    if (KEYS.confirm.includes(e.key)) {
      const opt = this.options[this.selected];
      if (this.mode === 'prompt') {
        if (opt.value === '__back' || opt.value === '__cancel') this.close(null);
        else {
          let v = this.promptValue;
          if (this.promptType === 'money') {
            v = parseMoneyInput(v);
          } else if (this.promptType === 'number' || this.promptType === 'percent') {
            const n = parseFloat(String(v).replace(/,/g, ''));
            v = Number.isFinite(n) ? n : 0;
          }
          this.close(v);
        }
      } else {
        this.close(opt.value);
      }
      e.preventDefault();
      return true;
    }
    if (KEYS.cancel.includes(e.key)) {
      if (this.mode === 'prompt') this.close(null);
      else if (this.mode === 'menu' || this.mode === 'confirm') {
        const cancel = this.options.find(
          (o) => o.value === false || o.value === null || o.value === '__back'
        );
        this.close(cancel ? cancel.value : this.options[this.options.length - 1].value);
      }
      e.preventDefault();
      return true;
    }
    return true;
  }

  draw(ctx) {
    if (!this.active) return;
    const layout = this._layout();
    const { boxW, boxH, pad, optH, x, y } = layout;

    if (!this.chrome || this.chrome.width !== boxW || this.chrome.height !== boxH) {
      this.chrome = makeDialogChrome(boxW, boxH);
    }
    ctx.drawImage(this.chrome, x, y);

    ctx.imageSmoothingEnabled = false;
    let ty = y + pad;
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';

    if (this.title) {
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText(this.title, x + pad, ty);
      ty += layout.titleH;
    }

    ctx.fillStyle = PALETTE.uiText;
    for (const line of this.lines) {
      ctx.fillText(line, x + pad, ty);
      ty += layout.lineH;
    }

    if (this.mode === 'prompt') {
      ty += 4;
      ctx.fillStyle = '#000';
      ctx.fillRect(x + pad, ty, boxW - pad * 2, 44);
      ctx.strokeStyle = PALETTE.uiBorder;
      ctx.strokeRect(x + pad + 0.5, ty + 0.5, boxW - pad * 2 - 1, 43);
      ctx.fillStyle = PALETTE.uiText;
      const caret = Math.floor(performance.now() / 400) % 2 === 0 ? '▌' : '';
      let display = String(this.promptValue);
      if (this.promptType === 'percent' && display !== '') display += '%';
      ctx.fillText(display + caret, x + pad + 12, ty + 12);
      ty += 56;
    } else {
      ty += 6;
    }

    this.options.forEach((opt, i) => {
      const selected = i === this.selected;
      if (selected) {
        ctx.fillStyle = 'rgba(200,160,80,0.25)';
        ctx.fillRect(x + pad - 2, ty - 1, boxW - pad * 2 + 4, optH);
        ctx.fillStyle = PALETTE.gold;
        ctx.font = '18px "Press Start 2P", monospace';
        ctx.fillText('▶', x + pad, ty);
      } else {
        ctx.fillStyle = PALETTE.uiText;
        ctx.font = '18px "Press Start 2P", monospace';
      }
      ctx.fillText(opt.label, x + pad + 36, ty);
      if (opt.subtext) {
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillStyle = selected ? '#c8b878' : '#888070';
        const sub = wrapText(opt.subtext, 64);
        ctx.fillText(sub[0] || '', x + pad + 36, ty + 28);
        ctx.font = '18px "Press Start 2P", monospace';
      }
      ty += optH;
    });
  }
}

function wrapText(text, maxChars) {
  const raw = String(text);
  const paragraphs = raw.split('\n');
  const lines = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars) {
        if (cur) lines.push(cur);
        cur = w;
      } else {
        cur = (cur + ' ' + w).trim();
      }
    }
    if (cur) lines.push(cur);
    if (!words.length) lines.push('');
  }
  return lines.length ? lines : [''];
}
