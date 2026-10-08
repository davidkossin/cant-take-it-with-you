/** Deterministic household tax calculation and transaction previews.
 * IRS rules: js/data/tax-brackets.js. Unsupported features are returned as warnings.
 */
import { getFederalTable } from '../data/tax-brackets.js';
import { stateFromZip } from '../data/state-from-zip.js';
import { emptyIncome, money, nonnegative, copy } from './Books.js';
import { rothLimit } from './Retirement.js';
import { incomeSchedule } from './IncomeSchedule.js';
import { ownerState } from './Household.js';
import { projectOneYear } from './Engine.js';

export function federalTaxOn(taxable, table) {
  let tax = 0, previous = 0;
  for (const b of table.brackets) {
    const cap = b.upTo ?? Infinity;
    tax += Math.max(0, Math.min(taxable, cap) - previous) * b.rate;
    if (taxable <= cap) break;
    previous = cap;
  }
  return money(tax);
}
export function filingStatus(state) {
  return state.filingStatus === 'married' || state.married ? 'married' : 'single';
}
export function employee401kDeferral(state, owner='primary') {
  return incomeSchedule(state).annual[owner==='spouse'?'spouseDeferral':'deferral'];
}
export function employer401kMatch(state, deferral, owner='primary') {
  return money(incomeSchedule(state).months.reduce((sum,row)=>sum+(row[owner]?.match || 0),0));
}
export function rothAnnualContribution(state, magi = nonnegative(state.salary) + nonnegative(state.spouseSalary)) {
  if (state.hasRoth === false) return 0;
  const cap = rothLimit(state.year, state.age, magi, filingStatus(state) === 'married',
    nonnegative(state.salary) + nonnegative(state.spouseSalary), state.taxInflation ?? .025);
  return money(Math.min(nonnegative(state.rothAnnualContribution), cap));
}
export function taxableSocialSecurity(benefit, otherIncome, married, exemptInterest = 0) {
  const provisional = otherIncome + exemptInterest + benefit / 2;
  const lower = married ? 32000 : 25000, upper = married ? 44000 : 34000;
  if (provisional <= lower) return 0;
  if (provisional <= upper) return Math.min(benefit / 2, (provisional - lower) / 2);
  return Math.min(benefit * .85, .85 * (provisional - upper) + Math.min(benefit / 2, (upper - lower) / 2));
}
export function capitalNet(shortGains, longGains, carry = {}) {
  let short = shortGains - nonnegative(carry.short), long = longGains - nonnegative(carry.long);
  if (short < 0 && long > 0) { const used = Math.min(-short, long); short += used; long -= used; }
  if (long < 0 && short > 0) { const used = Math.min(-long, short); long += used; short -= used; }
  let deduction = Math.min(3000, Math.max(0, -short - long));
  const lossDeduction = deduction;
  if (short < 0) { const used = Math.min(-short, deduction); short += used; deduction -= used; }
  if (long < 0) long += Math.min(-long, deduction);
  return { ordinary: Math.max(0, short) - lossDeduction, preferred: Math.max(0, long),
    carry: { short: Math.max(0, -short), long: Math.max(0, -long) }, lossDeduction };
}
export function preferredTax(amount, ordinary, caps) {
  const zero = Math.min(amount, Math.max(0, caps[0] - ordinary));
  const fifteen = Math.min(amount - zero, Math.max(0, caps[1] - Math.max(ordinary, caps[0])));
  return money(fifteen * .15 + Math.max(0, amount - zero - fifteen) * .20);
}
export function payrollTax(wages, spouseWages, married, wageBase) {
  return money(.062 * (Math.min(wageBase, wages) + Math.min(wageBase, spouseWages))
    + .0145 * (wages + spouseWages) + .009 * Math.max(0, wages + spouseWages - (married ? 250000 : 200000)));
}
const NO_INCOME_TAX = new Set(['AK','FL','NV','SD','TN','TX','WY','NH']);
export function stateTaxOn(state, agi, taxableSS, table) {
  const zipInfo = stateFromZip(state.zip);
  const abbr = state.taxState || zipInfo.abbr;
  const married = filingStatus(state) === 'married';
  if (NO_INCOME_TAX.has(abbr)) return { tax: 0, abbr, approximate: false, zipInfo };
  if (abbr === 'AZ') return { tax: money(.025 * Math.max(0, agi - taxableSS - table.stdDeduction)),
    abbr, approximate: true, zipInfo, note: 'AZ core rate/deduction; credits and adjustments excluded' };
  if (abbr === 'CA') {
    const f = (1 + (state.taxInflation ?? .025)) ** (state.year - 2025);
    const caps = married ? [22158,52528,82904,115084,145448,742958,891542,1485906]
      : [11079,26264,41452,57542,72724,371479,445771,742953];
    const rates = [.01,.02,.04,.06,.08,.093,.103,.113,.123];
    const taxable = Math.max(0, agi - taxableSS - (married ? 11412 : 5706) * f);
    const tax = federalTaxOn(taxable, { brackets: [...caps, null].map((n,i) =>
      ({ upTo: n == null ? null : n * f, rate: rates[i] })) }) + .01 * Math.max(0, taxable - 1000000);
    return { tax: money(tax), abbr, approximate: true, zipInfo,
      note: 'CA 2025 brackets/deduction projected; credits and state-specific adjustments excluded' };
  }
  const rate = state.stateTaxRateOverride ?? zipInfo.stateIncomeTaxApprox;
  return { tax: money(Math.max(0, agi) * rate), abbr, approximate: true, zipInfo,
    note: abbr === 'WA' ? 'WA capital gains tax is not implemented' : 'State tax is an explicit flat-rate approximation' };
}
export function projectedIncome(state) {
  // Every Engine tax calculation receives an explicit record, so this reference
  // pass cannot recurse into projectedIncome. It shares all income sources,
  // including interest, dividends, rental receipts and cash-dependent deductions.
  const result=projectOneYear(state,state.difficulty,{compact:true,randomVariation:false});
  const record={...result.statement.income};
  record.traditionalWithdrawals=money(record.traditionalWithdrawals+nonnegative(state._extraOrdinaryIncome));
  return record;
}
export function estimateAnnualTax(state, difficulty = {}, record = null) {
  const r = { ...emptyIncome(state.year), ...(record || projectedIncome(state)) };
  const married = filingStatus(state) === 'married';
  const table = getFederalTable(r.year, state.taxInflation ?? .025, married);
  const capital = capitalNet(r.shortGains, r.longGains, state.capitalLossCarry);
  const qualified = Math.max(0, r.qualifiedDividends + capital.preferred);
  const ordinaryBeforeSS = r.wages + r.spouseWages - r.deferral - r.spouseDeferral
    + r.interest + r.ordinaryDividends + r.traditionalWithdrawals + r.rentalIncome + capital.ordinary;
  const taxableSS = taxableSocialSecurity(r.socialSecurity, ordinaryBeforeSS + qualified, married, r.taxExemptInterest || 0);
  const agi = Math.max(0, ordinaryBeforeSS + qualified + taxableSS);
  const stateInfo = stateTaxOn({ ...state, year: r.year }, agi, taxableSS, table);
  const seniors = (state.age >= 65 ? 1 : 0) + (married && state.spouseAge >= 65 ? 1 : 0);
  const standard = table.stdDeduction + seniors * (married ? (r.year <= 2025 ? 1600 : 1650) : (r.year <= 2025 ? 2000 : 2050))
    * (1 + (state.taxInflation ?? .025)) ** Math.max(0, r.year - 2026);
  // Optional itemized amount is explicitly user-supplied; not inferred from all housing spending.
  const deduction = Math.max(standard, nonnegative(state.itemizedDeduction));
  const seniorExtra = r.year >= 2025 && r.year <= 2028 ? seniors * Math.max(0,6000-.06*Math.max(0,agi-(married?150000:75000))) : 0;
  const taxable = Math.max(0, agi - deduction - seniorExtra);
  const preferred = Math.min(qualified, taxable);
  const ordinary = taxable - preferred;
  const regular = federalTaxOn(ordinary, table) + preferredTax(preferred, ordinary, table.gains);
  // Core AMT for wages/investment income. ISO preferences, credits and itemized adjustments require external input.
  const f = (1 + (state.taxInflation ?? .025)) ** Math.max(0, r.year - 2026);
  const exemption = Math.max(0, (r.year <= 2025 ? (married ? 137000 : 88100) : (married ? 140200 : 90100)) * f
    - (r.year >= 2026 ? .5 : .25) * Math.max(0, agi + nonnegative(state.amtPreferenceIncome) - (r.year <= 2025 ? (married ? 1252700 : 626350) : (married ? 1000000 : 500000)) * f));
  const amtIncome = Math.max(0, agi + nonnegative(state.amtPreferenceIncome)
    - nonnegative(state.amtDeduction) - exemption);
  const amtPref = Math.min(qualified, amtIncome), amtOrdinary = amtIncome - amtPref;
  const amtTentative = .26 * Math.min((r.year <= 2025 ? 239100 : 244500) * f, amtOrdinary)
    + .28 * Math.max(0, amtOrdinary - (r.year <= 2025 ? 239100 : 244500) * f) + preferredTax(amtPref, amtOrdinary, table.gains);
  const amt = money(Math.max(0, amtTentative - regular));
  const investment = Math.max(0, r.interest + r.ordinaryDividends + r.qualifiedDividends
    + Math.max(0, capital.ordinary) + capital.preferred + Math.max(0, r.rentalIncome));
  const niit = money(.038 * Math.min(investment, Math.max(0, agi - (married ? 250000 : 200000))));
  const eligibleChildren = (state.kids || []).filter(k => k.age < 17 && k.taxDependent !== false).length;
  const ctc = Math.max(0, eligibleChildren * Math.floor(2200*f/100)*100 - Math.ceil(Math.max(0, agi - (married ? 400000 : 200000)) / 1000) * 50);
  const federal = money(Math.max(0, regular + amt - ctc));
  const payroll = payrollTax(r.wages, r.spouseWages, married, table.wageBase);
  let property = 0;
  for (const h of state.homes || []) property += h.annualPropertyTax != null
    ? nonnegative(h.annualPropertyTax) : nonnegative(h.assessedValue, h.value) * nonnegative(h.propertyTaxRate, .01);
  const warnings = [];
  for (const owner of ['primary','spouse']) {
    if (owner === 'spouse' && !married) continue;
    const p=ownerState(state,owner),prefix=owner==='spouse'?'Spouse: ':'';
    if (state.year >= 2026 && p.age >= 50 && (p.priorYearWages ?? p.salary) > 150000)
      warnings.push(prefix+'High-income Roth 401(k) catch-up excluded; regular pre-tax contribution limit used');
    if (p.employed && p.socialSecurityClaimAge < 67)
      warnings.push(prefix+'SSA earnings test uses annual limits; verify first-year rules and later benefit adjustment');
    if (p.socialSecurityClaimAge && p.birthYear < 1943)
      warnings.push(prefix+'Older-cohort delayed retirement credits require verification');
  }
  if (table.projected) warnings.push('Future/historical tax thresholds are projections');
  if (stateInfo.approximate) warnings.push(stateInfo.note);
  if (married && (state.spouseSalary == null || state.salaryOwnershipConfirmed === false)) warnings.push('Household wage ownership is not confirmed');
  if (married && state.spouseAge == null) warnings.push('Spouse age is unknown; confirm it to model retirement and account access');
  if (state.itemizedDeduction > 0 || state.amtPreferenceIncome > 0) warnings.push('Verify itemized/AMT adjustments externally');
  return { federal, state: stateInfo.tax, payroll, niit, amt, penalties: money(r.penalties),
    property: money(property), total: money(federal + stateInfo.tax + payroll + niit + r.penalties),
    meta: { agi, taxable, taxableSS, qualified, seniorExtra, stdDeduction: money(standard), filing: table.filing,
      zipInfo: { ...stateInfo.zipInfo, abbr: stateInfo.abbr }, k401Deferral: r.deferral,
      lossCarry: capital.carry, ruleVersion: table.ruleVersion, projected: table.projected, warnings,
      source: stateInfo.approximate ? 'state-approximation' : 'published-core-rules' } };
}
export function estimateCapitalGainsTax({ gains = 0, shortGains, longGains, yearsHeld, state, afterState = null, difficulty = {} }) {
  const before = projectedIncome(state);
  const st = shortGains ?? (yearsHeld < 1 ? gains : 0);
  const lt = longGains ?? (yearsHeld >= 1 ? gains : 0);
  const after = afterState ? projectedIncome(afterState) : copy(before);
  if (!afterState) { after.shortGains += st || 0; after.longGains += lt || 0; }
  const base = estimateAnnualTax(state, difficulty, before);
  const withGains = estimateAnnualTax(state, difficulty, after);
  const federal = money(withGains.federal - base.federal);
  const stateTax = money(withGains.state - base.state);
  const niit = money(withGains.niit - base.niit);
  return { federal, state: stateTax, niit, total: money(federal + stateTax + niit),
    longTerm: !st, rateNote: 'Estimated annual gain stacking + state + NIIT', stateAbbr: withGains.meta.zipInfo.abbr };
}
export function estimateTaxOnExtraIncome(state, difficulty, extraIncome) {
  const base = estimateAnnualTax(state, difficulty);
  const withExtra = estimateAnnualTax({ ...state, _extraOrdinaryIncome:
    nonnegative(state._extraOrdinaryIncome) + extraIncome }, difficulty);
  return { federal: money(withExtra.federal - base.federal), state: money(withExtra.state - base.state),
    total: money(withExtra.total - base.total) };
}
export async function fetchLiveTaxHint() { return null; }
