/** One monthly household schedule serves the engine and transaction tax previews. */
import { emptyIncome, money, nonnegative } from './Books.js';
import { ownerAge, ownerState } from './Household.js';
import { paycheckContributions } from './Contributions.js';
import { monthlyBenefit, fullRetirementAge, requiredDistribution, annualBenefitEarningsWithholding } from './Retirement.js';
import { accountGross, economicYear } from './Market.js';
import { effectiveDifficulty } from './Difficulty.js';

export const monthlyAmount = (annual, month) => money(annual*month/12)-money(annual*(month-1)/12);
const EMPTY_MONTH=Object.freeze({wages:0,deferral:0,match:0,benefit:0,pension:0,withdrawal:0,penalty:0});

export function incomeSchedule(state, { economy = null } = {}) {
  // Previews use the deterministic reference economy. The engine supplies its exact
  // year's economy, so both schedules account for growth before an account runs out.
  const market = economy || economicYear(state, effectiveDifficulty(state, state.difficulty), { randomVariation: false });
  const months = Array.from({length:12},(_,i)=>({month:i+1,primary:EMPTY_MONTH,spouse:EMPTY_MONTH}));
  const annual = emptyIncome(state.year);
  const opening = state.taxRecord?.year === state.year ? state.taxRecord : {};
  const claimPriceIndices={};
  for (const owner of ['primary','spouse']) {
    if (owner === 'spouse' && !state.married) continue;
    const p = ownerState(state,owner), age = ownerAge(state,owner);
    let deferred = nonnegative(opening[owner === 'spouse' ? 'spouseDeferral' : 'deferral']), matched = 0;
    let traditional = nonnegative(p.k401Balance), roth = nonnegative(p.rothBalance), basis = nonnegative(p.rothContributionBasis);
    const traditionalGross = accountGross(market, p.k401Allocation, state.investmentFee ?? market.investmentFee) ** (1 / 12);
    const rothGross = accountGross(market, p.rothAllocation, state.investmentFee ?? market.investmentFee) ** (1 / 12);
    const fra = fullRetirementAge(p.birthYear ?? state.year-Math.floor(age ?? 0));
    let wagesBeforeFRA = 0, wagesAnnual = 0;
    // monthlyBenefit can capture a claim's price index. Copy only its inputs rather
    // than a primary owner's full portfolio (lots, histories and reporting fields).
    const benefitState = {year:p.year,age:p.age,birthYear:p.birthYear,
      socialSecurityMonthly:p.socialSecurityMonthly,socialSecurityMonthlyAtFRA:p.socialSecurityMonthlyAtFRA,
      socialSecurityClaimAge:p.socialSecurityClaimAge,socialSecurityEligible:p.socialSecurityEligible,
      socialSecurityInFutureDollars:p.socialSecurityInFutureDollars,
      socialSecurityClaimPriceIndex:p.socialSecurityClaimPriceIndex,
      socialSecurityInputPriceIndex:p.socialSecurityInputPriceIndex};
    for (const row of months) {
      const currentAge = age == null ? null : age+(row.month-1)/12;
      const working = (owner==='spouse' ? p.employed!==false : !!p.employed) && !p.retired
        && (currentAge==null || currentAge<(p.retirementAge ?? 65));
      const wages = working ? monthlyAmount(nonnegative(p.salary),row.month) : 0;
      const contribution = paycheckContributions(state,wages,deferred,matched,owner,p);
      deferred = money(deferred+contribution.deferral); matched = money(matched+contribution.match);
      traditional = money(traditional+contribution.deferral+contribution.match);
      wagesAnnual += wages; if (currentAge != null && currentAge<fra) wagesBeforeFRA += wages;
      const benefit = currentAge == null ? 0 : monthlyBenefit(benefitState,currentAge,state.priceIndex ?? 1);
      const pension = currentAge != null && currentAge >= (p.pensionStartAge ?? p.retirementAge ?? 65)
        ? monthlyAmount(nonnegative(p.annualPension)*(p.pensionCOLA ? (state.priceIndex ?? 1)/(p.pensionInputPriceIndex ?? 1) : 1),row.month) : 0;
      const plan = p.retirementWithdrawalPlan;
      let withdrawal = 0, penalty = 0;
      if (plan?.amount>0 && currentAge != null) {
        const requested = monthlyAmount(nonnegative(plan.amount),row.month);
        if (plan.account === 'roth') {
          const qualified = currentAge>=59.5 && p.rothOpenedYear!=null && state.year-p.rothOpenedYear>=5;
          withdrawal = money(Math.min(requested,qualified?roth:Math.min(roth,basis)));
          roth = money(roth-withdrawal); basis = money(Math.max(0,basis-withdrawal));
        } else if (currentAge>=59.5 || plan.early || p.allowEarlyRetirementWithdrawals) {
          withdrawal = money(Math.min(requested,traditional)); traditional = money(traditional-withdrawal);
          if (currentAge<59.5 && !p.earlyWithdrawalPenaltyException) penalty = money(withdrawal*.10);
        }
      }
      row[owner] = {age:currentAge,working,wages,deferral:contribution.deferral,match:contribution.match,
        benefit,pension,withdrawal,penalty,planAccount:plan?.account};
      // Matches Engine's paycheck -> standing withdrawal -> month-end growth order.
      traditional = money(traditional * traditionalGross);
      roth = money(roth * rothGross);
    }
    if (benefitState.socialSecurityClaimPriceIndex!=null) claimPriceIndices[owner]=benefitState.socialSecurityClaimPriceIndex;
    // Apply the annual earnings test to payable pre-FRA months until withholding is exhausted.
    // The FRA-year test uses only wages earned before FRA, without scaling them a second time.
    let reduction = annualBenefitEarningsWithholding(p,wagesAnnual,wagesBeforeFRA);
    let eligibleWithdrawals = 0;
    for (const row of months) {
      const m = row[owner];
      if (m.age != null && m.age<fra) { const held = money(Math.min(m.benefit,reduction)); m.benefit=money(m.benefit-held); reduction=money(reduction-held); }
      annual[owner==='spouse'?'spouseWages':'wages'] += m.wages;
      annual[owner==='spouse'?'spouseDeferral':'deferral'] += m.deferral;
      annual.socialSecurity += m.benefit;
      annual.traditionalWithdrawals += m.pension+(m.planAccount==='roth'?0:m.withdrawal);
      annual.penalties += m.penalty;
      if (m.planAccount !== 'roth') eligibleWithdrawals += m.withdrawal;
    }
    if (age != null) {
      const already = nonnegative(opening[owner==='spouse'?'spouseRmdEligibleWithdrawals':'rmdEligibleWithdrawals']);
      const stillWorking = p.rmdStillWorkingException===true && (owner==='spouse'?p.employed!==false:!!p.employed)
        && !p.retired && age+11/12<(p.retirementAge ?? 65) && !p.fivePercentOwner;
      const required = requiredDistribution(nonnegative(p.rmdPriorYearBalance,nonnegative(p.k401Balance)),age,p.birthYear ?? state.year-Math.floor(age),stillWorking);
      annual.traditionalWithdrawals += money(Math.min(traditional,Math.max(0,required-already-eligibleWithdrawals)));
    }
  }
  for (const key of Object.keys(annual)) if (key!=='year') annual[key]=money(annual[key]);
  return {months,annual,claimPriceIndices};
}

export function scheduledAnnualIncome(state) {
  const schedule = incomeSchedule(state);
  const record = {...emptyIncome(state.year),...(state.taxRecord?.year===state.year ? state.taxRecord : {})};
  // Realized capital losses retain their sign when previewing the rest of the year.
  for (const [key,value] of Object.entries(schedule.annual)) if (key!=='year') record[key]=money((Number(record[key]) || 0)+value);
  record.traditionalWithdrawals=money(record.traditionalWithdrawals+nonnegative(state._extraOrdinaryIncome));
  return record;
}
