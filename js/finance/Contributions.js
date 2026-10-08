import { money, nonnegative } from './Books.js';
import { contributionLimits } from './Retirement.js';
import { ownerState } from './Household.js';
const NO_CONTRIBUTION=Object.freeze({deferral:0,match:0});

export function employeeDeferralLimit(state, owner = 'primary', person = null) {
  const p = person || ownerState(state, owner), age = p.age ?? 0;
  const capAge = state.year >= 2026 && age >= 50 && (p.priorYearWages ?? p.salary) > 150000 ? 49 : age;
  return contributionLimits(state.year, capAge, state.taxInflation ?? .025).k401;
}
/** Apply the election to this paycheck, then the remaining individual annual cap. */
export function paycheckContributions(state, wages, deferred = 0, matched = 0, owner = 'primary', person = null) {
  const p = person || ownerState(state, owner);
  if (!(wages>0) || p.has401k === false) return NO_CONTRIBUTION;
  const deferral = money(Math.min(wages * Math.min(1, nonnegative(p.k401ContribRate)),
    Math.max(0, employeeDeferralLimit(state, owner, p) - deferred)));
  const match = money(Math.min(Math.min(deferral, wages * nonnegative(p.k401MatchOnFirst)) * nonnegative(p.k401MatchRate),
    Math.max(0, contributionLimits(state.year,p.age ?? 0,state.taxInflation ?? .025).employerTotal-deferred-deferral-matched)));
  return { deferral, match };
}
