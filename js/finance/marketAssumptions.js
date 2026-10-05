import { PLANNING_ASSUMPTIONS } from './Market.js';
export const RESEARCH_WINDOW = 'Illustrative long-horizon planning assumptions';
// Kept for saved profiles/UI compatibility. Historical averages are not future forecasts.
export const RESEARCHED_AVERAGES = { equityGrowth: .065, equityVolatility: .18,
  inflation: .025, savingsRate: .025, mortgageRate: .065, equitySeries: 'Illustrative total return' };
const pack = (id,label,subtext,overrides={}) => ({ ...PLANNING_ASSUMPTIONS,id,label,subtext,
  expensePressure:1,taxMult:1,collegeCost:28000,shockChance:.04,shockMax:8000,...overrides });
export const MARKET_DIFFICULTIES = {
  optimistic:pack('optimistic','Optimistic','Stronger growth and lower inflation',{equityReturn:.08,equityVolatility:.16,inflation:.02,salaryGrowth:.035}),
  standard:pack('standard','Standard','Illustrative long-horizon planning baseline'),
  grim:pack('grim','Grim','Lower growth and higher inflation',{equityReturn:.045,equityVolatility:.22,inflation:.035,salaryGrowth:.025})
};
export const DIFFICULTY_ALIASES = {easy:'optimistic',difficult:'grim'};
export function resolveDifficultyId(id) { const raw=String(id || 'standard'); return DIFFICULTY_ALIASES[raw] || raw; }
