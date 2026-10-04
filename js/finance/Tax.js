/**
 * Tax estimation module.
 * Offline: curated federal brackets + ZIP→state approximate rates.
 *
 * Capital gains (simplified gameplay model — not tax advice):
 *   - yearsHeld ≥ 1 → long-term federal CGT ≈ 15% (LTCG_FEDERAL_RATE)
 *   - yearsHeld < 1  → short-term taxed as ordinary income (approx top marginal
 *     on gains alone using federal brackets + state rate)
 *   - State CGT ≈ state income tax rate × gains (from ZIP)
 *
 * Retirement tax treatment (gameplay):
 *   - Traditional 401(k): employee deferral reduces taxable wages; withdrawals
 *     taxed as ordinary income (see estimateTaxOnExtraIncome / Engine).
 *   - Roth IRA: contributions are after-tax (no wage deduction); qualified
 *     withdrawals at/after retirementAge are untaxed.
 *
 * FUTURE HOOK — live tax data:
 *   await fetchTaxTables(year) could pull IRS SOI / Tax Foundation JSON
 *   and merge into getFederalTable. Game must remain playable offline
 *   with the static tables in data/tax-brackets.js.
 */

import { getFederalTable } from '../data/tax-brackets.js';
import { stateFromZip, NATIONAL_AVERAGES } from '../data/state-from-zip.js';
import { LTCG_FEDERAL_RATE, K401_EMPLOYEE_LIMIT } from '../config.js';

/**
 * Progressive federal income tax on taxable income.
 * @param {number} taxable
 * @param {ReturnType<typeof getFederalTable>} table
 */
export function federalTaxOn(taxable, table) {
  if (taxable <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const bracket of table.brackets) {
    const cap = bracket.upTo == null ? Infinity : bracket.upTo;
    const slice = Math.min(taxable, cap) - prev;
    if (slice <= 0) break;
    tax += slice * bracket.rate;
    prev = cap;
    if (taxable <= cap) break;
  }
  return Math.round(tax);
}

function filingStatus(state) {
  if (state?.filingStatus === 'married' || state?.married === true) return 'married';
  return 'single';
}

/**
 * Traditional 401(k) employee elective deferral for the year (while employed).
 * Caps at K401_EMPLOYEE_LIMIT (TY 2025 spirit). Reduces taxable wages.
 * Only when has401k is not explicitly false and contrib rate > 0.
 */
export function employee401kDeferral(state) {
  if (state?.has401k === false) return 0;
  if (!state?.employed || state.retired || !(state.salary > 0)) return 0;
  const rate = Math.max(0, Math.min(1, Number(state.k401ContribRate) || 0));
  if (rate <= 0) return 0;
  return Math.min(Math.round((state.salary || 0) * rate), K401_EMPLOYEE_LIMIT);
}

/**
 * Employer match: min(deferral, salary * matchOnFirst) * matchRate
 * (classic “100% of first 3%”: matchRate=1, matchOnFirst=0.03).
 */
export function employer401kMatch(state, deferral) {
  if (state?.has401k === false) return 0;
  if (!state?.employed || state.retired || !(state.salary > 0)) return 0;
  const d = Math.max(0, deferral || 0);
  if (d <= 0) return 0;
  const matchRate = Math.max(0, Math.min(1, Number(state.k401MatchRate) || 0));
  const matchOnFirst = Math.max(0, Math.min(1, Number(state.k401MatchOnFirst) || 0));
  if (matchRate <= 0 || matchOnFirst <= 0) return 0;
  const capped = Math.min(d, Math.round((state.salary || 0) * matchOnFirst));
  return Math.round(capped * matchRate);
}

/**
 * Roth IRA annual contribution (after-tax — does NOT reduce taxable wages).
 * Stored as rothAnnualContribution dollars.
 */
export function rothAnnualContribution(state) {
  if (state?.hasRoth === false) return 0;
  if (!state?.employed || state.retired) return 0;
  return Math.max(0, Math.round(Number(state.rothAnnualContribution) || 0));
}

/**
 * Estimate annual taxes for a portfolio snapshot.
 * @param {object} state - game financial state
 * @param {object} difficulty
 * @returns {{ federal: number, state: number, property: number, total: number, meta: object }}
 */
export function estimateAnnualTax(state, difficulty) {
  const year = state.year;
  const filing = filingStatus(state);
  const table = getFederalTable(year, difficulty.inflation, filing);
  const zipRaw = state.zip;
  const zipInfo = stateFromZip(zipRaw == null || zipRaw === '' ? '' : zipRaw);
  const deferral = employee401kDeferral(state);
  const extraOrdinary = Math.max(0, Number(state._extraOrdinaryIncome) || 0);
  // Roth contributions are after-tax: not deducted from wages here.
  const grossWages = Math.max(
    0,
    (state.salary || 0) + (state.socialSecurity || 0) - deferral + extraOrdinary
  );
  const taxable = Math.max(0, grossWages - table.stdDeduction);
  let federal = federalTaxOn(taxable, table);
  federal = Math.round(federal * (difficulty.taxMult || 1));

  const stateTax = Math.round(grossWages * zipInfo.stateIncomeTaxApprox * (difficulty.taxMult || 1));

  let property = 0;
  for (const home of state.homes || []) {
    const rate =
      home.propertyTaxRate ??
      zipInfo.propertyTaxApprox ??
      NATIONAL_AVERAGES.propertyTaxApprox;
    // Prefer explicit annualPropertyTax dollar override when set
    if (home.annualPropertyTax != null && Number.isFinite(Number(home.annualPropertyTax))) {
      property += Math.round(Number(home.annualPropertyTax));
    } else {
      property += Math.round((home.value || 0) * rate);
    }
  }

  return {
    federal,
    state: stateTax,
    property,
    total: federal + stateTax + property,
    meta: {
      zipInfo,
      stdDeduction: table.stdDeduction,
      taxable,
      k401Deferral: deferral,
      extraOrdinary,
      filing,
      source: zipInfo.national ? 'national-average' : 'static-offline',
    },
  };
}

/**
 * Capital gains tax on a stock sale.
 */
export function estimateCapitalGainsTax({ gains, yearsHeld, state, difficulty }) {
  const g = Math.max(0, Number(gains) || 0);
  const zipInfo = stateFromZip(state.zip == null || state.zip === '' ? '' : state.zip);
  const longTerm = (Number(yearsHeld) || 0) >= 1;
  let federal = 0;
  let rateNote = '';
  const filing = filingStatus(state);

  if (longTerm) {
    federal = Math.round(g * LTCG_FEDERAL_RATE * (difficulty.taxMult || 1));
    rateNote = `Long-term federal ≈ ${(LTCG_FEDERAL_RATE * 100).toFixed(0)}%`;
  } else {
    const table = getFederalTable(state.year, difficulty.inflation, filing);
    const gross = Math.max(0, (state.salary || 0) + (state.socialSecurity || 0));
    const baseTaxable = Math.max(0, gross - table.stdDeduction);
    const withGains = Math.max(0, gross + g - table.stdDeduction);
    federal = Math.round(
      (federalTaxOn(withGains, table) - federalTaxOn(baseTaxable, table)) *
        (difficulty.taxMult || 1)
    );
    rateNote = 'Short-term: ordinary income rate (approx)';
  }

  const stateTax = Math.round(g * zipInfo.stateIncomeTaxApprox * (difficulty.taxMult || 1));
  return {
    federal,
    state: stateTax,
    total: federal + stateTax,
    longTerm,
    rateNote,
    stateAbbr: zipInfo.abbr,
  };
}

/**
 * Incremental federal + state tax if `extraIncome` is added as ordinary income
 * (e.g. traditional 401(k) withdrawal in retirement). Property tax unchanged.
 */
export function estimateTaxOnExtraIncome(state, difficulty, extraIncome) {
  const extra = Math.max(0, Math.round(Number(extraIncome) || 0));
  if (extra <= 0) return { federal: 0, state: 0, total: 0 };
  const base = estimateAnnualTax(state, difficulty);
  const withExtra = estimateAnnualTax(
    { ...state, _extraOrdinaryIncome: (Number(state._extraOrdinaryIncome) || 0) + extra },
    difficulty
  );
  const federal = Math.max(0, withExtra.federal - base.federal);
  const stateTax = Math.max(0, withExtra.state - base.state);
  return { federal, state: stateTax, total: federal + stateTax };
}

/**
 * Optional online enhancement stub.
 */
export async function fetchLiveTaxHint(year) {
  return null;
}
