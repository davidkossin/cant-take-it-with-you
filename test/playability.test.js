import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameClock } from '../js/input/FrameClock.js';
import { Player } from '../js/render/Player.js';
import { RUN_MULTIPLIER } from '../js/config.js';

function walkAtRefreshRate(hz, running = false) {
  const player = new Player(0, 0), clock = new FrameClock();
  player.keys.add('ArrowRight'); player.runHeld = running;
  let updates = 0, renders = 0;
  for (let i = 0; i <= hz * 2; i++) {
    const frame = clock.advance(i * 1000 / hz);
    if (frame.render) renders++;
    for (let j = 0; j < frame.steps; j++) { player.update(() => false); updates++; }
  }
  return { player, updates, renders };
}

test('walking and running cover the same distance at 30, 60, 120 and 144 Hz', () => {
  for (const running of [false, true]) {
    for (const hz of [30, 60, 120, 144]) {
      const { player, updates, renders } = walkAtRefreshRate(hz, running);
      assert.equal(updates, 120);
      assert.ok(Math.abs(player.x - 120 * player.speed * (running ? RUN_MULTIPLIER : 1)) < 1e-8);
      assert.ok(renders <= 121, 'high-refresh displays do not redraw duplicate frames');
    }
  }
});

test('suspension and lost focus cannot cause large player jumps', () => {
  const clock = new FrameClock();
  clock.advance(0);
  assert.equal(clock.advance(10000).steps, 5);
  clock.reset();
  assert.equal(clock.advance(20000).steps, 0);
  assert.equal(clock.advance(20000 + 1000 / 60).steps, 1);
});

test('fixed catch-up steps keep collisions and diagonal speeds bounded', () => {
  const player = new Player(0, 0), clock = new FrameClock();
  player.keys.add('ArrowRight'); player.keys.add('ArrowDown');
  player.runHeld = true;
  clock.advance(0);
  const frame = clock.advance(1000);
  let maxStep = 0;
  for (let i = 0; i < frame.steps; i++) {
    const x = player.x, y = player.y;
    player.update((nx, ny, w) => nx + w > 16);
    maxStep = Math.max(maxStep, Math.hypot(player.x - x, player.y - y));
    assert.ok(player.x + player.w <= 16);
  }
  assert.ok(maxStep <= player.speed * RUN_MULTIPLIER + 1e-8);
});

test('blur clears held keys and input bindings are removed on scene leave', () => {
  const handlers = new Map();
  const target = {
    addEventListener: (name, fn) => handlers.set(name, fn),
    removeEventListener: (name, fn) => { if (handlers.get(name) === fn) handlers.delete(name); },
  };
  const player = new Player(0, 0);
  player.bindInput(target);
  handlers.get('keydown')({ key: 'ArrowRight' });
  handlers.get('keydown')({ key: ' ', repeat: false });
  assert.equal(player.keys.size, 1);
  handlers.get('blur')();
  assert.equal(player.keys.size, 0); assert.equal(player.runHeld, false);
  player.unbindInput(target);
  assert.equal(handlers.size, 0);
});
