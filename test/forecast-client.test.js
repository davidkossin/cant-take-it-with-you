import test from 'node:test';
import assert from 'node:assert/strict';
import { ForecastClient } from '../js/finance/ForecastClient.js';
import { household } from './fixtures.js';

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
