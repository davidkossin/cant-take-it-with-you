import test from 'node:test';
import assert from 'node:assert/strict';
import { household } from './fixtures.js';
import { RoomScene } from '../js/scenes/RoomScene.js';
import { getDifficulty } from '../js/finance/Difficulty.js';

/**
 * Scripts dialog.prompt/confirm/menu/form answers in call order; dialog.show just logs and
 * continues. Used to drive a teller flow exactly as a player would, including a Back answer
 * (null) at any step, to verify Back re-asks the previous question rather than exiting.
 */
class ScriptedDialog {
  constructor(script) { this.script = script; this.calls = []; this.i = 0; }
  _next(kind, text, opts) {
    this.calls.push({ kind, text, title: opts?.title });
    if (this.i >= this.script.length) throw new Error(`Script ran out at ${kind} #${this.calls.length}: "${text}"`);
    return this.script[this.i++];
  }
  prompt(text, opts) { return Promise.resolve(this._next('prompt', text, opts)); }
  confirm(text, opts) { return Promise.resolve(this._next('confirm', text, opts)); }
  menu(text, opts) { return Promise.resolve(this._next('menu', text, opts)); }
  form(text, fields, opts) { return Promise.resolve(this._next('form', text, opts)); }
  multiSelect(text, items, opts) { return Promise.resolve(this._next('multiSelect', text, opts)); }
  show(text, opts) { this.calls.push({ kind: 'show', text, title: opts?.title }); return Promise.resolve(true); }
  showLoading() {}
  hideLoading() {}
}
const STANDARD = getDifficulty('standard');

test('Make a Large Purchase: Back at the amount step re-asks the name, not exits the flow', async () => {
  const game = { portfolio: household({ cash: 100000 }) };
  const dialog = new ScriptedDialog([
    'Boat',   // step 0: name
    null,     // step 1: amount -> Back
    'Boat',   // step 0 again: name (re-asked)
    20000,    // step 1 again: amount
    false,    // step 2: financed? No -- pay in full
  ]);
  await new RoomScene().handleLargePurchase(game, dialog);
  const prompts = dialog.calls.filter(c => c.kind === 'prompt').map(c => c.text);
  assert.deepEqual(prompts, ['What is your Purchase?', 'Purchase amount?', 'What is your Purchase?', 'Purchase amount?']);
  assert.equal(game.portfolio.cash, 80000);
  assert.equal(game.portfolio.lastTransaction.accepted, true);
});

test('Make a Large Purchase: financed path asks down/rate/term and Back steps back one question at a time', async () => {
  const game = { portfolio: household({ cash: 100000 }) };
  const dialog = new ScriptedDialog([
    'Boat', 20000,
    true,    // financed? Yes
    null,    // down payment -> Back to the financed? question
    true,    // financed? Yes again
    4000,    // down payment
    6.9,     // rate
    5,       // term
  ]);
  await new RoomScene().handleLargePurchase(game, dialog);
  const confirms = dialog.calls.filter(c => c.kind === 'confirm').length;
  assert.equal(confirms, 2); // asked twice: the Back on the down-payment step returned to it
  assert.equal(game.portfolio.cash, 96000); // only the down payment left Cash
  assert.equal(game.portfolio.otherLoans.length, 1);
  assert.equal(game.portfolio.otherLoans[0].principal, 16000);
});

test('Make a Large Purchase: Back on the very first question exits without side effects', async () => {
  const game = { portfolio: household({ cash: 100000 }) };
  const dialog = new ScriptedDialog([null]);
  await new RoomScene().handleLargePurchase(game, dialog);
  assert.equal(game.portfolio.cash, 100000);
  assert.equal(game.portfolio.lastTransaction, undefined);
});

test('Start a Job: setting up retirement contributions runs the questionnaire and applies it', async () => {
  const game = { portfolio: household({ age: 30, employed: false, salary: 0 }) };
  const dialog = new ScriptedDialog([
    'start',  // career window -> Start a Job
    60000,    // salary
    true,     // set up retirement contributions? Yes
    ['k401'], // multiSelect: which accounts does this person have
    { balance: 0, contrib: 6, match: 50, onFirst: 5, equity: 80 }, // 401(k) form
  ]);
  await new RoomScene().handleCareer(game, dialog);
  assert.equal(game.portfolio.salary, 60000);
  assert.equal(game.portfolio.employed, true);
  assert.equal(game.portfolio.has401k, true);
  assert.equal(game.portfolio.k401ContribRate, .06);
  assert.equal(game.portfolio.k401MatchRate, .5);
});

test('Retire: confirms retirement, then sets up a standing stock-sale plan, then Done', async () => {
  const game = { portfolio: household({ age: 65, employed: true, salary: 80000, stocksTotal: 100000, stocksCostBasis: 100000 }) };
  const dialog = new ScriptedDialog([
    'retire', // career window -> Retire
    true,     // confirm retirement
    'stock',  // fund choice -> sell stock annually
    12000,    // standing stock-sale amount
    null,     // fund choice menu again -> Done
  ]);
  await new RoomScene().handleCareer(game, dialog);
  assert.equal(game.portfolio.salary, 0);
  assert.equal(game.portfolio.retired, true);
  assert.deepEqual(game.portfolio.stockSalePlan, { amount: 12000, holdingId: null, inflationAdjusted: true });
});

function borrowerFixture() {
  return household({
    cash: 10000, stocksTotal: 50000, stocksCostBasis: 50000,
    homes: [{ type: 'primary', label: 'Home', value: 400000, mortgageOwed: 100000, rate: .06,
      remainingMonths: 300, remainingTerm: 25, monthlyPayment: 0 }],
  });
}

test('Borrow / Loan: backing out of the HELOC home-choice returns to the HELOC/shares menu, not out of the teller', async () => {
  const game = { portfolio: borrowerFixture() };
  const dialog = new ScriptedDialog([
    'heloc',  // kind menu
    null,     // which home for HELOC -> Back
    'securities', // kind menu shown again
    5000, 7, 10,  // amount, rate, term
    true,     // take loan
  ]);
  await new RoomScene().handleBorrow(game, dialog);
  const menus = dialog.calls.filter(c => c.kind === 'menu').map(c => c.text);
  assert.equal(menus.filter(t => t.includes('Asset-backed')).length, 2); // kind menu shown twice
  assert.equal(game.portfolio.otherLoans.length, 1);
  assert.equal(game.portfolio.otherLoans[0].type, 'securities');
  assert.equal(game.portfolio.cash, 15000); // +5000 loan proceeds
});

test('Bank: setting and stopping a standing Savings-to-Cash transfer from the annual withdraw/transfer screen', async () => {
  const game = { portfolio: household({ cash: 1000, savings: 50000 }) };
  const dialog = new ScriptedDialog(['plan', 'savings:toCash', 6000, null]);
  await new RoomScene().handleBank(game, dialog);
  assert.deepEqual(game.portfolio.savingsTransferPlan, { amount: 6000, direction: 'toCash', inflationAdjusted: true });

  const dialog2 = new ScriptedDialog(['plan', 'savings:stop', null]);
  await new RoomScene().handleBank(game, dialog2);
  assert.equal(game.portfolio.savingsTransferPlan, undefined);
});

test('Withdraw from Retirement Fund: declining the early-withdrawal penalty returns to account choice, and Escape at the summary returns to the amount', async () => {
  const game = { portfolio: household({ age: 40, cash: 0, k401Balance: 50000,
    rothBalance: 20000, rothContributionBasis: 20000, rothOpenedYear: 2010 }) };
  const dialog = new ScriptedDialog([
    'withdraw',
    'traditional',  // pick the 401(k) -- gated, under 59.5
    false,          // decline the penalty -> back to account choice
    'roth',         // pick Roth instead -- not gated
    'gross', 5000,
    null,           // Escape at the summary -> back to the amount
    5000,
    true,           // Withdraw
    null,           // back in Bank's main menu -> Done
  ]);
  await new RoomScene().handleBank(game, dialog);
  assert.equal(game.portfolio.k401Balance, 50000); // untouched -- the 401(k) path was declined
  assert.equal(game.portfolio.rothBalance, 15000); // 20000 - 5000
  assert.equal(game.portfolio.lastWithdrawal.account, 'roth');
});

test('Stock Broker: the main menu shows portfolio value with % change since the start of the game', async () => {
  const game = { portfolio: household({ stocksTotal: 10000, stocksCostBasis: 10000 }) };
  game.portfolio.stocksTotal = 12000; // simulated growth; initialStocksTotal is captured once at creation
  const dialog = new ScriptedDialog([null]); // Done immediately
  await new RoomScene().handleStockBroker(game, dialog, STANDARD);
  const menuText = dialog.calls.find(c => c.kind === 'menu').text;
  assert.match(menuText, /\$12,000/);
  assert.match(menuText, /\+20\.0% since start/);
});

test('Buy Stock: a specific ticker entered and priced manually mirrors Setup\'s ticker/price/growth-vol questions', async () => {
  const game = { portfolio: household({ cash: 100000 }) };
  const dialog = new ScriptedDialog([
    'TSLA',  // ticker
    false,   // look up online? No, enter manually
    250,     // manual price
    2000,    // amount to invest
    { growth: 8, vol: 20 }, // expected return model
    true,    // confirm Buy
  ]);
  await new RoomScene().handleBuySpecificStock(game, dialog);
  const holding = game.portfolio.stocksHoldings.find(h => h.ticker === 'TSLA');
  assert.equal(holding.value, 2000);
  assert.equal(holding.costBasis, 2000);
  assert.equal(holding.price, 250);
  assert.equal(holding.growth, .08);
  assert.equal(holding.volatility, .2);
  assert.equal(game.portfolio.cash, 98000);
});

test('Sell Stock: selecting a holding, overriding its price, and the linked $/% fields produce a tax-correct, unscaled-basis sale', async () => {
  const game = { portfolio: household({
    cash: 0, stocksTotal: 10000, stocksCostBasis: 5000,
    stocksHoldings: [{ ticker: 'AAPL', value: 10000, costBasis: 5000, shares: 100, price: 100, holdingPeriod: 'long' }],
  }) };
  const dialog = new ScriptedDialog([
    'AAPL',  // which holding
    120,     // override the $100 tracked price to $120
    { dollars: 5000, percent: 50 }, // linked $/% form: sell half the holding (at the tracked price)
    true,    // confirm the sale
  ]);
  await new RoomScene().handleSellStock(game, dialog, STANDARD);
  const holding = game.portfolio.stocksHoldings.find(h => h.ticker === 'AAPL');
  assert.equal(holding.value, 5000); // half the tracked value left, not rescaled by the price override
  assert.equal(holding.costBasis, 2500);
  const confirmText = dialog.calls.find(c => c.kind === 'confirm').text;
  assert.match(confirmText, /Sell \$6,000/); // credited at the overridden $120 price
  assert.match(confirmText, /Realized gain\/loss: \$3,500/);
});

test('Sell Stock: Back at the price-override step returns to holding choice, and Back on the $/% form returns to the price', async () => {
  const game = { portfolio: household({
    cash: 0, stocksTotal: 10000, stocksCostBasis: 5000,
    stocksHoldings: [
      { ticker: 'AAPL', value: 10000, costBasis: 5000, shares: 100, price: 100, holdingPeriod: 'long' },
      { ticker: 'MSFT', value: 4000, costBasis: 1000, shares: 20, price: 200, holdingPeriod: 'long' },
    ],
  }) };
  const dialog = new ScriptedDialog([
    'AAPL', null,              // price step -> Back to holding choice
    'AAPL', 100, null,         // $/% form -> Back to the price step
    100, { dollars: 2000, percent: 20 }, true,
  ]);
  await new RoomScene().handleSellStock(game, dialog, STANDARD);
  const menus = dialog.calls.filter(c => c.kind === 'menu').length;
  assert.equal(menus, 2); // holding choice re-asked once after Back
  const holding = game.portfolio.stocksHoldings.find(h => h.ticker === 'AAPL');
  assert.equal(holding.value, 8000);
});

test('Borrow / Loan: Escape at the HELOC summary goes back to the term question; explicit Cancel exits cleanly', async () => {
  const game = { portfolio: borrowerFixture() };
  const dialog = new ScriptedDialog([
    'heloc', 0, 20000, 8.5, 15,
    null,   // summary: Escape -> back to term
    12,     // term re-asked
    false,  // summary: explicit Cancel -> exit, nothing committed
  ]);
  await new RoomScene().handleBorrow(game, dialog);
  assert.equal(game.portfolio.otherLoans?.length || 0, 0);
  assert.equal(game.portfolio.cash, 10000); // unchanged
  const prompts = dialog.calls.filter(c => c.kind === 'prompt' && c.text.startsWith('Term')).length;
  assert.equal(prompts, 2);
});
