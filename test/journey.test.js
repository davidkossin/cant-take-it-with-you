import test from 'node:test';
import assert from 'node:assert/strict';
import { household } from './fixtures.js';
import { projectMonteCarlo, forecastKey, createForecast, addForecastPaths, finishForecast } from '../js/finance/Forecast.js';
import { projectJourney, HALLWAY_PATHS } from '../js/finance/Journey.js';
import { projectYears, computeWorth } from '../js/finance/Engine.js';
import { createDefaultSetup, createGameFromSetup, currentNode, enterYearRoom, commitRoomDecisions,
  jumpToHallwayNode } from '../js/state/GameState.js';
import { migrateGame } from '../js/finance/Schema.js';
import { autoSave, loadSave, listSaves } from '../js/state/SaveSystem.js';
import { HallwayScene } from '../js/scenes/HallwayScene.js';
import { virtualStick } from '../js/input/VirtualPad.js';

function invested(overrides = {}) {
  const p = household({ age: 80, stocksTotal: 5000000, stocksCostBasis: 5000000, ...overrides });
  p.rateOverrides.equityReturn = .065;
  p.rateOverrides.equityVolatility = .18;
  return p;
}

test('Hallway selects a complete path nearest the terminal median, with gains and losses', () => {
  const p = invested(), before = JSON.stringify(p);
  const acc = createForecast(p, { seed: 77 });
  addForecastPaths(acc, HALLWAY_PATHS);
  const f = finishForecast(acc), j = projectJourney(p, f.scenario);
  const chosen = acc.terminalPaths.find(r => r.simulationIndex === f.scenario.simulationIndex);
  const nearest = Math.min(...acc.terminalPaths.map(r => Math.abs(r.netWorth - f.series.at(-1).netWorth.p50)));
  assert.equal(Math.abs(chosen.netWorth - f.series.at(-1).netWorth.p50), nearest);
  assert.equal(j.at(-1).worth.exactNetWorth, chosen.netWorth);
  assert.equal(f.scenario.selectionPaths, HALLWAY_PATHS);
  j.forEach((r, i) => {
    assert.equal(r.worth.exactNetWorth, f.scenarioSeries[i].netWorth);
    assert.equal(r.worth.availableLiquid, f.scenarioSeries[i].liquid);
    assert.equal(r.worth.exactNetWorth / r.state.priceIndex, f.scenarioSeries[i].realNetWorth);
  });
  const changes = j.slice(1).map((r, i) => r.worth.stocks - j[i].worth.stocks);
  assert.ok(changes.some(n => n < 0));
  assert.ok(changes.some(n => n > 0));
  assert.notDeepEqual(j.slice(1).map(r => r.worth.exactNetWorth),
    projectYears(p, 20, p.difficulty, { deterministic: true }).map(r => r.worth.exactNetWorth));
  assert.equal(JSON.stringify(p), before);
});

test('failed paths remain eligible and an unfunded Hallway is not resampled', () => {
  const p = household({ age: 98, cash: 0, annualSpending: 10000 });
  const f = projectMonteCarlo(p, { paths: 50 });
  assert.equal(f.successProbability, 0);
  assert.equal(f.scenario.simulationIndex, 0); // Stable tie-breaking, even when every path fails.
  assert.equal(projectJourney(p, f.scenario)[1].statement.fundingSuccess, false);
});

test('room continuation and changed decisions reuse the same calendar-year shocks', () => {
  const p = invested(), f = projectMonteCarlo(p, { paths: 50, seed: 77 });
  const j = projectJourney(p, f.scenario), continued = projectJourney(j[7].state, f.scenario);
  assert.deepEqual(continued.map(r => r.worth), j.slice(7).map(r => r.worth));
  const changed = projectJourney({ ...j[7].state, annualSpending: 12000 }, f.scenario);
  changed.slice(1).forEach((r, i) => {
    assert.equal(r.statement.equityReturn, j[i + 8].statement.equityReturn);
    assert.equal(r.statement.inflation, j[i + 8].statement.inflation);
  });
  assert.notEqual(changed.at(-1).worth.exactNetWorth, continued.at(-1).worth.exactNetWorth);
});

test('chart path-count changes retain the initial preview and any saved path identity', () => {
  const p = invested({ age: 99 });
  const acc = createForecast(p, { seed: 77 });
  addForecastPaths(acc, 1000);
  const initial = finishForecast(acc);
  addForecastPaths(acc, 250);
  const larger = finishForecast(acc);
  assert.deepEqual(larger.scenario, initial.scenario);
  assert.deepEqual(larger.scenarioSeries, initial.scenarioSeries);
  const fixed = { ...initial.scenario, simulationIndex: 521 };
  const smaller = projectMonteCarlo(p, { paths: 10, scenario: fixed });
  assert.deepEqual(smaller.scenario, fixed);
  assert.deepEqual(smaller.scenarioSeries.map(r => r.netWorth), projectJourney(p, fixed).map(r => r.worth.exactNetWorth));
  assert.notEqual(forecastKey(p, 1000), forecastKey(p, 1000, fixed));
  assert.notEqual(forecastKey(p, 1000, fixed), forecastKey(p, 1000, { ...fixed, simulationIndex: 522 }));
});

function browserStubs() {
  const storage = new Map();
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
}

test('Hallway waits for the worker, then persists a path through load, room entry and rewind', async () => {
  browserStubs();
  const p = invested({ age: 96 }), g = createGameFromSetup({ ...createDefaultSetup(), ...p });
  const forecast = { result: null, error: null, progress: 0, calls: [],
    request(...args) { this.calls.push(args); }, cancel() {} };
  const scene = new HallwayScene({ forecast });
  scene.enter(g);
  try {
    const hallwayId = currentNode(g).id, start = scene.player.y;
    assert.equal(forecast.calls[0][1], HALLWAY_PATHS);
    assert.equal(scene.ready, false);
    scene.setInputBlocked(false); // Closing Menu cannot release movement while pending.
    virtualStick.y = -1;
    scene.update(g, null);
    assert.equal(scene.player.inputEnabled, false);
    assert.equal(scene.player.y, start);
    assert.equal(await scene.tryInteract(g, {}), null);
    assert.equal(loadSave(listSaves()[0].id).scene, 'hallway');
    virtualStick.y = 0;
    forecast.result = projectMonteCarlo(p, { paths: HALLWAY_PATHS });
    scene.update(g, null);
    assert.equal(scene.ready, true);
    assert.equal(scene.player.inputEnabled, true);
    const scenario = structuredClone(g.hallwayScenario), path = scene.snapshots;
    assert.deepEqual(loadSave(listSaves()[0].id).hallwayScenario, scenario);
    assert.deepEqual(migrateGame(JSON.parse(JSON.stringify(g))).hallwayScenario, scenario);
    assert.equal(scene.stateAtDoor(2).worth.exactNetWorth, forecast.result.scenarioSeries[2].netWorth);
    enterYearRoom(g, path[2].state, path.slice(1, 3));
    commitRoomDecisions(g);
    scene.leave(); scene.enter(g);
    assert.deepEqual(scene.snapshots.map(r => r.worth), path.slice(2).map(r => r.worth));
    assert.equal(forecast.calls.length, 1);
    assert.ok(jumpToHallwayNode(g, hallwayId));
    scene.leave(); scene.enter(g);
    assert.deepEqual(g.hallwayScenario, scenario);
    assert.deepEqual(scene.snapshots.map(r => r.worth), path.map(r => r.worth));
    assert.equal(forecast.calls.length, 1);
    const saved = autoSave(g, 'end');
    assert.deepEqual(loadSave(saved.id).hallwayScenario, scenario);
  } finally { virtualStick.y = 0; scene.leave(); }
});

test('worker failure permits retry without opening a door or fabricating a reference path', async () => {
  browserStubs();
  const g = createGameFromSetup({ ...createDefaultSetup(), ...household({ age: 99 }) });
  const forecast = { result: null, error: 'Unavailable', progress: 0,
    request() {}, cancel() {}, retry(p, n) { this.retried = { p, n }; } };
  const scene = new HallwayScene({ forecast });
  scene.enter(g);
  try {
    assert.equal(await scene.tryInteract(g, {}), null);
    assert.equal(forecast.retried.n, 1000);
    assert.equal(scene.snapshots.length, 1);
    assert.equal(g.hallwayScenario, null);
    assert.equal(scene.player.inputEnabled, false);
  } finally { scene.leave(); }
});

test('age-100 projections contain only the baseline and preserve the selected scenario', () => {
  const p = household({ age: 100 });
  const f = projectMonteCarlo(p, { paths: 25 });
  assert.equal(f.series.length, 1);
  assert.equal(f.reference.length, 0);
  assert.equal(projectJourney(p, f.scenario).length, 1);
  assert.equal(f.scenarioSeries[0].netWorth, computeWorth(p).exactNetWorth);
});
