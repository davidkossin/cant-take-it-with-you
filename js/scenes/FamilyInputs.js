/** Shared household questions for Custom Setup and the Family/Portfolio tellers. */
import { ownerAge, ownerWorking } from '../finance/Household.js';
import { HAIR_PALETTE, SHIRT_PALETTE, normalizeHairColor, normalizeShirtColor } from '../config.js';
import { contributionLimits, rothContributionMode } from '../finance/Retirement.js';
import { formatMoneyDisplay } from '../finance/DollarBasis.js';

export function personName(p, owner = 'primary') {
  return owner === 'spouse' ? p.spouseName || 'Spouse' : p.playerName || 'You';
}

export function householdSalary(p) {
  const primary = ownerWorking(p, ownerAge(p)) ? Math.max(0, p.salary || 0) : 0;
  const spouse = ownerWorking(p, ownerAge(p, 'spouse'), 'spouse')
    ? Math.max(0, p.spouseSalary || 0) : 0;
  return primary + spouse;
}

/** This year's IRS IRA limit (with age-50 catch-up) for one person. */
export function rothYearLimit(p, owner = 'primary') {
  return contributionLimits(p.year, ownerAge(p, owner) ?? 0, p.taxInflation ?? .025).ira;
}
/** Player-facing description of a person's Roth contribution setting. */
export function rothContributionLabel(p, owner = 'primary') {
  const key = field => owner === 'spouse' ? `spouse${field[0].toUpperCase()}${field.slice(1)}` : field;
  return rothContributionMode({ rothContributionMode: p[key('rothContributionMode')] }) === 'max'
    ? `rises with limit (${formatMoneyDisplay(rothYearLimit(p, owner), p)} in ${p.year})`
    : `${formatMoneyDisplay(p[key('rothAnnualContribution')] || 0, p)}/yr`;
}
/** Roth contribution style menu: 'fixed', 'max' (Rise with limit) or null on Back. */
export async function chooseRothContributionMode(p, dialog, { owner = 'primary', title = 'Retirement' } = {}) {
  const current = owner === 'spouse' ? p.spouseRothContributionMode : p.rothContributionMode;
  const limit = formatMoneyDisplay(rothYearLimit(p, owner), p);
  const choice = await dialog.menu(
    `**${personName(p, owner)} Roth IRA** from Cash (now ${rothContributionLabel(p, owner)}).\n` +
      '**Fixed amount**: the same amount every year.\n' +
      '**Rise with limit**: the full IRS limit each year, incl. the age-50 catch-up. Income limits and Cash still apply.',
    [
      { label: 'Fixed amount', value: 'fixed' },
      { label: `Rise with limit (${limit} in ${p.year})`, value: 'max' },
      { label: 'Back', value: null },
    ],
    { title, selected: current === 'max' ? 1 : 0, escValue: null });
  return choice ?? null;
}

/** Cancel leaves the original household unchanged. */
export async function editSpouseIdentity(p, dialog, { title = 'Family' } = {}) {
  let details;
  while (true) {
    details = await dialog.form('Spouse details', [
    { key: 'name', label: 'Spouse name', type: 'text', defaultValue: p.spouseName || 'Spouse' },
    { key: 'age', label: 'Spouse age', type: 'number', defaultValue: p.spouseAge == null ? '' : String(p.spouseAge) },
  ], { title, portfolio: p });
    if (!details) return false;
    if (Number.isFinite(Number(details.age)) && Number(details.age) >= 18 && Number(details.age) <= 110) break;
    await dialog.show('Enter the spouse’s actual age (18–110).', { title });
  }
  // Length is asked next, so the preview uses the spouse's current length.
  const look = await dialog.palette('Spouse appearance', [
    { key: 'hairColor', label: 'Hair color', kind: 'hair', colors: HAIR_PALETTE,
      selected: normalizeHairColor(p.spouseHairColor) },
    { key: 'shirtColor', label: 'Shirt color', kind: 'shirt', colors: SHIRT_PALETTE,
      selected: normalizeShirtColor(p.spouseShirtColor) },
  ], { title, hairLength: p.spouseHairLength === 'long' ? 'long' : 'short', backValue: null });
  if (look == null) return false;
  const length = await dialog.menu('Spouse hair length', [
    { label: 'Short', value: 'short' }, { label: 'Long', value: 'long' }, { label: 'Back', value: null },
  ], { title, selected: p.spouseHairLength === 'long' ? 1 : 0 });
  if (length == null) return false;
  p.spouseName = String(details.name || 'Spouse').trim().slice(0, 28) || 'Spouse';
  p.spouseAge = Math.max(18, Math.min(110, Math.round(Number(details.age) || 18)));
  p.spouseBirthYear = p.year - p.spouseAge;
  p.spouseHairColor = normalizeHairColor(look.hairColor);
  p.spouseShirtColor = normalizeShirtColor(look.shirtColor);
  p.spouseHairLength = length;
  return true;
}

/** Portfolio fields holding one person's name and look (what the room sprites read). */
export function appearanceKeys(owner = 'primary') {
  return owner === 'spouse'
    ? { name: 'spouseName', hairLength: 'spouseHairLength', hairColor: 'spouseHairColor', shirtColor: 'spouseShirtColor' }
    : { name: 'playerName', hairLength: 'hairLength', hairColor: 'hairColor', shirtColor: 'shirtColor' };
}

/**
 * Change Name/Appearance for the player or the spouse: name, then hair length,
 * then the hair + shirt color page (the same questions Custom Setup and spouse
 * details use). Back on any step returns to the previous one; Back on the name
 * returns false with nothing changed. On success returns the updated values
 * ({ [portfolioKey]: value }) for the caller to apply.
 * @returns {Promise<object|false>}
 */
export async function editPersonAppearance(p, dialog, { owner = 'primary', title = 'Change Name/Appearance' } = {}) {
  const keys = appearanceKeys(owner);
  const spouse = owner === 'spouse';
  const fallback = spouse ? 'Spouse' : 'Traveler';
  let name = String(p[keys.name] || fallback);
  let length = p[keys.hairLength] === 'long' ? 'long' : 'short';
  let step = 0;
  while (true) {
    if (step === 0) {
      const result = await dialog.prompt(spouse ? 'Spouse name' : 'What is your name?', { title, defaultValue: name });
      if (result == null) return false;
      name = String(result).trim().slice(0, 28) || name;
      step = 1;
    } else if (step === 1) {
      const result = await dialog.menu(`${name}: hair length?`, [
        { label: 'Short', value: 'short' }, { label: 'Long', value: 'long' }, { label: 'Back', value: null },
      ], { title, selected: length === 'long' ? 1 : 0 });
      if (result == null) { step = 0; continue; }
      length = result;
      step = 2;
    } else {
      // Preview uses the length just chosen.
      const look = await dialog.palette(`${name}: choose a look.`, [
        { key: 'hairColor', label: 'Hair color', kind: 'hair', colors: HAIR_PALETTE,
          selected: normalizeHairColor(p[keys.hairColor]) },
        { key: 'shirtColor', label: 'Shirt color', kind: 'shirt', colors: SHIRT_PALETTE,
          selected: normalizeShirtColor(p[keys.shirtColor]) },
      ], { title, hairLength: length, backLabel: '← Back', backValue: null });
      if (look == null) { step = 1; continue; }
      return {
        [keys.name]: name,
        [keys.hairLength]: length,
        [keys.hairColor]: normalizeHairColor(look.hairColor),
        [keys.shirtColor]: normalizeShirtColor(look.shirtColor),
      };
    }
  }
}

export async function editFamilyIncome(p, dialog, { title = 'Finances' } = {}) {
  const fields = [{ key: 'salary', label: `${personName(p)} Annual Salary`, type: 'money', prefix: '$', defaultValue: String(p.salary || 0) }];
  if (p.married) fields.push({ key: 'spouseSalary', label: `${personName(p, 'spouse')} Annual Salary`, type: 'money', prefix: '$', defaultValue: String(p.spouseSalary || 0) });
  const legacy = p.married && p.salaryOwnershipConfirmed !== true;
  const form = await dialog.form(legacy
    ? 'Earlier salary may be a household total. Split or confirm each person’s salary; do not enter the total twice.'
    : 'Annual salary before taxes, separately for each person.', fields, {
    title, portfolio: p,
    subtitle: 'Cash and Savings are shared; salaries belong to each earner.',
  });
  if (!form) return false;
  p.salary = Math.max(0, Number(form.salary) || 0);
  p.employed = p.salary > 0 && !p.retired;
  p.peakSalary = Math.max(p.peakSalary || 0, p.salary);
  if (p.married) {
    p.spouseSalary = Math.max(0, Number(form.spouseSalary) || 0);
    p.spouseEmployed = p.spouseSalary > 0 && !p.spouseRetired;
  }
  p.householdVersion = 1;
  p.salaryOwnershipConfirmed = true;
  p.salaryOwnership = 'individual';
  return true;
}

export async function editRetirementAges(p, dialog, { title = 'Retirement' } = {}) {
  const fields = [{ key: 'retirementAge', label: `${personName(p)} retirement age`, type: 'number', defaultValue: String(p.retirementAge || 65) }];
  if (p.married) fields.push({ key: 'spouseRetirementAge', label: `${personName(p, 'spouse')} retirement age`, type: 'number', defaultValue: String(p.spouseRetirementAge || 65) });
  const form = await dialog.form('Each person retires at their own age.', fields, { title });
  if (!form) return false;
  p.retirementAge = Math.max(40, Math.min(100, Math.round(Number(form.retirementAge) || 65)));
  if (p.married) p.spouseRetirementAge = Math.max(40, Math.min(100, Math.round(Number(form.spouseRetirementAge) || 65)));
  return true;
}

/** Account balances are personal. During play existing balances remain locked. */
export async function editRetirementAccounts(p, dialog, { owner = 'primary', lockBalances = false, title = 'Retirement' } = {}) {
  const spouse = owner === 'spouse';
  const key = field => spouse ? `spouse${field[0].toUpperCase()}${field.slice(1)}` : field;
  const draft = { ...p };
  const selected = [];
  if (p[key('has401k')]) selected.push('k401');
  if (p[key('hasRoth')]) selected.push('roth');
  const accounts = await dialog.multiSelect(`Which retirement accounts does ${personName(p, owner)} have?`, [
    { label: '401(k)', value: 'k401' }, { label: 'Roth IRA', value: 'roth' },
  ], { title, selected });
  if (accounts == null) return false;
  draft[key('has401k')] = accounts.includes('k401') || (lockBalances && (p[key('k401Balance')] || 0) > 0);
  draft[key('hasRoth')] = accounts.includes('roth') || (lockBalances && (p[key('rothBalance')] || 0) > 0);
  if (draft[key('has401k')]) {
    const fields = [
      ...(!lockBalances ? [{ key: 'balance', label: '401(k) balance', type: 'money', prefix: '$', defaultValue: String(p[key('k401Balance')] || 0) }] : []),
      { key: 'contrib', label: 'Contribution % of this salary', type: 'percent', defaultValue: String((p[key('k401ContribRate')] ?? .06) * 100) },
      { key: 'match', label: 'Employer match % of deferrals', type: 'percent', defaultValue: String((p[key('k401MatchRate')] || 0) * 100) },
      { key: 'onFirst', label: 'Match on first % of salary', type: 'percent', defaultValue: String((p[key('k401MatchOnFirst')] || 0) * 100) },
      { key: 'equity', label: 'Stocks % (remainder bonds)', type: 'percent', defaultValue: String((p[key('k401Allocation')]?.equity ?? 1) * 100) },
    ];
    const form = await dialog.form(`${personName(p, owner)} 401(k)`, fields, { title, portfolio: p });
    if (!form) return false;
    if (!lockBalances) draft[key('k401Balance')] = Math.max(0, Number(form.balance) || 0);
    draft[key('k401ContribRate')] = Math.max(0, Math.min(1, (Number(form.contrib) || 0) / 100));
    draft[key('k401MatchRate')] = Math.max(0, Math.min(1, (Number(form.match) || 0) / 100));
    draft[key('k401MatchOnFirst')] = Math.max(0, Math.min(1, (Number(form.onFirst) || 0) / 100));
    const equity = Math.max(0, Math.min(1, (Number(form.equity) || 0) / 100));
    draft[key('k401Allocation')] = { equity, bond: 1 - equity };
  } else {
    if (!lockBalances) draft[key('k401Balance')] = 0;
    draft[key('k401ContribRate')] = draft[key('k401MatchRate')] = draft[key('k401MatchOnFirst')] = 0;
  }
  if (draft[key('hasRoth')]) {
    const mode = await chooseRothContributionMode(p, dialog, { owner, title });
    if (!mode) return false;
    const fields = [
      ...(!lockBalances ? [{ key: 'balance', label: 'Roth IRA balance', type: 'money', prefix: '$', defaultValue: String(p[key('rothBalance')] || 0) }] : []),
      ...(mode === 'fixed' ? [{ key: 'contrib', label: 'Annual contribution from Cash', type: 'money', prefix: '$', defaultValue: String(p[key('rothAnnualContribution')] || 0) }] : []),
      ...(!lockBalances ? [
        { key: 'basis', label: 'Verified remaining contribution basis', type: 'money', prefix: '$', defaultValue: String(p[key('rothContributionBasis')] ?? 0) },
        { key: 'opened', label: 'Roth first opened year', type: 'number', defaultValue: String(p[key('rothOpenedYear')] ?? p.year) },
      ] : []),
      { key: 'equity', label: 'Stocks % (remainder bonds)', type: 'percent', defaultValue: String((p[key('rothAllocation')]?.equity ?? 1) * 100) },
    ];
    const heading = mode === 'max'
      ? `${personName(p, owner)} Roth IRA · contribution rises with limit (${formatMoneyDisplay(rothYearLimit(p, owner), p)} in ${p.year})`
      : `${personName(p, owner)} Roth IRA`;
    const form = await dialog.form(heading, fields, { title, portfolio: p });
    if (!form) return false;
    if (!lockBalances) {
      draft[key('rothBalance')] = Math.max(0, Number(form.balance) || 0);
      draft[key('rothContributionBasis')] = Math.max(0, Number(form.basis) || 0);
      draft[key('rothOpenedYear')] = Math.min(p.year, Math.round(Number(form.opened) || p.year));
    }
    draft[key('rothContributionMode')] = mode;
    if (mode === 'fixed') draft[key('rothAnnualContribution')] = Math.max(0, Number(form.contrib) || 0);
    const equity = Math.max(0, Math.min(1, (Number(form.equity) || 0) / 100));
    draft[key('rothAllocation')] = { equity, bond: 1 - equity };
  } else {
    if (!lockBalances) draft[key('rothBalance')] = draft[key('rothContributionBasis')] = 0;
    draft[key('rothAnnualContribution')] = 0;
    draft[key('rothContributionMode')] = 'fixed';
  }
  Object.assign(p, draft);
  return true;
}
