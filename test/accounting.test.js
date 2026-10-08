import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSetup, createGameFromSetup } from '../js/state/GameState.js';
import { buyStock, sellStock, buyHome, computeWorth, projectYears, NOT_ENOUGH_CASH } from '../js/finance/Engine.js';

export function portfolio(overrides = {}) {
  return createGameFromSetup({ ...createDefaultSetup(), year: 2026, cash: 20000,
    savings: 0, salary: 0, annualSpending: 0, zip: '75001', stocksTotal: 100000,
    stocksCostBasis: 60000, stocksMode: 'specific', stocksHoldings: [{ id: 'test',
      ticker: 'TEST', shares: 1000, price: 100, value: 100000, costBasis: 60000,
      acquiredDate: '2020-01-01', growth: 0, volatility: 0 }], ...overrides }).portfolio;
}

test('sale permanently reduces holdings and basis; valuation is a pure query', () => {
  const p = portfolio();
  const sold = sellStock(p, { proceeds: 25000, gains: 10000, yearsHeld: 1 });
  const beforeQuery = JSON.stringify(sold.state);
  assert.equal(computeWorth(sold.state).stocks, 75000);
  assert.equal(sold.state.stocksCostBasis, 45000);
  assert.equal(JSON.stringify(sold.state), beforeQuery);
  assert.equal(computeWorth(p).stocks, 100000);
});
test('purchasing stock preserves household wealth before fees', () => {
  const p = portfolio();
  const bought = buyStock(p, 5000);
  assert.equal(computeWorth(bought).stocks, 105000);
  assert.equal(bought.cash, 15000);
  assert.equal(computeWorth(bought).netWorth, computeWorth(p).netWorth);
});
test('an unfunded home down payment cannot create equity', () => {
  const p = portfolio({ cash: 10000, stocksTotal: 0, stocksCostBasis: 0, stocksHoldings: [] });
  const bought = buyHome(p, { value: 200000, downPayment: 50000 });
  assert.equal(bought.homes.length, 0);
  assert.ok(bought.lastTransaction.reason.startsWith(NOT_ENOUGH_CASH));
  assert.equal(computeWorth(bought).netWorth, computeWorth(p).netWorth);
});
test('legal zero inputs survive setup', () => {
  const p = portfolio({ annualSpending: 0, homes: [{ value: 100000, mortgageOwed: 50000,
    rate: 0, remainingTerm: 5 }] });
  assert.equal(p.annualSpending, 0);
  assert.equal(p.homes[0].rate, 0);
});
test('seeded multi-year paths do not restart the annual random draw', () => {
  const p = portfolio({ stocksMode: 'total', stocksHoldings: [], cash: 0 });
  p.annualSpending = 0;
  p.rateOverrides = { inflation: 0, equityReturn: .07, equityVolatility: .2, salaryGrowth: 0 };
  const snaps = projectYears(p, 4, 'standard', { seed: 123 });
  let before = 100000;
  const r = snaps.map(s => { const v = s.worth.stocks / before - 1; before = s.worth.stocks; return v; });
  assert.ok(Math.max(...r) - Math.min(...r) > .001);
});
