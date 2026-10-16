/**
 * Retro-styled dialog & menu boxes (logical canvas space).
 * Supports keyboard and mouse/pointer hit-testing for options.
 */

import { PALETTE, FRAME_W, FRAME_H, HUD_H, KEYS } from '../config.js';
import { makeDialogChrome, makePlayerSprite, hairTones, shirtTones } from './Assets.js';
import { captureMoneyContext, toDisplayMoney, fromDisplayMoney, moneyUnitSubtitle } from '../finance/DollarBasis.js';
export { formatMoneyDisplay } from '../finance/DollarBasis.js';

import {
  formatMoneyInput, TEXT_MAX_LEN, normalizeSel, caretSel, selRange, hasSelection, selectedText,
  selectAll, wordAt, moveSel, insertText, deleteText, caretFromX, scrollToCaret, tabIndex,
} from '../ui/TextEdit.js';
export { formatMoneyInput };

export function parseMoneyInput(raw) {
  const n = parseFloat(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Message for a required name / age value that cannot be accepted, or null.
 * 'name': blank or whitespace only. 'age': blank, or not a plain number.
 */
export function requiredFieldError(kind, value) {
  const v = String(value ?? '').trim();
  if (kind === 'name') return v ? null : 'Please enter a name.';
  if (kind === 'age') {
    if (!v) return 'Please enter an age.';
    return /^\d[\d,]*(\.\d+)?$/.test(v) ? null : 'Age must be a number.';
  }
  return null;
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
  return String(raw ?? '').slice(0, TEXT_MAX_LEN);
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
    /** prompt/form: caret + selection of the focused text field (see ui/TextEdit.js) */
    this.textSel = caretSel(0);
    /** first visible char of the focused field when its value is wider than the box */
    this.textScroll = 0;
    /** last edit / caret move (performance.now()); the caret stays solid briefly after one */
    this._caretT = 0;
    /** mouse drag-select in progress: { key } of the field being dragged in */
    this._drag = null;
    /** previous click on a text field, for double / triple click */
    this._lastClick = null;
    /** text geometry of drawn fields, keyed 'prompt' or form index: { textX, charW, scroll, len, box } */
    this._textGeom = {};
    /** text last copied / cut, handed to the browser's copy / cut event */
    this._clipText = null;
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

  /**
   * @param {object} [opts]
   * @param {*} [opts.escValue] what Escape/B resolves to. Default: the first option valued
   *   false/null/'__back' (or the last option if none), same as before this existed. Pass
   *   this when an option's real value (e.g. confirm()'s "No" = false) would otherwise be
   *   indistinguishable from "the player wants to go back", which they are not the same thing.
   */
  menu(text, options, { title = '', subtitle = '', selected = 0, escValue } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'menu';
      this.title = title;
      this.subtitle = subtitle;
      this.lines = wrapRich(text, 40);
      this.options = options;
      this.selected = Math.max(0, Math.min(options.length - 1, selected));
      this._escValue = escValue;
      this.resolve = resolve;
      this.chrome = null;
      this.fields = [];
    });
  }

  /** @param {boolean} [opts.distinctCancel] Escape resolves to null, distinct from Yes/No. */
  confirm(text, { title = 'Confirm', yes = 'Yes', no = 'No', subtitle = '', distinctCancel = false } = {}) {
    return this.menu(
      text,
      [
        { label: yes, value: true },
        { label: no, value: false },
      ],
      { title, subtitle, escValue: distinctCancel ? null : undefined }
    );
  }

  /**
   * Yes / No question shown on top of whatever dialog is open (or none); the
   * dialog underneath, with its pending answer, comes back unchanged after.
   * No is highlighted first and Escape / B answers No.
   * @returns {Promise<boolean>}
   */
  async confirmOver(text, { title = 'Confirm', subtitle = '', yes = 'Yes', no = 'No' } = {}) {
    const under = this.active ? { ...this } : null;
    const answer = await this.menu(text, [
      { label: yes, value: true },
      { label: no, value: false },
    ], { title, subtitle, selected: 1, escValue: false });
    if (under) {
      Object.assign(this, under);
      this.chrome = null;
    }
    return answer === true;
  }

  /**
   * @param {object} opts
   * @param {'text'|'number'|'money'|'percent'} [opts.type]
   * @param {string} [opts.prefix] — shown left of field (e.g. '$')
   * @param {string} [opts.subtitle]
   */
  prompt(text, { title = '', defaultValue = '', type = 'text', prefix = '', subtitle = '', portfolio,
    amountScale = 1, required = null } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'prompt';
      this.title = title;
      this._moneyContext = captureMoneyContext(portfolio);
      this.subtitle = type === 'money' ? moneySubtitle(subtitle, this._moneyContext) : subtitle;
      this.lines = wrapRich(text, 40);
      this.promptType = type;
      /** 'name' | 'age' | null: Accept refuses a blank (or, for ages, non-numeric) value */
      this.promptRequired = required;
      this.inlineError = null;
      this.promptPrefix = prefix || (type === 'money' ? '$' : '');
      let initial = String(defaultValue ?? '');
      this.promptAmountScale = amountScale;
      this.promptInitialMoneyValue = parseMoneyInput(defaultValue);
      if (type === 'money' && initial !== '') initial = displayMoneyInput(this.promptInitialMoneyValue, this._moneyContext, amountScale);
      this.promptInitialDisplay = initial;
      this.promptValue = initial;
      this._resetTextFocus();
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
   * @param {object} [opts]
   * @param {(fields:object[], changedIndex:number)=>void} [opts.onFieldChange] called after any
   *   field's value changes (keyboard or mobile input), so a caller can keep a linked field (e.g.
   *   a $ amount and a % amount that should recompute each other) in sync. Mutate `fields[i].value`
   *   directly; this does not itself recurse back into onFieldChange.
   */
  form(text, fields, { title = '', subtitle = '', portfolio, onFieldChange = null } = {}) {
    return new Promise((resolve) => {
      this.active = true;
      this.mode = 'form';
      this.title = title;
      this._moneyContext = captureMoneyContext(portfolio);
      this.subtitle = (fields || []).some(f => f.type === 'money') ? moneySubtitle(subtitle, this._moneyContext) : subtitle;
      this.lines = wrapRich(text || '', 40);
      this.onFieldChange = onFieldChange;
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
          required: f.required || null,
        };
      });
      this.fieldIndex = 0;
      this.inlineError = null;
      this._resetTextFocus();
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
      textSel: this.textSel,
      textScroll: this.textScroll,
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
    if (this.mode === 'prompt') promptY = ty + 4; // matches the box drawn in draw()
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
  handlePointer(lx, ly, { shift = false, now = (typeof performance !== 'undefined' ? performance.now() : 0),
    drag = true } = {}) {
    if (!this.active || this.mode === 'loading') return false;
    if (this.mode === 'palette') return this._palPointer(lx, ly, true);

    if (this.mode === 'prompt') {
      const r = this.getPromptFieldRect();
      if (r && lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) {
        this._textPointerDown(lx, { shift, now, drag });
        return true;
      }
    }

    if (this.mode === 'form') {
      for (const hit of this._fieldHitRects) {
        if (lx >= hit.x && lx <= hit.x + hit.w && ly >= hit.y && ly <= hit.y + hit.h) {
          if (hit.index !== this.fieldIndex) {
            this.fieldIndex = hit.index;
            this._resetTextFocus();
            this._lastClick = null;
            shift = false;
          }
          // On the label line: caret at the end; on the box: caret where pressed.
          const box = this._fieldBoxRects[hit.index];
          if (box && ly >= box.y) this._textPointerDown(lx, { shift, now, drag });
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
      else if (!this._refuseInvalid()) this.close(this._parsePromptValue());
      return;
    }
    if (this.mode === 'form') {
      if (opt.value === '__back' || opt.value === '__cancel') this.close(null);
      else if (this._refuseInvalid()) return;
      else {
        const out = {};
        for (const f of this.fields) {
          out[f.key] = this._parseFieldValue(f);
        }
        this.close(out);
      }
      return;
    }
    // A menu entry can act in place (e.g. open a file picker from this very key/click
    // handler) and keep the menu on screen; it closes the menu itself when it is done.
    if (this.mode === 'menu' && typeof opt.onActivate === 'function') {
      opt.onActivate();
      return;
    }
    this.close(opt.value);
  }

  /**
   * Required-field error for the prompt ('prompt') or form field index, or null.
   * @param {'prompt'|number} key
   */
  requiredError(key) {
    if (key === 'prompt') return this.mode === 'prompt' ? requiredFieldError(this.promptRequired, this.promptValue) : null;
    const f = this.mode === 'form' ? this.fields[key] : null;
    return f ? requiredFieldError(f.required, f.value) : null;
  }

  /** Show `msg` beside field `key` until its value changes. */
  setInlineError(key, msg) {
    const value = key === 'prompt' ? this.promptValue : this.fields[key]?.value;
    this.inlineError = msg ? { key, msg, value } : null;
  }

  /** The inline error still showing (its field unchanged since), or null. */
  currentInlineError() {
    const e = this.inlineError;
    if (!e) return null;
    const value = e.key === 'prompt' ? this.promptValue : this.fields[e.key]?.value;
    return value === e.value ? e : null;
  }

  /** Accept guard: true (and an inline message shown) when a required value is missing. */
  _refuseInvalid() {
    const keys = this.mode === 'prompt' ? ['prompt'] : this.fields.map((_, i) => i);
    for (const key of keys) {
      const msg = this.requiredError(key);
      if (!msg) continue;
      if (key !== 'prompt' && key !== this.fieldIndex) this.focusField(key, 'all');
      this.setInlineError(key, msg);
      return true;
    }
    this.inlineError = null;
    return false;
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

  /** Short warning text, right-aligned at (right, y), in the dialog's pixel font. */
  _drawInlineError(ctx, msg, right, y) {
    ctx.save();
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff8a6a';
    ctx.fillText(msg, right, y);
    ctx.restore();
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
      if (e.key === 'Tab') {
        // Keep focus in the game: Tab walks the form's fields, not the page.
        this._tabField(e.shiftKey ? -1 : 1);
        e.preventDefault();
        return true;
      }
      // The hidden input edits natively; MobileTextInput mirrors value + selection.
      return true;
    }

    if ((this.mode === 'prompt' || this.mode === 'form') && !fromNativeInput) {
      if (this._handleTextKey(e)) return true;
    }

    if (this.mode === 'form' && !fromNativeInput) {
      if (KEYS.up.includes(e.key)) {
        if (this.fieldIndex > 0) this.focusField(Math.min(this.fieldIndex, this.fields.length) - 1);
        else this.selected = (this.selected - 1 + this.options.length) % this.options.length;
        e.preventDefault();
        return true;
      }
      if (KEYS.down.includes(e.key)) {
        if (this.fieldIndex < this.fields.length - 1) this.focusField(this.fieldIndex + 1);
        else {
          // move into Accept/Back
          this.fieldIndex = this.fields.length; // past fields
          this.selected = 0;
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
        if (this._escValue !== undefined) this.close(this._escValue);
        else {
          const cancel = this.options.find(
            (o) => o.value === false || o.value === null || o.value === '__back'
          );
          this.close(cancel ? cancel.value : this.options[this.options.length - 1].value);
        }
      }
      e.preventDefault();
      return true;
    }
    return true;
  }

  /** Type `ch` into form field `f` at its caret (kept for callers of the old API). */
  _typeInto(f, ch) {
    const i = this.fields.indexOf(f);
    if (i < 0) return;
    if (i !== this.fieldIndex) this.focusField(i);
    this.insertTextAtCaret(ch);
  }

  /**
   * Set a form field's value (the only path that should mutate it -- keyboard typing/backspace
   * and the mobile text input both go through this), then run the form's onFieldChange hook, if
   * any, so a caller can keep a second field (e.g. a linked $ amount / % amount pair) in sync.
   */
  setFieldValue(index, value) {
    const f = this.fields[index];
    if (!f) return;
    f.value = value;
    this.onFieldChange?.(this.fields, index);
  }

  // ── Text field editing (prompt / form) ────────────────────────────────

  /**
   * The focused text field, or null (no prompt/form, or the form cursor is on
   * Accept / Back).
   * @returns {{key:string|number, type:string, get:() => string, set:(v:string) => void}|null}
   */
  _activeText() {
    if (!this.active) return null;
    if (this.mode === 'prompt') {
      return {
        key: 'prompt',
        type: this.promptType || 'text',
        get: () => String(this.promptValue ?? ''),
        set: (v) => { this.promptValue = v; },
      };
    }
    if (this.mode === 'form') {
      const i = this.fieldIndex;
      const f = this.fields[i];
      if (!f) return null;
      return {
        key: i,
        type: f.type || 'text',
        get: () => String(f.value ?? ''),
        set: (v) => this.setFieldValue(i, v),
      };
    }
    return null;
  }

  /** Caret at the end of the focused field (a new prompt/form, or arrow-key field moves). */
  _resetTextFocus(how = 'end') {
    const t = this._activeText();
    const v = t ? t.get() : '';
    this.textSel = how === 'all' ? selectAll(v) : caretSel(v.length);
    this.textScroll = 0;
    this._drag = null;
    this._caretT = typeof performance !== 'undefined' ? performance.now() : 0;
  }

  /** Current selection of the focused field, clamped to its value (values can change underneath). */
  getTextSelection() {
    const t = this._activeText();
    if (!t) return null;
    this.textSel = normalizeSel(this.textSel, t.get().length);
    const [start, end] = selRange(this.textSel);
    return { start, end, anchor: this.textSel.anchor, caret: this.textSel.caret,
      direction: this.textSel.caret < this.textSel.anchor ? 'backward' : 'forward' };
  }

  /** Set the focused field's selection (mobile hidden input mirrors its selectionStart/End here). */
  setTextSelection(start, end = start, direction = 'forward') {
    const t = this._activeText();
    if (!t) return;
    const backward = direction === 'backward';
    this.textSel = normalizeSel(backward ? { anchor: end, caret: start } : { anchor: start, caret: end }, t.get().length);
    this._touchCaret();
  }

  /** Focus form field `i` ('end' = caret at end, 'all' = select everything, as Tab does). */
  focusField(i, how = 'end') {
    if (this.mode !== 'form' || !this.fields[i]) return;
    this.fieldIndex = i;
    this._resetTextFocus(how);
  }

  /** Tab / Shift+Tab: next / previous form field, wrapping, with its text selected. */
  _tabField(dir) {
    if (this.mode === 'prompt') { this._resetTextFocus('all'); return; }
    if (this.mode !== 'form') return;
    const next = tabIndex(this.fieldIndex, this.fields.length, dir);
    if (next >= 0) this.focusField(next, 'all');
  }

  _touchCaret() {
    this._caretT = typeof performance !== 'undefined' ? performance.now() : 0;
  }

  /** Apply an edit result from TextEdit ({value, sel} or null = rejected). */
  _applyEdit(t, result) {
    if (!result) return false;
    if (result.value !== t.get()) t.set(result.value);
    this.textSel = normalizeSel(result.sel, t.get().length);
    this._touchCaret();
    return true;
  }

  /** Type or paste `text` into the focused field, replacing any selection. */
  insertTextAtCaret(text) {
    const t = this._activeText();
    if (!t) return false;
    this.getTextSelection();
    return this._applyEdit(t, insertText(t.type, t.get(), this.textSel, text));
  }

  /** Selected text of the focused field ('' when the selection is empty). */
  selectedFieldText() {
    const t = this._activeText();
    if (!t) return '';
    this.getTextSelection();
    return selectedText(t.get(), this.textSel);
  }

  /** Delete the selection (if any) of the focused field; returns the removed text. */
  _deleteSelection() {
    const t = this._activeText();
    if (!t) return '';
    const text = this.selectedFieldText();
    if (text) this._applyEdit(t, deleteText(t.type, t.get(), this.textSel, 'back'));
    return text;
  }

  _writeClipboard(text) {
    this._clipText = text;
    try {
      const clip = typeof navigator !== 'undefined' ? navigator.clipboard : null;
      clip?.writeText?.(text)?.catch?.(() => {});
    } catch (_) { /* clipboard unavailable: the copy / cut event below still carries it */ }
  }

  /**
   * Keys for the focused text field: Tab, caret moves, selection, deletion,
   * clipboard shortcuts and typing. Returns false for keys it leaves to the
   * rest of handleKeyDown (Enter, Escape, Up/Down, ...).
   */
  _handleTextKey(e) {
    if (e.key === 'Tab') {
      this._tabField(e.shiftKey ? -1 : 1);
      e.preventDefault();
      return true;
    }
    const t = this._activeText();
    if (!t) return false;
    const mod = e.ctrlKey || e.metaKey;
    const value = t.get();
    this.getTextSelection();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (mod && !e.altKey && k === 'a') {
      this.textSel = selectAll(value);
      this._touchCaret();
      e.preventDefault();
      return true;
    }
    if (mod && !e.altKey && (k === 'c' || k === 'x')) {
      const text = selectedText(value, this.textSel);
      if (text) {
        this._writeClipboard(text);
        if (k === 'x') this._deleteSelection();
      }
      // No preventDefault: the browser still fires copy / cut (handleClipboardEvent).
      return true;
    }
    if (mod && !e.altKey && k === 'v') {
      // No preventDefault: the browser fires a paste event (handleClipboardEvent).
      // If it never arrives, fall back to the async clipboard API.
      this._pasteSeen = false;
      const clip = typeof navigator !== 'undefined' ? navigator.clipboard : null;
      if (clip?.readText && typeof setTimeout === 'function') {
        const owner = this.resolve;
        setTimeout(() => {
          if (this._pasteSeen || this.resolve !== owner) return;
          clip.readText().then((text) => {
            if (!this._pasteSeen && this.resolve === owner && text) this.insertTextAtCaret(text);
          }).catch(() => {});
        }, 80);
      }
      return true;
    }

    const dir = e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right'
      : e.key === 'Home' ? 'home' : e.key === 'End' ? 'end' : null;
    if (dir) {
      // Cmd+Left/Right = line start/end on macOS; Ctrl or Alt+Left/Right = by word.
      const d = e.metaKey && (dir === 'left' || dir === 'right') ? (dir === 'left' ? 'home' : 'end') : dir;
      this.textSel = moveSel(value, this.textSel, d, { extend: e.shiftKey, word: (e.ctrlKey || e.altKey) && !e.metaKey });
      this._touchCaret();
      e.preventDefault();
      return true;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      this._applyEdit(t, deleteText(t.type, value, this.textSel, e.key === 'Backspace' ? 'back' : 'forward',
        { word: e.ctrlKey || e.altKey }));
      e.preventDefault();
      return true;
    }
    if (e.key.length === 1 && !mod) {
      this._applyEdit(t, insertText(t.type, value, this.textSel, e.key));
      e.preventDefault();
      return true;
    }
    return false;
  }

  /**
   * Browser copy / cut / paste events while a text field is focused (main.js
   * routes document events here). Returns whether the event was used.
   * @param {ClipboardEvent} e
   */
  handleClipboardEvent(e) {
    if (!this._activeText()) return false;
    if (e.type === 'paste') {
      this._pasteSeen = true;
      const text = e.clipboardData?.getData?.('text/plain') ?? e.clipboardData?.getData?.('text') ?? '';
      if (text) this.insertTextAtCaret(text);
      e.preventDefault?.();
      return true;
    }
    // copy / cut: the keydown already copied (and for cut, deleted) the selection.
    const text = this.selectedFieldText() || this._clipText;
    if (text && e.clipboardData?.setData) {
      e.clipboardData.setData('text/plain', text);
      e.preventDefault?.();
    }
    this._clipText = null;
    return true;
  }

  /** Text geometry for field `key` from the last draw (or a font-size estimate before the first draw). */
  _geomFor(key) {
    const g = this._textGeom[key];
    if (g) return g;
    const box = key === 'prompt' ? this.getPromptFieldRect() : this._fieldBoxRects[key];
    if (!box) return null;
    const px = key === 'prompt' ? 18 : 16;
    const t = key === 'prompt' ? { prefix: this.promptPrefix, value: this.promptValue }
      : { prefix: this.fields[key]?.prefix, value: this.fields[key]?.value };
    const prefixLen = t.prefix ? t.prefix.length + 1 : 0;
    return { textX: box.x + (key === 'prompt' ? 12 : 10) + prefixLen * px, charW: px, scroll: 0,
      len: String(t.value ?? '').length, box };
  }

  /** Caret index under frame point (lx, ly) for the focused field, or null when not over it. */
  caretIndexAt(lx) {
    const t = this._activeText();
    if (!t) return null;
    const g = this._geomFor(t.key);
    if (!g) return null;
    return caretFromX(lx, { textX: g.textX, charW: g.charW, scroll: this.textScroll, len: t.get().length });
  }

  /**
   * Pointer press on the focused field's text: place the caret (Shift extends),
   * double press selects a word, triple selects all; starts a drag selection.
   */
  _textPointerDown(lx, { shift = false, now = 0, drag = true } = {}) {
    const t = this._activeText();
    if (!t) return;
    const idx = this.caretIndexAt(lx) ?? t.get().length;
    const value = t.get();
    const prev = this._lastClick;
    const multi = prev && prev.key === t.key && now - prev.t < 450 && Math.abs(prev.x - lx) < 24;
    const count = multi ? prev.count + 1 : 1;
    this._lastClick = { key: t.key, t: now, x: lx, count };
    this.getTextSelection();
    if (count === 2) {
      const [s, e] = wordAt(value, idx);
      this.textSel = { anchor: s, caret: e };
      this._drag = null;
    } else if (count >= 3) {
      this.textSel = selectAll(value);
      this._drag = null;
    } else {
      this.textSel = shift ? { anchor: this.textSel.anchor, caret: idx } : caretSel(idx);
      this._drag = drag ? { key: t.key } : null;
    }
    this._touchCaret();
  }

  /** True while a mouse drag-select is in progress. */
  isDraggingText() {
    return !!this._drag;
  }

  /** Mouse moved with the button held: extend the selection to the pointer. */
  dragPointer(lx) {
    const t = this._activeText();
    if (!this._drag || !t || t.key !== this._drag.key) return false;
    const idx = this.caretIndexAt(lx);
    if (idx == null) return false;
    this.textSel = { anchor: normalizeSel(this.textSel, t.get().length).anchor, caret: idx };
    this._touchCaret();
    return true;
  }

  endPointer() {
    this._drag = null;
  }

  /**
   * Draw a field's value with selection highlight and caret, clipped to the box.
   * @returns the geometry stored for hit-testing
   */
  _drawFieldText(ctx, { key, box, padX, textY, px, prefix, value, suffix, focused, lineH }) {
    ctx.font = `${px}px "Press Start 2P", monospace`;
    const charW = ctx.measureText('0').width || px;
    const prefixStr = prefix ? prefix + ' ' : '';
    const startX = box.x + padX;
    const textX = startX + (prefixStr ? ctx.measureText(prefixStr).width : 0);
    const v = String(value ?? '');
    const visible = Math.max(1, Math.floor((box.x + box.w - padX - textX) / charW) - (suffix ? suffix.length : 0) - 1);
    let scroll = 0;
    let sel = null;
    if (focused) {
      sel = normalizeSel(this.textSel, v.length);
      this.textSel = sel;
      scroll = this.textScroll = scrollToCaret(this.textScroll, sel.caret, visible, v.length);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x + 2, box.y + 2, box.w - 4, box.h - 4);
    ctx.clip();
    if (sel && hasSelection(sel)) {
      const [s, e] = selRange(sel);
      const a = Math.max(s, scroll), b = Math.min(e, scroll + visible + 1);
      if (b > a) {
        ctx.fillStyle = 'rgba(70, 110, 200, 0.75)';
        ctx.fillRect(Math.round(textX + (a - scroll) * charW), textY - 4, Math.round((b - a) * charW), lineH);
      }
    }
    ctx.fillStyle = PALETTE.uiText;
    if (prefixStr) ctx.fillText(prefixStr, startX, textY);
    const shown = v.slice(scroll) + (suffix && v !== '' ? suffix : '');
    ctx.fillText(shown, textX, textY);
    if (sel) {
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      const blinkOn = now - this._caretT < 500 || Math.floor((now - this._caretT) / 500) % 2 === 1;
      if (blinkOn && !hasSelection(sel)) {
        ctx.fillStyle = PALETTE.gold;
        ctx.fillRect(Math.round(textX + (sel.caret - scroll) * charW) - 1, textY - 3, 3, lineH - 2);
      }
    }
    ctx.restore();
    const geom = { textX, charW, scroll, len: v.length, box };
    this._textGeom[key] = geom;
    return geom;
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
    this._textGeom = {};

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
      this._drawFieldText(ctx, {
        key: 'prompt', box: { x: x + pad, y: ty, w: boxW - pad * 2, h: 44 }, padX: 12, textY: ty + 12, px: 18,
        prefix: this.promptPrefix, value: this.promptValue, suffix: this.promptType === 'percent' ? '%' : '',
        focused: true, lineH: 26,
      });
      const err = this.currentInlineError();
      if (err && err.key === 'prompt') this._drawInlineError(ctx, err.msg, x + boxW - pad - 12, ty + 15);
      ty += 56;
    } else if (this.mode === 'form') {
      ty += 4;
      this.fields.forEach((f, i) => {
        const focused = i === this.fieldIndex;
        drawRichText(ctx, f.label, x + pad, ty, 14, focused ? PALETTE.gold : '#a89878');
        const err = this.currentInlineError();
        if (err && err.key === i) this._drawInlineError(ctx, err.msg, x + boxW - pad, ty);
        ty += 20;
        ctx.fillStyle = '#000';
        ctx.fillRect(x + pad, ty, boxW - pad * 2, 36);
        ctx.strokeStyle = focused ? PALETTE.gold : PALETTE.uiBorder;
        ctx.strokeRect(x + pad + 0.5, ty + 0.5, boxW - pad * 2 - 1, 35);
        this._drawFieldText(ctx, {
          key: i, box: { x: x + pad, y: ty, w: boxW - pad * 2, h: 36 }, padX: 10, textY: ty + 8, px: 16,
          prefix: f.prefix, value: f.value, suffix: f.type === 'percent' ? '%' : '', focused, lineH: 24,
        });
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

