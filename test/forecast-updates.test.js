import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { household } from './fixtures.js';
import { economicYear, holdingReturn, PLANNING_ASSUMPTIONS } from '../js/finance/Market.js';
import { projectYears } from '../js/finance/Engine.js';
import { createForecast, addForecastPaths, finishForecast, projectMonteCarlo, forecastKey,
  compactForecastState } from '../js/finance/Forecast.js';
import { ForecastClient } from '../js/finance/ForecastClient.js';

test('deterministic crash reaches custom market-exposed lots and every equity account',()=>{
  const p=household({age:98,stocksMode:'specific',stocksHoldings:[{id:'custom',ticker:'CUSTOM',
    value:100000,costBasis:100000,price:100,shares:1000,growth:.065,volatility:.18,marketExposure:1}],
    k401Balance:100000,rothBalance:100000,k401Allocation:{equity:1},rothAllocation:{equity:1},
    rothOpenedYear:2020,rothContributionBasis:100000});
  // Deactivate RMDs to isolate market transmission; all three wrappers start with the same exposure.
  p.birthYear=1960; p.rmdStillWorkingException=true; p.fivePercentOwner=false; p.retirementAge=110;
  p.retired=false; p.employed=true;
  p.rateOverrides={...p.rateOverrides,equityReturn:.065,equityVolatility:.18};
  const original=JSON.stringify(p);
  const crash=projectYears(p,2,'standard',{randomVariation:false,stress:'crash'}).at(-1).state;
  assert.equal(crash.stocksTotal,51000);
  assert.equal(crash.k401Balance,51000);
  assert.equal(crash.rothBalance,51000);
  assert.equal(JSON.stringify(p),original);
  const forecast=projectMonteCarlo(p,{paths:10});
  assert.equal(forecast.stress.crash.netWorth,173000); // $20k checking + $51k in each account.
});

test('explicit economic shocks survive noise suppression; exposure and residual noise are independent',()=>{
  const s={year:2035,simulationSeed:93};
  const opts={randomVariation:false,scenarioShocks:{equity:-.4,bond:-.1,inflation:.07}};
  const e=economicYear(s,PLANNING_ASSUMPTIONS,opts);
  assert.equal(e.equity,-.4); assert.equal(e.bond,-.1); assert.equal(e.inflation,.07);
  const exposed={ticker:'CUSTOM',growth:.065,volatility:.18,marketExposure:1};
  assert.ok(Math.abs(holdingReturn(exposed,e,s,opts)+.4)<1e-12);
  assert.equal(holdingReturn(exposed,e,s,opts),holdingReturn(exposed,e,s,{...opts,seed:999}));
  const none={...exposed,marketExposure:0};
  assert.equal(holdingReturn(none,e,s,opts),holdingReturn(none,economicYear(s,PLANNING_ASSUMPTIONS,{randomVariation:false}),s,opts));
  const injected=economicYear(s,PLANNING_ASSUMPTIONS,{economy:{equity:-.4},deterministic:true});
  assert.ok(holdingReturn(exposed,injected,s,{deterministic:true})<0);
  assert.notEqual(holdingReturn({...exposed,marketExposure:.7},e,s,{randomVariation:true,seed:1}),
    holdingReturn({...exposed,marketExposure:.7},e,s,{randomVariation:true,seed:2}));
});

test('progressive bands never select a scenario and extended compact samples reproduce a full run',()=>{
  const p=household({age:99,stocksTotal:500000,stocksCostBasis:400000,
    transactions:Array.from({length:200},()=>({type:'cosmetic',detail:'x'.repeat(100)})),
    kids:[{name:'Child',age:23,hairColor:'#444',hairLength:'long',annualCollegeCost:40000}]});
  p.rateOverrides={...p.rateOverrides,equityReturn:.065,equityVolatility:.18};
  const acc=createForecast(p,{seed:144,paths:100,revision:7});
  assert.equal(acc.simulationBaseline.transactions,undefined);
  assert.equal(acc.simulationBaseline.kids[0].name,undefined);
  assert.equal(acc.simulationBaseline.kids[0].annualCollegeCost,40000);
  assert.equal(compactForecastState(p).stocksCostBasis,400000);
  addForecastPaths(acc,100);
  const preview=finishForecast(acc,{partial:true});
  assert.equal(preview.provisional,true); assert.equal(preview.scenario,null);
  assert.deepEqual(preview.scenarioSeries,[]); assert.deepEqual(preview.reference,[]);
  addForecastPaths(acc,150);
  const final=finishForecast(acc);
  assert.equal(final.provisional,false); assert.equal(final.revision,7);
  assert.deepEqual(final.series,projectMonteCarlo(p,{seed:144,paths:250}).series);
  assert.deepEqual(final.inputSnapshot.portfolio,p);
  assert.equal(final.inputSnapshot.paths,250);
  assert.equal(final.inputSnapshot.horizon.endAge,100);
  assert.equal(final.inputSnapshot.seed,144);
  assert.deepEqual(final.inputSnapshot.assumptions,final.assumptions);
  assert.ok(acc.samples[0].netWorth instanceof Float64Array);
});

test('calendar-year economic scenarios remain identical across revised branch forecasts',()=>{
  const a=household({year:2026,age:98,stocksTotal:500000,stocksCostBasis:500000});
  a.rateOverrides={...a.rateOverrides,equityReturn:.065,equityVolatility:.18};
  const b={...a,annualSpending:1000};
  const one=projectMonteCarlo(a,{seed:211,paths:50,revision:1,originYear:2020});
  const two=projectMonteCarlo(b,{seed:211,paths:50,revision:2,originYear:2020});
  assert.equal(one.seed,two.seed);
  assert.equal(one.scenario.originYear,2020); assert.equal(two.scenario.originYear,2020);
  assert.equal(one.series[1].investments.p50,two.series[1].investments.p50);
  assert.notEqual(one.series[1].netWorth.p50,two.series[1].netWorth.p50);
  assert.notEqual(forecastKey(a,1000,null,{revision:1}),forecastKey(a,1000,null,{revision:2}));
});

test('household forecast investment bands include both spouses retirement accounts',()=>{
  const p=household({age:60,married:true,spouseAge:55,k401Balance:10000,rothBalance:20000,
    spouseK401Balance:30000,spouseRothBalance:40000,stocksTotal:50000,stocksCostBasis:50000});
  const f=projectMonteCarlo(p,{paths:5,years:0});
  assert.equal(f.series[0].investments.p50,150000);
  assert.equal(f.scenarioSeries[0].investments,150000);
});

test('annual forecast statement amounts use their own year dollar index',()=>{
  const p=household({age:99,priceIndex:2,cash:100000,annualSpending:10000});
  p.rateOverrides={...p.rateOverrides,inflation:.10};
  const f=projectMonteCarlo(p,{paths:5});
  assert.equal(f.reference[0].priceIndex,2);
  assert.equal(f.reference[0].statement.priceIndex,2);
  assert.equal(f.reference[0].statement.requiredSpending/f.reference[0].priceIndex,5000);
  assert.equal(f.scenarioSeries[1].realNetWorth,f.scenarioSeries[1].netWorth/2.2);
});

test('new timeline revisions force fresh runs, share progressive results, and discard stale messages',()=>{
  const previous=globalThis.Worker,workers=[];
  globalThis.Worker=class {
    constructor() { workers.push(this); }
    postMessage(message) { this.message=message; }
    terminate() { this.terminated=true; }
  };
  const a=new ForecastClient(),b=new ForecastClient(),p=household({age:99,simulationSeed:611});
  try {
    a.request(p,1000,null,{revision:101,force:true,originYear:2020});
    b.request(p,1000,null,{revision:101,originYear:2020});
    assert.equal(workers.length,1);
    const preview={count:100,provisional:true,scenario:null};
    workers[0].onmessage({data:{type:'preview',result:preview}});
    assert.equal(a.result,null); assert.equal(a.preview,preview); assert.equal(b.preview,preview);
    assert.equal(workers[0].message.options.originYear,2020);
    a.request(p,1000,null,{revision:102,force:true,originYear:2020});
    assert.equal(workers.length,2); assert.equal(a.preview,null);
    b.cancel();
    workers[0].onmessage({data:{type:'result',result:{stale:true}}});
    assert.equal(a.result,null);
    const complete={count:1000,revision:102};
    workers[1].onmessage({data:{type:'result',result:complete}});
    assert.equal(a.result,complete); assert.equal(a.preview,null);
    // Explicit refresh bypasses a completed identical-input cache entry.
    b.request(p,1000,null,{revision:102,force:true,originYear:2020});
    assert.equal(workers.length,3);
    assert.equal(b.result,null);
  } finally {
    a.cancel();b.cancel();
    if (previous===undefined) delete globalThis.Worker; else globalThis.Worker=previous;
  }
});

test('worker sends preliminary bands before its final scenario without changing seeded results',async()=>{
  const portfolio=household({age:99,simulationSeed:509,cash:100000,annualSpending:10000});
  const worker=new NodeWorker(new URL('./worker-adapter.mjs',import.meta.url)),previews=[];
  try {
    const final=await new Promise((resolve,reject)=>{
      worker.on('error',reject);
      worker.on('message',data=>{
        if (data.type==='preview') previews.push(data.result);
        if (data.type==='error') reject(new Error(data.message));
        if (data.type==='result') resolve(data.result);
      });
      worker.postMessage({portfolio,paths:1000,seed:509,options:{revision:5,originYear:2026}});
    });
    assert.deepEqual(previews.map(p=>p.count),[100,250,500]);
    assert.ok(previews.every(p=>p.provisional && p.scenario===null));
    assert.equal(final.count,1000); assert.equal(final.revision,5);
    assert.deepEqual(final.series,projectMonteCarlo(portfolio,{paths:1000,seed:509}).series);
    assert.equal(final.scenario.selectionPaths,1000);
  } finally {await worker.terminate();}
});
