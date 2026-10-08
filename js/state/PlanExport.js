import { GAME_VERSION } from '../config.js';
import { ENGINE_VERSION, FUNDING_RULE } from '../finance/Engine.js';
import { ASSUMPTION_VERSION } from '../finance/Market.js';
import { TAX_RULE_VERSION } from '../data/tax-brackets.js';
import { MODEL_SCOPE, SUCCESS_DEFINITION } from '../finance/Forecast.js';
import { effectiveDifficulty } from '../finance/Difficulty.js';
import { migrateGame, normalizePortfolio } from '../finance/Schema.js';
import { isJourneyScenario } from '../finance/Journey.js';
import { withUserGesture } from '../input/UserGesture.js';

export const PLAN_FORMAT = 'cant-take-it-plan';
export const PLAN_FORMAT_VERSION = 1;
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
/**
 * Save files: a plan file (PLAN_FORMAT) may carry an optional `profiles` list
 * of character profiles next to its unchanged `game`. With no active game, a
 * profiles-only file (PROFILES_FORMAT) carries just the list. Each entry is
 * { id, label, playerName, age, year, createdAt, setup }.
 */
export const PROFILES_FORMAT = 'cant-take-it-profiles';
export const PROFILES_FORMAT_VERSION = 1;
export const MAX_PROFILES = 1000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const clone = value => JSON.parse(JSON.stringify(value));

function versions() {
  return { game: GAME_VERSION, engine: ENGINE_VERSION, assumptions: ASSUMPTION_VERSION, taxRules: TAX_RULE_VERSION };
}

/** Complete portable backup; immutable timeline inputs are kept verbatim. */
export function exportPlan(game, options = {}) {
  if (!game?.portfolio || !game?.timeline) throw new Error('There is no active plan to export.');
  const document = {
    format: PLAN_FORMAT, formatVersion: PLAN_FORMAT_VERSION, exportedAt: new Date().toISOString(),
    versions: versions(),
    model: {
      fundingRule: FUNDING_RULE, definition: SUCCESS_DEFINITION, coverage: [...MODEL_SCOPE],
      assumptions: effectiveDifficulty(game.portfolio),
      warnings: [...(game.portfolio.modelWarnings || [])],
      seed: game.portfolio.simulationSeed ?? 20261004,
      scenario: game.hallwayScenario || null,
    },
    settings: options.settings ?? game.settings ?? game.preferences ?? {},
    // Optional: character profiles travel with the game in a Save to File.
    ...(Array.isArray(options.profiles) ? { profiles: options.profiles } : {}),
    // Includes all input snapshots, timeline forecasts, ledger and decisions.
    game,
  };
  return clone(document);
}

/** Profiles-only save file, for backing up profiles without an active game. */
export function exportProfiles(profiles) {
  return clone({
    format: PROFILES_FORMAT, formatVersion: PROFILES_FORMAT_VERSION, exportedAt: new Date().toISOString(),
    versions: versions(), profiles: Array.isArray(profiles) ? profiles : [],
  });
}

export function serializePlan(game, options = {}) { return JSON.stringify(exportPlan(game, options), null, 2); }

function validateJSON(value, depth = 0, budget = { items: 0 }) {
  if (++budget.items > 1500000 || depth > 64) throw new Error('This file contains too much nested data.');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('This file contains a non-finite number.');
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    if (value.length > 250000) throw new Error('This file contains an oversized data list.');
    for (const item of value) validateJSON(item, depth + 1, budget);
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      throw new Error('Only plain JSON objects can be imported.');
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw new Error('This file contains an unsafe object key.');
      validateJSON(item, depth + 1, budget);
    }
  }
}

const dictionary = value => value && typeof value === 'object' && !Array.isArray(value);
const FORECAST_METRICS = ['netWorth', 'liquid', 'cash', 'investments', 'realNetWorth', 'realLiquid'];
const PERCENTILES = ['p10', 'p25', 'p50', 'p75', 'p90'];
function validateYearAge(portfolio) {
  if (!dictionary(portfolio) || !Number.isFinite(portfolio.year) || !Number.isFinite(portfolio.age) ||
      portfolio.age < 0 || portfolio.age > 130 || portfolio.year < 1900 || portfolio.year > 2300)
    throw new Error('The plan needs a valid portfolio year and age.');
}
function validatePortfolio(portfolio) {
  validateYearAge(portfolio);
  for (const key of ['cash', 'savings', 'salary', 'spouseSalary', 'annualSpending', 'stocksTotal', 'stocksCostBasis',
    'k401Balance', 'rothBalance', 'spouseK401Balance', 'spouseRothBalance', 'spouseAge',
    'retirementAge', 'spouseRetirementAge', 'socialSecurityMonthly', 'spouseSocialSecurityMonthly',
    'socialSecurityClaimAge', 'spouseSocialSecurityClaimAge', 'annualCollegeCost',
    'priceIndex', 'childCostInflator', 'simulationSeed']) {
    if (portfolio[key] != null && (typeof portfolio[key] !== 'number' || !Number.isFinite(portfolio[key])))
      throw new Error(`The portfolio field ${key} must be a finite number.`);
  }
  const lists = {
    homes: ['value', 'mortgageOwed', 'rate', 'remainingMonths', 'remainingTerm', 'monthlyPayment',
      'costBasis', 'annualPropertyTax', 'annualMaintenance', 'annualInsurance', 'annualHOA', 'monthlyRevenue'],
    otherLoans: ['principal', 'rate', 'remainingMonths', 'remainingTerm', 'monthlyPayment'],
    stocksHoldings: ['value', 'costBasis', 'price', 'shares', 'purchasePrice', 'growth', 'volatility', 'marketExposure'],
    kids: ['age', 'annualCollegeCost', 'collegeCostInputIndex'],
    childcarePlans: ['annualCost', 'years', 'startYear', 'endYearExclusive', 'entryPriceIndex', 'enteredPriceIndex'],
  };
  for (const [key, fields] of Object.entries(lists)) if (portfolio[key] != null) {
    if (!Array.isArray(portfolio[key]) || portfolio[key].length > 10000)
      throw new Error(`The portfolio field ${key} must be a valid list.`);
    for (const item of portfolio[key]) {
      if (!dictionary(item)) throw new Error(`The portfolio list ${key} contains an invalid entry.`);
      for (const field of fields) if (item[field] != null && !Number.isFinite(item[field]))
        throw new Error(`The portfolio field ${key}.${field} must be a finite number.`);
    }
  }
  for (const key of ['k401Allocation', 'rothAllocation', 'spouseK401Allocation', 'spouseRothAllocation', 'rateOverrides']) {
    const value = portfolio[key];
    if (value != null && (!dictionary(value) || Object.values(value).some(item => !Number.isFinite(item))))
      throw new Error(`The portfolio field ${key} must contain numeric assumptions.`);
  }
  if (portfolio.modelWarnings != null && (!Array.isArray(portfolio.modelWarnings) ||
    portfolio.modelWarnings.some(value => typeof value !== 'string')))
    throw new Error('Portfolio model warnings must be a list of text entries.');
}

function validateForecast(forecast) {
  if (!dictionary(forecast) || forecast.provisional || !Number.isInteger(forecast.count) || forecast.count < 1 ||
      forecast.count > 20000 || !isJourneyScenario(forecast.scenario) || !dictionary(forecast.assumptions) ||
      !Number.isFinite(forecast.successProbability) || forecast.successProbability < 0 || forecast.successProbability > 1 ||
      !Array.isArray(forecast.successInterval95) || forecast.successInterval95.length !== 2 ||
      forecast.successInterval95.some(value => !Number.isFinite(value) || value < 0 || value > 1) ||
      !Array.isArray(forecast.series) || !forecast.series.length || forecast.series.length > 131)
    throw new Error('A saved timeline forecast is invalid or incomplete.');
  for (const key of ['equityReturn', 'equityVolatility', 'inflation']) if (!Number.isFinite(forecast.assumptions[key]))
    throw new Error('Saved forecast assumptions are incomplete.');
  forecast.series.forEach((row, index) => {
    validateYearAge(row);
    if (index && (row.year !== forecast.series[index - 1].year + 1 ||
        Math.abs(row.age - forecast.series[index - 1].age - 1) > .001))
      throw new Error('Saved forecast years and ages must advance annually.');
    for (const metric of FORECAST_METRICS) {
      const band = row[metric];
      if (!dictionary(band) || PERCENTILES.some(key => !Number.isFinite(band[key])) ||
          PERCENTILES.some((key, i) => i && band[key] < band[PERCENTILES[i - 1]]))
        throw new Error('A saved forecast has invalid percentile bands.');
    }
  });
  if (forecast.scenarioSeries != null) {
    if (!Array.isArray(forecast.scenarioSeries) || forecast.scenarioSeries.length !== forecast.series.length)
      throw new Error('A saved forecast trajectory has an invalid length.');
    forecast.scenarioSeries.forEach((row, i) => {
      if (!dictionary(row) || row.year !== forecast.series[i].year || row.age !== forecast.series[i].age ||
          FORECAST_METRICS.some(key => !Number.isFinite(row[key])))
        throw new Error('A saved forecast trajectory is invalid.');
    });
  }
  if (forecast.reference != null) {
    if (!Array.isArray(forecast.reference) || forecast.reference.length !== forecast.series.length - 1)
      throw new Error('Saved annual forecast details have an invalid length.');
    forecast.reference.forEach(row => { if (!dictionary(row)) throw new Error('Saved annual forecast details are invalid.'); validateStatement(row.statement); });
  }
}

function validateStatement(statement) {
  if (statement == null) return;
  if (!dictionary(statement) || !dictionary(statement.tax) || !Number.isFinite(statement.tax.total) ||
      !Number.isFinite(statement.requiredSpending) || !Number.isFinite(statement.unfunded))
    throw new Error('A saved annual financial statement is invalid.');
}

function validateActualPath(path) {
  if (!Array.isArray(path) || !path.length || path.length > 131)
    throw new Error('A saved timeline trajectory has an invalid length.');
  path.forEach((frame, i) => {
    if (!dictionary(frame)) throw new Error('A saved timeline trajectory frame is invalid.');
    validatePortfolio(frame.state);
    if (!dictionary(frame.worth) || ['netWorth', 'exactNetWorth', 'cash', 'bank', 'availableLiquid']
      .some(key => !Number.isFinite(frame.worth[key])) || (frame.events != null &&
        (!Array.isArray(frame.events) || frame.events.some(value => typeof value !== 'string'))))
      throw new Error('A saved timeline trajectory frame has invalid balances or events.');
    if (i && (frame.state.year !== path[i - 1].state.year + 1 || Math.abs(frame.state.age - path[i - 1].state.age - 1) > .001))
      throw new Error('Saved trajectory years and ages must advance annually.');
    validateStatement(frame.statement);
  });
}

function validateGame(game) {
  if (!dictionary(game) || !dictionary(game.timeline) || !dictionary(game.timeline.nodes) ||
      !dictionary(game.timeline.snapshots)) throw new Error('The file is missing its timeline and portfolio snapshots.');
  validatePortfolio(game.portfolio);
  const { nodes, snapshots, currentNodeId } = game.timeline;
  const entries = Object.entries(nodes);
  if (!entries.length || entries.length > 50000 || Object.keys(snapshots).length > 50000)
    throw new Error('The timeline has an invalid number of records.');
  if (!nodes[currentNodeId]) throw new Error('The active timeline node is missing.');
  for (const portfolio of Object.values(snapshots)) validatePortfolio(portfolio);
  for (const [id, node] of entries) {
    if (!dictionary(node) || node.id !== id || !['room', 'hallway'].includes(node.type) ||
        !Number.isFinite(node.year) || !Number.isFinite(node.age)) throw new Error('A timeline node is invalid.');
    if (!snapshots[node.snapshotId]) throw new Error('A timeline node refers to a missing portfolio snapshot.');
    if (node.parentId != null && !nodes[node.parentId]) throw new Error('A timeline parent is missing.');
  }
  // Mark once, so validation is linear even for long branch histories.
  const complete = new Set();
  for (const [id] of entries) {
    const path = new Set();
    let next = id;
    while (next && !complete.has(next)) {
      if (path.has(next)) throw new Error('A timeline contains a parent cycle.');
      path.add(next); next = nodes[next].parentId;
    }
    for (const visited of path) complete.add(visited);
  }
  if (game.timeline.mapVersion === 2) {
    const tree = game.timeline;
    if (!dictionary(tree.records) || !tree.records[tree.activeTimelineId])
      throw new Error('The active numbered timeline is missing.');
    for (const forecast of Object.values(tree.forecasts || {})) validateForecast(forecast);
    for (const path of Object.values(tree.actualPaths || {})) validateActualPath(path);
    const numbers = new Set();
    for (const [id, record] of Object.entries(tree.records)) {
      if (!dictionary(record) || record.id !== id || !Number.isInteger(record.number) || record.number < 1 ||
          numbers.has(record.number) || !Array.isArray(record.decisions) ||
          !Number.isFinite(record.startYear) || !Number.isFinite(record.startAge) || !Number.isFinite(record.terminalYear))
        throw new Error('A numbered timeline record is invalid.');
      numbers.add(record.number); validatePortfolio(record.baseline);
      if (record.parentTimelineId && !tree.records[record.parentTimelineId])
        throw new Error('A numbered timeline parent is missing.');
      if (record.forecastId && !tree.forecasts?.[record.forecastId]) throw new Error('A saved timeline forecast is missing.');
      if (record.actualPathId && !tree.actualPaths?.[record.actualPathId]) throw new Error('A saved timeline trajectory is missing.');
      if (record.forecast != null) validateForecast(record.forecast);
      if (record.scenario != null && !isJourneyScenario(record.scenario)) throw new Error('A saved timeline scenario is invalid.');
      if (record.originNodeId && !nodes[record.originNodeId]) throw new Error('A timeline origin node is missing.');
      if (record.hallwayNodeId && !nodes[record.hallwayNodeId]) throw new Error('A timeline hallway node is missing.');
      for (const decision of record.decisions) {
        if (!dictionary(decision) || typeof decision.id !== 'string' || !nodes[decision.nodeId] ||
            !Number.isFinite(decision.year) || !Number.isFinite(decision.age)) throw new Error('A saved decision point is invalid.');
      }
    }
    const completeTimelines = new Set();
    for (const id of Object.keys(tree.records)) {
      const path = new Set();
      let next = id;
      while (next && !completeTimelines.has(next)) {
        if (path.has(next)) throw new Error('Numbered timelines contain a parent cycle.');
        path.add(next); next = tree.records[next].parentTimelineId;
      }
      for (const visited of path) completeTimelines.add(visited);
    }
  }
}

const PROFILE_ID = /^[A-Za-z0-9_.:-]{1,120}$/;
/** Character profiles are setup answers; check them before anything is stored. */
export function validateProfiles(list) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new Error('The character profiles in this file must be a list.');
  if (list.length > MAX_PROFILES) throw new Error(`This file has more than ${MAX_PROFILES} character profiles.`);
  return list.map((entry, index) => {
    const n = index + 1;
    if (!dictionary(entry) || !dictionary(entry.setup)) throw new Error(`Character profile ${n} is missing its setup answers.`);
    if (entry.id != null && (typeof entry.id !== 'string' || !PROFILE_ID.test(entry.id)))
      throw new Error(`Character profile ${n} has an invalid id.`);
    for (const key of ['label', 'playerName', 'createdAt']) {
      if (entry[key] != null && (typeof entry[key] !== 'string' || entry[key].length > 200))
        throw new Error(`Character profile ${n} has an invalid ${key}.`);
    }
    const setup = entry.setup;
    if (setup.playerName != null && (typeof setup.playerName !== 'string' || setup.playerName.length > 200))
      throw new Error(`Character profile ${n} has an invalid player name.`);
    if (setup.age != null && (!Number.isFinite(setup.age) || setup.age < 0 || setup.age > 130))
      throw new Error(`Character profile ${n} needs an age between 0 and 130.`);
    if (setup.year != null && (!Number.isFinite(setup.year) || setup.year < 1900 || setup.year > 2300))
      throw new Error(`Character profile ${n} needs a valid start year.`);
    try { normalizePortfolio(setup); } catch { throw new Error(`Character profile ${n} could not be read.`); }
    return clone({
      id: entry.id ?? null, label: entry.label ?? null, playerName: entry.playerName ?? setup.playerName ?? null,
      age: Number.isFinite(entry.age) ? entry.age : setup.age ?? null,
      year: Number.isFinite(entry.year) ? entry.year : setup.year ?? null,
      createdAt: entry.createdAt ?? null, setup,
    });
  });
}

function parseDocument(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES)
    throw new Error('Choose a JSON plan file smaller than 50 MiB.');
  let document;
  try { document = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  validateJSON(document);
  return document;
}

/** No script evaluation, no storage changes until validation has succeeded. */
export function importPlan(text) {
  return importPlanDocument(parseDocument(text));
}

function importPlanDocument(document) {
  if (document?.format !== PLAN_FORMAT || document.formatVersion !== PLAN_FORMAT_VERSION)
    throw new Error('This is not a supported Can’t Take It plan backup.');
  validateGame(document.game);
  // Older plan files have no profiles; that is still a complete plan.
  const profiles = validateProfiles(document.profiles);
  const warnings = [];
  const current = versions();
  for (const [key, value] of Object.entries(current)) {
    if (document.versions?.[key] !== value) warnings.push(`${key} version differs from this build; future calculations use ${value}. Saved timeline results are retained.`);
  }
  const game = migrateGame(document.game);
  if (!game.settings && dictionary(document.settings)) game.settings = clone(document.settings);
  return { game, profiles, warnings, metadata: { exportedAt: document.exportedAt, versions: document.versions, model: document.model } };
}

/**
 * Any save file: a plan (with or without profiles) or a profiles-only file.
 * @returns {{game: object|null, profiles: object[], warnings: string[], metadata: object}}
 */
export function importSaveFile(text) {
  const document = parseDocument(text);
  if (document?.format === PROFILES_FORMAT) {
    if (document.formatVersion !== PROFILES_FORMAT_VERSION)
      throw new Error('This profiles file uses an unsupported format version.');
    const profiles = validateProfiles(document.profiles);
    if (!profiles.length) throw new Error('This save file has no game and no character profiles.');
    return { game: null, profiles, warnings: [], metadata: { exportedAt: document.exportedAt, versions: document.versions } };
  }
  if (document?.format !== PLAN_FORMAT)
    throw new Error('This is not a Can’t Take It save file.');
  return importPlanDocument(document);
}

/** File-name piece: letters, digits and dashes only. */
function slug(value, fallback) {
  const text = String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 40);
  return text || fallback;
}
export function saveFileName(game) {
  const year = Number.isFinite(game?.portfolio?.year) ? game.portfolio.year : new Date().getFullYear();
  return `cant-take-it-${slug(game?.portfolio?.playerName, 'traveler')}-${year}.json`;
}
export function profilesFileName(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `cant-take-it-profiles-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/**
 * Save text to the player's disk. Desktop Chrome/Edge show a Save dialog
 * (choose folder and name); other browsers download the file (mobile browsers
 * offer their download/share sheet). Cancelling the dialog is not an error.
 * @returns {Promise<{status:'saved'|'cancelled', method?:'picker'|'download', filename?:string}>}
 */
export async function saveTextToDisk(text, filename, type = 'application/json') {
  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    let handle;
    try {
      handle = await withUserGesture(() => window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Can’t Take It save file', accept: { 'application/json': ['.json'] } }],
      }));
    } catch (error) {
      if (error?.name === 'AbortError') return { status: 'cancelled' };
      // No gesture, a sandboxed frame or a blocked picker: download instead.
      handle = null;
    }
    if (handle === undefined) return { status: 'cancelled' };
    if (handle) {
      const writable = await handle.createWritable();
      try { await writable.write(new Blob([text], { type })); await writable.close(); }
      catch (error) { await writable.abort?.().catch(() => {}); throw error; }
      return { status: 'saved', method: 'picker', filename: handle.name || filename };
    }
  }
  downloadText(text, filename, type);
  return { status: 'saved', method: 'download', filename };
}

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CSV plus the exact baseline/catalog and assumptions needed to interpret it. */
export function exportForecastBundle(game, forecast, options = {}) {
  if (!forecast || forecast.provisional || !Array.isArray(forecast.series))
    throw new Error('Wait for a complete forecast before exporting it.');
  const plan = exportPlan(game, options);
  const columns = ['year', 'age'];
  const metrics = ['netWorth', 'liquid', 'cash', 'investments', 'realNetWorth', 'realLiquid'];
  const percentiles = ['p10', 'p25', 'p50', 'p75', 'p90'];
  for (const metric of metrics) for (const percentile of percentiles) columns.push(`${metric}_${percentile}`);
  const rows = [columns];
  for (const row of forecast.series) {
    rows.push([row.year, row.age, ...metrics.flatMap(metric => percentiles.map(percentile => row[metric]?.[percentile]))]);
  }
  const metadata = {
    format: 'cant-take-it-forecast', formatVersion: 1, exportedAt: plan.exportedAt,
    versions: { ...plan.versions, engine: forecast.engineVersion ?? plan.versions.engine,
      assumptions: forecast.assumptionVersion ?? plan.versions.assumptions,
      taxRules: forecast.taxRuleVersion ?? plan.versions.taxRules },
    seed: forecast.seed, paths: forecast.count,
    assumptions: forecast.assumptions, coverage: forecast.scope || MODEL_SCOPE,
    warnings: forecast.warnings || [], definition: forecast.definition || SUCCESS_DEFINITION,
    units: { netWorth: 'nominal USD', liquid: 'nominal USD', cash: 'nominal USD', investments: 'nominal USD',
      realNetWorth: 'starting-year purchasing-power USD', realLiquid: 'starting-year purchasing-power USD' },
    // Baseline must be the forecast baseline, not a subsequently edited portfolio.
    inputs: options.baseline ?? forecast.inputSnapshot ?? forecast.baseline ?? forecast.forecastInputs ?? game.portfolio,
    plan, forecast,
  };
  return { csv: rows.map(row => row.map(csvCell).join(',')).join('\r\n'), json: JSON.stringify(metadata, null, 2), metadata: clone(metadata) };
}

export function downloadText(text, filename, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadPlan(game, options = {}) {
  const plan = exportPlan(game, options);
  downloadText(JSON.stringify(plan, null, 2), `cant-take-it-plan-${game.portfolio.year}.json`);
  return plan;
}

export function downloadForecastBundle(game, forecast, options = {}) {
  const bundle = exportForecastBundle(game, forecast, options);
  // One JSON download always carries the data even where browsers limit multiple
  // downloads. It includes the CSV text as well as the structured chart data.
  downloadText(JSON.stringify({ ...bundle.metadata, csv: bundle.csv }, null, 2), `cant-take-it-forecast-${game.portfolio.year}.json`);
  return bundle;
}

/** Resolves null when the native picker is cancelled. */
export function pickPlanFile() { return pickJsonFile(importPlan); }
/** Plan (with or without profiles) or profiles-only file; null on cancel. */
export function pickSaveFile() { return pickJsonFile(importSaveFile); }

function pickJsonFile(parse) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.style.display = 'none'; document.body.append(input);
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true; window.removeEventListener('focus', onFocus); input.remove(); resolve(value);
    };
    const onFocus = () => setTimeout(() => { if (!input.files?.length) finish(null); }, 400);
    input.oncancel = () => finish(null);
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { finish(null); return; }
      try {
        if (file.size > MAX_IMPORT_BYTES) throw new Error('Choose a JSON plan file smaller than 50 MiB.');
        finish(parse(await file.text()));
      } catch (error) {
        settled = true; window.removeEventListener('focus', onFocus); input.remove(); reject(error);
      }
    };
    // A touch tap opens the chooser from its release (see UserGesture.js).
    withUserGesture(() => { window.addEventListener('focus', onFocus); input.click(); return true; })
      .then(opened => { if (!opened) finish(null); }, error => { settled = true; input.remove(); reject(error); });
  });
}
