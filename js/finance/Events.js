/**
 * Automatic life/finance events applied when projecting a year.
 */

import { RETIREMENT_AGE, COLLEGE_AGE_MIN } from '../config.js';
import { resolveRng } from './rng.js';

/**
 * @param {object} state - mutable clone of financial state at start of year
 * @param {object} difficulty
 * @param {object} [opts] - { deterministic, rng, seed }
 * @returns {string[]} event descriptions for UI/log
 */
export function applyAutoEvents(state, difficulty, opts = {}) {
  const log = [];
  const rng = resolveRng(opts);

  // Track peak salary for simplified Social Security estimate
  if (state.employed && !state.retired && (state.salary || 0) > 0) {
    state.peakSalary = Math.max(state.peakSalary || 0, state.salary || 0);
  }

  // Retirement (player-chosen age; default RETIREMENT_AGE)
  const retireAt = Number(state.retirementAge) > 0 ? Number(state.retirementAge) : RETIREMENT_AGE;
  if (state.age >= retireAt && state.employed && !state.retired) {
    state.retired = true;
    state.employed = false;
    state.salary = 0;
    log.push(`Retired`);
  }

  // Simplified Social Security stub: at/after retirement age if retired, ~35% of peak
  if (state.retired && state.age >= retireAt) {
    const peak = state.peakSalary || 40000;
    state.socialSecurity = Math.round(peak * 0.35);
  } else {
    state.socialSecurity = 0;
  }

  // First year of college — portal / banner one-shot (tuition charged in Engine outflow)
  for (const kid of state.kids || []) {
    if (kid.age === COLLEGE_AGE_MIN) {
      log.push(`${kid.name || 'Child'} goes to college`);
    }
  }

  // Mortgage payoff milestones are emitted in Engine.projectOneYear after the
  // amortization / residual-clear step (Hallway aura portals read those events).
  // Tiny pre-existing crumbs only:
  for (const home of state.homes || []) {
    if ((home.mortgageOwed || 0) > 0 && home.mortgageOwed < 1) {
      home.mortgageOwed = 0;
      home.remainingTerm = 0;
      log.push(`Mortgage paid off: ${home.label || home.type}.`);
    }
  }

  // Unexpected expense — difficulty-scaled, capped; skipped when deterministic
  if (!opts.deterministic) {
    const chance = difficulty.shockChance ?? 0.04 * (difficulty.expensePressure || 1);
    if (rng() < chance) {
      const maxHit = difficulty.shockMax ?? 8000;
      const hit = Math.round(2000 + rng() * maxHit * (difficulty.expensePressure || 1));
      const capped = Math.min(hit, maxHit * (difficulty.expensePressure || 1));
      const paid = Math.min(liquidTotal(state), Math.round(capped));
      drainLiquid(state, paid);
      log.push(`Unexpected expense: −$${fmt(paid)}`);
    }
  }

  return log;
}

function liquidTotal(state) {
  return (state.cash || 0) + (state.savings || 0) + (state.stocksTotal || 0);
}

function drainLiquid(state, amount) {
  let left = amount;
  const fromCash = Math.min(state.cash || 0, left);
  state.cash = (state.cash || 0) - fromCash;
  left -= fromCash;
  if (left <= 0) return;
  const fromSav = Math.min(state.savings || 0, left);
  state.savings = (state.savings || 0) - fromSav;
  left -= fromSav;
  if (left <= 0) return;
  const fromStocks = Math.min(state.stocksTotal || 0, left);
  const take = fromStocks;
  if (take > 0 && (state.stocksTotal || 0) > 0) {
    const ratio = take / state.stocksTotal;
    state.stocksCostBasis = Math.max(
      0,
      Math.round((state.stocksCostBasis || 0) * (1 - ratio))
    );
  }
  state.stocksTotal = (state.stocksTotal || 0) - take;
}

function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

export { liquidTotal, drainLiquid };
