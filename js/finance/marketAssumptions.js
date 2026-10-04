/**
 * USA market assumptions for difficulty defaults (v0.6.0).
 *
 * Research window: calendar years 2016–2025 (10 fully sourced years).
 *
 * Sources (cited 2026-10-04):
 * - Equity total return (S&P 500, price + reinvested dividends), by calendar year:
 *   Chase “What Is the Average Stock Market Return?” (2016–2025 series);
 *   cross-checked with us500.com / Slickcharts S&P 500 total-return tables.
 *   Annual %: 11.96, 21.83, -4.38, 31.49, 18.40, 28.71, -18.11, 26.29, 25.02, 17.88.
 *   Arithmetic mean ≈ 15.91%. Sample stdev of those annual returns ≈ 15.73%.
 * - Inflation (CPI-U annual-average YoY): BLS via usinflationcalculator.com /
 *   Minneapolis Fed CPI table. 2016–2025 %: 1.3, 2.1, 2.4, 1.8, 1.2, 4.7, 8.0,
 *   4.1, 2.9, 2.6. Mean ≈ 3.11%.
 * - Savings / deposit rate: Bankrate Monitor national savings APY (FRED BRMSA0102
 *   + Forbes Advisor FDIC national averages). Decade average ≈ 0.20% APY
 *   (national brick-and-mortar average; HYSA tops are higher — player may override).
 * - Mortgage rate: Freddie Mac / Rocket Mortgage / Wealthvieu 30-year fixed
 *   annual averages 2016–2025. Mean ≈ 4.77%.
 *
 * Difficulty adjustments (documented; player may override any numeric default):
 * - Optimistic vs Standard: inflation −0.50pp, mortgage/savings −0.75pp / −0.05pp,
 *   equity growth +1.50pp, equity volatility −2.00pp; softer expense/tax/shocks.
 * - Grim vs Standard: inflation +1.00pp, mortgage/savings +1.25pp / +0.10pp,
 *   equity growth −2.50pp, equity volatility +3.00pp; harder expense/tax/shocks.
 */

/** Researched Standard baseline (decimals). */
export const RESEARCH_WINDOW = '2016–2025';

export const RESEARCHED_AVERAGES = {
  equityGrowth: 0.1591, // S&P 500 total-return arithmetic mean
  equityVolatility: 0.1573, // sample stdev of annual total returns
  inflation: 0.0311, // CPI-U annual-average mean
  savingsRate: 0.002, // national average savings APY
  mortgageRate: 0.0477, // 30-year fixed mean
  equitySeries: 'S&P 500 total return (price + reinvested dividends)',
};

/**
 * Build a difficulty pack from researched averages + relative adjustments.
 * Legacy ids `easy` / `difficult` alias optimistic / grim.
 */
function pack(id, label, subtext, adj, extras = {}) {
  const a = RESEARCHED_AVERAGES;
  return {
    id,
    label,
    subtext,
    inflation: +(a.inflation + (adj.inflation || 0)).toFixed(4),
    equityReturn: +(a.equityGrowth + (adj.equityGrowth || 0)).toFixed(4),
    equityVolatility: +(a.equityVolatility + (adj.equityVolatility || 0)).toFixed(4),
    savingsRate: Math.max(0, +(a.savingsRate + (adj.savingsRate || 0)).toFixed(4)),
    mortgageRate: Math.max(0, +(a.mortgageRate + (adj.mortgageRate || 0)).toFixed(4)),
    salaryGrowth: extras.salaryGrowth ?? 0.03,
    expensePressure: extras.expensePressure ?? 1.0,
    taxMult: extras.taxMult ?? 1.0,
    collegeCost: extras.collegeCost ?? 25000,
    shockChance: extras.shockChance ?? 0.04,
    shockMax: extras.shockMax ?? 8000,
  };
}

export const MARKET_DIFFICULTIES = {
  optimistic: pack(
    'optimistic',
    'Optimistic',
    'The world becomes a better place for all',
    {
      inflation: -0.005,
      equityGrowth: 0.015,
      equityVolatility: -0.02,
      savingsRate: -0.0005,
      mortgageRate: -0.0075,
    },
    {
      salaryGrowth: 0.04,
      expensePressure: 0.9,
      taxMult: 0.9,
      collegeCost: 18000,
      shockChance: 0.02,
      shockMax: 5000,
    }
  ),
  standard: pack(
    'standard',
    'Standard',
    'The world remains the way it is today',
    {},
    {
      salaryGrowth: 0.03,
      expensePressure: 1.0,
      taxMult: 1.0,
      collegeCost: 25000,
      shockChance: 0.04,
      shockMax: 8000,
    }
  ),
  grim: pack(
    'grim',
    'Grim',
    'A grim outlook - Life gets harder for everyone',
    {
      inflation: 0.01,
      equityGrowth: -0.025,
      equityVolatility: 0.03,
      savingsRate: 0.001,
      mortgageRate: 0.0125,
    },
    {
      salaryGrowth: 0.02,
      expensePressure: 1.2,
      taxMult: 1.1,
      collegeCost: 35000,
      shockChance: 0.07,
      shockMax: 12000,
    }
  ),
};

/** Legacy id aliases so older saves keep working. */
export const DIFFICULTY_ALIASES = {
  easy: 'optimistic',
  difficult: 'grim',
};

export function resolveDifficultyId(id) {
  const raw = String(id || 'standard');
  return DIFFICULTY_ALIASES[raw] || raw;
}
