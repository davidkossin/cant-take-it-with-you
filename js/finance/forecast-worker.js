import { createForecast, addForecastPaths, finishForecast } from './Forecast.js';
self.onmessage=async ({data})=>{
  try {
    const acc=createForecast(data.portfolio,{paths:data.paths,seed:data.seed,scenario:data.scenario});
    while (acc.count<data.paths) {
      addForecastPaths(acc,Math.min(25,data.paths-acc.count));
      self.postMessage({type:'progress',completed:acc.count,total:data.paths});
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    self.postMessage({type:'result',result:finishForecast(acc)});
  } catch (error) { self.postMessage({type:'error',message:error.message}); }
};
