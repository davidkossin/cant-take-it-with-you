import test from 'node:test';
import assert from 'node:assert/strict';
import { Dialog } from '../js/render/Dialog.js';
import {
  caretSel, normalizeSel, selRange, moveSel, wordAt, wordLeft, wordRight, insertText, deleteText,
  caretFromX, scrollToCaret, tabIndex, formatMoneyWithCaret, selectAll,
} from '../js/ui/TextEdit.js';

const key = (k, o = {}) => ({ key: k, prevented: false, preventDefault() { this.prevented = true; }, ...o });
const press = (d, k, o) => { const e = key(k, o); d.handleKeyDown(e); return e; };

test('caret moves: arrows, Home/End, word jumps; a plain arrow collapses a selection to its side', () => {
  const v = 'Ada Lovelace';
  assert.deepEqual(moveSel(v, caretSel(5), 'left'), caretSel(4));
  assert.deepEqual(moveSel(v, caretSel(0), 'left'), caretSel(0));
  assert.deepEqual(moveSel(v, caretSel(5), 'home'), caretSel(0));
  assert.deepEqual(moveSel(v, caretSel(5), 'end'), caretSel(12));
  assert.deepEqual(moveSel(v, caretSel(12), 'left', { word: true }), caretSel(4));
  assert.deepEqual(moveSel(v, caretSel(0), 'right', { word: true }), caretSel(3));
  assert.deepEqual(moveSel(v, { anchor: 2, caret: 8 }, 'left'), caretSel(2));
  assert.deepEqual(moveSel(v, { anchor: 8, caret: 2 }, 'right'), caretSel(8));
  assert.equal(wordLeft(v, 4), 0);
  assert.equal(wordRight(v, 3), 12);
});

test('Shift+arrows / Home / End extend from the anchor; double-click picks the word', () => {
  const v = 'Ada Lovelace';
  let sel = moveSel(v, caretSel(4), 'right', { extend: true });
  sel = moveSel(v, sel, 'right', { extend: true });
  assert.deepEqual(sel, { anchor: 4, caret: 6 });
  assert.deepEqual(moveSel(v, sel, 'home', { extend: true }), { anchor: 4, caret: 0 });
  assert.deepEqual(moveSel(v, sel, 'end', { extend: true }), { anchor: 4, caret: 12 });
  assert.deepEqual(wordAt(v, 6), [4, 12]);
  assert.deepEqual(wordAt(v, 3), [0, 3]);
  assert.deepEqual(wordAt('', 0), [0, 0]);
  assert.deepEqual(selectAll(v), { anchor: 0, caret: 12 });
  assert.deepEqual(normalizeSel({ anchor: 40, caret: -3 }, 5), { anchor: 5, caret: 0 });
  assert.deepEqual(selRange({ anchor: 7, caret: 2 }), [2, 7]);
});

test('typing replaces the selection, respects the text max length, and filters number fields', () => {
  assert.deepEqual(insertText('text', 'Ada Lovelace', { anchor: 0, caret: 3 }, 'Grace'),
    { value: 'Grace Lovelace', sel: caretSel(5) });
  assert.deepEqual(insertText('text', 'Ada', caretSel(1), 'x'), { value: 'Axda', sel: caretSel(2) });
  assert.equal(insertText('text', 'x'.repeat(28), caretSel(28), 'y'), null);
  assert.equal(insertText('text', 'x'.repeat(26), caretSel(0), 'abcd').value, 'ab' + 'x'.repeat(26));
  assert.equal(insertText('text', 'Ada', caretSel(3), 'line\nbreak').value, 'Adaline break');
  assert.equal(insertText('number', '42', caretSel(2), 'a'), null);
  assert.deepEqual(insertText('number', '42', caretSel(1), '7'), { value: '472', sel: caretSel(2) });
  assert.deepEqual(insertText('percent', '5', selectAll('5'), '12.5%'), { value: '12.5', sel: caretSel(4) });
});

test('money editing keeps commas formatted and the caret beside the same digit', () => {
  assert.deepEqual(insertText('money', '1,234', caretSel(5), '5'), { value: '12,345', sel: caretSel(6) });
  assert.deepEqual(insertText('money', '1,234', caretSel(1), '9'), { value: '19,234', sel: caretSel(2) });
  assert.deepEqual(insertText('money', '1,234.00', { anchor: 0, caret: 5 }, '7'), { value: '7.00', sel: caretSel(1) });
  assert.equal(insertText('money', '1.23', caretSel(4), '4'), null); // no third decimal
  assert.equal(insertText('money', '1.5', caretSel(3), '.'), null);   // no second point
  assert.deepEqual(insertText('money', '', caretSel(0), '$1,500.5'), { value: '1,500.5', sel: caretSel(7) });
  // Backspace right after a comma deletes the digit before it.
  assert.deepEqual(deleteText('money', '1,234', caretSel(2), 'back'), { value: '234', sel: caretSel(0) });
  assert.deepEqual(deleteText('money', '12,345', caretSel(2), 'forward'), { value: '1,245', sel: caretSel(3) });
  assert.deepEqual(deleteText('money', '12,345', { anchor: 1, caret: 6 }, 'back'), { value: '1', sel: caretSel(1) });
  assert.deepEqual(formatMoneyWithCaret('12345', 2), { value: '12,345', caret: 2 });
});

test('Backspace / Delete remove the selection, else one character (or a word)', () => {
  assert.deepEqual(deleteText('text', 'Ada Lovelace', { anchor: 3, caret: 12 }, 'back'), { value: 'Ada', sel: caretSel(3) });
  assert.deepEqual(deleteText('text', 'Ada', caretSel(3), 'back'), { value: 'Ad', sel: caretSel(2) });
  assert.deepEqual(deleteText('text', 'Ada', caretSel(0), 'forward'), { value: 'da', sel: caretSel(0) });
  assert.equal(deleteText('text', 'Ada', caretSel(0), 'back'), null);
  assert.equal(deleteText('text', 'Ada', caretSel(3), 'forward'), null);
  assert.deepEqual(deleteText('text', 'Ada Lovelace', caretSel(12), 'back', { word: true }), { value: 'Ada ', sel: caretSel(4) });
});

test('caret from a pointer x uses the fixed advance, scroll and rounding to the nearest gap', () => {
  const g = { textX: 100, charW: 16, scroll: 0, len: 8 };
  assert.equal(caretFromX(100, g), 0);
  assert.equal(caretFromX(107, g), 0);
  assert.equal(caretFromX(109, g), 1);
  assert.equal(caretFromX(100 + 16 * 3, g), 3);
  assert.equal(caretFromX(50, g), 0);
  assert.equal(caretFromX(9999, g), 8);
  assert.equal(caretFromX(100 + 16 * 2, { ...g, scroll: 4 }), 6);
  assert.equal(scrollToCaret(0, 30, 20, 40), 10);
  assert.equal(scrollToCaret(10, 3, 20, 40), 3);
  assert.equal(scrollToCaret(5, 3, 20, 10), 0);
});

test('Tab / Shift+Tab order wraps, starting from the Accept row too', () => {
  assert.equal(tabIndex(0, 3, 1), 1);
  assert.equal(tabIndex(2, 3, 1), 0);
  assert.equal(tabIndex(0, 3, -1), 2);
  assert.equal(tabIndex(3, 3, 1), 0);
  assert.equal(tabIndex(3, 3, -1), 2);
  assert.equal(tabIndex(0, 0, 1), -1);
});

test('Dialog form: caret editing, Shift selection, typing over it, Tab selects the next field, Enter submits', async () => {
  const d = new Dialog();
  const result = d.form('Details', [
    { key: 'name', label: 'Name', defaultValue: 'Ada Lovelace' },
    { key: 'amount', label: 'Amount', type: 'money', defaultValue: '1234' },
    { key: 'age', label: 'Age', type: 'number', defaultValue: '40' },
  ]);
  assert.deepEqual(d.getTextSelection(), { start: 12, end: 12, anchor: 12, caret: 12, direction: 'forward' });
  press(d, 'Home');
  press(d, 'ArrowRight', { shiftKey: true });
  press(d, 'ArrowRight', { shiftKey: true });
  press(d, 'ArrowRight', { shiftKey: true });
  assert.equal(d.selectedFieldText(), 'Ada');
  press(d, 'G'); press(d, 'r'); press(d, 'a'); press(d, 'c'); press(d, 'e');
  assert.equal(d.fields[0].value, 'Grace Lovelace');
  // 'a' / 'e' type letters in a field; they do not move or confirm.
  assert.equal(d.active, true);
  const tab = press(d, 'Tab');
  assert.equal(tab.prevented, true);
  assert.equal(d.fieldIndex, 1);
  assert.equal(d.selectedFieldText(), '1,234.00');
  press(d, '9');
  assert.equal(d.fields[1].value, '9');
  press(d, 'Tab', { shiftKey: true });
  assert.equal(d.fieldIndex, 0);
  press(d, 'Tab', { shiftKey: true });
  assert.equal(d.fieldIndex, 2, 'Shift+Tab wraps to the last field');
  press(d, 'a', { ctrlKey: true });
  press(d, 'Delete');
  assert.equal(d.fields[2].value, '');
  press(d, '5'); press(d, '2');
  press(d, 'Enter');
  assert.deepEqual(await result, { name: 'Grace Lovelace', amount: 9, age: 52 });
});

test('Dialog prompt: Backspace with no selection deletes before the caret; Escape still cancels', async () => {
  const d = new Dialog();
  const result = d.prompt('Name?', { defaultValue: 'Traveler' });
  press(d, 'ArrowLeft'); press(d, 'ArrowLeft');
  press(d, 'Backspace');
  assert.equal(d.promptValue, 'Traveer');
  press(d, 'End');
  press(d, 'ArrowLeft', { shiftKey: true, ctrlKey: true });
  press(d, 'Backspace');
  assert.equal(d.promptValue, '');
  press(d, 'Escape');
  assert.equal(await result, null);
});

test('Dialog pointer: a press places the caret at the character, drag selects, double press selects a word', () => {
  const d = new Dialog();
  d.form('Details', [{ key: 'name', label: 'Name', defaultValue: 'Ada Lovelace' }, { key: 'zip', label: 'Zip', defaultValue: '' }]);
  // Geometry as drawn: box at (100, 200), value text from x = 110 at 16 px per char.
  d._fieldHitRects = [
    { index: 0, x: 100, y: 180, w: 800, h: 56 },
    { index: 1, x: 100, y: 240, w: 800, h: 56 },
  ];
  d._fieldBoxRects = [{ x: 100, y: 200, w: 800, h: 36 }, { x: 100, y: 260, w: 800, h: 36 }];
  d._textGeom = { 0: { textX: 110, charW: 16, scroll: 0, len: 12 }, 1: { textX: 110, charW: 16, scroll: 0, len: 0 } };
  assert.equal(d.handlePointer(110 + 16 * 4 + 3, 210, { now: 1000 }), true);
  assert.deepEqual(d.getTextSelection(), { start: 4, end: 4, anchor: 4, caret: 4, direction: 'forward' });
  assert.equal(d.isDraggingText(), true);
  d.dragPointer(110 + 16 * 8);
  d.endPointer();
  assert.equal(d.selectedFieldText(), 'Love');
  press(d, 'X');
  assert.equal(d.fields[0].value, 'Ada Xlace');
  d.handlePointer(110 + 16 * 1, 210, { now: 5000 });
  d.handlePointer(110 + 16 * 1, 210, { now: 5200 });
  assert.equal(d.selectedFieldText(), 'Ada');
  // A press on another field focuses it with the caret there.
  d.handlePointer(400, 270, { now: 9000 });
  assert.equal(d.fieldIndex, 1);
  assert.deepEqual(d.getTextSelection(), { start: 0, end: 0, anchor: 0, caret: 0, direction: 'forward' });
});

test('Dialog clipboard: copy/cut/paste events act on the focused field selection', async () => {
  const d = new Dialog();
  const result = d.prompt('Purchase?', { defaultValue: 'Red car' });
  press(d, 'Home');
  press(d, 'End', { shiftKey: true });
  const data = {};
  const ev = (type, text) => ({ type, preventDefault() { this.prevented = true; },
    clipboardData: { setData: (_t, v) => { data.text = v; }, getData: () => text } });
  const copy = ev('copy');
  d.handleClipboardEvent(copy);
  assert.equal(data.text, 'Red car');
  assert.equal(copy.prevented, true);
  press(d, 'Home');
  press(d, 'ArrowRight', { shiftKey: true, ctrlKey: true });
  press(d, 'x', { ctrlKey: true }); // cut: removes the selection now
  assert.equal(d.promptValue, ' car');
  d.handleClipboardEvent(ev('paste', 'Blue'));
  assert.equal(d.promptValue, 'Blue car');
  press(d, 'Enter');
  assert.equal(await result, 'Blue car');
});

test('mobile selection mirror: setTextSelection clamps and keeps direction', () => {
  const d = new Dialog();
  d.prompt('Name?', { defaultValue: 'Ada' });
  d.setTextSelection(1, 99, 'backward');
  assert.deepEqual(d.getTextSelection(), { start: 1, end: 3, anchor: 3, caret: 1, direction: 'backward' });
});

test('confirmOver asks Yes/No over an open dialog (No first) and restores it unchanged', async () => {
  const d = new Dialog();
  const under = d.prompt('Name?', { defaultValue: 'Ada' });
  const asked = d.confirmOver('Are you sure you want to leave?', { title: 'Leave the game?' });
  assert.equal(d.mode, 'menu');
  assert.equal(d.options[d.selected].label, 'No');
  press(d, 'Escape');
  assert.equal(await asked, false);
  assert.equal(d.mode, 'prompt');
  assert.equal(d.promptValue, 'Ada');
  press(d, 'Enter');
  assert.equal(await under, 'Ada');
  const yes = d.confirmOver('Are you sure you want to leave?');
  press(d, 'ArrowUp');
  press(d, 'Enter');
  assert.equal(await yes, true);
  assert.equal(d.active, false);
});

test('Setup holding form: $ amount and # of shares fill each other on every keystroke at the entered price', async () => {
  const { linkedSharesForm, formatShareCount } = await import('../js/scenes/SetupScene.js');
  assert.equal(formatShareCount(2.5), '2.5');
  assert.equal(formatShareCount(1 / 3), '0.3333');
  assert.equal(formatShareCount(10), '10');
  const linked = linkedSharesForm(40);
  const d = new Dialog();
  const result = d.form('Shares owned', [
    { key: 'dollars', label: '$ amount', type: 'money', defaultValue: '0' },
    { key: 'shares', label: '# of shares', type: 'number', defaultValue: '0' },
  ], { onFieldChange: linked.onFieldChange });
  press(d, 'a', { ctrlKey: true });
  press(d, '1');
  assert.equal(d.fields[1].value, '0.025');
  press(d, '0'); press(d, '0');
  assert.equal(d.fields[0].value, '100');
  assert.equal(d.fields[1].value, '2.5');
  assert.equal(linked.lastEdited(), 'dollars');
  press(d, 'Tab');
  press(d, '3');
  assert.equal(d.fields[0].value, '120.00');
  assert.equal(linked.lastEdited(), 'shares');
  press(d, 'Backspace');
  assert.equal(d.fields[0].value, '', 'blank shares blanks the $ amount');
  press(d, '3');
  press(d, 'Enter');
  assert.deepEqual(await result, { dollars: 120, shares: 3 });
  // No usable price: the other field is left blank, never divided by zero.
  const fields = [{ value: '500' }, { value: '9' }];
  linkedSharesForm(0).onFieldChange(fields, 0);
  assert.equal(fields[1].value, '');
});
