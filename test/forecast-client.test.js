import test from 'node:test';
import assert from 'node:assert/strict';
import { ForecastClient } from '../js/finance/ForecastClient.js';
import { household } from './fixtures.js';
import { projectMonteCarlo } from '../js/finance/Forecast.js';
import { createDefaultSetup, createGameFromSetup } from '../js/state/GameState.js';
import { HallwayScene } from '../js/scenes/HallwayScene.js';
import { PauseMenu } from '../js/scenes/PauseMenu.js';

test('a canceled worker cannot overwrite a retried Hallway forecast, even with the same key', () => {
  const previousWorker = globalThis.Worker, workers = [];
  globalThis.Worker = class {
    constructor() { workers.push(this); }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
  };
  const p = household({ age: 97 }), client = new ForecastClient();
  const scenario = { version: 1, seed: 29, simulationIndex: 1200, originYear: 2026 };
  try {
    client.request(p, 1000, scenario);
    assert.deepEqual(workers[0].message.scenario, scenario);
    assert.equal(workers[0].message.seed, scenario.seed);
    client.retry(p, 1000, scenario);
    assert.equal(workers[0].terminated, true);
    workers[0].onmessage({ data: { type: 'result', result: { stale: true } } });
    workers[0].onerror();
    assert.equal(client.result, null);
    assert.equal(client.error, null);
    assert.equal(client.worker, workers[1]);
    workers[1].onmessage({ data: { type: 'progress', completed: 500, total: 1000 } });
    assert.equal(client.progress, .5);
    const result = { valid: true, scenario };
    workers[1].onmessage({ data: { type: 'result', result } });
    assert.equal(client.result, result);
    assert.equal(workers[1].terminated, true);
  } finally {
    client.cancel();
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
  }
});

function stubWorkers() {
  const previous = globalThis.Worker, workers = [];
  globalThis.Worker = class {
    constructor() { workers.push(this); }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
  };
  return { workers, restore() { if (previous === undefined) delete globalThis.Worker; else globalThis.Worker = previous; } };
}
function stubCanvas() {
  const noop = () => {};
  return new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 })
    : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop, set: (t, k, v) => { t[k] = v; return true; } });
}
function browserStubs() {
  const storage = new Map();
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
}

test('Pause Charts share the in-flight Hallway run, then reuse its cached result without rerunning', () => {
  browserStubs();
  const { workers, restore } = stubWorkers();
  const p = household({ age: 96, stocksTotal: 500000, stocksCostBasis: 500000 });
  p.rateOverrides.equityReturn = .065; p.rateOverrides.equityVolatility = .18;
  const g = createGameFromSetup({ ...createDefaultSetup(), ...p });
  const hallway = new HallwayScene(), pause = new PauseMenu(), ctx = stubCanvas();
  const draw = () => pause.drawCharts(ctx, g, 0, 0, 1800, 1000);
  try {
    hallway.enter(g);
    assert.equal(workers.length, 1);
    assert.equal(hallway.ready, false);
    // Pause opened mid-run: joins the Hallway's worker instead of starting a duplicate.
    pause.show(g); draw(); draw();
    assert.equal(workers.length, 1);
    assert.equal(pause.forecast.worker, workers[0]);
    workers[0].onmessage({ data: { type: 'progress', completed: 500, total: 1000 } });
    assert.equal(pause.forecast.progress, .5);
    assert.equal(hallway.forecast.progress, .5);
    // Closing pause mid-run must not kill the Hallway's projection.
    pause.hide();
    assert.notEqual(workers[0].terminated, true);
    pause.show(g); draw();
    assert.equal(workers.length, 1);
    const { seed } = workers[0].message;
    const result = projectMonteCarlo(workers[0].message.portfolio, { paths: workers[0].message.paths, seed });
    workers[0].onmessage({ data: { type: 'result', result } });
    assert.equal(workers[0].terminated, true);
    assert.equal(pause.forecast.result, result);
    pause.hide();
    hallway.update(g, null);
    assert.equal(hallway.ready, true);
    assert.deepEqual(g.hallwayScenario, result.scenario);

    // Pause after the Hallway finished pins game.hallwayScenario: same inputs, so reuse (cyan path unchanged).
    pause.show(g); draw();
    assert.equal(workers.length, 1);
    assert.equal(pause.forecast.result, result);
    assert.deepEqual(pause.forecast.result.scenarioSeries.map(r => r.netWorth),
      hallway.snapshots.map(r => r.worth.exactNetWorth));
    pause.hide(); pause.show(g); draw();
    assert.equal(workers.length, 1);

    // Explicitly asking for more paths reruns, pinned to the saved Hallway path; picking 1,000 again reuses.
    pause.forecastPaths = 5000; draw();
    assert.equal(workers.length, 2);
    assert.equal(workers[1].message.paths, 5000);
    assert.deepEqual(workers[1].message.scenario, g.hallwayScenario);
    pause.forecastPaths = 1000; draw();
    assert.equal(workers[1].terminated, true);
    assert.equal(workers.length, 2);
    assert.equal(pause.forecast.result, result);

    // Changed model inputs (a decision) do rerun.
    g.portfolio = { ...g.portfolio, annualSpending: 1000 }; draw();
    assert.equal(workers.length, 3);
  } finally { pause.hide(); hallway.leave(); restore(); }
});

test('clients sharing a run: only the last subscriber cancel terminates the worker; stale messages are ignored', () => {
  const { workers, restore } = stubWorkers();
  const p = household({ age: 95 }), a = new ForecastClient(), b = new ForecastClient();
  try {
    a.request(p, 1000); b.request(p, 1000);
    assert.equal(workers.length, 1);
    a.cancel();
    assert.notEqual(workers[0].terminated, true);
    b.cancel();
    assert.equal(workers[0].terminated, true);
    workers[0].onmessage({ data: { type: 'result', result: { stale: true } } });
    assert.equal(b.result, null);
    b.request(p, 1000);
    assert.equal(workers.length, 2);
  } finally { a.cancel(); b.cancel(); restore(); }
});
