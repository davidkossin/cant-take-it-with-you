import test from 'node:test';
import assert from 'node:assert/strict';
import { SetupScene } from '../js/scenes/SetupScene.js';
import { RoomScene, transactionReason } from '../js/scenes/RoomScene.js';
import { Hud } from '../js/render/Hud.js';
import { Dialog, formatMoneyInput } from '../js/render/Dialog.js';
import { editFamilyIncome, editSpouseIdentity, editRetirementAccounts, householdSalary } from '../js/scenes/FamilyInputs.js';
import { projectOneYear } from '../js/finance/Engine.js';
import { household } from './fixtures.js';

function scriptedDialog(answers) {
  // Drive the actual Dialog conversion/parsing and option activation. Answers
  // for money fields are the dollars visible to the player, not stored values.
  return new class extends Dialog {
    seen = [];
    answer(kind, text, extra) {
      this.seen.push({ kind, text, ...extra });
      assert.ok(answers.length, `Missing answer for ${kind}: ${text}`);
      return answers.shift();
    }
    menu(text, options, opts) {
      const answer = this.answer('menu', text, { options, ...opts });
      const result = super.menu(text, options, opts);
      this.selected = options.findIndex(option => option.value === answer);
      assert.ok(this.selected >= 0, `Unknown menu choice ${answer}: ${text}`);
      this._activateSelected();
      return result;
    }
    palette(text, groups, opts) {
      // Answer: the back value, a hair id (other grids keep their default),
      // or { hairColor, shirtColor }.
      const answer = this.answer('palette', text, { groups, ...opts });
      const result = super.palette(text, groups, opts);
      if (answer === (opts?.backValue ?? null)) {
        this.close(this.paletteBack);
        return result;
      }
      const picks = typeof answer === 'string' ? { hairColor: answer } : answer;
      for (const [key, id] of Object.entries(picks)) {
        const group = this.palGroups.find(g => g.key === key);
        assert.ok(group, `Unknown palette group ${key}: ${text}`);
        group.chosen = group.colors.findIndex(c => c.id === id);
        assert.ok(group.chosen >= 0, `Unknown palette choice ${id}: ${text}`);
      }
      this.close(this._palValues());
      return result;
    }
    prompt(text, opts) {
      const answer = this.answer('prompt', text, { ...opts });
      const result = super.prompt(text, opts);
      if (answer == null) this.selected = 1;
      else this.promptValue = opts?.type === 'money' ? formatMoneyInput(answer) : String(answer);
      this._activateSelected();
      return result;
    }
    confirm(text, opts) {
      const answer = this.answer('confirm', text, { ...opts });
      const result = super.menu(text, [{ label: 'Yes', value: true }, { label: 'No', value: false }], opts);
      this.selected = answer === true ? 0 : 1;
      this._activateSelected();
      return result;
    }
    form(text, fields, opts) {
      const answer = this.answer('form', text, { fields, ...opts });
      const result = super.form(text, fields, opts);
      if (answer == null) this.selected = 1;
      else {
        for (const [key, value] of Object.entries(answer)) {
          const field = this.fields.find(f => f.key === key);
          assert.ok(field, `Unknown form field ${key}: ${text}`);
          field.value = field.type === 'money' ? formatMoneyInput(value) : String(value);
        }
      }
      this._activateSelected();
      return result;
    }
    multiSelect(text, options, opts) {
      const answer = this.answer('multi', text, { options, ...opts });
      const result = super.multiSelect(text, options, opts);
      if (answer == null) this.selected = this.options.length - 1;
      else {
        for (const value of answer) assert.ok(options.some(option => option.value === value), `Unknown account ${value}`);
        this.multiValues = new Set(answer);
        this.selected = this.options.length - 2;
      }
      this._activateSelected();
      return result;
    }
    show(text, opts) {
      this.seen.push({ kind: 'show', text, ...opts });
      const result = super.show(text, opts);
      this._activateSelected();
      return result;
    }
  }();
}

test('Custom Setup asks Family after Difficulty and keeps salaries/accounts personal', async () => {
  const dialog = scriptedDialog([
    'Ada', 2026, 40, 'dark', 'short', 'standard', 'married', { name: 'Ben', age: 35 }, 'blonde', 'long',
    1, 'Alex', 2, 'continue', '75001', 12000, { savings: 20000, rate: 2 },
    { salary: 150000, spouseSalary: 90000 }, { retirementAge: 70, spouseRetirementAge: 65 },
    ['k401', 'roth'], { balance: 100000, contrib: 8, match: 100, onFirst: 4, equity: 80 },
    { balance: 30000, contrib: 5000, basis: 22000, opened: 2020, equity: 75 },
    ['k401'], { balance: 70000, contrib: 6, match: 50, onFirst: 6, equity: 60 },
    'total', 100000, 80000, '2020-01-01', 'rent', 2000, 50000, 'go',
  ]);
  const setup = await new SetupScene().run(dialog, { mode: 'profile' });
  const difficulty = dialog.seen.findIndex(x => x.title === 'Difficulty');
  assert.equal(dialog.seen[difficulty + 1].title, 'Family');
  assert.ok(dialog.seen.findIndex(x => x.title === 'Zip Code') > difficulty + 1);
  const income = dialog.seen.find(x => x.kind === 'form' && x.fields[0].key === 'salary');
  assert.deepEqual(income.fields.map(f => f.label), ['Ada Annual Salary', 'Ben Annual Salary']);
  assert.equal(setup.spouseBirthYear, 1991);
  assert.equal(setup.spouseHairLength, 'long');
  assert.equal(setup.salary, 150000);
  assert.equal(setup.spouseSalary, 90000);
  assert.equal(setup.retirementAge, 70);
  assert.equal(setup.spouseRetirementAge, 65);
  assert.equal(setup.k401Balance, 100000);
  assert.equal(setup.spouseK401Balance, 70000);
  assert.equal(setup.rothContributionBasis, 22000);
  assert.equal(setup.salaryOwnershipConfirmed, true);
  assert.equal(householdSalary(setup), 240000);
});

test('Single-person setup omits spouse salary, retirement age and account forms', async () => {
  const dialog = scriptedDialog([
    'Ada', 2026, 40, 'dark', 'short', 'standard', 'single', 0, 'continue', '', 12000,
    { savings: 20000, rate: 2 }, { salary: 90000 }, { retirementAge: 65 }, [],
    'total', 100000, 80000, '2020-01-01', 'rent', 2000, 40000, 'go',
  ]);
  const setup = await new SetupScene().run(dialog, { mode: 'profile' });
  assert.equal(setup.married, false);
  const income = dialog.seen.find(x => x.kind === 'form' && x.fields[0].key === 'salary');
  assert.deepEqual(income.fields.map(f => f.key), ['salary']);
  const ages = dialog.seen.find(x => x.kind === 'form' && x.fields[0].key === 'retirementAge');
  assert.deepEqual(ages.fields.map(f => f.key), ['retirementAge']);
  assert.equal(dialog.seen.filter(x => x.kind === 'multi').length, 1);
});

test('Legacy married salary is visibly flagged and ownership is confirmed by the form', async () => {
  const p = household({ married: true, playerName: 'Ada', spouseName: 'Ben', salary: 240000, salaryOwnershipConfirmed: false });
  const dialog = scriptedDialog([{ salary: 150000, spouseSalary: 90000 }]);
  await editFamilyIncome(p, dialog);
  assert.match(dialog.seen[0].text, /household total/);
  assert.equal(p.salaryOwnershipConfirmed, true);
  assert.equal(householdSalary(p), 240000);
});

test('Cancelling legacy salary confirmation leaves the original amounts unresolved', async () => {
  const p = household({ married: true, salary: 240000, spouseSalary: 0, salaryOwnershipConfirmed: false });
  const before = structuredClone(p);
  assert.equal(await editFamilyIncome(p, scriptedDialog([null])), false);
  assert.deepEqual(p, before);
});

test('Unknown spouse age is blank and an invalid age cannot silently use the player age', async () => {
  const p = { playerName: 'Ada', age: 65, year: 2026 };
  const dialog = scriptedDialog([{ name: 'Ben', age: 0 }, { name: 'Ben', age: 55 }, 'dark', 'short']);
  assert.equal(await editSpouseIdentity(p, dialog), true);
  assert.equal(dialog.seen[0].fields[1].defaultValue, '');
  assert.equal(p.spouseAge, 55);
  assert.equal(p.spouseBirthYear, 1971);
});

test('Spouse account form never changes the primary retirement balance', async () => {
  const p = household({ married: true, k401Balance: 90000, spouseK401Balance: 25000 });
  await editRetirementAccounts(p, scriptedDialog([['k401'], { balance: 30000, contrib: 10, match: 100, onFirst: 3, equity: 80 }]), { owner: 'spouse' });
  assert.equal(p.k401Balance, 90000);
  assert.equal(p.spouseK401Balance, 30000);
  assert.equal(p.spouseK401ContribRate, .1);
  assert.equal(p.spouseK401Allocation.equity, .8);
  assert.ok(Math.abs(p.spouseK401Allocation.bond - .2) < 1e-12);
});

test('Cancelling marriage leaves household finances and filing status unchanged', async () => {
  const p = household({ playerName: 'Ada' });
  const game = { portfolio: p };
  const before = structuredClone(p);
  await new RoomScene().handleTeller(game, scriptedDialog(['marry', { name: 'Ben', age: 35 }, 'dark', 'short', null]), 'kid');
  assert.deepEqual(game.portfolio, before);
});

test('Marriage collects spouse financial context and the next year uses that person’s age and salary', async () => {
  const game = { portfolio: household({ playerName: 'Ada', age: 65, k401Balance: 50000 }) };
  const dialog = scriptedDialog(['marry', { name: 'Ben', age: 55 }, 'red', 'short',
    { salary: 0, spouseSalary: 50000 }, { retirementAge: 65, spouseRetirementAge: 65 },
    ['k401'], { balance: 100000, contrib: 10, match: 100, onFirst: 3, equity: 80 }]);
  await new RoomScene().handleTeller(game, dialog, 'kid');
  assert.equal(game.portfolio.married, true);
  assert.equal(game.portfolio.filingStatus, 'married');
  assert.equal(game.portfolio.k401Balance, 50000);
  assert.equal(game.portfolio.spouseK401Balance, 100000);
  const next = projectOneYear(game.portfolio, 'standard', { economy: { equity: 0, bond: 0, inflation: 0, home: 0, salary: 0 } }).state;
  assert.equal(next.lastStatement.income.spouseWages, 50000);
  assert.equal(next.spouseAge, 56);
  assert.equal(next.age, 66);
});

test('Family child care instruction uses entry dollars and stops after the chosen years', async () => {
  const game = { portfolio: household({ year: 2040, priceIndex: 2, cash: 100000 }) };
  await new RoomScene().handleTeller(game, scriptedDialog(['care', 'nanny', { annualCost: 12000, years: 2 }]), 'kid');
  const plan = game.portfolio.childcarePlans[0];
  assert.equal(plan.entryPriceIndex, 2);
  assert.equal(plan.endYearExclusive, 2042);
  const options = { economy: { equity: 0, bond: 0, inflation: 0, home: 0, salary: 0 } };
  let s = projectOneYear(game.portfolio, 'standard', options).state;
  assert.equal(plan.annualCost, 24000);
  assert.equal(s.lastStatement.expenses.childcare, 24000);
  s = projectOneYear(s, 'standard', options).state;
  assert.equal(s.lastStatement.expenses.childcare, 24000);
  s = projectOneYear(s, 'standard', options).state;
  assert.equal(s.lastStatement.expenses.childcare, undefined);
});

test('Bank net target withdraws from the selected spouse account and reserves tax', async () => {
  const game = { portfolio: household({ married: true, spouseName: 'Ben', spouseAge: 65, cash: 0, spouseK401Balance: 100000 }) };
  const dialog = scriptedDialog(['withdraw', 'spouse:traditional', 'net', 40000, true, null]);
  await new RoomScene().handleTeller(game, dialog, 'bank');
  assert.ok(game.portfolio.cash >= 40000);
  assert.equal(game.portfolio.k401Balance, 0);
  assert.ok(game.portfolio.spouseK401Balance < 60000);
  assert.ok(game.portfolio.lastWithdrawal.withheld > 0);
  assert.ok(dialog.seen.some(x => x.kind === 'confirm' && /Estimated additional tax/.test(x.text)));
});

test('Bank net targets and savings transfers honor future-room dollar units', async () => {
  const results = [];
  for (const inflationAdjusted of [true, false]) {
    const game = { portfolio: household({ year: 2040, dollarBaseYear: 2026, priceIndex: 2,
      inflationAdjusted, age: 65, spouseAge: 65, married: true, cash: 0, savings: 10000, spouseK401Balance: 100000 }) };
    const input = inflationAdjusted ? 20000 : 40000;
    await new RoomScene().handleTeller(game, scriptedDialog(['withdraw', 'spouse:traditional', 'net', input, true,
      'toCash', inflationAdjusted ? 5000 : 10000, null]), 'bank');
    assert.ok(game.portfolio.cash >= 50000);
    assert.equal(game.portfolio.savings, 0);
    results.push({ cash: game.portfolio.cash, retirement: game.portfolio.spouseK401Balance,
      tax: game.portfolio.lastWithdrawal.withheld });
  }
  assert.deepEqual(results[0], results[1]);
});

test('Rejected room purchases show needed and available Cash in the selected dollar units', async () => {
  for (const inflationAdjusted of [true, false]) {
    const game = { portfolio: household({ year: 2040, dollarBaseYear: 2026, priceIndex: 2,
      inflationAdjusted, cash: 10000 }) };
    const dialog = scriptedDialog(['buy', 'market', inflationAdjusted ? 12000 : 24000, null]);
    await new RoomScene().handleTeller(game, dialog, 'stock');
    assert.equal(game.portfolio.cash, 10000);
    assert.equal(game.portfolio.stocksTotal, 0);
    const message = dialog.seen.find(x => x.kind === 'show').text;
    assert.match(message, inflationAdjusted ? /Needs \$12,000; Cash is \$5,000/ : /Needs \$24,000; Cash is \$10,000/);
  }
});

test('Retirement and savings rejection metadata use the same room currency renderer', () => {
  const p = { priceIndex: 2, inflationAdjusted: true };
  assert.match(transactionReason({ reasonCode: 'insufficient-account-balance', available: 10000, source: 'savings' }, p), /\$5,000.*Savings/);
  assert.match(transactionReason({ reasonCode: 'insufficient-retirement-balance', available: 30000 }, p), /\$15,000/);
  assert.match(transactionReason({ reasonCode: 'insufficient-retirement-net', maximumNetCash: 24000 }, p), /\$12,000 after estimated tax/);
});

test('HUD puts spouse before children in a larger font and sums employed household salaries', () => {
  const originalDocument = globalThis.document;
  const noop = () => {};
  const spriteContext = new Proxy({}, { get: (target, name) => target[name] ?? noop });
  globalThis.document = { createElement: () => ({ getContext: () => spriteContext }) };
  const drawn = [];
  const ctx = { drawImage: noop, fillRect: noop, measureText: text => ({ width: text.length * 12 }),
    fillText(text, x, y) { drawn.push({ text, x, y, font: this.font }); } };
  try {
    const p = household({ married: true, spouseName: 'Ben', spouseAge: 35, salary: 150000, employed: true,
      spouseSalary: 90000, spouseEmployed: true, kids: [{ name: 'Alex', age: 2 }], priceIndex: 2, inflationAdjusted: true });
    new Hud().draw(ctx, p);
    assert.ok(drawn.some(x => x.text === '$120,000'));
    const spouse = drawn.find(x => x.text === 'Ben 35'), child = drawn.find(x => x.text === 'Alex 2');
    assert.ok(spouse.x < child.x);
    assert.match(spouse.font, /^18px/);
    assert.match(child.font, /^14px/);
  } finally { globalThis.document = originalDocument; }
});

test('Displayed household salary uses each person’s retirement age immediately', () => {
  const p = household({ age: 65, salary: 150000, retirementAge: 65, employed: true, married: true,
    spouseAge: 55, spouseSalary: 90000, spouseRetirementAge: 65, spouseEmployed: true });
  assert.equal(householdSalary(p), 90000);
  assert.equal(householdSalary({ ...p, spouseAge: 65 }), 0);
});

test('Restarting work after planned retirement collects a new retirement age for each owner', async () => {
  for (const owner of ['primary','spouse']) {
    const game={portfolio:household({age:70,retired:true,employed:false,married:owner==='spouse',
      spouseAge:70,spouseRetired:true,spouseEmployed:false})};
    const dialog=scriptedDialog([...(owner==='spouse'?['spouse']:[]),'start',50000,false,75]);
    await new RoomScene().handleTeller(game,dialog,'job');
    const result=projectOneYear(game.portfolio,'standard',{economy:{equity:0,bond:0,inflation:0,home:0,salary:0}});
    assert.equal(result.statement.income[owner==='spouse'?'spouseWages':'wages'],50000);
    assert.equal(game.portfolio[owner==='spouse'?'spouseRetirementAge':'retirementAge'],75);
  }
});

test('Cancelling the new job retirement date leaves employment and salaries unchanged', async () => {
  const game={portfolio:household({age:70,retired:true,employed:false})};
  const before=structuredClone(game.portfolio);
  await new RoomScene().handleTeller(game,scriptedDialog(['start',50000,false,null]),'job');
  assert.deepEqual(game.portfolio,before);
});
