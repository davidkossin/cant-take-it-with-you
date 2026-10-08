import { createForecast, addForecastPaths, finishForecast } from './Forecast.js';
self.onmessage=async ({data})=>{
  try {
    const paths=Math.max(1,Math.min(20000,Math.round(Number(data.paths) || 1000)));
    const acc=createForecast(data.portfolio,{...data.options,paths,seed:data.seed,scenario:data.scenario});
    const previews=new Set([100,250,500,1000,2500,5000]);
    while (acc.count<paths) {
      addForecastPaths(acc,Math.min(25,paths-acc.count));
      self.postMessage({type:'progress',completed:acc.count,total:paths});
      if (acc.count<paths && previews.has(acc.count))
        self.postMessage({type:'preview',result:finishForecast(acc,{partial:true})});
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    self.postMessage({type:'result',result:finishForecast(acc)});
  } catch (error) { self.postMessage({type:'error',message:error.message}); }
};
