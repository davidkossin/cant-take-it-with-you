import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { household } from './fixtures.js';
import { projectMonteCarlo } from '../js/finance/Forecast.js';
import { HALLWAY_PATHS } from '../js/finance/Journey.js';
import { createDefaultSetup, createGameFromSetup } from '../js/state/GameState.js';
import { HallwayScene } from '../js/scenes/HallwayScene.js';
import { drawFutureSplash, SPLASH_TITLE, SPLASH_FADE_MS, TITLE_SAFE } from '../js/render/FutureSplash.js';

/** Records text draws; Press Start 2P is one em per glyph, so width = chars × px. */
function recordingCanvas() {
  const texts = [], state = { font: '10px x', textAlign: 'left' }, noop = () => {};
  const px = () => Number(/(\d+)px/.exec(state.font)?.[1] || 10);
  return { texts, ctx: new Proxy(state, {
    get: (t, k) => k === 'fillText' ? (text, x, y) => texts.push({ text: String(text), x, y, px: px(), align: t.textAlign })
      : k === 'measureText' ? (text) => ({ width: String(text).length * px() })
      : k in t ? t[k] : noop,
    set: (t, k, v) => { t[k] = v; return true; },
  }) };
}
function browserStubs() {
  const storage = new Map();
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
}
function game(age) {
  return createGameFromSetup({ ...createDefaultSetup(), ...household({ age }) });
}

test('Hallway entry shows a full-frame "Generating Your Future" splash, then fades into the Hallway', () => {
  browserStubs();
  const g = game(97);
  const forecast = { result: null, error: null, progress: 0, request() {}, cancel() {}, retry() { this.retried = true; } };
  const scene = new HallwayScene({ forecast });
  scene.enter(g);
  try {
    assert.equal(scene.splashing, true);
    assert.equal(scene.splashAlpha(), 1);
    let { ctx, texts } = recordingCanvas();
    forecast.progress = .42;
    scene.render(ctx, g);
    const shown = texts.map(t => t.text);
    assert.ok(shown.includes(SPLASH_TITLE));
    assert.ok(shown.includes('42%'));
    assert.ok(shown.includes(`Simulating ${HALLWAY_PATHS.toLocaleString('en-US')} lifetimes`));
    // Replaces the view: no HUD or Hallway banner underneath.
    assert.ok(!shown.some(t => /Monte Carlo journey/.test(t)));

    forecast.error = 'Unavailable';
    ({ ctx, texts } = recordingCanvas());
    scene.render(ctx, g);
    assert.ok(texts.some(t => t.text === 'Projection unavailable'));
    assert.ok(texts.some(t => /retry/.test(t.text)));
    forecast.error = null;

    forecast.result = projectMonteCarlo(g.portfolio, { paths: 20 });
    scene.update(g, null);
    assert.equal(scene.ready, true);
    assert.equal(scene.splashing, false);
    const start = scene.splashFadeStart;
    assert.ok(start != null);
    assert.ok(Math.abs(scene.splashAlpha(start + SPLASH_FADE_MS / 2) - .5) < 1e-9);
    assert.equal(scene.splashAlpha(start + SPLASH_FADE_MS), 0);
    assert.equal(scene.splashFadeStart, null);
  } finally { scene.leave(); }
});

test('a cached forecast or saved Hallway path skips the splash entirely', () => {
  browserStubs();
  const g = game(96);
  const result = projectMonteCarlo(g.portfolio, { paths: 20 });
  const forecast = { result, error: null, progress: 1, request() {}, cancel() {} };
  const scene = new HallwayScene({ forecast });
  scene.enter(g);
  try {
    assert.equal(scene.ready, true);
    assert.equal(scene.splashing, false);
    assert.equal(scene.splashAlpha(), 0);
    scene.leave(); scene.enter(g); // saved hallwayScenario path
    assert.equal(scene.ready, true);
    assert.equal(scene.splashAlpha(), 0);
  } finally { scene.leave(); }
});

test('splash text is fitted inside the title-safe area', () => {
  for (const opts of [{ progress: .5 }, { error: 'x' }, { progress: 1, paths: 10000 }]) {
    const { ctx, texts } = recordingCanvas();
    drawFutureSplash(ctx, opts);
    assert.ok(texts.length >= 4);
    for (const t of texts) {
      const w = t.text.length * t.px, left = t.align === 'center' ? t.x - w / 2 : t.x;
      assert.ok(left >= TITLE_SAFE.x && left + w <= TITLE_SAFE.x + TITLE_SAFE.w, t.text);
      assert.ok(t.y >= TITLE_SAFE.y && t.y + t.px <= TITLE_SAFE.y + TITLE_SAFE.h, t.text);
    }
    const title = texts.find(t => t.text === SPLASH_TITLE);
    assert.ok(title && title.px >= 48);
  }
});

test('the old in-Hallway loader string is gone from the game sources', async () => {
  // Built from parts so this test file does not itself contain the retired string.
  const oldLoader = new RegExp(['preparing', 'your', 'monte', 'carlo'].join(' '), 'i');
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e =>
    e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name]))).flat();
  for (const file of [...await walk('js'), 'index.html']) {
    assert.doesNotMatch(await readFile(file, 'utf8'), oldLoader, file);
  }
});
