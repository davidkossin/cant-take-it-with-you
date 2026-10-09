import test from 'node:test';
import assert from 'node:assert/strict';
import { household } from './fixtures.js';
import { annualChildCost, projectOneYear } from '../js/finance/Engine.js';
import { STATE_CHILD_COST, AVERAGE_CHILD_COST, annualChildCostForZip, childCostLabel, childCostInfoForZip }
  from '../js/data/stateChildCosts.js';
import { stateCodeFromZip, stateFromZip } from '../js/data/state-from-zip.js';

test('state child cost table has 50 states and a rounded 50-state fallback average', () => {
  const values = Object.values(STATE_CHILD_COST);
  assert.equal(values.length, 50);
  assert.equal(AVERAGE_CHILD_COST, Math.round(values.reduce((a, b) => a + b, 0) / 50));
  assert.equal(AVERAGE_CHILD_COST, 23673);
});

test('stateCodeFromZip maps 3-digit ZIP prefixes to states, DC, territories and military', () => {
  for (const [zip, code] of [['02108', 'MA'], ['05501', 'MA'], ['00501', 'NY'], ['06103', 'CT'],
    ['10001', 'NY'], ['20001', 'DC'], ['20101', 'VA'], ['22201', 'VA'], ['39201', 'MS'], ['39901', 'GA'],
    ['73301', 'TX'], ['88510', 'TX'], ['79901', 'TX'], ['85001', 'AZ'], ['90045', 'CA'], ['96813', 'HI'],
    ['96910', 'GU'], ['99501', 'AK'], ['83702', 'ID'], ['84101', 'UT'], ['59001', 'MT'], ['82001', 'WY'],
    ['57501', 'SD'], ['58501', 'ND'], ['03301', 'NH'], ['04101', 'ME'], ['05601', 'VT'], ['19901', 'DE'],
    ['21201', 'MD'], ['72201', 'AR'], ['70112', 'LA'], ['63101', 'MO'], ['66101', 'KS'], ['68102', 'NE'],
    ['50309', 'IA'], ['87501', 'NM'], ['89501', 'NV'], ['97201', 'OR'], ['98101', 'WA'], ['01103', 'MA'],
    ['56501', 'MN'], ['56721', 'MN'], ['56901', 'DC'], ['00901', 'PR'], ['00801', 'VI'], ['09001', 'AE'],
    ['09901', 'AE'], ['34001', 'AA'], ['96201', 'AP'], ['85001-1234', 'AZ'], ['850011234', 'AZ']])
    assert.equal(stateCodeFromZip(zip), code, zip);
  // Blank, malformed, and prefixes with no ZIP codes.
  for (const zip of ['', null, undefined, 'abc', '123', '00100', '00401', '21301', '34301', '42801', '69401',
    '71501', '83901', '88601', '98701'])
    assert.equal(stateCodeFromZip(zip), null, String(zip));
});

test('taxes and child costs share one ZIP lookup', () => {
  for (const zip of ['02108', '05501', '00501', '20101', '39901', '73301', '88510', '20001', '00901', '34001', '21301'])
    assert.equal(childCostInfoForZip(zip).code, stateCodeFromZip(zip), zip);
  assert.equal(stateFromZip('05501').abbr, 'MA');
  assert.equal(stateFromZip('39901').abbr, 'GA');
  assert.equal(stateFromZip('88510').abbr, 'TX');
  assert.equal(stateFromZip('73301').stateIncomeTaxApprox, 0);
  const dc = stateFromZip('20001');
  assert.equal(dc.abbr, 'DC');
  assert.equal(dc.stateIncomeTaxApprox, 0.085);
  assert.equal(stateFromZip('34001').abbr, 'AA');
  assert.equal(stateFromZip('34001').stateIncomeTaxApprox, 0.05);
  assert.equal(stateFromZip('85001-1234').abbr, 'AZ');
  assert.equal(stateFromZip('21301').abbr, 'XX');
  assert.equal(stateFromZip('').abbr, 'US');
  assert.equal(stateFromZip('123').unknown, true);
});

test('annualChildCostForZip uses the state figure and falls back to the 50-state average', () => {
  assert.equal(annualChildCostForZip('02108'), 35841);
  assert.equal(annualChildCostForZip('90045'), 29468);
  assert.equal(annualChildCostForZip('39201'), 16151);
  for (const zip of ['20001', '00901', '00801', '96910', '09001', '96201', '21301', '', 'nope']) assert.equal(annualChildCostForZip(zip), AVERAGE_CHILD_COST, zip);
  assert.equal(childCostLabel('85001'), "Arizona's average of $24,026/year");
  assert.equal(childCostLabel(''), 'the 50-state average of $23,673/year');
});

test('engine child cost is flat for ages 0–17 by ZIP, inflated by priceIndex, zero at 18+', () => {
  for (const age of [0, 5, 12, 17]) assert.equal(annualChildCost(age, {}, 1, '85001'), 24026);
  assert.equal(annualChildCost(3, {}, 2, '39201'), 32302);
  assert.equal(annualChildCost(3, {}, 1, ''), AVERAGE_CHILD_COST);
  assert.equal(annualChildCost(18, {}, 1, '02108'), 0);
  const base = { cash: 1e6, salary: 0, annualSpending: 0, kids: [{ name: 'Alex', age: 4 }] };
  const ma = projectOneYear(household({ ...base, zip: '02108' }), 'standard', { deterministic: true });
  const ms = projectOneYear(household({ ...base, zip: '39201' }), 'standard', { deterministic: true });
  assert.ok(ma.statement.expenses.children > ms.statement.expenses.children);
});
