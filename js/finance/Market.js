import { hashSeed, mulberry32 } from './rng.js';
import { stockBook, money, nonnegative } from './Books.js';

export const ASSUMPTION_VERSION = 'planning-2026-3';
// Transparent illustrative long-horizon assumptions, not a market forecast or price-history extrapolation.
// homeRealGrowth/homeVolatility: FHFA All-Transactions HPI and S&P/Case-Shiller U.S. National Home
// Price Index, ~1975-2025 (~50yr), nominal CAGR ~4.9-5.0%, real (CPI-deflated) ~1.0-1.5%; national annual
// volatility has no single clean citation, ~4-6% is a reasonable analyst estimate. See financial-model-v2.md.
export const PLANNING_ASSUMPTIONS = { equityReturn: .065, equityVolatility: .18,
  bondReturn: .035, bondVolatility: .06, inflation: .025, inflationVolatility: .01,
  savingsRate: .025, mortgageRate: .065, salaryGrowth: .03, equityDividendYield: .015,
  investmentFee: .002, homeRealGrowth: .0125, homeVolatility: .05 };

export function normal(rng) {
  return Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, rng()))) * Math.cos(2 * Math.PI * rng());
}
export function lognormalReturn(mean, volatility, z = 0) {
  if (!(mean > -1) || !(volatility >= 0)) throw new RangeError('Invalid return moments');
  const s2 = Math.log1p(volatility ** 2 / (1 + mean) ** 2);
  return Math.expm1(Math.log1p(mean) - s2 / 2 + Math.sqrt(s2) * z);
}
function equityZ(equity,a) {
  // A zero-volatility baseline must still transmit an explicitly supplied crash. Use the
  // published market scale to translate that stress into a standardized exposure factor.
  if (!a.equityVolatility && Math.abs(equity-a.equityReturn)<1e-12) return 0;
  const volatility=a.equityVolatility || PLANNING_ASSUMPTIONS.equityVolatility;
  const variance=Math.log1p(volatility**2/(1+a.equityReturn)**2);
  return (Math.log1p(Math.max(-1+Number.EPSILON,equity))-Math.log1p(a.equityReturn)+variance/2)/Math.sqrt(variance);
}
/** Random sampling is independent of supplied economic shocks. `deterministic` is a legacy alias. */
export const randomVariationEnabled = opts => opts.randomVariation ?? opts.stochastic ?? !opts.deterministic;
export function economicYear(state, assumptions, opts = {}) {
  const provided = opts.economy || opts.marketPath?.[state.year];
  const a = { ...PLANNING_ASSUMPTIONS, ...assumptions };
  const random = randomVariationEnabled(opts);
  const rng = opts.rng || mulberry32(hashSeed(opts.seed ?? state.simulationSeed ?? 20261004,
    opts.simulationIndex ?? 0, state.year, 'economy'));
  const z1 = random && !provided ? normal(rng) : 0;
  const z2 = random && !provided ? normal(rng) : 0;
  const z3 = random && !provided ? normal(rng) : 0;
  // Fixed log-shock correlations: equity/bond .10; inflation independent.
  let equity = provided?.equity ?? lognormalReturn(a.equityReturn, a.equityVolatility, z1);
  let bond = provided?.bond ?? lognormalReturn(a.bondReturn, a.bondVolatility, .1 * z1 + Math.sqrt(.99) * z2);
  let inflation = provided?.inflation ?? Math.max(-.1, a.inflation + a.inflationVolatility * z3);
  const elapsed = state.year - (opts.startYear ?? state.year);
  const crash = opts.stress === 'crash' && elapsed >= 0 && elapsed < 2;
  if (crash) equity = elapsed === 0 ? -.4 : -.15;
  if (opts.stress === 'inflation' && elapsed >= 0 && elapsed < 5) inflation = .07;
  // Explicit values are annual returns / inflation, not changes to the random generator.
  const shocks = opts.scenarioShocks || opts.shocks || {};
  equity = shocks.equity ?? equity; bond = shocks.bond ?? bond; inflation = shocks.inflation ?? inflation;
  const marketFactor = crash || shocks.equity != null || provided?.equity != null || provided?.zEquity != null
    ? (shocks.equity == null && !crash ? provided?.zEquity : null) ?? equityZ(equity,a) : z1;
  return { ...a, ...provided, equity, bond, inflation, zEquity: marketFactor,
    homeReturn: shocks.homeReturn ?? provided?.homeReturn ?? lognormalReturn((1 + inflation) * (1 + a.homeRealGrowth) - 1,
      a.homeVolatility, random && !provided ? normal(rng) : 0) };
}
export function holdingReturn(h, economy, state, opts = {}) {
  if (h.assetClass === 'bond') return economy.bond;
  if (h.assetClass === 'cash') return state.savingsRate ?? economy.savingsRate;
  // Specific stocks have a common equity factor plus a stable idiosyncratic factor.
  if (h.ticker === 'MARKET' && h.growth == null && h.volatility == null) return economy.equity;
  const rng = mulberry32(hashSeed(opts.seed ?? state.simulationSeed ?? 20261004,
    opts.simulationIndex ?? 0, state.year, h.ticker || h.id, 'stock'));
  const exposure = Math.max(-1,Math.min(1,h.marketExposure ?? .7));
  const residual = randomVariationEnabled(opts) ? Math.sqrt(1-exposure**2)*normal(rng) : 0;
  // Same arithmetic expected return as the market, greater volatility; no permanent alpha.
  // Suppress only residual noise: the supplied market factor always reaches exposed stocks.
  return lognormalReturn(h.growth ?? economy.equityReturn, h.volatility ?? .35,
    exposure * (economy.zEquity || 0) + residual);
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
