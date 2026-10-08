import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameFromSetup, createDefaultSetup, commitRoomDecisions, commitHallwayNode,
  enterYearRoom, jumpToHallwayNode, currentNode, westReturnHallway } from '../js/state/GameState.js';
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
/** Stand next to a Hallway interactable, facing it; the dialog answers every question with `answer`. */
function faceAndAnswer(scene, obj, answer, facing = 'right') {
  const p = scene.player;
  p.x = obj.x + obj.w / 2 - p.w / 2 - (facing === 'right' ? 10 : 0);
  p.y = obj.y + obj.h / 2 - p.h / 2 - (facing === 'down' ? 10 : 0);
  p.facing = facing;
  const calls = [];
  const ask = async (text, options, extra) => { calls.push({ text, options, extra }); return answer; };
  return { calls, active: false, confirm: ask, menu: ask, async show(text) { calls.push({ text }); } };
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

test('the first Hallway door is the current year: start state, nothing elapsed, a timeline only on north exit', async () => {
  browserStubs(); const g = game();
  commitRoomDecisions(g); const hall = commitHallwayNode(g); saveForecast(g);
  const scene = new HallwayScene({ forecast: { cancel() {}, request() { throw Error('Saved path was rerolled'); } } });
  scene.enter(g);
  try {
    assert.deepEqual(scene.world.doors.map(d => [d.year, d.age, d.yearIndex]), [[2026, 97, 0], [2027, 98, 1], [2028, 99, 2]]);
    assert.equal(scene.stateAtDoor(0), scene.snapshots[0]);
    const before = structuredClone(scene.baseline);
    const dialog = faceAndAnswer(scene, scene.world.doors[0], true);
    assert.deepEqual(await scene.tryInteract(g, dialog), { goto: 'room', arrival: 'west-door' });
    assert.match(dialog.calls[0].text, /^Enter Decision Room for 2026 \(age 97\)\? No time passes\./);
    const room = currentNode(g);
    assert.equal(room.parentId, hall);
    assert.deepEqual([room.year, room.age, g.portfolio.year, g.portfolio.age], [2026, 97, 2026, 97]);
    assert.equal(g.portfolio.cash, before.cash);
    assert.deepEqual([room.elapsedFromYear, room.elapsedToYear], [2026, 2026]);
    assert.ok(g.worthHistory.every(row => row.year === 2026), 'no years elapsed');
    assert.equal(listTimelines(g).length, 1, 'entering the room alone creates no timeline');
    assert.equal(westReturnHallway(g)?.id, hall);
    g.portfolio.cash += 1000; commitRoomDecisions(g); commitHallwayNode(g);
    const timelines = listTimelines(g);
    assert.equal(timelines.length, 2);
    assert.equal(timelines[1].startYear, 2026);
    assert.equal(timelines[0].baseline.cash, before.cash);
    assert.equal(timelines[1].baseline.cash, before.cash + 1000);
    assert.equal(timelines[1].parentPointId, timelines[0].points[1].id);
    assert.equal(timelines[0].points[1].year, 2026);
  } finally { scene.leave(); }
});

test('the south door asks first (No by default), then erases the timeline and its branches and returns to its Decision Room', async () => {
  browserStubs(); const g = game();
  commitRoomDecisions(g); const rootHall = commitHallwayNode(g); const { path } = saveForecast(g);
  enterYearRoom(g, path[1].state, path.slice(1, 2)); const room = currentNode(g).id;
  g.portfolio.cash = 900; commitRoomDecisions(g); const hall2 = commitHallwayNode(g); const second = saveForecast(g);
  enterYearRoom(g, second.path[1].state, second.path.slice(1, 2)); commitRoomDecisions(g); commitHallwayNode(g); saveForecast(g);
  assert.deepEqual(listTimelines(g).map(t => [t.number, t.parentTimelineId]), [[1, null], [2, 'timeline-1'], [3, 'timeline-2']]);
  jumpToHallwayNode(g, hall2);
  const pause = new PauseMenu(); pause.show(g); pause.screen = 'map';
  pause.mapMode = 'result'; pause.selectedComparison = ['timeline-2', 'timeline-3']; pause.mapTimelineIndex = 2;
  const scene = new HallwayScene({ forecast: { cancel() {}, request() { throw Error('Saved path was rerolled'); } } });
  scene.enter(g);
  try {
    const south = scene.world.interactables.find(o => o.kind === 'south-door');
    assert.equal(south.year, 2027);
    const declined = faceAndAnswer(scene, south, false, 'down');
    assert.equal(await scene.tryInteract(g, declined), null);
    assert.equal(declined.calls[0].extra.title, 'Are you sure?');
    assert.equal(declined.calls[0].extra.selected, 1, 'No is selected by default');
    assert.match(declined.calls[0].text, /erase Timeline 2 and every timeline that branches from it/);
    assert.equal(listTimelines(g).length, 3);
    const nav = await scene.tryInteract(g, faceAndAnswer(scene, south, true, 'down'));
    assert.deepEqual(nav, { goto: 'room', arrival: 'north-door', timelineErased: true });
    assert.deepEqual(listTimelines(g).map(t => t.number), [1]);
    assert.equal(g.timeline.activeTimelineId, 'timeline-1');
    assert.equal(g.timeline.currentNodeId, room, 'back in the original room, not a new visit');
    assert.equal(g.portfolio.cash, 900, 'finances as they were when the room was left');
    assert.equal(g.hallwayScenario, null);
    assert.deepEqual(Object.keys(g.timeline.forecasts), ['forecast-timeline-1']);
    assert.deepEqual(Object.keys(g.timeline.actualPaths), ['actual-timeline-1']);
    assert.equal(g.timeline.nodes[hall2], undefined);
    const nodes = Object.values(g.timeline.nodes);
    assert.deepEqual(Object.keys(g.timeline.snapshots).sort(), nodes.map(n => n.snapshotId).sort());
    assert.ok(nodes.every(n => !n.parentId || g.timeline.nodes[n.parentId]));
    assert.ok(currentTimeline(g).decisions.every(point => g.timeline.nodes[point.nodeId]));
    assert.equal(westReturnHallway(g)?.id, rootHall);
    assert.equal(g.worthHistory.at(-1).year, 2027);
    assert.doesNotThrow(() => importPlan(JSON.stringify(exportPlan(g))));
    pause.forgetTimelineSelection();
    assert.deepEqual([pause.mapMode, pause.selectedComparison, pause.mapTimelineIndex], ['overview', [], 0]);
    // Leaving the room north again starts a fresh timeline; the erased number is free.
    commitRoomDecisions(g); commitHallwayNode(g);
    assert.deepEqual(listTimelines(g).map(t => [t.number, t.status]), [[1, 'ready'], [2, 'pending']]);
  } finally { scene.leave(); }
});

test('the south door of Timeline 1 resets it to before its Hallway', async () => {
  browserStubs(); const g = game(); const start = currentNode(g).id;
  g.portfolio.cash = 70000; commitRoomDecisions(g); const rootHall = commitHallwayNode(g); const { path } = saveForecast(g);
  enterYearRoom(g, path[1].state, path.slice(1, 2)); commitRoomDecisions(g); commitHallwayNode(g); saveForecast(g);
  jumpToHallwayNode(g, rootHall);
  const scene = new HallwayScene({ forecast: { cancel() {}, request() { throw Error('Saved path was rerolled'); } } });
  scene.enter(g);
  try {
    const south = scene.world.interactables.find(o => o.kind === 'south-door');
    const dialog = faceAndAnswer(scene, south, true, 'down');
    assert.equal((await scene.tryInteract(g, dialog)).timelineErased, true);
    assert.match(dialog.calls[0].text, /Timeline 1 and every timeline that branches from it/);
    const [first, ...rest] = listTimelines(g);
    assert.equal(rest.length, 0);
    assert.deepEqual([first.number, first.hallwayNodeId, first.forecastId, first.actualPathId, first.status, first.decisions.length, first.originNodeId],
      [1, null, undefined, undefined, 'pending', 0, start]);
    assert.equal(first.baseline.cash, 80000, 'as if the Hallway was never entered');
    assert.deepEqual(Object.keys(g.timeline.nodes), [start]);
    assert.deepEqual(g.timeline.forecasts, {}); assert.deepEqual(g.timeline.actualPaths, {});
    assert.equal(g.timeline.currentNodeId, start);
    assert.equal(g.portfolio.cash, 70000);
    assert.equal(westReturnHallway(g), null);
    assert.doesNotThrow(() => importPlan(JSON.stringify(exportPlan(g))));
    commitRoomDecisions(g); commitHallwayNode(g);
    assert.deepEqual(listTimelines(g).map(t => [t.number, t.baseline.cash]), [[1, 70000]]);
  } finally { scene.leave(); }
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
    assert.ok(scene.world.doors[0].y > scene.glassWall.y + scene.glassWall.h, 'the leave-year door stays usable');
    assert.equal(g.timeline.mapJumpYear, undefined);
    enterYearRoom(g, scene.visual.state);
    assert.equal(g.portfolio.year, scene.glassWall.year - 1);
  } finally { scene.leave(); }
});

test('hallway HUD years match door years, including the first and last doors', () => {
  const world = buildHallway(70, 2026, 30);
  assert.deepEqual([world.doors[0].year, world.doors[0].age, world.doors[0].yearIndex], [2026, 30, 0]);
  assert.deepEqual([world.doors.at(-1).year, world.doors.at(-1).age, world.doors.at(-1).yearIndex], [2095, 99, 69]);
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
