import test from 'node:test';
import assert from 'node:assert/strict';
import { household } from './fixtures.js';
import { economicYear, PLANNING_ASSUMPTIONS, holdingReturn } from '../js/finance/Market.js';
import { projectMonteCarlo, createForecast, addForecastPaths, finishForecast, forecastKey } from '../js/finance/Forecast.js';
import { projectYears, computeWorth, setRetirementWithdrawalPlan, setStockSalePlan } from '../js/finance/Engine.js';

test('annual return draws recover configured arithmetic moments and permit market losses',()=>{
  const a={...PLANNING_ASSUMPTIONS},N=50000;
  let sum=0,sum2=0,losses=0,b=0,b2=0,cross=0;
  for(let i=0;i<N;i++) {
    const r=economicYear({year:2026},a,{seed:87,simulationIndex:i});
    sum+=r.equity;sum2+=r.equity**2;b+=r.bond;b2+=r.bond**2;cross+=r.equity*r.bond;
    if(r.equity<0) losses++;
  }
  const mean=sum/N,sd=Math.sqrt(sum2/N-mean**2);
  assert.ok(Math.abs(mean-.065)<.004);assert.ok(Math.abs(sd-.18)<.004);
  assert.ok(losses/N>.25 && losses/N<.5);
  const corr=(cross/N-mean*b/N)/(sd*Math.sqrt(b2/N-(b/N)**2));
  assert.ok(corr>.07 && corr<.13);
});
test('company lots share returns regardless of holding order and account wrappers share factors',()=>{
  const s=household(), e=economicYear(s,PLANNING_ASSUMPTIONS,{seed:19});
  const a=holdingReturn({ticker:'TEST',id:'lot1'},e,s,{seed:19});
  const b=holdingReturn({ticker:'TEST',id:'lot2'},e,s,{seed:19});assert.equal(a,b);
  const p=household({age:60,stocksTotal:100000,stocksCostBasis:100000,k401Balance:100000,rothBalance:100000,
    k401Allocation:{equity:1},rothAllocation:{equity:1},rothOpenedYear:2020});
  p.rateOverrides={...p.rateOverrides,equityReturn:.065,equityVolatility:.18};
  const r=projectYears(p,1,'standard',{seed:19})[0].state;
  assert.equal(r.stocksTotal,r.k401Balance);assert.equal(r.k401Balance,r.rothBalance);
});
test('Monte Carlo is reproducible, does not mutate gameplay, and percentile bands are ordered',()=>{
  const p=household({age:97,stocksTotal:100000,stocksCostBasis:100000});
  p.rateOverrides.equityReturn=.065;p.rateOverrides.equityVolatility=.18;
  const before=JSON.stringify(p), a=projectMonteCarlo(p,{paths:200,seed:77}),b=projectMonteCarlo(p,{paths:200,seed:77});
  assert.equal(JSON.stringify(p),before);assert.deepEqual(a.series,b.series);assert.equal(a.successProbability,b.successProbability);
  for(const row of a.series) for(const key of ['netWorth','liquid','realNetWorth']) {
    const v=row[key];assert.ok(v.p10<=v.p25 && v.p25<=v.p50 && v.p50<=v.p75 && v.p75<=v.p90);
  }
  const acc=createForecast(p,{seed:77});addForecastPaths(acc,75);addForecastPaths(acc,125);
  assert.deepEqual(finishForecast(acc).series,a.series);
});
test('a standing stock-sale plan survives Monte Carlo without mutating the input baseline across paths',()=>{
  const p=setStockSalePlan(household({age:99,cash:0,stocksTotal:30000,stocksCostBasis:30000,annualSpending:20000}),{amount:20000});
  const before=JSON.stringify(p);
  const a=projectMonteCarlo(p,{paths:30,seed:5});
  assert.equal(JSON.stringify(p),before); // the baseline the forecast started from is untouched
  assert.equal(a.successProbability,1); // zero-volatility fixture: the plan fully funds spending on every path
});
test('zero-volatility cash fixture collapses bands and reports all success/all failure truthfully',()=>{
  const p=household({age:98,cash:100000,annualSpending:10000});
  const a=projectMonteCarlo(p,{paths:50});
  assert.equal(a.successProbability,1);assert.equal(a.series.at(-1).netWorth.p10,80000);
  assert.equal(a.series.at(-1).netWorth.p90,80000);
  assert.deepEqual(a.firstWall,{p10:null,p50:null,p90:null,wallFree:50,count:50});
  const fail=projectMonteCarlo({...p,cash:0},{paths:50});assert.equal(fail.successProbability,0);
  assert.equal(fail.count,50);assert.equal(fail.series.at(-1).netWorth.p50,0);
  assert.ok(fail.successInterval95[1]>0);
  assert.deepEqual(fail.firstWall.p50,{year:2026,age:98});assert.equal(fail.firstWall.wallFree,0);
});
test('cash-flow order distinguishes early crash from late crash for a standing withdrawal',()=>{
  // Only the player's own standing 401(k) withdrawal draws on the market; nothing is sold automatically.
  const p=setRetirementWithdrawalPlan(household({age:60,cash:0,k401Balance:100000,annualSpending:30000,employed:false}),
    {amount:33000,account:'traditional'});
  const marketPath=(returns)=>Object.fromEntries(returns.map((r,i)=>[2026+i,{equity:r,bond:0,inflation:0,homeReturn:0}]));
  const early=projectYears(p,3,'standard',{marketPath:marketPath([-.5,0,1]),deterministic:true}).at(-1);
  const late=projectYears(p,3,'standard',{marketPath:marketPath([1,0,-.5]),deterministic:true}).at(-1);
  assert.ok(early.state.planFailed);assert.ok(!late.state.planFailed);
  assert.ok(computeWorth(late.state).k401Balance>computeWorth(early.state).k401Balance);
});
test('forecast cache changes for model inputs and versions, not reporting noise',()=>{
  const p=household();assert.notEqual(forecastKey(p),forecastKey({...p,annualSpending:1}));
  assert.equal(forecastKey(p),forecastKey({...p,transactions:[{type:'ui-only'}]}));
  assert.notEqual(forecastKey(p,1000),forecastKey(p,5000));
  const key=JSON.parse(forecastKey(p));
  assert.equal(key.funding,'cash-only');assert.equal(key.selection,'median-first-wall');
});

test('partial injected economic paths retain finite account factors; crash affects specific stocks',()=>{
  const p=household({age:60,stocksTotal:100000,stocksCostBasis:100000,k401Balance:100000});
  const r=projectYears(p,1,'standard',{economy:{equity:-.2},deterministic:true})[0];
  assert.ok(Number.isFinite(r.worth.exactNetWorth));assert.equal(r.state.k401Balance,80000);
  const state={year:2026,simulationSeed:55};
  const e=economicYear(state,PLANNING_ASSUMPTIONS,{deterministic:true,stress:'crash',startYear:2026});
  assert.ok(holdingReturn({ticker:'TEST'},e,state,{deterministic:false})<0);
});
