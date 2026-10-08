import test from 'node:test';
import assert from 'node:assert/strict';
import { household } from './fixtures.js';
import { incomeSchedule } from '../js/finance/IncomeSchedule.js';
import { projectedIncome, estimateAnnualTax, estimateCapitalGainsTax } from '../js/finance/Tax.js';
import { projectOneYear, setRetirementWithdrawalPlan, previewRetirementWithdrawal, withdrawRetirement, sellStock, buyStock } from '../js/finance/Engine.js';

const close = (a,b,tolerance=.02) => assert.ok(Math.abs(a-b)<=tolerance, `${a} != ${b}`);

test('retirement depletion previews use the same monthly growth and rounding as the reference engine', () => {
  for (const growth of [-.4,.21]) {
    const p = setRetirementWithdrawalPlan(household({age:65,cash:100000,k401Balance:10000,
      rateOverrides:{inflation:0,equityReturn:growth,equityVolatility:0,bondReturn:0,
        bondVolatility:0,inflationVolatility:0,homeRealGrowth:0,homeVolatility:0,salaryGrowth:0}}), {amount:24000});
    const projected = projectedIncome(p);
    const actual = projectOneYear(p,'standard',{randomVariation:false});
    assert.equal(projected.traditionalWithdrawals, actual.statement.income.traditionalWithdrawals);
    assert.equal(estimateAnnualTax(p).total, actual.tax.total);
    assert.equal(actual.state.k401Balance, 0);
  }
});

test('engine income schedules use the supplied stress economy for either owner', () => {
  const p=household({age:65,cash:100000,married:true,spouseAge:65,k401Balance:10000,spouseK401Balance:20000,
    retirementWithdrawalPlan:{amount:24000,account:'traditional'},
    spouseRetirementWithdrawalPlan:{amount:48000,account:'traditional'}});
  const economy={equity:-.4,bond:0,inflation:0,investmentFee:0};
  const scheduled=incomeSchedule(p,{economy}).annual;
  const actual=projectOneYear(p,'standard',{randomVariation:false,economy});
  assert.equal(scheduled.traditionalWithdrawals, actual.statement.income.traditionalWithdrawals);
  assert.equal(actual.state.k401Balance,0);
  assert.equal(actual.state.spouseK401Balance,0);
});

test('withholding for a depleted standing plan reconciles to one annual tax bill', () => {
  const p=setRetirementWithdrawalPlan(household({age:65,cash:0,salary:100000,retirementAge:75,k401Balance:20000,
    rateOverrides:{inflation:0,equityReturn:.1,equityVolatility:0,bondReturn:0,bondVolatility:0,
      inflationVolatility:0,homeRealGrowth:0,homeVolatility:0,salaryGrowth:0}}), {amount:36000});
  const before=projectOneYear(p,'standard',{randomVariation:false});
  const preview=previewRetirementWithdrawal(p,{netTarget:10000});
  const withdrawn=withdrawRetirement(p,{netTarget:10000});
  const after=projectOneYear(withdrawn,'standard',{randomVariation:false});
  assert.equal(preview.accepted,true);
  // Earlier depletion can lower later taxable withdrawals; tax savings are not an
  // immediate cash credit. The preview reserves only an additional annual bill.
  close(Math.max(0,after.tax.total-before.tax.total),preview.tax.total);
  assert.equal(after.state.taxPayable,0);
  assert.ok(withdrawn.taxRecord.taxPaid<=after.statement.taxPaid);
  close(after.statement.reconciliation.difference,0);
});

test('SSA values entered in another dollar year preserve their entry price index for both owners', () => {
  const p=household({age:67,retired:true,employed:false,priceIndex:2,
    socialSecurityMonthly:2000,socialSecurityInputPriceIndex:2,socialSecurityClaimAge:67,
    married:true,spouseAge:67,spouseEmployed:false,spouseSocialSecurityMonthly:1000,
    spouseSocialSecurityInputPriceIndex:2,spouseSocialSecurityClaimAge:67});
  assert.equal(projectedIncome(p).socialSecurity,36000);
  assert.equal(projectOneYear(p,'standard',{randomVariation:false}).statement.income.socialSecurity,36000);
  assert.equal(p.socialSecurityClaimPriceIndex,undefined);
  assert.equal(p.spouseSocialSecurityClaimPriceIndex,undefined);
});

test('sale previews preserve previously realized capital losses', () => {
  const p=household({salary:100000,stocksTotal:10000,stocksCostBasis:0});
  p.taxRecord={year:p.year,longGains:-20000};
  assert.equal(projectedIncome(p).longGains,-20000);
  const sold=sellStock(p,{proceeds:10000});
  assert.equal(sold.tax.total,0);
  assert.equal(sold.state.taxRecord.longGains,-10000);
  const before=projectOneYear(p,'standard',{randomVariation:false});
  const after=projectOneYear(sold.state,'standard',{randomVariation:false});
  assert.equal(before.tax.total,after.tax.total);
});

test('investment purchases require an explicit transfer from Savings to Cash', () => {
  const p=household({cash:100,savings:10000});
  const denied=buyStock(p,1000);
  assert.equal(denied.lastTransaction.reasonCode,'insufficient-cash');
  assert.equal(denied.lastTransaction.required,1000);
  assert.equal(denied.cash,100);
  assert.equal(denied.savings,10000);
  assert.equal(denied.stocksTotal,0);
});

test('recorded compact journeys keep event amounts without transaction logging', () => {
  const p=household({cash:10000,priceIndex:2});
  const result=projectOneYear(p,'standard',{compact:true,recordEvents:true,randomVariation:false,shockAmount:1000});
  const detail=result.statement.eventDetails.find(row=>row.kind==='unexpected-expense');
  assert.equal(detail.amount,1000);
  assert.equal(detail.priceIndex,2);
  assert.equal(detail.year,p.year);
  assert.match(result.events[detail.index],/^Unexpected expense/);
  assert.equal(result.state.transactions,undefined);
  assert.equal(result.state._recordEvents,undefined);
  const quiet=projectOneYear(p,'standard',{compact:true,randomVariation:false,shockAmount:1000});
  assert.deepEqual(quiet.events,[]);
  assert.equal(quiet.statement.eventDetails,undefined);
});

test('transaction previews include savings interest in annual gain stacking', () => {
  const p=household({age:65,retired:true,employed:false,cash:100000,savings:2000000,savingsRate:.05});
  const before=projectOneYear(p,'standard',{randomVariation:false});
  const after=projectOneYear({...p,taxRecord:{year:p.year,longGains:10000}},'standard',{randomVariation:false});
  const preview=estimateCapitalGainsTax({state:p,longGains:10000});
  assert.equal(projectedIncome(p).interest,before.statement.income.interest);
  close(preview.total,after.tax.total-before.tax.total);
  assert.ok(preview.total>1500);
});

test('sale previews reflect dividends remaining after the selected holdings are sold', () => {
  const p=household({salary:100000,cash:100000,stocksTotal:100000,stocksCostBasis:50000,equityDividendYield:.05});
  const sold=sellStock(p,{proceeds:50000});
  const before=projectOneYear(p,'standard',{randomVariation:false});
  const after=projectOneYear(sold.state,'standard',{randomVariation:false});
  assert.ok(after.statement.income.qualifiedDividends<before.statement.income.qualifiedDividends);
  close(sold.tax.total,after.tax.total-before.tax.total);
});
