import { hashSeed, mulberry32 } from './rng.js';
import { stockBook, money, nonnegative } from './Books.js';

export const ASSUMPTION_VERSION = 'planning-2026-1';
// Transparent illustrative long-horizon assumptions, not a market forecast or price-history extrapolation.
export const PLANNING_ASSUMPTIONS = { equityReturn: .065, equityVolatility: .18,
  bondReturn: .035, bondVolatility: .06, inflation: .025, inflationVolatility: .01,
  savingsRate: .025, mortgageRate: .065, salaryGrowth: .03, equityDividendYield: .015,
  investmentFee: .002, homeRealGrowth: .005, homeVolatility: .06 };

export function normal(rng) {
  return Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, rng()))) * Math.cos(2 * Math.PI * rng());
}
export function lognormalReturn(mean, volatility, z = 0) {
  if (!(mean > -1) || !(volatility >= 0)) throw new RangeError('Invalid return moments');
  const s2 = Math.log1p(volatility ** 2 / (1 + mean) ** 2);
  return Math.expm1(Math.log1p(mean) - s2 / 2 + Math.sqrt(s2) * z);
}
function equityZ(equity,a) {
  const variance=Math.log1p(a.equityVolatility**2/(1+a.equityReturn)**2);
  return variance>0 ? (Math.log1p(equity)-Math.log1p(a.equityReturn)+variance/2)/Math.sqrt(variance) : 0;
}
export function economicYear(state, assumptions, opts = {}) {
  const provided = opts.economy || opts.marketPath?.[state.year];
  if (provided) {
    const a = { ...PLANNING_ASSUMPTIONS, ...assumptions };
    const inflation = provided.inflation ?? a.inflation;
    const equity = provided.equity ?? lognormalReturn(a.equityReturn,a.equityVolatility,0);
    return { ...a, equity, bond: provided.bond ?? lognormalReturn(a.bondReturn,a.bondVolatility,0),
      inflation, homeReturn: provided.homeReturn ?? lognormalReturn((1+inflation)*(1+a.homeRealGrowth)-1,a.homeVolatility,0),
      zEquity: provided.zEquity ?? equityZ(equity,a), ...provided };
  }
  const a = { ...PLANNING_ASSUMPTIONS, ...assumptions };
  const rng = opts.rng || mulberry32(hashSeed(opts.seed ?? state.simulationSeed ?? 20261004,
    opts.simulationIndex ?? 0, state.year, 'economy'));
  const z1 = opts.deterministic ? 0 : normal(rng);
  const z2 = opts.deterministic ? 0 : normal(rng);
  const z3 = opts.deterministic ? 0 : normal(rng);
  // Fixed log-shock correlations: equity/bond .10; inflation independent.
  let equity = lognormalReturn(a.equityReturn, a.equityVolatility, z1);
  const bond = lognormalReturn(a.bondReturn, a.bondVolatility, .1 * z1 + Math.sqrt(.99) * z2);
  let inflation = Math.max(-.1, a.inflation + a.inflationVolatility * z3);
  const elapsed = state.year - (opts.startYear ?? state.year);
  if (opts.stress === 'crash' && elapsed < 2) equity = elapsed === 0 ? -.4 : -.15;
  if (opts.stress === 'inflation' && elapsed < 5) inflation = .07;
  return { ...a, equity, bond, inflation, zEquity: opts.stress === 'crash' && elapsed < 2 ? equityZ(equity,a) : z1,
    homeReturn: lognormalReturn((1 + inflation) * (1 + a.homeRealGrowth) - 1,
      a.homeVolatility, opts.deterministic ? 0 : normal(rng)) };
}
export function holdingReturn(h, economy, state, opts = {}) {
  if (h.assetClass === 'bond') return economy.bond;
  if (h.assetClass === 'cash') return state.savingsRate ?? economy.savingsRate;
  // Specific stocks have a common equity factor plus a stable idiosyncratic factor.
  if (h.ticker === 'MARKET' && h.growth == null && h.volatility == null) return economy.equity;
  if (h.growth != null || h.volatility != null) {
    const rng = mulberry32(hashSeed(opts.seed ?? state.simulationSeed ?? 20261004,
      opts.simulationIndex ?? 0, state.year, h.ticker || h.id, 'stock'));
    const z = opts.deterministic ? 0 : .7 * (economy.zEquity || 0) + Math.sqrt(.51) * normal(rng);
    return lognormalReturn(h.growth ?? economy.equityReturn, h.volatility ?? .35, z);
  }
  const rng = mulberry32(hashSeed(opts.seed ?? state.simulationSeed ?? 20261004,
    opts.simulationIndex ?? 0, state.year, h.ticker || h.id, 'stock'));
  // Same arithmetic expected return as the market, greater volatility; no permanent alpha.
  return lognormalReturn(economy.equityReturn, .35,
    opts.deterministic ? 0 : .7 * (economy.zEquity || 0) + Math.sqrt(.51) * normal(rng));
}
export function accountGross(economy, allocation = { equity: 1, bond: 0 }, fee = .002) {
  const equity = Math.max(0, Math.min(1, allocation.equity ?? 1));
  return Math.max(0, (equity * (1 + economy.equity) + (1 - equity) * (1 + economy.bond)) * (1 - fee));
}
export function availableStocks(state) {
  return state.stocksHoldings?.length
    ? money(state.stocksHoldings.filter(h => !h.illiquid).reduce((n, h) => n + nonnegative(h.value), 0))
    : stockBook(state).value;
}
