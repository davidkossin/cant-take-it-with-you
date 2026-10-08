import test from 'node:test';
import assert from 'node:assert/strict';
import { ledgerHistory } from '../js/scenes/EndingScene.js';

test('ending ledger expresses every year in the original-year buying power without altering history', () => {
  const game = { portfolio: { inflationAdjusted: true }, worthHistory: [
    {year:2026,priceIndex:1,netWorth:100,bank:20,salary:10},
    {year:2050,priceIndex:2,netWorth:400,bank:80,salary:40},
    {year:2025,legacy:true,netWorth:90,bank:10,salary:5},
  ] };
  const before = JSON.stringify(game);
  assert.deepEqual(ledgerHistory(game).map(r => r.netWorth), [100,200,null]);
  assert.deepEqual(ledgerHistory(game).map(r => r.bank), [20,40,null]);
  assert.deepEqual(ledgerHistory(game).map(r => r.salary), [10,20,null]);
  assert.equal(JSON.stringify(game), before);
  game.settings = {inflationAdjusted:false};
  assert.deepEqual(ledgerHistory(game).map(r => r.netWorth), [100,400,90]);
});
