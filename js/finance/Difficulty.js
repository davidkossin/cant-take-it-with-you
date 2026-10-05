import { DIFFICULTIES } from '../config.js';
import { resolveDifficultyId, MARKET_DIFFICULTIES } from './marketAssumptions.js';

/**
 * Resolve a difficulty pack by id (supports legacy easy/difficult).
 * @param {string} id
 */
export function getDifficulty(id) {
  const resolved = resolveDifficultyId(id);
  return DIFFICULTIES[resolved] || DIFFICULTIES.standard || MARKET_DIFFICULTIES.standard;
}

/** Player-facing list — Optimistic / Standard / Grim only (no legacy aliases). */
export function listDifficulties() {
  return [
    MARKET_DIFFICULTIES.optimistic,
    MARKET_DIFFICULTIES.standard,
    MARKET_DIFFICULTIES.grim,
  ];
}

/**
 * Merge difficulty defaults with any numeric overrides stored on the portfolio.
 * @param {object} state portfolio / setup
 * @param {string|object} [difficultyIdOrPack]
 */
export function effectiveDifficulty(state, difficultyIdOrPack) {
  let base;
  if (typeof difficultyIdOrPack === 'object' && difficultyIdOrPack && difficultyIdOrPack.inflation != null) {
    base = { ...difficultyIdOrPack };
  } else {
    const id =
      typeof difficultyIdOrPack === 'string'
        ? difficultyIdOrPack
        : state?.difficulty || 'standard';
    base = { ...getDifficulty(id) };
  }

  const overrides = state?.rateOverrides || {};
  for (const key of [
    'inflation',
    'equityReturn',
    'equityVolatility',
    'savingsRate',
    'mortgageRate',
    'salaryGrowth',
    'expensePressure',
    'taxMult',
    'bondReturn',
    'bondVolatility',
    'inflationVolatility',
    'homeRealGrowth',
    'homeVolatility',
    'equityDividendYield',
  ]) {
    if (overrides[key] != null && Number.isFinite(Number(overrides[key]))) {
      base[key] = Number(overrides[key]);
    }
  }
  if (base.equityVolatility == null) {
    base.equityVolatility = getDifficulty(base.id || 'standard').equityVolatility;
  }
  base.equityReturn = Math.max(-.95, Math.min(1, base.equityReturn));
  base.equityVolatility = Math.max(0, Math.min(2, base.equityVolatility));
  base.inflation = Math.max(-.1, Math.min(.5, base.inflation));
  return base;
}
