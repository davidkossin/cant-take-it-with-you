import { forecastKey } from './Forecast.js';
const cache=new Map();
/** Worker isolation and termination prevent stale branch forecasts and renderer stalls. */
export class ForecastClient {
  constructor() { this.worker=null; this.key=null; this.result=null; this.progress=0; this.error=null; }
  request(portfolio,paths=1000,scenario=null) {
    const key=forecastKey(portfolio,paths,scenario);
    if (key===this.key && (this.worker || this.result || this.error)) return;
    this.cancel(); this.key=key; this.progress=0; this.error=null; this.result=cache.get(key) || null;
    if (this.result) return;
    if (typeof Worker==='undefined') { this.error='Forecast workers are unavailable in this browser.'; return; }
    try { this.worker=new Worker(new URL('./forecast-worker.js',import.meta.url),{type:'module'}); }
    catch { this.error='Forecast could not start. Reload and try again.'; return; }
    const worker=this.worker;
    this.worker.onmessage=({data})=>{
      if (this.key!==key || this.worker!==worker) return;
      if (data.type==='progress') this.progress=data.completed/data.total;
      if (data.type==='error') { this.error=data.message; this.cancel(); }
      if (data.type==='result') {
        this.result=data.result; cache.set(key,this.result);
        if (cache.size>4) cache.delete(cache.keys().next().value);
        this.progress=1; this.cancel();
      }
    };
    this.worker.onerror=()=>{if(this.key!==key || this.worker!==worker)return;this.error='Forecast could not run. Reload and try again.';this.cancel();};
    this.worker.postMessage({portfolio,paths,seed:scenario?.seed ?? portfolio.simulationSeed ?? 20261004,scenario});
  }
  retry(portfolio,paths=1000,scenario=null) { this.cancel(); this.key=null; this.request(portfolio,paths,scenario); }
  cancel() { this.worker?.terminate(); this.worker=null; }
}
