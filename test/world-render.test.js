import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { buildDecisionRoom, buildHallway, drawWorld, invalidateWorldRenderCache } from '../js/render/World.js';
import { VIEW_W, VIEW_H, WORLD_SCALE } from '../js/config.js';

// Record the browser Canvas API used by the real procedural art and world
// renderer. Texture canvases and terrain chunks are distinct so the tests can
// observe warm-frame work and retained backing memory without a GPU.
const canvases = [];
class CanvasMock {
  constructor(width = 0, height = 0, kind = 'texture') {
    this.width = width;
    this.height = height;
    this.kind = kind;
    this.calls = [];
    this.context = new Proxy({}, {
      get: (target, key) => {
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop() {} });
        }
        if (key in target) return target[key];
        return (...args) => this.calls.push({ op: key, args });
      },
      set: (target, key, value) => { target[key] = value; return true; },
    });
    canvases.push(this);
  }
  getContext() { return this.context; }
}

const originalDocument = globalThis.document;
const originalOffscreen = globalThis.OffscreenCanvas;
globalThis.document = { createElement: () => new CanvasMock() };
globalThis.OffscreenCanvas = class extends CanvasMock {
  constructor(width, height) { super(width, height, 'chunk'); }
};
after(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalOffscreen === undefined) delete globalThis.OffscreenCanvas;
  else globalThis.OffscreenCanvas = originalOffscreen;
});

const chunks = () => canvases.filter(c => c.kind === 'chunk');
const activeChunks = () => chunks().filter(c => c.width > 0);
const blits = canvas => canvas.calls.filter(c => c.op === 'drawImage');

test('warm hallway renders reuse high resolution terrain and paint only visible years', () => {
  const world = buildHallway(69, 2027, 31);
  const frame = new CanvasMock(VIEW_W, VIEW_H, 'frame');
  try {
    drawWorld(frame.context, world, 0, 640, 0);
    const count = chunks().length;
    const terrainWork = chunks().reduce((sum, canvas) => sum + blits(canvas).length, 0);
    frame.calls.length = 0;
    drawWorld(frame.context, world, 1, 641, 8);
    assert.equal(chunks().length, count, 'a small camera move must reuse world-space terrain');
    assert.equal(chunks().reduce((sum, canvas) => sum + blits(canvas).length, 0), terrainWork);
    assert.ok(blits(frame).length <= 24, 'warm frames use a few chunk and sprite blits, not hundreds of tiles');
    assert.ok(activeChunks().every(c => c.width === 128 * WORLD_SCALE && c.height === 128 * WORLD_SCALE));
    const labels = frame.calls.filter(c => c.op === 'fillText');
    assert.ok(labels.length > 0 && labels.length <= 4, 'offscreen year labels must not be painted');
    assert.ok(labels.every(c => c.args[2] >= 0 && c.args[2] <= VIEW_H));
    const monthMarks = frame.calls.filter(c => c.op === 'fillRect' && c.args[2] === 3);
    assert.ok(monthMarks.length <= 36);
    assert.ok(monthMarks.every(c => c.args[1] >= 0 && c.args[1] <= VIEW_H));
    assert.equal(frame.context.imageSmoothingEnabled, false, 'world rendering restores pixel sprite smoothing');
  } finally { invalidateWorldRenderCache(world); }
});

test('chunk edges include adjacent wall shadows and support negative room camera coordinates', () => {
  const world = buildDecisionRoom();
  world.map[3][14] = 'void';
  world.map[3][15] = 'wall'; // East-facing shadow extends from x=254 into the x=256 chunk.
  const frame = new CanvasMock(VIEW_W, VIEW_H, 'frame');
  const oldCount = chunks().length;
  try {
    drawWorld(frame.context, world, -80, -8, 0);
    const painted = chunks().slice(oldCount);
    assert.ok(painted.some(canvas => blits(canvas).some(call =>
      call.args[1] === -2 && call.args[3] === 10 && call.args[4] === 16)),
    'neighboring chunk must retain the shadow that crosses its left edge');
    const chunkBlits = blits(frame).filter(c => c.args[0].kind === 'chunk');
    assert.ok(chunkBlits.some(c => c.args[1] <= 0 && c.args[2] <= 0));
    assert.ok(chunkBlits.some(c => c.args[1] + c.args[3] >= VIEW_W));
    assert.ok(chunkBlits.some(c => c.args[2] + c.args[4] >= VIEW_H));
    assert.deepEqual(frame.calls.find(c => c.op === 'fillRect').args, [0, 0, VIEW_W, VIEW_H]);
  } finally { invalidateWorldRenderCache(world); }
});

test('new terrain and explicit in-place edits invalidate cached layers', () => {
  const world = buildDecisionRoom();
  const frame = new CanvasMock(VIEW_W, VIEW_H, 'frame');
  try {
    drawWorld(frame.context, world, 0, 0);
    const original = activeChunks().slice();
    world.map = world.map.map(row => row.slice());
    world.map[2][2] = 'wall';
    drawWorld(frame.context, world, 0, 0);
    assert.ok(original.every(c => c.width === 0 && c.height === 0));
    const replaced = activeChunks().slice();
    world.map[2][3] = 'wall';
    world.renderRevision = 1;
    drawWorld(frame.context, world, 0, 0);
    assert.ok(replaced.every(c => c.width === 0));
    const revised = activeChunks().slice();
    world.map[2][4] = 'wall';
    invalidateWorldRenderCache(world);
    assert.ok(revised.every(c => c.width === 0));
    drawWorld(frame.context, world, 0, 0);
    assert.ok(activeChunks().length > 0);
  } finally { invalidateWorldRenderCache(world); }
});

test('long hallways and many worlds retain at most 24 MiB of chunk pixels', () => {
  const world = buildHallway(69, 2027, 31);
  const room = buildDecisionRoom();
  const frame = new CanvasMock(VIEW_W, VIEW_H, 'frame');
  try {
    for (let y = 0; y < world.height; y += 512) drawWorld(frame.context, world, 0, y);
    drawWorld(frame.context, room, -80, -8);
    const retainedBytes = activeChunks().reduce((sum, c) => sum + c.width * c.height * 4, 0);
    assert.ok(activeChunks().length <= 24);
    assert.ok(retainedBytes <= 24 * 1024 * 1024);
    frame.calls.length = 0;
    drawWorld(frame.context, world, 0, 0);
    assert.ok(blits(frame).some(c => c.args[0].kind === 'chunk' && c.args[0].width > 0),
      'an evicted hallway region must be reconstructed on return');
  } finally {
    invalidateWorldRenderCache(world);
    invalidateWorldRenderCache(room);
  }
});

test('a browser without a usable chunk canvas retains direct terrain rendering', () => {
  const world = buildDecisionRoom();
  const frame = new CanvasMock(VIEW_W, VIEW_H, 'frame');
  const workingOffscreen = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class { getContext() { return null; } };
  try {
    drawWorld(frame.context, world, -80, -8);
    assert.ok(blits(frame).length > 100, 'fallback paints the original terrain');
    assert.equal(frame.context.imageSmoothingEnabled, false);
  } finally {
    globalThis.OffscreenCanvas = workingOffscreen;
    invalidateWorldRenderCache(world);
  }
});
