import test from 'node:test';
import assert from 'node:assert/strict';
import { household } from './fixtures.js';
import { createDefaultSetup, createGameFromSetup, createStandardPortfolioSetup } from '../js/state/GameState.js';
import { RoomScene } from '../js/scenes/RoomScene.js';
import { computeWorth } from '../js/finance/Engine.js';

/** Scripted dialog: answers queued in order; records every menu/form shown. */
function scriptedDialog(answers) {
  const seen = [];
  const next = (kind, text, extra) => { seen.push({ kind, text, ...extra }); return Promise.resolve(answers.shift() ?? null); };
  return {
    seen, active: false,
    menu: (text, options, opts) => next('menu', text, { options, title: opts?.title }),
    prompt: (text, opts) => next('prompt', text, { title: opts?.title }),
    confirm: (text, opts) => next('confirm', text, { title: opts?.title }),
    form: (text, fields, opts) => next('form', text, { fields, title: opts?.title }),
    show: (text, opts) => { seen.push({ kind: 'show', text, title: opts?.title }); return Promise.resolve(true); },
  };
}
function game(overrides) {
  return createGameFromSetup({ ...createDefaultSetup(), ...household(overrides) });
}

test('Bank teller moves Savings to Cash as an explicit player action', async () => {
  const g = game({ cash: 1000, savings: 5000 }), before = computeWorth(g.portfolio).netWorth;
  const dialog = scriptedDialog(['toCash', 3000, null]);
  await new RoomScene().handleTeller(g, dialog, 'bank');
  assert.equal(g.portfolio.cash, 4000);
  assert.equal(g.portfolio.savings, 2000);
  assert.equal(computeWorth(g.portfolio).netWorth, before);
  assert.ok(dialog.seen.some(s => s.kind === 'show' && /Savings to Cash/.test(s.text)));
});

test('Bank teller one-time 401(k) withdrawal asks before an early penalty', async () => {
  const g = game({ age: 40, cash: 0, k401Balance: 50000 });
  const declined = scriptedDialog(['withdraw', 'traditional', false, null]);
  await new RoomScene().handleTeller(g, declined, 'bank');
  assert.equal(g.portfolio.k401Balance, 50000);
  const accepted = scriptedDialog(['withdraw', 'traditional', true, 'gross', 10000, true, null]);
  await new RoomScene().handleTeller(g, accepted, 'bank');
  assert.equal(g.portfolio.cash, 9000);
  assert.equal(g.portfolio.k401Balance, 40000);
  assert.equal(g.portfolio.taxRecord.penalties, 1000);
  assert.equal(g.portfolio.taxRecord.taxPaid, 1000);
});

test('Bank teller sets and stops a standing yearly withdrawal', async () => {
  const g = game({ age: 66, cash: 0, k401Balance: 300000 });
  await new RoomScene().handleTeller(g, scriptedDialog(['plan', 'traditional', 30000, null]), 'bank');
  assert.deepEqual(g.portfolio.retirementWithdrawalPlan, { amount: 30000, account: 'traditional', early: false, inflationAdjusted: true });
  await new RoomScene().handleTeller(g, scriptedDialog(['plan', 'stop', null]), 'bank');
  assert.equal(g.portfolio.retirementWithdrawalPlan, undefined);
});

test('Portfolio teller locks balances during play but keeps income, spending and setup editable', async () => {
  const g = game({ cash: 1000, savings: 5000, k401Balance: 7000 });
  const dialog = scriptedDialog([null]);
  await new RoomScene().handleTeller(g, dialog, 'portfolio');
  const labels = dialog.seen[0].options.map(o => o.label).join(' | ');
  assert.doesNotMatch(labels, /Cash \(checking\)|Stocks total|Savings \/ rate|401\(k\) \/ Roth\b(?! contributions)/);
  for (const keep of ['Salary', 'Annual spending', 'Retirement age', 'Planning inputs / benefits', '401(k) / Roth contributions'])
    assert.ok(labels.includes(keep), keep);
  const form = scriptedDialog(['retire', 'fixed', { kRate: 10, rothC: 0 }, null]);
  await new RoomScene().handleTeller(g, form, 'portfolio');
  const fields = form.seen.find(s => s.kind === 'form').fields.map(f => f.key);
  assert.deepEqual(fields, ['kRate', 'rothC']);
  assert.equal(g.portfolio.k401Balance, 7000);
  assert.equal(g.portfolio.k401ContribRate, .1);
});

test("Portfolio teller sets 'Rise with limit' Roth contributions for player and spouse", async () => {
  const g = game({ married: true, spouseAge: 50, salary: 80000, spouseSalary: 60000, rothAnnualContribution: 1000 });
  const dialog = scriptedDialog(['retire', 'max', 'max', { kRate: 10, spouseKRate: 5 }, null]);
  await new RoomScene().handleTeller(g, dialog, 'portfolio');
  const menus = dialog.seen.filter(s => s.kind === 'menu' && s.options.some(o => o.value === 'max'));
  assert.equal(menus.length, 2);
  assert.ok(menus[1].options[1].label.startsWith('Rise with limit'));
  assert.deepEqual(dialog.seen.find(s => s.kind === 'form').fields.map(f => f.key), ['kRate', 'spouseKRate']);
  const p = g.portfolio;
  assert.equal(p.rothContributionMode, 'max'); assert.equal(p.spouseRothContributionMode, 'max');
  assert.equal(p.hasRoth, true); assert.equal(p.spouseHasRoth, true);
  assert.equal(p.rothAnnualContribution, 1000); // the fixed amount is kept for switching back
  const back = scriptedDialog(['retire', 'fixed', 'fixed', { kRate: 10, rothC: 2500, spouseKRate: 5, spouseRothC: 0 }, null]);
  await new RoomScene().handleTeller(g, back, 'portfolio');
  assert.equal(p.rothContributionMode, 'fixed'); assert.equal(p.rothAnnualContribution, 2500);
  assert.equal(p.spouseRothContributionMode, 'fixed');
});

test('Starman starts with $155k Cash; everything else is unchanged', () => {
  const s = createStandardPortfolioSetup();
  assert.equal(s.cash, 155000);
  assert.equal(s.savings, 35000); assert.equal(s.stocksTotal, 85000); assert.equal(s.k401Balance, 62000);
  assert.equal(s.salary, 80000); assert.equal(s.annualSpending, 48000);
  assert.equal(computeWorth(createGameFromSetup(s).portfolio).netWorth, 447000);
});
