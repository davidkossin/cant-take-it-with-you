import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSetup, createGameFromSetup } from '../js/state/GameState.js';
import * as saves from '../js/state/SaveSystem.js';
import { saveProfile, listProfiles, loadProfile } from '../js/state/ProfileSystem.js';
import { exportPlan, importPlan, serializePlan, exportForecastBundle } from '../js/state/PlanExport.js';
import { SAVE_KEY, PROFILE_KEY } from '../js/config.js';
import { projectMonteCarlo } from '../js/finance/Forecast.js';
import { projectJourney } from '../js/finance/Journey.js';

/** Small transactional browser-storage fake: a failed transaction commits nothing. */
function browserStorage() {
  const local = new Map(), stores = new Map();
  const localStorage = { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) };
  const indexedDB = { failWrites: false, writes: 0, open() {
    const request = {};
    setTimeout(() => {
      const database = {
        objectStoreNames: { contains: key => stores.has(key) },
        createObjectStore: key => stores.set(key, new Map()), close() {},
        transaction(names, mode) {
          const working = new Map(names.map(name => [name, new Map(stores.get(name))]));
          const transaction = { outstanding: 0, aborted: false, error: null,
            abort() {
              if (this.aborted) return;
              this.aborted = true;
              setTimeout(() => this.onabort?.(), 0);
            },
            objectStore(name) {
              return {
                getAll() {
                  const result = {}; transaction.outstanding++;
                  setTimeout(() => {
                    result.result = [...working.get(name).values()].map(value => structuredClone(value));
                    transaction.outstanding--; result.onsuccess?.();
                  }, 0);
                  return result;
                },
                getAllKeys() {
                  const result = {}; transaction.outstanding++;
                  setTimeout(() => {
                    result.result = [...working.get(name).keys()];
                    transaction.outstanding--; result.onsuccess?.();
                  }, 0);
                  return result;
                },
                put(value) { indexedDB.writes++; working.get(name).set(value.key, structuredClone(value)); },
                delete(key) { working.get(name).delete(key); },
              };
            },
          };
          const finish = () => {
            if (transaction.aborted) return;
            if (transaction.outstanding) { setTimeout(finish, 0); return; }
            if (mode === 'readwrite' && indexedDB.failWrites) {
              transaction.error = Object.assign(new Error('Full'), { name: 'QuotaExceededError' });
              transaction.abort(); return;
            }
            if (mode === 'readwrite') for (const [name, map] of working) stores.set(name, map);
            transaction.oncomplete?.();
          };
          setTimeout(finish, 0);
          return transaction;
        },
      };
      request.result = database;
      request.onupgradeneeded?.(); request.onsuccess?.();
    }, 0);
    return request;
  } };
  globalThis.localStorage = localStorage; globalThis.indexedDB = indexedDB;
  return { local, stores, indexedDB };
}

test('durable saves retain checkpoints, deduplicate histories and migrate without modifying legacy data', async () => {
  const storage = browserStorage();
  const game = createGameFromSetup(createDefaultSetup());
  const legacy = JSON.stringify([{ id: 'old-1', label: 'Legacy', kind: 'begin', year: game.portfolio.year,
    playerName: game.portfolio.playerName, savedAt: '2026-01-01T00:00:00.000Z', game }]);
  const legacyProfiles = JSON.stringify([{ id: 'profile-old', playerName: 'Old', setup: createDefaultSetup() }]);
  storage.local.set(SAVE_KEY, legacy); storage.local.set(PROFILE_KEY, legacyProfiles);
  assert.equal((await saves.initializeSaves()).state, 'saved');
  assert.equal(saves.listSaves().length, 1); assert.equal(listProfiles().length, 1);
  const checkpoints = [];
  for (let i = 0; i < 45; i++) checkpoints.push(saves.autoSave(game));
  game.portfolio.cash += 9999;
  const profile = saveProfile(createDefaultSetup());
  assert.equal((await saves.flushSaves()).state, 'saved');
  assert.equal(saves.listSaves().length, 46);
  assert.equal(saves.loadSave(checkpoints[0].id).portfolio.cash, 5000);
  assert.equal(loadProfile(profile.id).playerName, 'Traveler');
  assert.equal(storage.local.get(SAVE_KEY), legacy);
  assert.equal(storage.local.get(PROFILE_KEY), legacyProfiles);
  assert.ok(storage.stores.get('chunks').size < 30, 'Shared financial inputs/catalogs are stored once across 45 checkpoints');
  assert.equal(storage.stores.get('records').size, 48);
  game.portfolio.cash = 7654321;
  const unique = saves.autoSave(game); await saves.flushSaves();
  const chunkCount = storage.stores.get('chunks').size;
  saves.deleteSave(unique.id); await saves.flushSaves();
  assert.ok(storage.stores.get('chunks').size < chunkCount, 'Explicit deletion reclaims unshared data');
  saves.deleteSave('old-1'); await saves.flushSaves();
  const reopened = await import(`../js/state/SaveSystem.js?reopened=${Date.now()}`);
  await reopened.initializeSaves();
  assert.equal(reopened.loadSave('old-1'), null, 'Deleted legacy saves do not return on reload');
  assert.equal(reopened.listSaves().length, 45);
  assert.equal(reopened.loadSave(checkpoints.at(-1).id).portfolio.cash, 5000);
});

test('quota failures preserve prior durable data, stay playable and retry pending snapshots atomically', async () => {
  const storage = browserStorage();
  const session = await import(`../js/state/SaveSystem.js?quota=${Date.now()}`);
  await session.initializeSaves();
  const game = createGameFromSetup(createDefaultSetup());
  const first = session.autoSave(game); await session.flushSaves();
  const durableBefore = structuredClone([...storage.stores.get('records')]);
  storage.indexedDB.failWrites = true;
  game.portfolio.cash = 9876;
  let newer;
  assert.doesNotThrow(() => { newer = session.autoSave(game); });
  const failed = await session.flushSaves();
  assert.equal(failed.state, 'error'); assert.match(failed.message, /storage is full/i);
  assert.deepEqual([...storage.stores.get('records')], durableBefore);
  assert.equal(session.loadSave(first.id).portfolio.cash, 5000);
  assert.equal(session.loadSave(newer.id).portfolio.cash, 9876);
  assert.equal(failed.pending, 1);
  storage.indexedDB.failWrites = false;
  assert.equal((await session.flushSaves()).state, 'saved');
  assert.equal(session.getSaveStatus().pending, 0);
  assert.equal(storage.stores.get('records').size, 2);
});

test('unavailable or blocked storage never throws through autosave', async () => {
  globalThis.localStorage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } };
  globalThis.indexedDB = undefined;
  const session = await import(`../js/state/SaveSystem.js?blocked=${Date.now()}`);
  const game = createGameFromSetup(createDefaultSetup());
  let entry;
  assert.doesNotThrow(() => { entry = session.autoSave(game); });
  const result = await session.flushSaves();
  assert.equal(result.state, 'error'); assert.match(result.message, /Save to File/);
  assert.equal(session.loadSave(entry.id).portfolio.cash, game.portfolio.cash);
});

test('unavailable storage bounds its pending checkpoint buffer without evicting prior checkpoints', async () => {
  globalThis.localStorage = { getItem() { return null; } };
  globalThis.indexedDB = undefined;
  const session = await import(`../js/state/SaveSystem.js?bounded=${Date.now()}`);
  const game = createGameFromSetup(createDefaultSetup()), entries = [];
  for (let i = 0; i < 256; i++) entries.push(session.autoSave(game));
  assert.ok(entries.every(Boolean));
  assert.equal(session.autoSave(game), null);
  assert.match(session.getSaveStatus().message, /checkpoint buffer is full/);
  await session.flushSaves();
  assert.equal(session.listSaves().length, 256);
  assert.equal(session.loadSave(entries[0].id).portfolio.cash, game.portfolio.cash);
  assert.equal(session.loadSave(entries.at(-1).id).portfolio.cash, game.portfolio.cash);
});

test('portable plan round-trip preserves exact financial inputs, immutable forecasts, decisions, settings and seed', () => {
  const game = createGameFromSetup(createDefaultSetup());
  game.settings = { inflationAdjustment: true, simulationPaths: 10000 };
  game.portfolio.simulationSeed = 123456;
  const timeline = game.timeline.records[game.timeline.activeTimelineId];
  timeline.baseline.cash = 12.34;
  timeline.forecastInputs = { salary: 98765.43, seed: 41 };
  // Stored timeline forecasts are JSON snapshots, like storeTimelineForecast's clone.
  const savedForecast = JSON.parse(JSON.stringify(projectMonteCarlo(timeline.baseline, { paths: 2 })));
  savedForecast.engineVersion = 'old';
  game.timeline.forecasts = { old: savedForecast };
  timeline.forecastId = 'old';
  game.eventLog.push({ year: 2026, text: 'Transferred $500 into checking' });
  const before = JSON.stringify(game), plan = exportPlan(game), imported = importPlan(serializePlan(game));
  assert.equal(JSON.stringify(game), before);
  assert.deepEqual(imported.game.timeline.records, game.timeline.records);
  assert.deepEqual(imported.game.timeline.forecasts, game.timeline.forecasts);
  assert.deepEqual(imported.game.settings, game.settings);
  assert.deepEqual(imported.game.eventLog, game.eventLog);
  assert.equal(imported.game.portfolio.simulationSeed, 123456);
  assert.equal(plan.model.seed, 123456);
  assert.ok(plan.versions.taxRules); assert.ok(plan.model.coverage.length > 3);
});

test('portable imports reject malformed numbers, missing snapshots, cycles and prototype keys before any writes', () => {
  const game = createGameFromSetup(createDefaultSetup()), plan = exportPlan(game);
  assert.throws(() => importPlan('{'), /valid JSON/);
  assert.throws(() => importPlan('{}'), /supported/);
  assert.throws(() => importPlan(JSON.stringify(plan).replace('"cash":5000', '"cash":"bad"')), /cash/);
  const current = plan.game.timeline.currentNodeId;
  plan.game.timeline.nodes[current].parentId = current;
  assert.throws(() => importPlan(JSON.stringify(plan)), /cycle/);
  plan.game.timeline.nodes[current].parentId = null;
  delete plan.game.timeline.snapshots[plan.game.timeline.nodes[current].snapshotId];
  assert.throws(() => importPlan(JSON.stringify(plan)), /snapshot/);
  const polluted = serializePlan(game).replace('"format":', '"__proto__":{"polluted":true},"format":');
  assert.throws(() => importPlan(polluted), /unsafe object key/);
  assert.equal({}.polluted, undefined);
  const badSpouse = exportPlan(game);
  badSpouse.game.portfolio.spouseSalary = 'not a salary';
  assert.throws(() => importPlan(JSON.stringify(badSpouse)), /spouseSalary/);
  const invalidAccounts = exportPlan(game);
  invalidAccounts.game.portfolio.homes = {};
  assert.throws(() => importPlan(JSON.stringify(invalidAccounts)), /homes.*valid list/);
  invalidAccounts.game.portfolio.homes = [];
  invalidAccounts.game.portfolio.k401Allocation = { equity: 'unknown' };
  assert.throws(() => importPlan(JSON.stringify(invalidAccounts)), /numeric assumptions/);
  const numberedCycle = exportPlan(game), tree = numberedCycle.game.timeline;
  tree.records[tree.activeTimelineId].parentTimelineId = tree.activeTimelineId;
  assert.throws(() => importPlan(JSON.stringify(numberedCycle)), /parent cycle/);
  const malformedForecast = exportPlan(game), active = malformedForecast.game.timeline.records[malformedForecast.game.timeline.activeTimelineId];
  const forecast = projectMonteCarlo(active.baseline, { paths: 2, years: 1 });
  malformedForecast.game.timeline.forecasts.bad = forecast; active.forecastId = 'bad';
  delete forecast.series[0].realNetWorth;
  assert.throws(() => importPlan(JSON.stringify(malformedForecast)), /percentile bands/);
  const malformedPath = exportPlan(game), pathRecord = malformedPath.game.timeline.records[malformedPath.game.timeline.activeTimelineId];
  malformedPath.game.timeline.actualPaths.bad = projectJourney(pathRecord.baseline,
    projectMonteCarlo(pathRecord.baseline, { paths: 1, years: 1 }).scenario, { years: 1 });
  pathRecord.actualPathId = 'bad';
  delete malformedPath.game.timeline.actualPaths.bad[0].state;
  assert.throws(() => importPlan(JSON.stringify(malformedPath)), /portfolio year and age/);
});

test('forecast export includes exact selected baseline, CSV units and uncertainty metadata', () => {
  const game = createGameFromSetup(createDefaultSetup());
  const baseline = { ...game.portfolio, salary: 76543.21 };
  const forecast = { count: 1000, seed: 321, assumptions: { inflation: .025 },
    successInterval95: [.61, .67], series: [{ year: 2026, age: 30,
      netWorth: { p10: 1, p25: 2, p50: 3, p75: 4, p90: 5 } }] };
  const bundle = exportForecastBundle(game, forecast, { baseline });
  const metadata = JSON.parse(bundle.json);
  assert.equal(metadata.inputs.salary, 76543.21); assert.equal(metadata.seed, 321);
  assert.equal(metadata.paths, 1000); assert.deepEqual(metadata.forecast.successInterval95, [.61, .67]);
  assert.ok(metadata.plan.game.timeline.snapshots);
  assert.match(metadata.units.realNetWorth, /starting-year/);
  assert.match(bundle.csv, /netWorth_p50/); assert.match(bundle.csv, /2026,30,1,2,3,4,5/);
  assert.throws(() => exportForecastBundle(game, { ...forecast, provisional: true }), /complete forecast/);
});
