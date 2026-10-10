/**
 * SNES / LTTP-styled dialog & menu boxes (logical canvas space).
 * Supports keyboard and mouse/pointer hit-testing for options.
 */

import { PALETTE, FRAME_W, FRAME_H, HUD_H, KEYS } from '../config.js';
import { makeDialogChrome, makePlayerSprite, hairTones, shirtTones } from './Assets.js';
import { captureMoneyContext, toDisplayMoney, fromDisplayMoney, moneyUnitSubtitle } from '../finance/DollarBasis.js';
export { formatMoneyDisplay } from '../finance/DollarBasis.js';

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

export function sanitizeNumberInput(raw) {
  let s = String(raw ?? '').replace(/[^\d.\-]/g, '');
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const parts = s.split('.');
  s = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('').replace(/\./g, '') : '');
  return (neg ? '-' : '') + s;
}

/**
 * Appearance page geometry (frame pixels): one or more labeled 2×8 swatch
 * grids stacked on the left (name of the chosen color beside each grid), and
 * on the right a sprite preview with Continue and Back under it. Swatches are
 * half the linear size of the first single-grid picker so hair and shirt fit
 * on one page. The block stays inside the 80% title-safe area, and the left
 * column ends above the phone D-pad, which overlaps the frame's bottom-left.
 */
export const PALETTE_COLS = 8;
const PAL = {
  swatchW: 64,
  swatchH: 48,
  gap: 9,
  labelH: 34,
  sectionGap: 28,
  nameGap: 32,
  colW: 300,
  previewH: 216,
  spriteScale: 7,
  rowGap: 12,
  topGap: 14,
};

export function sanitizeTextInput(raw) {
  return String(raw ?? '').slice(0, 28);
}

/**
 * Rich text: **bold** and _italic_ runs in authored copy (body text, option labels/subtext,
 * form field labels), never in a player-typed value. Press Start 2P is monospace, so wrapping
 * by character count (as before) stays pixel-accurate; only drawing needs real measurement,
 * and draw() always has a live canvas context (unlike the constructors below, which run in
 * plain Node tests with no document/canvas available).
 */
const FONT_FAMILY = '"Press Start 2P", monospace';
function richFont(px, { bold = false, italic = false } = {}) {
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${px}px ${FONT_FAMILY}`;
}
/** Split one line of text into styled runs. Unmatched markers are left literal. */
function parseRuns(text) {
  const runs = [];
  const re = /\*\*(.+?)\*\*|_(.+?)_/g;
  let last = 0, m;
  while ((m = re.exec(String(text)))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false, italic: false });
    runs.push(m[1] != null ? { text: m[1], bold: true, italic: false } : { text: m[2], bold: false, italic: true });
    last = re.lastIndex;
  }
  if (last < text.length || !runs.length) runs.push({ text: String(text).slice(last), bold: false, italic: false });
  return runs;
}
const richWords = run => run.text.split(/\s+/).filter(Boolean).map(w => ({ text: w, bold: run.bold, italic: run.italic }));
/** Word-wrap rich text by character budget; returns lines of styled word tokens. */
function wrapRich(text, maxChars) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    const words = parseRuns(para).flatMap(richWords);
    if (!words.length) { lines.push([]); continue; }
    let cur = [], curLen = 0;
    for (const word of words) {
      const next = cur.length ? curLen + 1 + word.text.length : word.text.length;
      if (cur.length && next > maxChars) { lines.push(cur); cur = [word]; curLen = word.text.length; }
      else { cur.push(word); curLen = next; }
    }
    if (cur.length) lines.push(cur);
  }
  return lines.length ? lines : [[]];
}
/** Draw one unwrapped line of authored text, styled run by run (no line-breaking). */
function drawRichText(ctx, text, x, y, px, color) {
  let cx = x;
  for (const run of parseRuns(text)) {
    ctx.font = richFont(px, run);
    ctx.fillStyle = color;
    ctx.fillText(run.text, cx, y);
    cx += ctx.measureText(run.text).width;
  }
  return cx - x;
}
/** Draw one already-wrapped rich line (word tokens from wrapRich), word by word. */
function drawRichLine(ctx, words, x, y, px, color) {
  ctx.font = richFont(px);
  const spaceW = ctx.measureText(' ').width;
  let cx = x;
  for (const word of words) {
    ctx.font = richFont(px, word);
    ctx.fillStyle = color;
    ctx.fillText(word.text, cx, y);
    cx += ctx.measureText(word.text).width + spaceW;
  }
}
const OPTION_BASE_H = 40;
const OPTION_SUB_LINE_H = 22;

export class Dialog {
  constructor() {
    this.active = false;
    this.title = '';
    this.subtitle = '';
    this.lines = [];
    this.options = [];
    this.selected = 0;
    this.mode = 'text'; // text | menu | prompt | confirm | form | multi | palette | loading
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
    /** form: the black input box of each field (frame pixels), from the last draw */
    this._fieldBoxRects = [];
    this.loadingMessage = 'Loading…';
    /** palette: swatch groups, focus (group index, then Continue, then Back) */
    this.palGroups = [];
    this.palFocus = 0;
    /** palette: swatch under the mouse ({g, i}); previews without choosing */
    this.palHover = null;
    this.paletteBack = null;
    this.paletteHairLength = 'short';
  }

  show(text, { title = '', subtitle = '' } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'text';
      this.title = title;
      this.subtitle = subtitle;
      this.lines = wrapRich(text, 40);
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
      this.lines = wrapRich(text, 40);
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
  prompt(text, { title = '', defaultValue = '', type = 'text', prefix = '', subtitle = '', portfolio,
    amountScale = 1 } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'prompt';
      this.title = title;
      this._moneyContext = captureMoneyContext(portfolio);
      this.subtitle = type === 'money' ? moneySubtitle(subtitle, this._moneyContext) : subtitle;
      this.lines = wrapRich(text, 40);
      this.promptType = type;
      this.promptPrefix = prefix || (type === 'money' ? '$' : '');
      let initial = String(defaultValue ?? '');
      this.promptAmountScale = amountScale;
      this.promptInitialMoneyValue = parseMoneyInput(defaultValue);
      if (type === 'money' && initial !== '') initial = displayMoneyInput(this.promptInitialMoneyValue, this._moneyContext, amountScale);
      this.promptInitialDisplay = initial;
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
  form(text, fields, { title = '', subtitle = '', portfolio } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'form';
      this.title = title;
      this._moneyContext = captureMoneyContext(portfolio);
      this.subtitle = (fields || []).some(f => f.type === 'money') ? moneySubtitle(subtitle, this._moneyContext) : subtitle;
      this.lines = wrapRich(text || '', 40);
      this.fields = (fields || []).map((f) => {
        let v = String(f.defaultValue ?? '');
        const type = f.type || 'text';
        const initialMoneyValue = parseMoneyInput(f.defaultValue);
        const amountScale = f.amountScale ?? 1;
        if (type === 'money' && v !== '') v = displayMoneyInput(initialMoneyValue, this._moneyContext, amountScale);
        return {
          key: f.key,
          label: f.label || f.key,
          type,
          value: v,
          prefix: f.prefix || (type === 'money' ? '$' : ''),
          subtitle: f.subtitle || '',
          amountScale,
          initialMoneyValue,
          initialDisplay: v,
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
      this.lines = wrapRich(text, 40);
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

  /**
   * Appearance page: labeled PALETTE_COLS-wide swatch grids (e.g. hair, then
   * shirt) on one page, a live sprite preview, then Continue and Back.
   * Resolves with `{ [group.key]: colorId, ... }` on Continue, or `backValue`
   * for Back / Esc / B.
   * @param {string} text
   * @param {{key:string,label:string,kind:'hair'|'shirt',
   *   colors:{id:string,label:string,hex:string}[], selected?:string}[]} groups
   * @param {object} [opts]
   * @param {'short'|'long'} [opts.hairLength] hair length for the preview sprite
   * @param {*} [opts.backValue] value returned for Back (default null)
   */
  palette(text, groups, { title = '', subtitle = '', hairLength = 'short',
    doneLabel = 'Continue', backLabel = 'Back', backValue = null } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'palette';
      this.title = title;
      this.subtitle = subtitle;
      this.lines = wrapRich(text, 40);
      this.palGroups = (groups || []).map((g) => ({
        key: g.key,
        label: g.label,
        kind: g.kind === 'shirt' ? 'shirt' : 'hair',
        colors: g.colors || [],
        chosen: Math.max(0, (g.colors || []).findIndex((c) => c.id === g.selected)),
      }));
      this.palFocus = 0;
      this.palHover = null;
      // Continue / Back: generic option rows (also keeps the phone D-pad up).
      this.options = [
        { label: doneLabel, value: '__done' },
        { label: backLabel, value: backValue, back: true },
      ];
      this.selected = 0;
      this.paletteBack = backValue;
      this.paletteHairLength = hairLength === 'long' ? 'long' : 'short';
      this.resolve = resolve;
      this.chrome = null;
      this.fields = [];
    });
  }

  /** Focus index of the Continue row; Back is the one after it. */
  _palDone() {
    return this.palGroups.length;
  }

  _palValues() {
    const out = {};
    for (const g of this.palGroups) out[g.key] = g.colors[g.chosen]?.id ?? null;
    return out;
  }

  /**
   * Arrow / D-pad step. Inside a grid the arrows move that grid's choice
   * (left/right wrap through all of its colors). Up from a grid's top row or
   * down from its bottom row moves to the neighbouring grid, which keeps its
   * own choice, then Continue, then Back, wrapping to the first grid.
   */
  _paletteMove(dir) {
    const done = this._palDone();
    const back = done + 1;
    const f = this.palFocus;
    this.palHover = null;
    if (f < done) {
      const g = this.palGroups[f];
      const n = g.colors.length;
      const cols = PALETTE_COLS;
      const c = g.chosen;
      if (dir === 'left') g.chosen = (c - 1 + n) % n;
      else if (dir === 'right') g.chosen = (c + 1) % n;
      else if (dir === 'up') {
        if (c < cols) this.palFocus = f === 0 ? back : f - 1;
        else g.chosen = c - cols;
      } else if (dir === 'down') {
        if (c + cols >= n) this.palFocus = f + 1;
        else g.chosen = c + cols;
      }
    } else if (f === done) {
      if (dir === 'up' || dir === 'left') this.palFocus = done - 1;
      else if (dir === 'down') this.palFocus = back;
    } else {
      if (dir === 'up') this.palFocus = done;
      else if (dir === 'down') this.palFocus = 0;
      else if (dir === 'left') this.palFocus = done - 1;
    }
    this.selected = this.palFocus === back ? 1 : 0;
  }

  /** Enter / A: a grid moves on to the next question; Continue / Back close. */
  _paletteActivate() {
    const done = this._palDone();
    if (this.palFocus < done) this.palFocus += 1;
    else if (this.palFocus === done) this.close(this._palValues());
    else this.close(this.paletteBack);
    this.selected = this.palFocus === done + 1 ? 1 : 0;
  }

  /** Pointer over (or tapping) a palette hit area. */
  _palPointer(lx, ly, click) {
    for (const hit of this._optionHitRects) {
      if (lx < hit.x || lx > hit.x + hit.w || ly < hit.y || ly > hit.y + hit.h) continue;
      if (hit.kind === 'swatch') {
        this.palFocus = hit.g;
        if (click) {
          this.palGroups[hit.g].chosen = hit.i;
          this.palHover = null;
        } else {
          this.palHover = { g: hit.g, i: hit.i };
        }
      } else {
        this.palHover = null;
        this.palFocus = hit.focus;
        this.selected = hit.focus === this._palDone() + 1 ? 1 : 0;
        if (click) this._paletteActivate();
      }
      return true;
    }
    if (!click) this.palHover = null;
    return false;
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
      _moneyContext: this._moneyContext,
      promptAmountScale: this.promptAmountScale,
      promptInitialMoneyValue: this.promptInitialMoneyValue,
      promptInitialDisplay: this.promptInitialDisplay,
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
    this.lines = wrapRich(message, 40);
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

  /** Input box of form field `index` from the last draw, or null. */
  getFormFieldRect(index = this.fieldIndex) {
    if (!this.active || this.mode !== 'form') return null;
    return this._fieldBoxRects[index] || null;
  }

  /** Per-option row metrics: base label height, plus wrapped subtext lines (if any). */
  _optionMetrics() {
    return this.options.map((opt) => {
      const subLines = opt.subtext ? wrapRich(opt.subtext, 64) : [];
      return { subLines, h: OPTION_BASE_H + (subLines.length ? 6 + subLines.length * OPTION_SUB_LINE_H : 0) };
    });
  }

  _layout() {
    const boxW = Math.min(1640, FRAME_W - 200);
    const lineH = 28;
    const pad = 36;
    const textH = this.lines.length * lineH;
    const subH = this.subtitle ? 28 : 0;
    const promptH = this.mode === 'prompt' ? 64 : 0;
    const formH =
      this.mode === 'form'
        ? this.fields.reduce((s, f) => s + (f.subtitle ? 78 : 58), 0) + 8
        : 0;
    const optsH = this.mode === 'palette' ? this._palBlockH(OPTION_BASE_H) + 8
      : this._optionMetrics().reduce((s, m) => s + m.h, 0) + 8;
    const titleH = this.title ? 44 : 0;
    // Stay below the HUD band and above a bottom margin; grow within that space, not the full frame.
    const topMargin = 28, bottomMargin = 28;
    const availTop = HUD_H + topMargin;
    const availH = FRAME_H - availTop - bottomMargin;
    const boxH = Math.min(availH, pad * 2 + titleH + subH + textH + promptH + formH + optsH + 16);
    const x = Math.floor((FRAME_W - boxW) / 2);
    const y = availTop + Math.floor((availH - boxH) / 2);
    let ty = y + pad;
    if (this.title) ty += titleH;
    if (this.subtitle) ty += subH;
    ty += textH;
    let promptY = ty;
    if (this.mode === 'prompt') promptY = ty + 8;
    return { boxW, boxH, pad, lineH, optH: OPTION_BASE_H, titleH, textH, subH, x, y, promptY, formH };
  }

  /** True when (lx, ly) is on a text entry box (prompt field or a form field). */
  textFieldAt(lx, ly) {
    if (!this.active) return false;
    const inside = (r) => r && lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h;
    if (this.mode === 'prompt') return inside(this.getPromptFieldRect());
    if (this.mode === 'form') return this._fieldHitRects.some(inside);
    return false;
  }

  /**
   * Mouse / pointer hit-test in logical canvas coords.
   * @returns {boolean} whether the event was handled
   */
  handlePointer(lx, ly) {
    if (!this.active || this.mode === 'loading') return false;
    if (this.mode === 'palette') return this._palPointer(lx, ly, true);

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

  /**
   * Mouse hover in logical canvas coords: move the option cursor onto the
   * option under the pointer (no activation).
   * @returns {boolean} whether the pointer is over an option
   */
  hoverPointer(lx, ly) {
    if (!this.active || this.mode === 'loading') return false;
    if (this.mode === 'palette') return this._palPointer(lx, ly, false);
    for (const hit of this._optionHitRects) {
      if (lx >= hit.x && lx <= hit.x + hit.w && ly >= hit.y && ly <= hit.y + hit.h) {
        this.selected = hit.index;
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
    if (this.promptType === 'money') v = v === this.promptInitialDisplay
      ? this.promptInitialMoneyValue
      : storedMoneyInput(v, this._moneyContext, this.promptAmountScale);
    else if (this.promptType === 'number' || this.promptType === 'percent') {
      const n = parseFloat(String(v).replace(/,/g, ''));
      v = Number.isFinite(n) ? n : 0;
    }
    return v;
  }

  _parseFieldValue(f) {
    let v = f.value;
    if (f.type === 'money') return v === f.initialDisplay ? f.initialMoneyValue
      : storedMoneyInput(v, this._moneyContext, f.amountScale);
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

    if (this.mode === 'palette') {
      const dir = KEYS.up.includes(e.key) ? 'up'
        : KEYS.down.includes(e.key) ? 'down'
          : KEYS.left.includes(e.key) ? 'left'
            : KEYS.right.includes(e.key) ? 'right' : null;
      if (dir) this._paletteMove(dir);
      else if (KEYS.confirm.includes(e.key)) {
        this.palHover = null;
        this._paletteActivate();
      } else if (KEYS.cancel.includes(e.key)) this.close(this.paletteBack);
      else return true;
      e.preventDefault();
      return true;
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
    const { boxW, boxH, pad, x, y } = layout;

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
      drawRichText(ctx, this.subtitle.slice(0, 64), x + pad, ty, 14, '#a89878');
      ty += layout.subH;
    }

    this._fieldHitRects = [];
    this._fieldBoxRects = [];
    this._optionHitRects = [];

    if (this.mode === 'loading') {
      ctx.fillStyle = PALETTE.gold;
      const dots = '.'.repeat(Math.floor(performance.now() / 400) % 4);
      ctx.fillText(this.loadingMessage + dots, x + pad, ty + 12);
      return;
    }

    for (const line of this.lines) {
      drawRichLine(ctx, line, x + pad, ty, 18, PALETTE.uiText);
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
      const prefix = this.promptPrefix ? this.promptPrefix + ' ' : '';
      ctx.fillText(prefix + display + caret, x + pad + 12, ty + 12);
      ty += 56;
    } else if (this.mode === 'form') {
      ty += 4;
      this.fields.forEach((f, i) => {
        const focused = i === this.fieldIndex;
        drawRichText(ctx, f.label, x + pad, ty, 14, focused ? PALETTE.gold : '#a89878');
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
        this._fieldBoxRects[i] = { x: x + pad, y: ty, w: boxW - pad * 2, h: 36 };
        ty += 40;
        if (f.subtitle) {
          drawRichText(ctx, f.subtitle.slice(0, 70), x + pad, ty, 12, '#777');
          ty += 18;
        }
      });
      ty += 6;
    } else if (this.mode === 'palette') {
      this._drawPalette(ctx, layout, ty + 6);
      return;
    } else {
      ty += 6;
    }

    const metrics = this._optionMetrics();
    this.options.forEach((opt, i) => {
      const selected = i === this.selected;
      const checked =
        this.mode === 'multi' && opt.toggle && this.multiValues.has(opt.value);
      const h = metrics[i].h;
      if (selected) {
        ctx.fillStyle = 'rgba(200,160,80,0.25)';
        ctx.fillRect(x + pad - 2, ty - 1, boxW - pad * 2 + 4, h);
        ctx.fillStyle = PALETTE.gold;
        ctx.font = richFont(18);
        ctx.fillText('▶', x + pad, ty);
      }
      let label = opt.label;
      if (this.mode === 'multi' && opt.toggle) {
        label = `${checked ? '[X]' : '[ ]'} ${opt.label}`;
      }
      drawRichText(ctx, label, x + pad + 36, ty, 18, selected ? PALETTE.gold : PALETTE.uiText);
      if (metrics[i].subLines.length) {
        let sy = ty + 28;
        for (const subLine of metrics[i].subLines) {
          drawRichLine(ctx, subLine, x + pad + 36, sy, 14, selected ? '#c8b878' : '#888070');
          sy += OPTION_SUB_LINE_H;
        }
      }
      this._optionHitRects.push({
        index: i,
        x: x + pad - 2,
        y: ty - 1,
        w: boxW - pad * 2 + 4,
        h,
      });
      ty += h;
    });
  }

  /** Height of the palette block below the text: left grids vs right column. */
  _palBlockH(optH) {
    const rows = (g) => Math.ceil(g.colors.length / PALETTE_COLS);
    const gridH = (g) => rows(g) * PAL.swatchH + (rows(g) - 1) * PAL.gap;
    const left = this.palGroups.reduce((h, g, k) => h + (k ? PAL.sectionGap : 0) + PAL.labelH + gridH(g), 0);
    const right = PAL.previewH + PAL.rowGap + optH * 2;
    return PAL.topGap + Math.max(left, right);
  }

  /** Swatch grids with labels and names, sprite preview, Continue and Back. */
  _drawPalette(ctx, layout, blockTop) {
    const { boxW, pad, optH, x } = layout;
    const top = blockTop + PAL.topGap;
    const { swatchW: sw, swatchH: sh, gap } = PAL;
    const cols = PALETTE_COLS;
    const done = this._palDone();
    const gx = x + pad;
    const shownId = { hair: null, shirt: null };
    let gy = top;

    this.palGroups.forEach((g, gi) => {
      const focused = this.palFocus === gi;
      const hover = this.palHover && this.palHover.g === gi ? this.palHover.i : -1;
      const shown = g.colors[hover >= 0 ? hover : g.chosen];
      shownId[g.kind] = shown?.id ?? null;

      // Label: gold with the cursor while this grid has focus.
      ctx.font = '18px "Press Start 2P", monospace';
      ctx.fillStyle = focused ? PALETTE.gold : PALETTE.uiText;
      if (focused) ctx.fillText('▶', gx, gy);
      ctx.fillText(g.label, gx + 30, gy);
      const sy0 = gy + PAL.labelH;
      const rows = Math.ceil(g.colors.length / cols);
      const gridH = rows * sh + (rows - 1) * gap;

      g.colors.forEach((c, i) => {
        const sx = gx + (i % cols) * (sw + gap);
        const sy = sy0 + Math.floor(i / cols) * (sh + gap);
        const t = g.kind === 'shirt' ? shirtTones(c.id) : hairTones(c.id);
        // Bevelled chip in the sprite's own ramp: lit top-left, shaded bottom-right.
        ctx.fillStyle = '#000';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.fillStyle = t.shade;
        ctx.fillRect(sx + 2, sy + 2, sw - 4, sh - 4);
        ctx.fillStyle = t.light;
        ctx.fillRect(sx + 2, sy + 2, sw - 7, sh - 7);
        ctx.fillStyle = c.hex;
        ctx.fillRect(sx + 5, sy + 5, sw - 10, sh - 10);
        ctx.fillStyle = t.light;
        ctx.fillRect(sx + 7, sy + 7, 6, 3);
        this._optionHitRects.push({
          kind: 'swatch', g: gi, i,
          x: sx - gap / 2, y: sy - gap / 2, w: sw + gap, h: sh + gap,
        });
      });

      // Chosen swatch: gold frame (bright on the focused grid, dim otherwise).
      const cx = gx + (g.chosen % cols) * (sw + gap);
      const cy = sy0 + Math.floor(g.chosen / cols) * (sh + gap);
      ctx.fillStyle = '#000';
      ctx.fillRect(cx - 7, cy - 7, sw + 14, 2);
      ctx.fillRect(cx - 7, cy + sh + 5, sw + 14, 2);
      ctx.fillRect(cx - 7, cy - 7, 2, sh + 14);
      ctx.fillRect(cx + sw + 5, cy - 7, 2, sh + 14);
      ctx.strokeStyle = focused ? PALETTE.gold : PALETTE.goldDark;
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 3.5, cy - 3.5, sw + 7, sh + 7);
      if (focused) {
        ctx.strokeStyle = '#fff4c8';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 1.5, cy - 1.5, sw + 3, sh + 3);
      }
      // Mouse hover: thin light outline, previewed but not chosen yet.
      if (hover >= 0 && hover !== g.chosen) {
        const hx = gx + (hover % cols) * (sw + gap);
        const hy = sy0 + Math.floor(hover / cols) * (sh + gap);
        ctx.strokeStyle = PALETTE.uiText;
        ctx.lineWidth = 2;
        ctx.strokeRect(hx - 3, hy - 3, sw + 6, sh + 6);
      }
      ctx.lineWidth = 1;

      // Name of the chosen (or hovered) color beside the grid.
      const gridW = cols * sw + (cols - 1) * gap;
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.fillStyle = focused ? PALETTE.gold : '#c8b878';
      ctx.fillText(shown ? shown.label : '', gx + gridW + PAL.nameGap, sy0 + Math.round((gridH - 20) / 2));

      gy = sy0 + gridH + PAL.sectionGap;
    });

    // Right column: live preview of the hair and shirt being shown.
    const cw = PAL.colW;
    const ph = PAL.previewH;
    const px0 = x + boxW - pad - cw;
    ctx.fillStyle = '#000';
    ctx.fillRect(px0, top, cw, ph);
    ctx.fillStyle = '#1e1628';
    ctx.fillRect(px0 + 3, top + 3, cw - 6, ph - 6);
    ctx.strokeStyle = PALETTE.uiBorderDark;
    ctx.lineWidth = 2;
    ctx.strokeRect(px0 + 1, top + 1, cw - 2, ph - 2);
    ctx.lineWidth = 1;
    const k = PAL.spriteScale;
    const spr = makePlayerSprite(shownId.hair || 'dark', this.paletteHairLength, 0, 'down', -1, shownId.shirt || 'blue');
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spr, Math.round(px0 + (cw - 16 * k) / 2), top + 6, 16 * k, 24 * k);
    ctx.imageSmoothingEnabled = prev;
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = '#a89878';
    const cap = this.paletteHairLength === 'long' ? 'Long hair' : 'Short hair';
    ctx.fillText(cap, Math.round(px0 + (cw - ctx.measureText(cap).width) / 2), top + ph - 24);

    // Continue and Back rows, styled like menu options.
    let ry = top + ph + PAL.rowGap;
    [done, done + 1].forEach((focus, n) => {
      const opt = this.options[n];
      const on = this.palFocus === focus;
      ctx.font = '18px "Press Start 2P", monospace';
      if (on) {
        ctx.fillStyle = 'rgba(200,160,80,0.25)';
        ctx.fillRect(px0, ry - 1, cw, optH);
        ctx.fillStyle = PALETTE.gold;
        ctx.fillText('▶', px0 + 10, ry + 10);
      } else {
        ctx.fillStyle = PALETTE.uiText;
      }
      ctx.fillText(opt ? opt.label : '', px0 + 44, ry + 10);
      this._optionHitRects.push({ kind: 'row', focus, x: px0, y: ry - 1, w: cw, h: optH });
      ry += optH;
    });
  }
}

function displayMoneyInput(value, context, amountScale) {
  return formatMoneyInput(toDisplayMoney(value, context, { amountScale }).toFixed(2));
}

function storedMoneyInput(value, context, amountScale) {
  // Round only user edits. Untouched fields preserve their exact stored amount.
  // Baseline SSA/education fields may require fractional base-year cents to
  // represent the intended current nominal amount exactly.
  const nominal = fromDisplayMoney(parseMoneyInput(value), context);
  const rounded = Math.round((nominal + Number.EPSILON) * 100) / 100;
  return fromDisplayMoney(rounded, {inflationAdjusted:false}, {amountScale});
}

function moneySubtitle(subtitle, context) {
  const units = moneyUnitSubtitle(context);
  return subtitle ? `${units} · ${subtitle}` : units;
}

