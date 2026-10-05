import { createDefaultSetup, createGameFromSetup } from '../js/state/GameState.js';
export function household(overrides={}) {
  return createGameFromSetup({...createDefaultSetup(),year:2026,age:30,cash:20000,
    savings:0,salary:0,spouseSalary:0,annualSpending:0,zip:'75001',stocksTotal:0,
    stocksCostBasis:0,stocksHoldings:[],equityDividendYield:0,investmentFee:0,
    shockChance:0,rateOverrides:{inflation:0,equityReturn:0,equityVolatility:0,
      bondReturn:0,bondVolatility:0,inflationVolatility:0,homeRealGrowth:0,homeVolatility:0,salaryGrowth:0},...overrides}).portfolio;
}
