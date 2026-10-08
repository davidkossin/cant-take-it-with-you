import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameFromSetup, createDefaultSetup, commitRoomDecisions, commitHallwayNode,
  enterYearRoom, jumpToHallwayNode, currentNode, returnToLeftDecisionRoom } from '../js/state/GameState.js';
import { ensureTimelineSystem, listTimelines, timelineMapModel, currentTimeline, getTimelineForecast,
  storeTimelineForecast, storeTimelineActualPath, pointLetter } from '../js/state/TimelineSystem.js';
import { projectMonteCarlo } from '../js/finance/Forecast.js';
import { projectJourney } from '../js/finance/Journey.js';
import { HallwayScene, hallwaySnapshotIndex } from '../js/scenes/HallwayScene.js';
import { PauseMenu } from '../js/scenes/PauseMenu.js';
import { comparisonDomain, drawTimelineComparison } from '../js/render/TimelineMap.js';
import { exportPlan, importPlan } from '../js/state/PlanExport.js';
import { buildHallway } from '../js/render/World.js';
import { setMoneyContext } from '../js/finance/DollarBasis.js';
import { household } from './fixtures.js';

function game(age = 97) {
  return createGameFromSetup({ ...createDefaultSetup(), ...household({ age, cash: 80000, stocksTotal: 100000,
    stocksCostBasis: 100000, annualSpending: 12000 }) });
}
function saveForecast(g, count = 25) {
  const timeline = currentTimeline(g);
  const f = projectMonteCarlo(timeline.baseline, { paths: count, seed: 63, originYear: g.timeline.startYear });
  storeTimelineForecast(g, f);
  const path = projectJourney(timeline.baseline, f.scenario);
  storeTimelineActualPath(g, path);
  return { f, path };
}
function browserStubs() {
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.localStorage = { getItem() { return null; }, setItem() {} };
}
function canvas() {
  const texts = [], noop = () => {};
  const ctx = new Proxy({ fillText(text, x, y) { texts.push({ text, x, y }); }, measureText(text) { return { width: String(text).length * 12 }; } },
    { get: (target, key) => key in target ? target[key] : noop, set: (target, key, value) => { target[key] = value; return true; } });
  return { ctx, texts };
}

test('numeric timelines start with A and an age-100 terminal; decisions insert letters and child origins match', () => {
  const g = game();
  let timelines = listTimelines(g);
  assert.equal(timelines.length, 1);
  assert.deepEqual(timelines[0].points.map(p => [p.letter, p.year]), [['A', 2026], ['B', 2029]]);
  commitRoomDecisions(g); const hall = commitHallwayNode(g);
  const { f, path } = saveForecast(g);
  const original = JSON.stringify(getTimelineForecast(g));
  enterYearRoom(g, path[1].state, path.slice(1, 2));
  timelines = listTimelines(g);
  assert.deepEqual(timelines[0].points.map(p => [p.letter, p.year]), [['A', 2026], ['B', 2027], ['C', 2029]]);
  g.portfolio.annualSpending = 8000;
  commitRoomDecisions(g); commitHallwayNode(g);
  timelines = listTimelines(g);
  assert.deepEqual(timelines.map(t => t.number), [1, 2]);
  assert.deepEqual(timelines[1].points.map(p => [p.letter, p.year]), [['A', 2027], ['B', 2029]]);
  assert.equal(timelines[1].parentPointId, timelines[0].points[1].id);
  assert.equal(JSON.stringify(timelines[0].forecast), original);
  assert.equal(timelines[0].forecast.seed, f.seed);
  assert.equal(timelines[0].hallwayNodeId, hall);
  assert.deepEqual(timelineMapModel(g).years, [2026, 2027, 2029]);
});

test('timeline rewind reconstructs the selected branch history instead of trimming another branch', () => {
  const g = game(); commitRoomDecisions(g); const rootHall = commitHallwayNode(g);
  const { path } = saveForecast(g);
  enterYearRoom(g, path[1].state, path.slice(1, 2));
  g.portfolio.cash = 900; commitRoomDecisions(g); const aHall = commitHallwayNode(g);
  assert.equal(g.worthHistory.at(-1).bank, 900);
  jumpToHallwayNode(g, rootHall);
  enterYearRoom(g, path[1].state, path.slice(1, 2));
  g.portfolio.cash = 500; commitRoomDecisions(g); commitHallwayNode(g);
  assert.equal(g.worthHistory.at(-1).bank, 500);
  jumpToHallwayNode(g, aHall);
  assert.equal(g.portfolio.cash, 900);
  assert.equal(g.worthHistory.at(-1).bank, 900);
  assert.deepEqual(listTimelines(g).map(t => t.number), [1, 2, 3]);
});

test('south-door decision creates a child on north exit without mutating the earlier room', () => {
  const g = game(); const initialNode = currentNode(g).id;
  commitRoomDecisions(g); const hall = commitHallwayNode(g);
  const baseline = structuredClone(currentTimeline(g).baseline);
  returnToLeftDecisionRoom(g, baseline);
  assert.notEqual(currentNode(g).id, initialNode);
  assert.equal(currentNode(g).parentId, hall);
  g.portfolio.cash += 1000; commitRoomDecisions(g); commitHallwayNode(g);
  const timelines = listTimelines(g);
  assert.equal(timelines.length, 2);
  assert.equal(timelines[0].baseline.cash, baseline.cash);
  assert.equal(timelines[1].baseline.cash, baseline.cash + 1000);
  assert.equal(timelines[1].parentPointId, timelines[0].points[1].id);
});

test('Hallway new decisions rerun an ensemble; saved timeline revisit and portable load never reroll', () => {
  browserStubs(); const g = game(98);
  const forecast = { result: null, progress: 0, error: null, calls: [],
    request(...args) { this.result = null; this.calls.push(args); }, cancel() {} };
  const scene = new HallwayScene({ forecast });
  scene.enter(g);
  try {
    assert.equal(forecast.calls.length, 1);
    const rootHall = currentNode(g).id;
    forecast.result = projectMonteCarlo(scene.baseline, { paths: 20, ...scene.forecastOptions });
    scene.update(g, null);
    const initialPath = structuredClone(scene.snapshots);
    const initialScenario = structuredClone(g.hallwayScenario);
    enterYearRoom(g, initialPath[1].state, initialPath.slice(1, 2));
    g.portfolio.annualSpending = 6000; commitRoomDecisions(g);
    scene.leave(); scene.enter(g);
    assert.equal(forecast.calls.length, 2);
    assert.equal(scene.ready, false);
    assert.equal(forecast.calls[1][3].force, true);
    assert.equal(forecast.calls[1][3].originYear, g.timeline.startYear);
    assert.notEqual(forecast.calls[0][3].revision, forecast.calls[1][3].revision);
    forecast.result = projectMonteCarlo(scene.baseline, { paths: 20, ...scene.forecastOptions });
    scene.update(g, null);
    jumpToHallwayNode(g, rootHall); scene.leave(); scene.enter(g);
    assert.equal(forecast.calls.length, 2);
    assert.deepEqual(g.hallwayScenario, initialScenario);
    assert.deepEqual(scene.snapshots, initialPath);
    const loaded = importPlan(JSON.stringify(exportPlan(g))).game;
    scene.leave(); scene.enter(loaded);
    assert.equal(forecast.calls.length, 2);
    assert.deepEqual(scene.snapshots, initialPath);
  } finally { scene.leave(); }
});

test('Map compares two distinct numeric timelines through keyboard and mouse, drawing three aligned charts', () => {
  const g = game(); commitRoomDecisions(g); commitHallwayNode(g);
  const { path } = saveForecast(g);
  enterYearRoom(g, path[1].state, path.slice(1, 2)); commitRoomDecisions(g); commitHallwayNode(g); saveForecast(g);
  const pause = new PauseMenu(), { ctx, texts } = canvas(); pause.show(g); pause.screen = 'map';
  pause.toggleMapCompare(g);
  pause.compareSelectionIndex = 0;
  pause.handleKey({ key: 'Enter', preventDefault() {} }, g);
  assert.equal(pause.selectedComparison.length, 1);
  pause.handleKey({ key: 'Enter', preventDefault() {} }, g);
  assert.equal(pause.mapMode, 'result');
  pause.drawMap(ctx, g, 0, 0, 1680, 880);
  assert.equal(texts.filter(t => /^Timeline [12] ·/.test(t.text)).length, 2);
  assert.equal(texts.filter(t => /^Overlay ·/.test(t.text)).length, 1);
  pause.toggleMapCompare(g); pause.drawMap(ctx, g, 0, 0, 1680, 880);
  const hit = pause._hits.find(h => h.key === 'compare:timeline-1');
  pause.handlePointerDown(hit.x + 5, hit.y + 5, g);
  assert.deepEqual(pause.selectedComparison, ['timeline-1']);
  const timelines = listTimelines(g), domain = comparisonDomain(timelines);
  assert.equal(domain.firstYear, 2026); assert.equal(domain.lastYear, 2029);
  const count = Object.keys(g.timeline.forecasts).length;
  drawTimelineComparison(ctx, timelines, { x: 0, y: 0, w: 1600, h: 700 }, 2026);
  assert.equal(Object.keys(g.timeline.forecasts).length, count);
});

test('map migration preserves old node snapshots and reports unrecoverable forecasts honestly', () => {
  const g = game(); commitRoomDecisions(g); commitHallwayNode(g);
  const snapshots = JSON.stringify(g.timeline.snapshots);
  delete g.timeline.records; delete g.timeline.mapVersion;
  ensureTimelineSystem(g);
  assert.equal(JSON.stringify(g.timeline.snapshots), snapshots);
  assert.equal(listTimelines(g)[0].forecast, null);
  assert.equal(pointLetter(0), 'A'); assert.equal(pointLetter(25), 'Z'); assert.equal(pointLetter(26), 'AA');
});

test('map point jumps honor the selected year and preserve the saved projection', () => {
  browserStubs(); const g = game(); commitRoomDecisions(g); const hall = commitHallwayNode(g);
  const { path } = saveForecast(g);
  enterYearRoom(g, path[1].state, path.slice(1, 2)); commitRoomDecisions(g); commitHallwayNode(g); saveForecast(g);
  const initial = JSON.stringify(g.timeline.forecasts);
  const pause = new PauseMenu(); pause.show(g); pause.screen = 'map';
  pause.selectMapTimeline(g, 0); pause.mapPointIndex = 1;
  assert.deepEqual(pause.activateMapFocus(g), { jump: hall });
  assert.equal(g.timeline.mapJumpYear, 2027);
  assert.equal(pause.chartYear, 1);
  const scene = new HallwayScene({ forecast: { calls: 0, cancel() {}, request() { this.calls++; } } });
  scene.enter(g);
  try {
    assert.equal(scene.forecast.calls, 0);
    assert.equal(scene.visual.state.year, 2027);
    assert.equal(g.timeline.mapJumpYear, undefined);
    scene.update(g, null);
    assert.equal(scene.visual.state.year, 2027);
    assert.equal(JSON.stringify(g.timeline.forecasts), initial);
  } finally { scene.leave(); }
});

test('map terminal inspection cannot teleport beyond the cash-funding barrier', () => {
  browserStubs(); const g = game();
  g.portfolio.cash = 15000; g.portfolio.annualSpending = 12000;
  commitRoomDecisions(g); commitHallwayNode(g); saveForecast(g);
  const pause = new PauseMenu(); pause.show(g); pause.screen = 'map';
  pause.mapPointIndex = 1; pause.activateMapFocus(g);
  assert.equal(pause.chartYear, 3);
  const scene = new HallwayScene({ forecast: { cancel() {}, request() { throw Error('Saved path was rerolled'); } } });
  scene.enter(g);
  try {
    assert.ok(scene.glassWall);
    assert.equal(scene.visual.state.year, scene.glassWall.year - 1);
    assert.ok(scene.player.y > scene.glassWall.y + scene.glassWall.h);
    assert.match(scene.mapJumpNotice, /Raise Cash/);
    assert.equal(g.timeline.mapJumpYear, undefined);
    enterYearRoom(g, scene.visual.state);
    assert.equal(g.portfolio.year, scene.glassWall.year - 1);
  } finally { scene.leave(); }
});

test('hallway HUD years match door years, including the first and last doors', () => {
  const world = buildHallway(69, 2027, 31);
  assert.equal(hallwaySnapshotIndex(world, { ...world.spawn, h: 12 }, 71), 0);
  for (const door of world.doors) {
    assert.equal(hallwaySnapshotIndex(world, { y: door.y + 5, h: 12 }, 71), door.yearIndex);
  }
  assert.equal(hallwaySnapshotIndex(world, { y: 59, h: 12 }, 71), 70);
});

test('display preference follows the player into saved decision rooms', () => {
  const g = game(); commitRoomDecisions(g); commitHallwayNode(g);
  const { path } = saveForecast(g);
  g.settings.inflationAdjusted = false; g.portfolio.inflationAdjusted = false;
  enterYearRoom(g, path[1].state, path.slice(1, 2));
  assert.equal(g.portfolio.inflationAdjusted, false);
  assert.equal(g.portfolio.dollarBaseYear, 2026);
});

test('comparison axes share original-year dollars without applying the display deflator twice', () => {
  const g = game(); g.portfolio.priceIndex = 2;
  commitRoomDecisions(g); commitHallwayNode(g); saveForecast(g);
  const first = listTimelines(g)[0];
  assert.equal(first.forecast.series[0].realNetWorth.p50, first.forecast.series[0].netWorth.p50 / 2);
  const { ctx, texts } = canvas();
  setMoneyContext({ priceIndex: 10, inflationAdjusted: true });
  drawTimelineComparison(ctx, [first, { ...first, number: 2 }], { x: 0, y: 0, w: 1600, h: 700 }, 2026);
  assert.ok(texts.some(t => t.text === 'Overlay · 2026 buying power'));
  assert.ok(texts.some(t => /^\$[4-9]\d+k$/.test(t.text)));
  setMoneyContext(null);
});
