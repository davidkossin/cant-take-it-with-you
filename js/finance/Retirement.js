import { nonnegative, money } from './Books.js';

export function contributionLimits(year, age, inflation = .025) {
  const f = (1 + inflation) ** Math.max(0, year - 2026);
  const rounding = (n, step) => Math.floor(n * f / step) * step;
  const base = year <= 2025 ? 23500 : rounding(24500, 500);
  const catchup = age >= 60 && age <= 63 ? rounding(11250, 250)
    : age >= 50 ? (year <= 2025 ? 7500 : rounding(8000, 500)) : 0;
  return { k401: base + catchup, employerTotal: (year <= 2025 ? 70000 : rounding(72000, 1000)) + catchup,
    ira: (year <= 2025 ? 7000 : rounding(7500, 500)) + (age >= 50 ? (year <= 2025 ? 1000 : rounding(1100, 100)) : 0),
    projected: year > 2026 || year < 2025 };
}
export function rothLimit(year, age, magi, married, compensation, inflation = .025) {
  const limit = contributionLimits(year, age, inflation).ira;
  const f = (1 + inflation) ** Math.max(0, year - 2026);
  const start = (married ? (year <= 2025 ? 236000 : 242000) : (year <= 2025 ? 150000 : 153000)) * f;
  const range = (married ? 10000 : 15000) * f;
  const fraction = Math.max(0, Math.min(1, (start + range - magi) / range));
  const cap = fraction === 0 ? 0 : fraction === 1 ? limit : Math.max(200, Math.ceil(limit * fraction / 10) * 10);
  return Math.max(0, Math.min(limit, cap, compensation));
}
export function fullRetirementAge(birthYear) {
  if (birthYear <= 1937) return 65;
  if (birthYear <= 1942) return 65 + (birthYear - 1937) * 2 / 12;
  if (birthYear <= 1954) return 66;
  if (birthYear <= 1959) return 66 + (birthYear - 1954) * 2 / 12;
  return 67;
}
export function claimFactor(claimAge, birthYear) {
  const months = Math.round((claimAge - fullRetirementAge(birthYear)) * 12);
  return months < 0 ? 1 - Math.min(36, -months) * 5 / 900 - Math.max(0, -months - 36) * 5 / 1200
    : 1 + Math.max(0, Math.min(months, Math.round((70 - fullRetirementAge(birthYear)) * 12))) * .08 / 12;
}
/** Inputs are SSA statement amounts in today's dollars; never infer benefits from salary. */
export function monthlyBenefit(state, age, priceIndex) {
  const claimAge = Math.max(62, Math.min(70, state.socialSecurityClaimAge ?? 67));
  if (age < claimAge || state.socialSecurityEligible === false) return 0;
  const amount = state.socialSecurityMonthlyAtFRA != null
    ? state.socialSecurityMonthlyAtFRA * claimFactor(claimAge, state.birthYear ?? state.year - Math.floor(state.age))
    : nonnegative(state.socialSecurityMonthly);
  if (state.socialSecurityInFutureDollars && state.socialSecurityClaimPriceIndex == null) state.socialSecurityClaimPriceIndex = priceIndex;
  return money(amount * (state.socialSecurityInFutureDollars ? priceIndex / state.socialSecurityClaimPriceIndex : priceIndex));
}
const DIVISORS = [27.4,26.5,25.5,24.6,23.7,22.9,22.0,21.1,20.2,19.4,18.5,17.7,16.8,
  16.0,15.2,14.4,13.7,12.9,12.2,11.5,10.8,10.1,9.5,8.9,8.4,7.8,7.3,6.8,6.4];
export function rmdAge(birthYear) {
  return birthYear >= 1960 ? 75 : birthYear >= 1951 ? 73 : birthYear >= 1949 ? 72 : 70.5;
}
export function requiredDistribution(balance, age, birthYear, stillWorking = false) {
  if (age < rmdAge(birthYear) || stillWorking) return 0;
  const divisor = DIVISORS[Math.max(0, Math.min(DIVISORS.length - 1, Math.floor(age) - 72))];
  return money(balance / divisor);
}

/** Core annual SSA earnings test. First-year monthly rules/credit recomputation are excluded. */
export function benefitEarningsReduction(state, age, expectedWages) {
  const fra = fullRetirementAge(state.birthYear ?? state.year - Math.floor(state.age));
  if (age >= fra) return 0;
  const f = (1 + (state.taxInflation ?? .025)) ** Math.max(0, state.year - 2026);
  const fraThisYear = state.age + 1 > fra;
  const threshold = (fraThisYear ? 65160 : 24480) * f;
  const wages = fraThisYear ? expectedWages * Math.max(0, fra - state.age) : expectedWages;
  return money(Math.max(0, wages - threshold) / (fraThisYear ? 3 : 2) / 12);
}
