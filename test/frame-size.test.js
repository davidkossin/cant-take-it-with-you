import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFrameSize, setFrameSize, frameBase, FRAME_W, FRAME_H, VIEW_W, VIEW_H, HUD_H, WORLD_SCALE } from '../js/config.js';
import * as config from '../js/config.js';
import { Dialog, measureRich } from '../js/render/Dialog.js';

test('16:9 and near-16:9 desktops keep the exact 1920×1080 frame', () => {
  assert.deepEqual(computeFrameSize(1920, 1080), { w: 1920, h: 1080, orientation: 'landscape' });
  assert.deepEqual(computeFrameSize(1366, 768), { w: 1920, h: 1080, orientation: 'landscape' });
  assert.deepEqual(computeFrameSize(1600, 900), { w: 1920, h: 1080, orientation: 'landscape' });
});

test('portrait gets a taller frame, clamped', () => {
  const t = computeFrameSize(768, 1024);
  assert.equal(t.orientation, 'portrait');
  assert.equal(t.w, 1080);
  assert.equal(t.h, 1440);
  assert.ok(computeFrameSize(300, 1400).h <= 2400);
});

test('phone-sized screens use a smaller base so text stays readable', () => {
  assert.equal(frameBase(1920, 1080), 1080);
  assert.equal(frameBase(376, 640), 752);
  assert.equal(frameBase(100, 100), 720);
  assert.equal(computeFrameSize(376, 640).w, 752);
});

test('setFrameSize updates live bindings and derived view size', () => {
  assert.equal(setFrameSize(1080, 1920), true);
  assert.equal(config.FRAME_W, 1080);
  assert.equal(config.FRAME_H, 1920);
  assert.equal(config.VIEW_W, 1080 / WORLD_SCALE);
  assert.equal(config.VIEW_H, (1920 - HUD_H) / WORLD_SCALE);
  assert.equal(setFrameSize(1080, 1920), false);
  setFrameSize(1920, 1080);
  assert.equal(config.FRAME_W, 1920);
});

test('dialog wrap is width based and re-wraps when the frame narrows', () => {
  const text = 'word '.repeat(60).trim();
  const d = new Dialog();
  d._setText(text);
  setFrameSize(1920, 1080);
  const wide = d.lines.length;
  setFrameSize(752, 1272);
  const narrow = d.lines.length;
  setFrameSize(1920, 1080);
  assert.ok(narrow > wide);
  // 1400px max line width at 18px = 77 glyphs; a 60-word paragraph (299 chars) needs at least 4 lines.
  assert.ok(wide >= 4 && wide <= 5);
  assert.equal(measureRich('abcd', 18), 72);
});
