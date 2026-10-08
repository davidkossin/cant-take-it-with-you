import { normalizePortfolio } from './Schema.js';
import { projectOneYear, projectYears, computeWorth, ENGINE_VERSION, FUNDING_RULE } from './Engine.js';
import { copy } from './Books.js';
import { effectiveDifficulty } from './Difficulty.js';
import { ASSUMPTION_VERSION } from './Market.js';
import { estimateAnnualTax } from './Tax.js';
import { TAX_RULE_VERSION } from '../data/tax-brackets.js';
import { projectJourney, isJourneyScenario, HALLWAY_SELECTION, HALLWAY_PATHS } from './Journey.js';

export const SUCCESS_DEFINITION = 'Wall-free: Cash paid every modeled living, housing, child/college, debt and tax cost in every month through age 100. Nothing is sold, transferred or withdrawn automatically; only required minimum distributions and your own standing retirement withdrawal move money into Cash. The first month Cash falls short is a glass wall. Roth contribution goals are optional.';
export const MODEL_SCOPE = [
  'Single / married filing jointly; W-2 income; core federal income, payroll, capital gain, NIIT and AMT rules.',
  'Other states use labeled tax approximations; CA uses projected 2025 brackets; AZ uses a core flat-rate calculation.',
  'Future tax thresholds are indexed assumptions, not future law. Refundable credits, QBI, options/RSUs, trusts and estate tax are not modeled.',
  'SSA statement benefit required. Survivor/spousal/disability benefits and later earnings-test credit adjustments are not modeled.',
  'One owner for retirement accounts. Roth conversions and inherited accounts are not modeled. High-income Roth 401(k) catch-up is excluded.',
  'Property costs/vacancy are modeled. Passive losses, depreciation recapture and sale-exclusion eligibility require verified inputs.',
  'Annual shared lognormal market shocks and constant annual allocation; illustrative moments, no estimated forecasting precision or fat-tail model.',
  'Hallway follows one complete simulated path whose first glass wall is the median wall year of the initial 1,000 paths (paths that never hit a wall count as never); ties go to the ending net worth nearest that group\'s median. It is not the pointwise median. Decisions reuse its calendar-year shocks.'
];
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const at=(sorted.length-1)*p, lo=Math.floor(at), hi=Math.ceil(at);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(at-lo);
}
export function wilson(successes, count) {
  if (!count) return [0,1];
  const p=successes/count, z=1.95996398454, d=1+z*z/count;
  const center=(p+z*z/(2*count))/d;
  const half=z*Math.sqrt(p*(1-p)/count+z*z/(4*count*count))/d;
  return [Math.max(0,center-half),Math.min(1,center+half)];
}
const METRICS=['netWorth','liquid','cash','investments','realNetWorth','realLiquid'];
export function createForecast(baseline, opts={}) {
  const years=Math.max(0,Math.min(100-baseline.age,opts.years ?? 100-baseline.age));
  const samples=Array.from({length:years+1},()=>Object.fromEntries(METRICS.map(k=>[k,[]])));
  if (opts.scenario != null && !isJourneyScenario(opts.scenario)) throw new TypeError('Invalid Hallway scenario');
  return {baseline:copy(baseline),years,samples,successes:0,count:0,failures:[],terminalPaths:[],
    seed:opts.scenario?.seed ?? opts.seed ?? baseline.simulationSeed ?? 20261004,options:opts};
}
function pathMetrics(s) {
  const w=computeWorth(s), deflator=s.priceIndex || 1;
  return {netWorth:w.exactNetWorth,liquid:w.availableLiquid,cash:w.cash,
    investments:w.stocks+w.k401Balance+w.rothBalance,realNetWorth:w.exactNetWorth/deflator,realLiquid:w.availableLiquid/deflator};
}
function sampleInto(acc,s,index) {
  const values=pathMetrics(s);
  for (const k of METRICS) acc.samples[index][k].push(values[k]);
}
/** Calendar-year + simulation-index keys give competing branches common random numbers. */
export function addForecastPaths(acc,count) {
  for (let path=acc.count;path<acc.count+count;path++) {
    let state=copy(acc.baseline); delete state.transactions; delete state.lastStatement;
    sampleInto(acc,state,0);
    for (let i=0;i<acc.years;i++) {
      state=projectOneYear(state,state.difficulty,{...acc.options,deterministic:false,seed:acc.seed,
        simulationIndex:path,startYear:acc.baseline.year,compact:true}).state;
      sampleInto(acc,state,i+1);
    }
    acc.terminalPaths.push({simulationIndex:path,netWorth:computeWorth(state).exactNetWorth,
      firstFailureYear:state.planFailed?(state.firstFailureYear ?? acc.baseline.year):null});
    if (!state.planFailed) acc.successes++;
    else acc.failures.push(state.firstFailureYear ?? acc.baseline.year);
  }
  acc.count+=count;
}
export function finishForecast(acc) {
  if (!acc.count) throw new RangeError('A forecast requires at least one path');
  const series=acc.samples.map((row,i)=>{
    const metrics={};
    for (const k of METRICS) {
      row[k].sort((a,b)=>a-b);
      metrics[k]={p10:percentile(row[k],.1),p25:percentile(row[k],.25),p50:percentile(row[k],.5),
        p75:percentile(row[k],.75),p90:percentile(row[k],.9)};
    }
    return {year:acc.baseline.year+i,age:acc.baseline.age+i,...metrics};
  });
  // Select an actual trajectory, never a synthetic series assembled from annual percentiles.
  // Larger chart ensembles refine the bands without changing the initial Hallway preview.
  const candidates=acc.terminalPaths.slice(0,HALLWAY_PATHS);
  const {chosen,medianWallYear,terminalMedian}=selectHallwayPath(candidates);
  const scenario=copy(acc.options.scenario || {version:1,seed:acc.seed,simulationIndex:chosen.simulationIndex,
    originYear:acc.baseline.year,originAge:acc.baseline.age,selection:HALLWAY_SELECTION,fundingRule:FUNDING_RULE,
    selectionPaths:candidates.length,selectionMedianWallYear:medianWallYear,
    selectionTerminalMedian:terminalMedian,engineVersion:ENGINE_VERSION,
    assumptionVersion:ASSUMPTION_VERSION,taxRuleVersion:TAX_RULE_VERSION});
  const reference=projectJourney(acc.baseline,scenario,{...acc.options,years:acc.years,compact:true});
  const warnings=[...new Set([...normalizePortfolio(acc.baseline, { legacy: false }).modelWarnings,...estimateAnnualTax(acc.baseline).meta.warnings])];
  const stress={};
  for (const mode of ['crash','inflation']) {
    const path=projectYears(acc.baseline,acc.years,acc.baseline.difficulty,
      {deterministic:true,compact:true,stress:mode,seed:acc.seed});
    const s=path.at(-1)?.state || acc.baseline;
    stress[mode]={netWorth:computeWorth(s).netWorth,success:!s.planFailed,firstFailureYear:s.firstFailureYear ?? null};
  }
  return {count:acc.count,successes:acc.successes,successProbability:acc.count?acc.successes/acc.count:0,
    successInterval95:wilson(acc.successes,acc.count),series,seed:acc.seed,definition:SUCCESS_DEFINITION,
    engineVersion:ENGINE_VERSION,assumptionVersion:ASSUMPTION_VERSION,taxRuleVersion:TAX_RULE_VERSION,
    assumptions:effectiveDifficulty(acc.baseline),warnings,scope:MODEL_SCOPE,stress,
    firstFailureMedian:acc.failures.length?percentile(acc.failures.sort((a,b)=>a-b),.5):null,
    firstWall:firstWallBands(acc),
    scenario,scenarioSeries:reference.map(r=>({year:r.state.year,age:r.state.age,...pathMetrics(r.state)})),
    reference:reference.slice(1).map(r=>({year:r.state.year,age:r.state.age,worth:r.worth,statement:r.statement,priceIndex:r.state.priceIndex})),
    generatedAt:new Date().toISOString()};
}
const wallYear=path=>path.firstFailureYear ?? Infinity;
/** Nearest-rank quantile over an ascending array: always an actual path's value. */
const rankAt=(sorted,p)=>sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(p*sorted.length)-1))];
/**
 * Median first glass wall (never = Infinity), then the ending net worth closest to the median of
 * the paths sharing that wall year; equal distances keep the earliest simulation index.
 */
export function selectHallwayPath(candidates) {
  const years=candidates.map(wallYear).sort((a,b)=>a-b), median=rankAt(years,.5);
  const tied=candidates.filter(path=>wallYear(path)===median);
  const terminalMedian=percentile(tied.map(path=>path.netWorth).sort((a,b)=>a-b),.5);
  const chosen=tied.reduce((best,path)=>
    Math.abs(path.netWorth-terminalMedian)<Math.abs(best.netWorth-terminalMedian) ? path : best);
  return {chosen,medianWallYear:Number.isFinite(median)?median:null,terminalMedian};
}
/** First glass wall across every path: year/age at P10, median and P90; null = no wall through age 100. */
function firstWallBands(acc) {
  const years=acc.terminalPaths.map(wallYear).sort((a,b)=>a-b);
  const at=p=>{ const year=rankAt(years,p);
    return Number.isFinite(year)?{year,age:acc.baseline.age+year-acc.baseline.year}:null; };
  return {p10:at(.1),p50:at(.5),p90:at(.9),wallFree:acc.successes,count:acc.count};
}
export function projectMonteCarlo(baseline,opts={}) {
  const acc=createForecast(baseline,opts);
  addForecastPaths(acc,Math.max(1,Math.min(20000,Math.round(opts.paths ?? 1000))));
  return finishForecast(acc);
}
/** Remove reporting/history data from the cache key, retain every model input. */
export function forecastKey(portfolio,paths=1000,scenario=null) {
  const s=copy(portfolio);
  for (const key of ['transactions','lastStatement','lastTransaction','milestones','modelWarnings']) delete s[key];
  const sorted=v=>Array.isArray(v)?v.map(sorted):v && typeof v==='object'
    ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
  return JSON.stringify({engine:ENGINE_VERSION,funding:FUNDING_RULE,selection:HALLWAY_SELECTION,
    assumptions:ASSUMPTION_VERSION,tax:TAX_RULE_VERSION,paths,
    scenario:sorted(scenario),state:sorted(s)});
}
