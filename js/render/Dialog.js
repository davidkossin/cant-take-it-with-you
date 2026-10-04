/**
 * SNES / LTTP-styled dialog & menu boxes (logical canvas space).
 * Supports keyboard and mouse/pointer hit-testing for options.
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

export function sanitizeNumberInput(raw) {
  let s = String(raw ?? '').replace(/[^\d.\-]/g, '');
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const parts = s.split('.');
  s = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('').replace(/\./g, '') : '');
  return (neg ? '-' : '') + s;
}

export function sanitizeTextInput(raw) {
  return String(raw ?? '').slice(0, 28);
}

export class Dialog {
  constructor() {
    this.active = false;
    this.title = '';
    this.subtitle = '';
    this.lines = [];
    this.options = [];
    this.selected = 0;
    this.mode = 'text'; // text | menu | prompt | confirm | form | multi | loading
    this.promptValue = '';
    this.promptType = 'text';
    this.promptPrefix = ''; // e.g. '$' shown beside money field
    this.resolve = null;
    this.chrome = null;
    this.flash = 0;
    /** @type {{key:string,label:string,type:string,value:string,prefix?:string,subtitle?:string}[]} */
    this.fields = [];
    this.fieldIndex = 0;
    /** multi-select toggles */
    this.multiValues = new Set();
    this._optionHitRects = [];
    this._fieldHitRects = [];
    this.loadingMessage = 'Loading…';
  }

  show(text, { title = '', subtitle = '' } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'text';
      this.title = title;
      this.subtitle = subtitle;
      this.lines = wrapText(text, 40);
      this.options = [{ label: 'OK', value: true }];
      this.selected = 0;
      this.resolve = resolve;
      this.chrome = null;
      this.fields = [];
    });
  }

  menu(text, options, { title = '', subtitle = '', selected = 0 } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'menu';
      this.title = title;
      this.subtitle = subtitle;
      this.lines = wrapText(text, 40);
      this.options = options;
      this.selected = Math.max(0, Math.min(options.length - 1, selected));
      this.resolve = resolve;
      this.chrome = null;
      this.fields = [];
    });
  }

  confirm(text, { title = 'Confirm', yes = 'Yes', no = 'No', subtitle = '' } = {}) {
    return this.menu(
      text,
      [
        { label: yes, value: true },
        { label: no, value: false },
      ],
      { title, subtitle }
    );
  }

  /**
   * @param {object} opts
   * @param {'text'|'number'|'money'|'percent'} [opts.type]
   * @param {string} [opts.prefix] — shown left of field (e.g. '$')
   * @param {string} [opts.subtitle]
   */
  prompt(text, { title = '', defaultValue = '', type = 'text', prefix = '', subtitle = '' } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'prompt';
      this.title = title;
      this.subtitle = subtitle;
      this.lines = wrapText(text, 40);
      this.promptType = type;
      this.promptPrefix = prefix || (type === 'money' ? '$' : '');
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
      this.fields = [];
    });
  }

  /**
   * Multi-field form. Resolves with { key: parsedValue } or null on Back.
   * @param {string} text
   * @param {{key:string,label:string,type?:string,defaultValue?:string|number,prefix?:string,subtitle?:string}[]} fields
   */
  form(text, fields, { title = '', subtitle = '' } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'form';
      this.title = title;
      this.subtitle = subtitle;
      this.lines = wrapText(text || '', 40);
      this.fields = (fields || []).map((f) => {
        let v = String(f.defaultValue ?? '');
        const type = f.type || 'text';
        if (type === 'money') v = formatMoneyInput(v);
        return {
          key: f.key,
          label: f.label || f.key,
          type,
          value: v,
          prefix: f.prefix || (type === 'money' ? '$' : ''),
          subtitle: f.subtitle || '',
        };
      });
      this.fieldIndex = 0;
      this.options = [
        { label: 'Accept', value: '__accept' },
        { label: 'Back', value: '__back' },
      ];
      this.selected = 0;
      this.resolve = resolve;
      this.chrome = null;
    });
  }

  /**
   * Checkbox-style multi-select. Resolves with array of selected values, or null on Back.
   */
  multiSelect(text, items, { title = '', subtitle = '', selected = [] } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'multi';
      this.title = title;
      this.subtitle = subtitle;
      this.lines = wrapText(text, 40);
      this.multiValues = new Set(selected || []);
      this.options = [
        ...(items || []).map((it) => ({
          label: it.label,
          value: it.value,
          subtext: it.subtext || '',
          toggle: true,
        })),
        { label: 'Done', value: '__done' },
        { label: '← Back', value: '__back' },
      ];
      this.selected = 0;
      this.resolve = resolve;
      this.chrome = null;
      this.fields = [];
    });
  }

  /** Non-blocking loading overlay (does not steal resolve of another dialog). */
  showLoading(message = 'Loading…') {
    this._prev = {
      active: this.active,
      mode: this.mode,
      title: this.title,
      subtitle: this.subtitle,
      lines: this.lines,
      options: this.options,
      selected: this.selected,
      promptValue: this.promptValue,
      promptType: this.promptType,
      promptPrefix: this.promptPrefix,
      fields: this.fields,
      fieldIndex: this.fieldIndex,
      multiValues: this.multiValues,
      resolve: this.resolve,
    };
    this.active = true;
    this.mode = 'loading';
    this.loadingMessage = message;
    this.title = '';
    this.subtitle = '';
    this.lines = wrapText(message, 40);
    this.options = [];
    this.resolve = null;
    this.chrome = null;
  }

  hideLoading() {
    if (this.mode !== 'loading') return;
    const p = this._prev;
    this._prev = null;
    if (!p) {
      this.active = false;
      return;
    }
    Object.assign(this, p);
  }

  close(result) {
    const r = this.resolve;
    this.active = false;
    this.resolve = null;
    if (r) r(result);
  }

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
    const hasSub = this.options.some((o) => o.subtext) || !!this.subtitle;
    const optH = hasSub || this.mode === 'multi' ? 58 : 40;
    const pad = 36;
    const textH = this.lines.length * lineH;
    const subH = this.subtitle ? 28 : 0;
    const promptH = this.mode === 'prompt' ? 64 : 0;
    const formH =
      this.mode === 'form'
        ? this.fields.reduce((s, f) => s + (f.subtitle ? 78 : 58), 0) + 8
        : 0;
    const optsH = this.options.length * optH + 8;
    const titleH = this.title ? 44 : 0;
    const boxH = Math.min(
      FRAME_H - 40,
      pad * 2 + titleH + subH + textH + promptH + formH + optsH + 16
    );
    const x = Math.floor((FRAME_W - boxW) / 2);
    const y = Math.floor((FRAME_H - boxH) / 2);
    let ty = y + pad;
    if (this.title) ty += titleH;
    if (this.subtitle) ty += subH;
    ty += textH;
    let promptY = ty;
    if (this.mode === 'prompt') promptY = ty + 8;
    return { boxW, boxH, pad, lineH, optH, titleH, textH, subH, x, y, promptY, formH };
  }

  /**
   * Mouse / pointer hit-test in logical canvas coords.
   * @returns {boolean} whether the event was handled
   */
  handlePointer(lx, ly) {
    if (!this.active || this.mode === 'loading') return false;

    if (this.mode === 'form') {
      for (const hit of this._fieldHitRects) {
        if (lx >= hit.x && lx <= hit.x + hit.w && ly >= hit.y && ly <= hit.y + hit.h) {
          this.fieldIndex = hit.index;
          return true;
        }
      }
    }

    for (const hit of this._optionHitRects) {
      if (lx >= hit.x && lx <= hit.x + hit.w && ly >= hit.y && ly <= hit.y + hit.h) {
        this.selected = hit.index;
        this._activateSelected();
        return true;
      }
    }
    return false;
  }

  _activateSelected() {
    const opt = this.options[this.selected];
    if (!opt) return;
    if (this.mode === 'multi') {
      if (opt.value === '__back') {
        this.close(null);
        return;
      }
      if (opt.value === '__done') {
        this.close([...this.multiValues]);
        return;
      }
      if (opt.toggle) {
        if (this.multiValues.has(opt.value)) this.multiValues.delete(opt.value);
        else this.multiValues.add(opt.value);
        return;
      }
    }
    if (this.mode === 'prompt') {
      if (opt.value === '__back' || opt.value === '__cancel') this.close(null);
      else this.close(this._parsePromptValue());
      return;
    }
    if (this.mode === 'form') {
      if (opt.value === '__back' || opt.value === '__cancel') this.close(null);
      else {
        const out = {};
        for (const f of this.fields) {
          out[f.key] = this._parseFieldValue(f);
        }
        this.close(out);
      }
      return;
    }
    this.close(opt.value);
  }

  _parsePromptValue() {
    let v = this.promptValue;
    if (this.promptType === 'money') v = parseMoneyInput(v);
    else if (this.promptType === 'number' || this.promptType === 'percent') {
      const n = parseFloat(String(v).replace(/,/g, ''));
      v = Number.isFinite(n) ? n : 0;
    }
    return v;
  }

  _parseFieldValue(f) {
    let v = f.value;
    if (f.type === 'money') return parseMoneyInput(v);
    if (f.type === 'number' || f.type === 'percent') {
      const n = parseFloat(String(v).replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    }
    return v;
  }

  handleKeyDown(e) {
    if (!this.active || this.mode === 'loading') return false;
    if (e.key === ' ' && e.repeat) {
      e.preventDefault();
      return true;
    }

    const fromNativeInput =
      e.target &&
      (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');

    if (fromNativeInput && (this.mode === 'prompt' || this.mode === 'form')) {
      if (e.key === 'Enter') {
        this._activateSelected();
        e.preventDefault();
        return true;
      }
      if (e.key === 'Escape') {
        this.close(null);
        e.preventDefault();
        return true;
      }
      return true;
    }

    if (this.mode === 'form' && !fromNativeInput) {
      const f = this.fields[this.fieldIndex];
      if (f && e.key === 'Backspace') {
        f.value = f.value.slice(0, -1);
        if (f.type === 'money') f.value = formatMoneyInput(f.value);
        e.preventDefault();
        return true;
      }
      if (f && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        this._typeInto(f, e.key);
        e.preventDefault();
        return true;
      }
      if (KEYS.up.includes(e.key)) {
        if (this.fieldIndex > 0) this.fieldIndex--;
        else this.selected = (this.selected - 1 + this.options.length) % this.options.length;
        e.preventDefault();
        return true;
      }
      if (KEYS.down.includes(e.key)) {
        if (this.fieldIndex < this.fields.length - 1) this.fieldIndex++;
        else {
          // move into Accept/Back
          this.fieldIndex = this.fields.length; // past fields
          this.selected = 0;
        }
        e.preventDefault();
        return true;
      }
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
      this._activateSelected();
      e.preventDefault();
      return true;
    }
    if (KEYS.cancel.includes(e.key)) {
      if (this.mode === 'prompt' || this.mode === 'form') this.close(null);
      else if (this.mode === 'multi') this.close(null);
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

  _typeInto(f, ch) {
    if (f.type === 'money') {
      if (/[0-9.,\-]/.test(ch)) {
        const raw = (f.value + ch).replace(/,/g, '');
        if (/^-?\d*\.?\d*$/.test(raw) || raw === '-' || raw === '.') {
          f.value = formatMoneyInput(raw);
        }
      }
    } else if (f.type === 'number' || f.type === 'percent') {
      if (/[0-9.\-]/.test(ch)) f.value += ch;
    } else if (f.value.length < 28) {
      f.value += ch;
    }
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
    if (this.subtitle) {
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillStyle = '#a89878';
      ctx.fillText(this.subtitle.slice(0, 64), x + pad, ty);
      ctx.font = '18px "Press Start 2P", monospace';
      ty += layout.subH;
    }

    ctx.fillStyle = PALETTE.uiText;
    for (const line of this.lines) {
      ctx.fillText(line, x + pad, ty);
      ty += layout.lineH;
    }

    this._fieldHitRects = [];
    this._optionHitRects = [];

    if (this.mode === 'loading') {
      ctx.fillStyle = PALETTE.gold;
      const dots = '.'.repeat(Math.floor(performance.now() / 400) % 4);
      ctx.fillText(this.loadingMessage + dots, x + pad, ty + 12);
      return;
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
      const prefix = this.promptPrefix ? this.promptPrefix + ' ' : '';
      ctx.fillText(prefix + display + caret, x + pad + 12, ty + 12);
      ty += 56;
    } else if (this.mode === 'form') {
      ty += 4;
      this.fields.forEach((f, i) => {
        const focused = i === this.fieldIndex;
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillStyle = focused ? PALETTE.gold : '#a89878';
        ctx.fillText(f.label, x + pad, ty);
        ty += 20;
        ctx.fillStyle = '#000';
        ctx.fillRect(x + pad, ty, boxW - pad * 2, 36);
        ctx.strokeStyle = focused ? PALETTE.gold : PALETTE.uiBorder;
        ctx.strokeRect(x + pad + 0.5, ty + 0.5, boxW - pad * 2 - 1, 35);
        ctx.fillStyle = PALETTE.uiText;
        ctx.font = '16px "Press Start 2P", monospace';
        const caret = focused && Math.floor(performance.now() / 400) % 2 === 0 ? '▌' : '';
        let display = String(f.value);
        if (f.type === 'percent' && display !== '') display += '%';
        const prefix = f.prefix ? f.prefix + ' ' : '';
        ctx.fillText(prefix + display + caret, x + pad + 10, ty + 8);
        this._fieldHitRects.push({
          index: i,
          x: x + pad,
          y: ty - 20,
          w: boxW - pad * 2,
          h: 56,
        });
        ty += 40;
        if (f.subtitle) {
          ctx.font = '12px "Press Start 2P", monospace';
          ctx.fillStyle = '#777';
          ctx.fillText(f.subtitle.slice(0, 70), x + pad, ty);
          ty += 18;
        }
      });
      ty += 6;
    } else {
      ty += 6;
    }

    this.options.forEach((opt, i) => {
      const selected = i === this.selected;
      const checked =
        this.mode === 'multi' && opt.toggle && this.multiValues.has(opt.value);
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
      let label = opt.label;
      if (this.mode === 'multi' && opt.toggle) {
        label = `${checked ? '[X]' : '[ ]'} ${opt.label}`;
      }
      ctx.fillText(label, x + pad + 36, ty);
      if (opt.subtext) {
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillStyle = selected ? '#c8b878' : '#888070';
        const sub = wrapText(opt.subtext, 64);
        ctx.fillText(sub[0] || '', x + pad + 36, ty + 28);
        ctx.font = '18px "Press Start 2P", monospace';
      }
      this._optionHitRects.push({
        index: i,
        x: x + pad - 2,
        y: ty - 1,
        w: boxW - pad * 2 + 4,
        h: optH,
      });
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
