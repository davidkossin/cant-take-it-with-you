/**
 * Caret / selection / editing rules for the canvas-drawn text fields in
 * Dialog prompt and form modes. Pure functions over (value, selection), so the
 * desktop-standard behaviors (click to place the caret, Shift+arrow and drag
 * selection, typing over a selection, word jumps, comma-aware money editing)
 * can be tested without a canvas.
 *
 * A selection is `{ anchor, caret }`: `anchor` is where it started, `caret` is
 * the moving end (where the blinking caret is drawn). Both are indexes into the
 * field's displayed value (money values include their commas). A collapsed
 * selection (anchor === caret) is a plain caret.
 */

/** Longest free-text value (names, tickers, dates). */
export const TEXT_MAX_LEN = 28;

/** "1234.5" → "1,234.5"; keeps a leading '-' and at most two decimals. */
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

const clamp = (i, lo, hi) => Math.max(lo, Math.min(hi, i));

export function caretSel(i) {
  return { anchor: i, caret: i };
}

/** Selection clamped to a value of length `len` (values can change underneath it). */
export function normalizeSel(sel, len) {
  if (!sel) return caretSel(len);
  const a = clamp(Number.isFinite(sel.anchor) ? sel.anchor : len, 0, len);
  const c = clamp(Number.isFinite(sel.caret) ? sel.caret : len, 0, len);
  return { anchor: a, caret: c };
}

/** [start, end) of a selection. */
export function selRange(sel) {
  return [Math.min(sel.anchor, sel.caret), Math.max(sel.anchor, sel.caret)];
}

export function hasSelection(sel) {
  return !!sel && sel.anchor !== sel.caret;
}

export function selectedText(value, sel) {
  const [s, e] = selRange(sel);
  return String(value).slice(s, e);
}

export function selectAll(value) {
  return { anchor: 0, caret: String(value).length };
}

const WORD_RE = /[\p{L}\p{N}_]/u;
export function isWordChar(ch) {
  return !!ch && WORD_RE.test(ch);
}

/** Start of the word left of `i` (Ctrl/Alt+Left, Ctrl+Backspace). */
export function wordLeft(value, i) {
  const v = String(value);
  let k = clamp(i, 0, v.length);
  while (k > 0 && !isWordChar(v[k - 1])) k--;
  while (k > 0 && isWordChar(v[k - 1])) k--;
  return k;
}

/** End of the word right of `i` (Ctrl/Alt+Right, Ctrl+Delete). */
export function wordRight(value, i) {
  const v = String(value);
  let k = clamp(i, 0, v.length);
  while (k < v.length && !isWordChar(v[k])) k++;
  while (k < v.length && isWordChar(v[k])) k++;
  return k;
}

/**
 * Double-click selection around index `i`: the word under it, else the run
 * of spaces / punctuation under it.
 * @returns {[number, number]}
 */
export function wordAt(value, i) {
  const v = String(value);
  if (!v.length) return [0, 0];
  let k = clamp(i, 0, v.length);
  // Clicking just past a word's last letter still picks that word.
  if (k === v.length || (!isWordChar(v[k]) && isWordChar(v[k - 1]))) k = Math.max(0, k - 1);
  const word = isWordChar(v[k]);
  const same = (ch) => isWordChar(ch) === word;
  let s = k, e = k + 1;
  while (s > 0 && same(v[s - 1])) s--;
  while (e < v.length && same(v[e])) e++;
  return [s, e];
}

/**
 * Arrow / Home / End.
 * @param {'left'|'right'|'home'|'end'} dir
 * @param {{extend?:boolean, word?:boolean}} [opts] extend = Shift held; word = Ctrl/Alt held
 */
export function moveSel(value, sel, dir, { extend = false, word = false } = {}) {
  const v = String(value);
  const cur = normalizeSel(sel, v.length);
  const [s, e] = selRange(cur);
  if (!extend && s !== e && !word && (dir === 'left' || dir === 'right')) {
    // Plain arrow with a selection collapses it to that side (standard).
    return caretSel(dir === 'left' ? s : e);
  }
  let c = cur.caret;
  if (dir === 'home') c = 0;
  else if (dir === 'end') c = v.length;
  else if (dir === 'left') c = word ? wordLeft(v, c) : Math.max(0, c - 1);
  else if (dir === 'right') c = word ? wordRight(v, c) : Math.min(v.length, c + 1);
  return extend ? { anchor: cur.anchor, caret: c } : caretSel(c);
}

/** Characters an insert may keep for a field type (pastes are filtered the same way). */
export function filterInsert(type, text) {
  const t = String(text ?? '');
  if (type === 'money') return t.replace(/[^\d.\-]/g, '');
  if (type === 'number' || type === 'percent') return t.replace(/[^\d.\-]/g, '');
  // One-line fields: line breaks / tabs become spaces, other control chars go.
  return t.replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '');
}

const significant = (s) => String(s).replace(/,/g, '').length;

/**
 * Index in `formatted` that has `afterSig` non-comma characters after it.
 * Reformatting (commas, stripped leading zeros) never changes the characters
 * right of the caret, so counting from the end keeps the caret in place.
 */
export function indexWithSigAfter(formatted, afterSig) {
  const f = String(formatted);
  let count = 0;
  let k = f.length;
  for (; k > 0; k--) {
    if (count >= afterSig) break;
    if (f[k - 1] !== ',') count++;
  }
  // Sit left of a comma rather than right of it ("19|,234", not "19,|234").
  while (k > 0 && f[k - 1] === ',') k--;
  return k;
}

/**
 * Reformat a raw money string whose caret is at `caret`, keeping the caret
 * beside the same digit. Returns null when the raw text is not a valid amount.
 * @returns {{value:string, caret:number}|null}
 */
export function formatMoneyWithCaret(raw, caret) {
  const r = String(raw);
  const c = clamp(caret, 0, r.length);
  const bare = r.replace(/,/g, '');
  if (!(/^-?\d*\.?\d*$/.test(bare))) return null;
  const value = formatMoneyInput(bare);
  const afterSig = significant(r.slice(c));
  return { value, caret: clamp(indexWithSigAfter(value, afterSig), 0, value.length) };
}

/**
 * Replace the selection (or insert at the caret) with `text`, applying the
 * field type's rules. Returns null when nothing changes (rejected input), so
 * callers keep the old value and selection.
 * @param {'text'|'number'|'money'|'percent'} type
 * @returns {{value:string, sel:{anchor:number, caret:number}}|null}
 */
export function insertText(type, value, sel, text, { maxLen = TEXT_MAX_LEN } = {}) {
  const v = String(value ?? '');
  const cur = normalizeSel(sel, v.length);
  const [s, e] = selRange(cur);
  let ins = filterInsert(type, text);
  const before = v.slice(0, s), after = v.slice(e);
  if (type === 'money') {
    if (!ins && s === e) return null;
    const raw = before + ins + after;
    const bare = raw.replace(/,/g, '');
    // Over two decimals: refuse (masked-input behavior), do not silently drop digits.
    const dec = bare.split('.')[1];
    if (dec != null && dec.length > 2) return null;
    const out = formatMoneyWithCaret(raw, before.length + ins.length);
    if (!out) return null;
    return { value: out.value, sel: caretSel(out.caret) };
  }
  if (type === 'text') {
    const room = Math.max(0, maxLen - (before.length + after.length));
    ins = ins.slice(0, room);
  }
  if (!ins && s === e) return null;
  const next = before + ins + after;
  return { value: next, sel: caretSel(before.length + ins.length) };
}

/** Remove [s, e) and reformat money, keeping the caret at s. */
function removeRange(type, v, s, e) {
  const before = v.slice(0, s), after = v.slice(e);
  if (type === 'money') {
    const out = formatMoneyWithCaret(before + after, before.length);
    if (out) return { value: out.value, sel: caretSel(out.caret) };
    // e.g. deleting the '.' of "1.5" that would merge into an invalid string
    return null;
  }
  return { value: before + after, sel: caretSel(before.length) };
}

/**
 * Backspace (dir 'back') or Delete (dir 'forward'). With a selection both
 * delete the selection; otherwise one character (or one word with `word`).
 * Money skips over a comma so Backspace after "1," deletes the "1".
 * @returns {{value:string, sel:{anchor:number, caret:number}}|null}
 */
export function deleteText(type, value, sel, dir = 'back', { word = false } = {}) {
  const v = String(value ?? '');
  const cur = normalizeSel(sel, v.length);
  let [s, e] = selRange(cur);
  if (s === e) {
    if (dir === 'back') {
      if (s === 0) return null;
      s = word ? wordLeft(v, s) : s - 1;
      if (type === 'money' && !word && v[s] === ',' && s > 0) s -= 1;
    } else {
      if (e >= v.length) return null;
      e = word ? wordRight(v, e) : e + 1;
      if (type === 'money' && !word && v[e - 1] === ',' && e < v.length) e += 1;
    }
  }
  return removeRange(type, v, s, e);
}

/**
 * Character index nearest a pointer x (frame pixels) in a field whose value
 * text starts at `textX` with fixed advance `charW`, scrolled by `scroll` chars.
 */
export function caretFromX(x, { textX, charW, scroll = 0, len }) {
  const w = charW > 0 ? charW : 1;
  return clamp(Math.round((x - textX) / w) + scroll, 0, len);
}

/**
 * First visible character so the caret stays inside a field that shows
 * `visible` characters (long values scroll horizontally).
 */
export function scrollToCaret(scroll, caret, visible, len) {
  const vis = Math.max(1, Math.floor(visible));
  if (len <= vis) return 0;
  let sc = clamp(scroll, 0, len - vis);
  if (caret < sc) sc = caret;
  else if (caret > sc + vis) sc = caret - vis;
  return clamp(sc, 0, Math.max(0, len - vis));
}

/** Next field index for Tab (dir +1) / Shift+Tab (dir -1), wrapping. `cur` may be past the fields (Accept row). */
export function tabIndex(cur, count, dir) {
  if (count <= 0) return -1;
  const from = cur >= 0 && cur < count ? cur : dir > 0 ? -1 : count;
  return ((from + dir) % count + count) % count;
}
