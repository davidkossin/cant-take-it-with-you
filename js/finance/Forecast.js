import { normalizePortfolio } from './Schema.js';
import { projectOneYear, projectYears, computeWorth, ENGINE_VERSION, FUNDING_RULE } from './Engine.js';
import { copy } from './Books.js';
import { effectiveDifficulty } from './Difficulty.js';
import { ASSUMPTION_VERSION } from './Market.js';
import { estimateAnnualTax } from './Tax.js';
import { TAX_RULE_VERSION } from '../data/tax-brackets.js';
import { projectJourney, projectionYears, isJourneyScenario, HALLWAY_SELECTION, HALLWAY_PATHS } from './Journey.js';

export const SUCCESS_DEFINITION = 'Wall-free: Cash paid every modeled living, housing, child/college, debt and tax cost in every month through age 100. Nothing is sold, transferred or withdrawn automatically; only required minimum distributions and your own standing retirement withdrawal move money into Cash. The first month Cash falls short is a glass wall. Roth contribution goals are optional.';
export const MODEL_SCOPE = [
  'Single / married filing jointly; W-2 income; core federal income, payroll, capital gain, NIIT and AMT rules.',
  'Other states use labeled tax approximations; CA uses projected 2025 brackets; AZ uses a core flat-rate calculation.',
  'Future tax thresholds are indexed assumptions, not future law. Refundable credits, QBI, options/RSUs, trusts and estate tax are not modeled.',
  'SSA statement benefit required. Survivor/spousal/disability benefits and later earnings-test credit adjustments are not modeled.',
  'Separate household earners and retirement-account owners, with individual ages, retirement dates and statement benefits. Roth conversions and inherited accounts are not modeled. High-income Roth 401(k) catch-up is excluded.',
  'Property costs/vacancy are modeled. Passive losses, depreciation recapture and sale-exclusion eligibility require verified inputs.',
  'Annual shared lognormal market shocks and constant annual allocation; illustrative moments, no estimated forecasting precision or fat-tail model.',
  'Each timeline\'s Hallway follows one complete simulated path whose first glass wall is the median wall year of its initial 1,000 paths (paths that never hit a wall count as never); ties go to the ending net worth nearest that group\'s median. It is not the pointwise median. New timelines reuse the seeded calendar-year scenario ensemble, but can select a different Hallway path.'
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
const REPORTING_KEYS = new Set(['transactions','lastStatement','lastTransaction','milestones','modelWarnings',
  'worthHistory','spendingBreakdown','avatar','hairColor','hairLength','name']);
/** Keep unknown model fields; only presentation/report fields are removed from simulation clones. */
export function compactForecastState(value) {
  if (Array.isArray(value)) return value.map(compactForecastState);
  if (value && typeof value === 'object') {
    const result={};
    for (const [key,item] of Object.entries(value)) if (!REPORTING_KEYS.has(key)) result[key]=compactForecastState(item);
    return result;
  }
  return value;
}
const pathCount = n => Math.max(1,Math.min(20000,Math.round(Number(n) || 1000)));
export function createForecast(baseline, opts={}) {
  const years=projectionYears(baseline,opts.years), capacity=pathCount(opts.paths);
  const samples=Array.from({length:years+1},()=>Object.fromEntries(METRICS.map(k=>[k,new Float64Array(capacity)])));
  if (opts.scenario != null && !isJourneyScenario(opts.scenario)) throw new TypeError('Invalid Hallway scenario');
  return {baseline:copy(baseline),simulationBaseline:compactForecastState(baseline),years,capacity,samples,successes:0,count:0,failures:[],terminalPaths:[],
    seed:opts.scenario?.seed ?? opts.seed ?? baseline.simulationSeed ?? 20261004,options:opts};
}
function pathMetrics(s,w=computeWorth(s)) {
  const deflator=s.priceIndex || 1;
  return {netWorth:w.exactNetWorth,liquid:w.availableLiquid,cash:w.cash,
    investments:w.stocks+w.k401Balance+w.rothBalance+(w.spouseK401Balance || 0)+(w.spouseRothBalance || 0),
    realNetWorth:w.exactNetWorth/deflator,realLiquid:w.availableLiquid/deflator};
}
function sampleInto(acc,s,index,path,worth) {
  const values=pathMetrics(s,worth);
  for (const k of METRICS) acc.samples[index][k][path]=values[k];
}
/** Calendar-year + simulation-index keys give competing branches common random numbers. */
export function addForecastPaths(acc,count) {
  count=Math.max(0,Math.min(20000-acc.count,Math.floor(count)));
  if (acc.count+count>acc.capacity) {
    const capacity=Math.min(20000,Math.max(acc.count+count,acc.capacity*2));
    for (const row of acc.samples) for (const key of METRICS) {
      const grown=new Float64Array(capacity); grown.set(row[key]); row[key]=grown;
    }
    acc.capacity=capacity;
  }
  for (let path=acc.count;path<acc.count+count;path++) {
    let state=compactForecastState(acc.simulationBaseline);
    let worth=computeWorth(state);
    sampleInto(acc,state,0,path,worth);
    const options={...acc.options,deterministic:false,randomVariation:true,seed:acc.seed,
      simulationIndex:path,startYear:acc.options.originYear ?? acc.baseline.year,compact:true};
    for (let i=0;i<acc.years;i++) {
      const projected=projectOneYear(state,state.difficulty,options);
      state=projected.state; worth=projected.worth;
      sampleInto(acc,state,i+1,path,worth);
    }
    acc.terminalPaths.push({simulationIndex:path,netWorth:worth.exactNetWorth,
      firstFailureYear:state.planFailed?(state.firstFailureYear ?? acc.baseline.year):null});
    if (!state.planFailed) acc.successes++;
    else acc.failures.push(state.firstFailureYear ?? acc.baseline.year);
  }
  acc.count+=count;
}
export function finishForecast(acc,{partial=false}={}) {
  if (!acc.count) throw new RangeError('A forecast requires at least one path');
  const series=acc.samples.map((row,i)=>{
    const metrics={};
    for (const k of METRICS) {
      // Sorting a copy preserves unsorted path-index samples for progressive and extended runs.
      const sorted=row[k].slice(0,acc.count).sort();
      metrics[k]={p10:percentile(sorted,.1),p25:percentile(sorted,.25),p50:percentile(sorted,.5),
        p75:percentile(sorted,.75),p90:percentile(sorted,.9)};
    }
    return {year:acc.baseline.year+i,age:acc.baseline.age+i,...metrics};
  });
  const assumptions=effectiveDifficulty(acc.baseline);
  const summary={count:acc.count,successes:acc.successes,successProbability:acc.successes/acc.count,
    successInterval95:wilson(acc.successes,acc.count),series,seed:acc.seed,definition:SUCCESS_DEFINITION,
    engineVersion:ENGINE_VERSION,assumptionVersion:ASSUMPTION_VERSION,taxRuleVersion:TAX_RULE_VERSION,
    assumptions,firstFailureMedian:acc.failures.length?percentile([...acc.failures].sort((a,b)=>a-b),.5):null,
    firstWall:firstWallBands(acc),provisional:partial,revision:acc.options.revision ?? null,
    horizon:{startYear:acc.baseline.year,startAge:acc.baseline.age,years:acc.years,
      endYear:acc.baseline.year+acc.years,endAge:acc.baseline.age+acc.years},generatedAt:new Date().toISOString()};
  // Preliminary bands cannot select or commit a gameplay scenario.
  if (partial) return {...summary,scenario:null,scenarioSeries:[],reference:[],stress:null,warnings:[],scope:MODEL_SCOPE};
  // Select an actual trajectory, never a synthetic series assembled from annual percentiles.
  // Larger chart ensembles refine the bands without changing the initial Hallway preview.
  const candidates=acc.terminalPaths.slice(0,HALLWAY_PATHS);
  const {chosen,medianWallYear,terminalMedian}=selectHallwayPath(candidates);
  const originYear=acc.options.originYear ?? acc.baseline.year;
  const scenario=copy(acc.options.scenario || {version:1,seed:acc.seed,simulationIndex:chosen.simulationIndex,
    originYear,originAge:acc.baseline.age+originYear-acc.baseline.year,
    selectionYear:acc.baseline.year,selectionAge:acc.baseline.age,selection:HALLWAY_SELECTION,fundingRule:FUNDING_RULE,
    selectionPaths:candidates.length,selectionMedianWallYear:medianWallYear,
    selectionTerminalMedian:terminalMedian,engineVersion:ENGINE_VERSION,
    assumptionVersion:ASSUMPTION_VERSION,taxRuleVersion:TAX_RULE_VERSION});
  const reference=projectJourney(acc.baseline,scenario,{...acc.options,years:acc.years,compact:true});
  const warnings=[...new Set([...normalizePortfolio(acc.baseline, { legacy: false }).modelWarnings,...estimateAnnualTax(acc.baseline).meta.warnings])];
  const stress={};
  for (const mode of ['crash','inflation']) {
    const path=projectYears(acc.baseline,acc.years,acc.baseline.difficulty,
      {deterministic:true,randomVariation:false,compact:true,stress:mode,seed:acc.seed,startYear:acc.baseline.year});
    const s=path.at(-1)?.state || acc.baseline;
    stress[mode]={netWorth:computeWorth(s).netWorth,success:!s.planFailed,firstFailureYear:s.firstFailureYear ?? null};
  }
  return {...summary,warnings,scope:MODEL_SCOPE,stress,
    inputSnapshot:{version:1,portfolio:copy(acc.baseline),assumptions:copy(assumptions),
      engineVersion:ENGINE_VERSION,assumptionVersion:ASSUMPTION_VERSION,taxRuleVersion:TAX_RULE_VERSION,
      fundingRule:FUNDING_RULE,selection:HALLWAY_SELECTION,seed:acc.seed,paths:acc.count,
      horizon:copy(summary.horizon),scenario:copy(scenario),
      options:copy({...acc.options,paths:acc.count,seed:acc.seed})},
    scenario,scenarioSeries:reference.map(r=>({year:r.state.year,age:r.state.age,...pathMetrics(r.state,r.worth)})),
    reference:reference.slice(1).map(r=>({year:r.state.year,age:r.state.age,worth:r.worth,statement:r.statement,
      // These costs occurred during the statement year, before year-end inflation.
      priceIndex:r.statement?.priceIndex ?? r.state.priceIndex})),
  };
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
  addForecastPaths(acc,pathCount(opts.paths));
  return finishForecast(acc);
}
/** Remove reporting/history data from the cache key, retain every model input. */
export function forecastKey(portfolio,paths=1000,scenario=null,options={}) {
  const s=compactForecastState(portfolio);
  const sorted=v=>Array.isArray(v)?v.map(sorted):v && typeof v==='object'
    ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
  return JSON.stringify({engine:ENGINE_VERSION,funding:FUNDING_RULE,selection:HALLWAY_SELECTION,
    assumptions:ASSUMPTION_VERSION,tax:TAX_RULE_VERSION,paths:pathCount(paths),
    revision:options.revision ?? null,originYear:options.originYear ?? portfolio.year,
    scenario:sorted(scenario),state:sorted(s)});
}
