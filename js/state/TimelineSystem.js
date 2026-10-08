import { cloneState } from '../finance/Engine.js';
import { MAX_AGE } from '../config.js';

export const TIMELINE_VERSION = 2;

/** Spreadsheet-style point letters remain unambiguous after Z. */
export function pointLetter(index) {
  let n = Math.max(0, index) + 1, label = '';
  while (n) { n--; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26); }
  return label;
}

function baselineSnapshot(game, node) {
  return game.timeline.snapshots?.[node?.snapshotId] || game.portfolio;
}

function makeRecord(game, number, node, parent = null, parentPointId = null) {
  const baseline = cloneState(baselineSnapshot(game, node));
  // Transaction history belongs to the snapshot graph, not every forecast input.
  delete baseline.transactions;
  return { id: `timeline-${number}`, number, parentTimelineId: parent?.id || null,
    parentPointId, originNodeId: node?.id || null, hallwayNodeId: null,
    startYear: baseline.year, startAge: baseline.age,
    terminalYear: baseline.year + Math.max(0, MAX_AGE - baseline.age),
    baseline, decisions: [], forecast: null, scenario: null, status: 'pending' };
}

/** Upgrade the old node graph without destroying its snapshots or branch history. */
export function ensureTimelineSystem(game) {
  const tree = game.timeline;
  if (!tree) return null;
  if (tree.mapVersion === TIMELINE_VERSION && tree.records) {
    tree.forecasts ||= {}; tree.actualPaths ||= {};
    return tree;
  }
  const nodes = Object.values(tree.nodes || {});
  const root = nodes.find(n => !n.parentId) || nodes[0];
  tree.records = {};
  tree.forecasts = {}; tree.actualPaths = {};
  tree.nextTimelineNumber = 1;
  const first = makeRecord(game, tree.nextTimelineNumber++, root);
  tree.records[first.id] = first;
  if (root) root.timelineId = first.id;
  // Insertion order is the historical event order in both old and current saves.
  for (const node of nodes) {
    if (node === root) continue;
    const parentNode = tree.nodes[node.parentId];
    const parent = tree.records[parentNode?.timelineId] || first;
    node.timelineId = parent.id;
    if (node.type === 'room' && node.kind === 'begin' && parent.hallwayNodeId) {
      const point = addDecision(parent, node);
      node.timelinePointId = point.id;
    }
    if (node.type === 'hallway') {
      let record = parent;
      if (parent.hallwayNodeId) {
        const room = nearestRoom(tree, parentNode);
        const point = room?.timelinePointId ? parent.decisions.find(p => p.id === room.timelinePointId)
          : addDecision(parent, room || parentNode || node);
        record = makeRecord(game, tree.nextTimelineNumber++, node, parent, point?.id);
        tree.records[record.id] = record;
      } else record.baseline = cloneState(baselineSnapshot(game, node));
      record.hallwayNodeId = node.id;
      record.originNodeId = node.parentId || record.originNodeId;
      node.timelineId = record.id;
    }
  }
  tree.activeTimelineId = tree.nodes[tree.currentNodeId]?.timelineId || first.id;
  // A legacy save contains at most one recoverable selected scenario. Never invent
  // forecasts for its other timelines; label those as unavailable until entered.
  const active = tree.records[tree.activeTimelineId];
  if (active?.hallwayNodeId && game.hallwayScenario) active.scenario = cloneState(game.hallwayScenario);
  tree.mapVersion = TIMELINE_VERSION;
  return tree;
}

function nearestRoom(tree, from) {
  let node = from; const seen = new Set();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    if (node.type === 'room' && node.kind === 'begin') return node;
    node = tree.nodes[node.parentId];
  }
  return null;
}

function addDecision(record, node) {
  const existing = record.decisions.find(p => p.nodeId === node.id);
  if (existing) return existing;
  const point = { id: `${record.id}-decision-${record.decisions.length + 1}`,
    nodeId: node.id, year: node.year, age: node.age };
  record.decisions.push(point);
  return point;
}

export function currentTimeline(game) {
  const tree = ensureTimelineSystem(game);
  return tree?.records[tree.activeTimelineId] || null;
}

export function recordTimelineDecision(game, node, parentHallwayId = null) {
  const tree = ensureTimelineSystem(game);
  const hall = tree.nodes[parentHallwayId || node.parentId];
  const record = tree.records[hall?.timelineId || tree.activeTimelineId];
  if (!record) return null;
  node.timelineId = record.id;
  tree.activeTimelineId = record.id;
  const point = addDecision(record, node);
  node.timelinePointId = point.id;
  return point;
}

/** Only a north-door transition calls this: revisiting a hallway never allocates a timeline. */
export function createHallwayTimeline(game, node) {
  const tree = ensureTimelineSystem(game);
  // The upgrade may have already classified this newly inserted node.
  if (node.timelineId && tree.records[node.timelineId]?.hallwayNodeId === node.id)
    return tree.records[node.timelineId];
  const parentNode = tree.nodes[node.parentId];
  const parent = tree.records[parentNode?.timelineId || tree.activeTimelineId];
  let record = parent;
  if (parent.hallwayNodeId) {
    const room = nearestRoom(tree, parentNode);
    const point = parent.decisions.find(p => p.id === room?.timelinePointId)
      || addDecision(parent, room || parentNode);
    record = makeRecord(game, tree.nextTimelineNumber++, node, parent, point.id);
    tree.records[record.id] = record;
  } else {
    record.baseline = cloneState(baselineSnapshot(game, node));
    delete record.baseline.transactions;
  }
  record.hallwayNodeId = node.id;
  record.originNodeId = node.parentId || record.originNodeId;
  node.timelineId = record.id;
  tree.activeTimelineId = record.id;
  game.hallwayScenario = null;
  return record;
}

/** Save the complete original ensemble summary, never raw simulation paths. */
export function storeTimelineForecast(game, forecast) {
  const record = currentTimeline(game);
  if (!record || record.forecastId || !forecast?.series || !forecast?.scenario) return record;
  const compact = cloneState(forecast);
  for (const key of ['samples', 'samplePaths', 'paths', 'terminalPaths']) delete compact[key];
  // Annual statements provide detail for Charts; they do not contain portfolio snapshots.
  const forecastId = `forecast-${record.id}`;
  game.timeline.forecasts[forecastId] = compact;
  record.forecastId = forecastId;
  delete record.forecast;
  record.scenario = cloneState(forecast.scenario);
  record.status = 'ready';
  record.forecastInputs = { portfolio: cloneState(record.baseline), paths: forecast.count,
    seed: forecast.seed, originYear: forecast.scenario.originYear,
    engineVersion: forecast.engineVersion, assumptionVersion: forecast.assumptionVersion,
    taxRuleVersion: forecast.taxRuleVersion, assumptions: cloneState(forecast.assumptions || {}) };
  return record;
}

export function getTimelineForecast(game, record = currentTimeline(game)) {
  return game.timeline?.forecasts?.[record?.forecastId] || record?.forecast || null;
}

/** Keep the selected actual path exact across reloads and future engine versions. */
export function storeTimelineActualPath(game, snapshots) {
  const record = currentTimeline(game);
  if (!record || record.actualPathId) return;
  const pathId = `actual-${record.id}`;
  game.timeline.actualPaths[pathId] = snapshots.map(result => {
    const state = cloneState(result.state);
    for (const key of ['transactions', 'lastStatement', 'lastTransaction', 'modelWarnings']) delete state[key];
    return { state, worth: cloneState(result.worth), events: [...(result.events || [])], statement: cloneState(result.statement || null) };
  });
  record.actualPathId = pathId;
}

export function timelinePoints(record) {
  const decisions = [...record.decisions].sort((a, b) => a.year - b.year || record.decisions.indexOf(a) - record.decisions.indexOf(b));
  const points = [{ id: `${record.id}-origin`, year: record.startYear, age: record.startAge,
    kind: 'origin', nodeId: record.originNodeId }, ...decisions.map(p => ({ ...p, kind: 'decision' })),
  { id: `${record.id}-terminal`, year: record.terminalYear, age: MAX_AGE, kind: 'terminal', nodeId: null }];
  return points.map((p, i) => ({ ...p, letter: pointLetter(i) }));
}

export function listTimelines(game) {
  const tree = ensureTimelineSystem(game);
  return Object.values(tree?.records || {}).sort((a, b) => a.number - b.number)
    .map(record => ({ ...record, forecast: getTimelineForecast(game, record), label: `Timeline ${record.number}`, points: timelinePoints(record),
      isCurrent: record.id === tree.activeTimelineId }));
}

export function timelineMapModel(game) {
  const timelines = listTimelines(game);
  return { timelines, years: [...new Set(timelines.flatMap(t => t.points.map(p => p.year)))].sort((a, b) => a - b),
    startYear: game.timeline?.startYear, activeTimelineId: game.timeline?.activeTimelineId };
}

/** Common economic samples use the original setup year, even after a later-year decision. */
export function timelineForecastOptions(game) {
  const record = currentTimeline(game);
  return { revision: record?.id || 'legacy', originYear: game.timeline?.startYear || game.portfolio.year };
}
