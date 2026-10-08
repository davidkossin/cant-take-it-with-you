/** Account ownership is explicit; joint Cash/Savings never changes account access rules. */
export function ownerKey(key, owner = 'primary') {
  return owner === 'spouse' ? `spouse${key[0].toUpperCase()}${key.slice(1)}` : key;
}
export function ownerAge(state, owner = 'primary') {
  const value = state[ownerKey('age', owner)];
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}
/** A small owner view avoids cloning a household's lots, history and transactions. */
export function ownerState(state, owner = 'primary') {
  if (owner !== 'spouse') return state;
  // A stable object shape and direct reads avoid rebuilding dozens of property-name
  // strings on every household tax/schedule calculation in a Monte Carlo run.
  return {
    year: state.year, priceIndex: state.priceIndex, taxInflation: state.taxInflation,
    age: state.spouseAge,
    birthYear: state.spouseBirthYear ?? (state.spouseAge == null ? undefined : state.year-Math.floor(state.spouseAge)),
    salary: state.spouseSalary, employed: state.spouseEmployed, retired: state.spouseRetired,
    retirementAge: state.spouseRetirementAge, has401k: state.spouseHas401k,
    k401Balance: state.spouseK401Balance, k401ContribRate: state.spouseK401ContribRate,
    k401MatchRate: state.spouseK401MatchRate, k401MatchOnFirst: state.spouseK401MatchOnFirst,
    k401Allocation: state.spouseK401Allocation, priorYearWages: state.spousePriorYearWages,
    hasRoth: state.spouseHasRoth, rothBalance: state.spouseRothBalance,
    rothAnnualContribution: state.spouseRothAnnualContribution, rothContributionBasis: state.spouseRothContributionBasis,
    rothOpenedYear: state.spouseRothOpenedYear, rothAllocation: state.spouseRothAllocation,
    socialSecurityMonthly: state.spouseSocialSecurityMonthly,
    socialSecurityMonthlyAtFRA: state.spouseSocialSecurityMonthlyAtFRA,
    socialSecurityClaimAge: state.spouseSocialSecurityClaimAge, socialSecurityEligible: state.spouseSocialSecurityEligible,
    socialSecurityInFutureDollars: state.spouseSocialSecurityInFutureDollars,
    socialSecurityClaimPriceIndex: state.spouseSocialSecurityClaimPriceIndex,
    socialSecurityInputPriceIndex: state.spouseSocialSecurityInputPriceIndex,
    annualPension: state.spouseAnnualPension, pensionStartAge: state.spousePensionStartAge,
    pensionCOLA: state.spousePensionCOLA, pensionInputPriceIndex: state.spousePensionInputPriceIndex,
    allowEarlyRetirementWithdrawals: state.spouseAllowEarlyRetirementWithdrawals,
    earlyWithdrawalPenaltyException: state.spouseEarlyWithdrawalPenaltyException,
    retirementWithdrawalPlan: state.spouseRetirementWithdrawalPlan,
    rmdStillWorkingException: state.spouseRmdStillWorkingException,
    fivePercentOwner: state.spouseFivePercentOwner, rmdPriorYearBalance: state.spouseRmdPriorYearBalance,
  };
}
export function ownerWorking(state, age = state.age, owner = 'primary') {
  const p = ownerState(state, owner);
  const employed = owner === 'spouse' ? state.married && p.employed !== false : !!p.employed;
  return !!(employed && !p.retired && (age == null || age < (p.retirementAge ?? 65)));
}
