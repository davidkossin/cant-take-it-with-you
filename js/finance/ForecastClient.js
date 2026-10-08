import { forecastKey } from './Forecast.js';
import { isJourneyScenario } from './Journey.js';
import { copy } from './Books.js';

const CACHE_LIMIT=8;
/** Finished forecasts shared by every client (Hallway, Pause → Charts), keyed on model inputs + paths + scenario. */
const cache=new Map();
/** In-flight worker runs shared by every client requesting the same key. */
const runs=new Map();

function remember(key,result) {
  cache.delete(key); cache.set(key,result);
  while (cache.size>CACHE_LIMIT) cache.delete(cache.keys().next().value);
}
function recall(key) {
  const result=cache.get(key);
  if (result) remember(key,result); // refresh LRU position
  return result || null;
}
/**
 * An unpinned run selects its own Hallway scenario; rerunning the same inputs pinned to that
 * scenario reproduces the identical forecast (same seed, same simulation indices). Alias it so
 * Pause → Charts, which pins game.hallwayScenario, reuses the Hallway's run instead of rerunning.
 */
function storeResult(run,result) {
  remember(run.key,result);
  if (run.scenario==null && isJourneyScenario(result?.scenario))
    remember(forecastKey(run.portfolio,run.paths,result.scenario,run.options),result);
}
function closeRun(run) {
  run.closed=true; run.worker?.terminate();
  if (runs.get(run.key)===run) runs.delete(run.key);
  run.subscribers.clear();
}
function startRun(key,portfolio,paths,scenario,options) {
  // The player can edit the live portfolio while this worker is running. Keep
  // cache aliases tied to the inputs actually sent, rather than those edits.
  portfolio=copy(portfolio); scenario=scenario==null?null:copy(scenario);
  const run={key,portfolio,paths,scenario,options,worker:null,progress:0,preview:null,subscribers:new Set(),closed:false};
  run.worker=new Worker(new URL('./forecast-worker.js',import.meta.url),{type:'module'});
  const worker=run.worker;
  const live=()=>!run.closed && run.worker===worker;
  worker.onmessage=({data})=>{
    if (!live()) return;
    if (data.type==='progress') {
      run.progress=data.completed/data.total;
      for (const c of run.subscribers) c.progress=run.progress;
    }
    if (data.type==='preview') {
      run.preview=data.result;
      for (const c of run.subscribers) c.preview=run.preview;
    }
    if (data.type==='error') fail(run,data.message);
    if (data.type==='result') {
      storeResult(run,data.result);
      const subs=[...run.subscribers]; closeRun(run);
      for (const c of subs) c._settle(data.result,null);
    }
  };
  worker.onerror=()=>{ if (live()) fail(run,'Forecast could not run. Reload and try again.'); };
  try {
    worker.postMessage({portfolio,paths,seed:scenario?.seed ?? portfolio.simulationSeed ?? 20261004,scenario,options});
  } catch (error) { closeRun(run); throw error; }
  runs.set(key,run);
  return run;
}
function fail(run,message) {
  const subs=[...run.subscribers]; closeRun(run);
  for (const c of subs) c._settle(null,message);
}

/**
 * Worker isolation and termination prevent stale branch forecasts and renderer stalls.
 * Clients with the same key share one cached result or one in-flight worker; a worker is
 * terminated only when its last subscriber cancels.
 */
export class ForecastClient {
  constructor() { this.worker=null; this.run=null; this.key=null; this.result=null; this.preview=null; this.progress=0; this.error=null; }
  request(portfolio,paths=1000,scenario=null,options={}) {
    paths=Math.max(1,Math.min(20000,Math.round(Number(paths) || 1000)));
    const key=forecastKey(portfolio,paths,scenario,options);
    if (!options.force && key===this.key && (this.run || this.result || this.error)) return;
    this.cancel(); this.key=key; this.progress=0; this.error=null; this.preview=null;
    this.result=options.force ? null : recall(key);
    if (this.result) { this.progress=1; return; }
    let run=runs.get(key);
    if (!run) {
      if (typeof Worker==='undefined') { this.error='Forecast workers are unavailable in this browser.'; return; }
      try { run=startRun(key,portfolio,paths,scenario,{revision:options.revision ?? null,
        originYear:options.originYear ?? portfolio.year}); }
      catch { this.error='Forecast could not start. Reload and try again.'; return; }
    }
    run.subscribers.add(this); this.run=run; this.worker=run.worker; this.progress=run.progress; this.preview=run.preview;
  }
  retry(portfolio,paths=1000,scenario=null,options={}) {
    this.cancel(); this.key=null; this.request(portfolio,paths,scenario,{...options,force:true});
  }
  /** Detach from the shared run; terminate the worker only if no other client still awaits it. */
  cancel() {
    const run=this.run; this.run=null; this.worker=null;
    if (!run) return;
    run.subscribers.delete(this);
    if (!run.subscribers.size) closeRun(run);
  }
  _settle(result,error) {
    this.run=null; this.worker=null; this.result=result; this.preview=null; this.error=error;
    if (result) this.progress=1;
  }
}
