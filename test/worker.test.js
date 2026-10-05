import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { household } from './fixtures.js';
import { projectMonteCarlo } from '../js/finance/Forecast.js';

test('forecast worker emits progress and the same seeded distribution as the shared engine',async()=>{
  const portfolio=household({age:98,cash:100000,annualSpending:10000,stocksTotal:100000,stocksCostBasis:100000});
  portfolio.rateOverrides.equityReturn=.065;portfolio.rateOverrides.equityVolatility=.18;
  const selected=projectMonteCarlo(portfolio,{paths:50,seed:91}).scenario;
  const scenario={...selected,simulationIndex:72};
  const expected=projectMonteCarlo(portfolio,{paths:50,seed:91,scenario});
  const worker=new Worker(new URL('./worker-adapter.mjs',import.meta.url));
  const progress=[];
  try {
    const result=await new Promise((resolve,reject)=>{
      worker.on('error',reject);
      worker.on('message',data=>{
        if(data.type==='progress') progress.push(data.completed);
        if(data.type==='error') reject(new Error(data.message));
        if(data.type==='result') resolve(data.result);
      });
      worker.postMessage({portfolio,paths:50,seed:91,scenario});
    });
    assert.deepEqual(progress,[25,50]);assert.equal(result.count,50);
    assert.deepEqual(result.series,expected.series);assert.equal(result.successProbability,expected.successProbability);
    assert.deepEqual(result.scenario,scenario);assert.deepEqual(result.scenarioSeries,expected.scenarioSeries);
    assert.deepEqual(result.reference,expected.reference);
  } finally {await worker.terminate();}
});
