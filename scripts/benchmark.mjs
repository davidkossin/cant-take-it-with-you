import { createStandardPortfolioSetup, createGameFromSetup } from '../js/state/GameState.js';
import { projectMonteCarlo } from '../js/finance/Forecast.js';
const p=createGameFromSetup(createStandardPortfolioSetup()).portfolio;
const start=performance.now(),f=projectMonteCarlo(p,{paths:Number(process.argv[2] || 1000),seed:20261004});
console.log(JSON.stringify({paths:f.count,years:f.series.length-1,milliseconds:Math.round(performance.now()-start),success:f.successProbability,
  samplingInterval:f.successInterval95,firstFailureMedian:f.firstFailureMedian,terminalMedian:f.series.at(-1).netWorth.p50},null,2));
