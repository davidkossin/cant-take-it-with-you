import test from 'node:test';
import assert from 'node:assert/strict';
import { household } from './fixtures.js';
import { projectOneYear, projectYears, computeWorth, sellStock, retirementAccess,
  withdrawRetirement, previewRetirementWithdrawal, setRetirementWithdrawalPlan } from '../js/finance/Engine.js';
import { projectedIncome, estimateAnnualTax } from '../js/finance/Tax.js';
import { normalizePortfolio, migrateGame } from '../js/finance/Schema.js';

const deterministic={deterministic:true};
const close=(a,b,tolerance=.03)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test('separate earners have separate payroll caps and retirement dates',()=>{
  const p=household({age:64,married:true,spouseAge:54,spouseBirthYear:1972,
    salary:150000,spouseSalary:150000,retirementAge:65,spouseRetirementAge:65,
    has401k:false,spouseHas401k:false});
  const first=projectOneYear(p,'standard',deterministic);
  assert.equal(first.tax.payroll,23400);
  assert.equal(first.state.spouseAge,55);
  const second=projectOneYear(first.state,'standard',deterministic);
  assert.equal(second.statement.income.wages,0);
  assert.equal(second.statement.income.spouseWages,150000);
  assert.equal(second.state.spouseAge,56);
  close(second.statement.reconciliation.difference,0);
});

test('paycheck elections contribute correctly during partial-year retirement',()=>{
  const p=household({age:64,retirementAge:64.5,salary:100000,has401k:true,k401Balance:0,
    k401ContribRate:.5,k401MatchRate:1,k401MatchOnFirst:.03});
  const expected=projectedIncome(p),r=projectOneYear(p,'standard',deterministic);
  assert.equal(expected.wages,50000);close(expected.deferral,25000);
  close(r.statement.employeeContribution,25000);
  assert.equal(r.statement.employerContribution,1500);
  close(r.state.k401Balance,26500);
  close(r.statement.reconciliation.difference,0);
});

test('spouse contributions and balances have independent access restrictions',()=>{
  const p=household({age:70,retired:true,employed:false,married:true,spouseAge:40,spouseSalary:100000,
    spouseHas401k:true,spouseK401Balance:10000,spouseK401ContribRate:.25,
    spouseK401MatchRate:1,spouseK401MatchOnFirst:.03});
  const r=projectOneYear(p,'standard',deterministic);
  assert.equal(r.statement.income.spouseDeferral,24500);
  assert.equal(r.state.spouseK401Balance,37500);
  assert.equal(retirementAccess(r.state,'traditional',{owner:'spouse'}).available,0);
  assert.equal(retirementAccess(r.state,'traditional',{owner:'primary'}).gated,false);
  const w=withdrawRetirement(p,{amount:1000,owner:'spouse',early:true});
  assert.equal(w.spouseK401Balance,9000);assert.equal(w.k401Balance,p.k401Balance);
  assert.equal(w.taxRecord.penalties,100);
  close(computeWorth(w).exactNetWorth,computeWorth(p).exactNetWorth);
});

test('inactive spouse income is excluded from sales previews and annual taxes',()=>{
  const p=household({age:70,retired:true,employed:false,married:true,spouseAge:68,
    spouseSalary:200000,spouseEmployed:false,spouseRetired:true,
    stocksTotal:100000,stocksCostBasis:0});
  assert.equal(projectedIncome(p).spouseWages,0);
  const sale=sellStock(p,{proceeds:100000});
  assert.equal(sale.tax.total,0);assert.equal(sale.netCash,100000);
  assert.equal(projectOneYear(sale.state,'standard',deterministic).tax.total,0);
});

test('previews share household pensions, benefits and standing withdrawals',()=>{
  const p=setRetirementWithdrawalPlan(household({age:66,retired:true,employed:false,k401Balance:100000,
    annualPension:12000,socialSecurityMonthly:1000,socialSecurityClaimAge:65,
    married:true,spouseAge:62,spouseEmployed:false,spouseAnnualPension:6000,spousePensionStartAge:62,
    spouseSocialSecurityMonthly:500,spouseSocialSecurityClaimAge:62}),{amount:24000});
  const record=projectedIncome(p),r=projectOneYear(p,'standard',deterministic);
  assert.equal(record.socialSecurity,18000);assert.equal(record.traditionalWithdrawals,42000);
  assert.equal(record.socialSecurity,r.statement.income.socialSecurity);
  assert.equal(record.traditionalWithdrawals,r.statement.income.traditionalWithdrawals);
  assert.equal(estimateAnnualTax(p).total,r.tax.total);
});

test('net cash target reserves incremental taxes once and cannot overdraw an account',()=>{
  const p=household({age:60,cash:0,salary:100000,k401Balance:100000});
  const source=JSON.stringify(p),preview=previewRetirementWithdrawal(p,{netTarget:10000});
  assert.equal(JSON.stringify(p),source);
  assert.equal(preview.accepted,true);assert.ok(preview.gross>10000);close(preview.netCash,10000,.01);
  const w=withdrawRetirement(p,{netTarget:10000});
  close(w.cash,10000,.01);assert.equal(w.taxRecord.taxPaid,preview.tax.total);
  const r=projectOneYear(w,'standard',deterministic);
  assert.equal(r.state.taxPayable,0);close(r.statement.reconciliation.difference,0);
  close(r.tax.total,estimateAnnualTax(p).total+preview.tax.total);
  const denied=withdrawRetirement(p,{netTarget:200000});
  assert.equal(denied.lastTransaction.accepted,false);assert.equal(denied.k401Balance,100000);
});

test('net target includes early penalties and Roth contribution withdrawals are tax free',()=>{
  const young=household({age:40,cash:0,k401Balance:100000});
  const preview=previewRetirementWithdrawal(young,{netTarget:10000,early:true});
  close(preview.gross,11111.11,.01);close(preview.tax.penalties,1111.11,.01);
  const roth=withdrawRetirement(household({age:40,cash:0,rothBalance:20000,rothContributionBasis:12000}),{account:'roth',netTarget:10000});
  assert.equal(roth.cash,10000);assert.equal(roth.rothBalance,10000);assert.equal(roth.rothContributionBasis,2000);
});

test('property-tax arrears are reported once and remain explicit liabilities',()=>{
  const p=household({cash:0,homes:[{value:100000,mortgageOwed:0,annualPropertyTax:1200,
    annualMaintenance:0,annualInsurance:0}]});
  const r=projectOneYear(p,'standard',deterministic);
  assert.equal(r.statement.unfunded,1200);assert.equal(r.statement.requiredSpending,1200);
  assert.equal(r.state.propertyTaxPayable,1200);assert.equal(r.statement.expenses.propertyTaxArrears,undefined);
  close(r.statement.reconciliation.difference,0);
  const old=projectOneYear(household({cash:0,propertyTaxPayable:1200}),'standard',deterministic);
  assert.equal(old.statement.unfunded,1200);assert.equal(old.statement.fundingSuccess,false);
});

test('childcare expires on the specified year and inflates only from the entry year',()=>{
  const p=household({cash:100000,priceIndex:2,childcarePlans:[{type:'nanny',annualCost:12000,
    entryPriceIndex:2,startYear:2026,endYearExclusive:2028}],rateOverrides:{inflation:.1,
    equityReturn:0,equityVolatility:0,bondReturn:0,bondVolatility:0,inflationVolatility:0,homeRealGrowth:0,homeVolatility:0,salaryGrowth:0}});
  const years=projectYears(p,3,'standard',deterministic);
  assert.equal(years[0].statement.expenses.childcare,12000);
  assert.equal(years[1].statement.expenses.childcare,13200);
  assert.equal(years[2].statement.expenses.childcare,undefined);
});

test('FRA-year earnings test withholds the full annual amount before FRA',()=>{
  const p=household({year:2027,age:66.5,birthYear:1960,salary:160000,retirementAge:67.5,
    socialSecurityMonthly:2000,socialSecurityClaimAge:66.5,taxInflation:0});
  const r=projectOneYear(p,'standard',deterministic);
  close(r.statement.income.socialSecurity,19053.33,.02);
});

test('legacy ownership and spouse ages require confirmation without guessed values',()=>{
  const original={year:2040,age:50,financeVersion:2,married:true,salary:300000,cash:10000,stocksTotal:0};
  const p=normalizePortfolio(original);
  assert.equal(p.salary,300000);assert.equal(p.spouseSalary,undefined);assert.equal(p.spouseAge,undefined);
  assert.equal(p.salaryOwnershipConfirmed,false);assert.ok(p.modelWarnings.some(w=>w.startsWith('Spouse wage ownership')));
  assert.ok(p.modelWarnings.some(w=>w.startsWith('Spouse age')));
  assert.equal(retirementAccess(p,'traditional',{owner:'spouse'}).ageUnknown,true);
  const g=migrateGame({portfolio:original,timeline:{startYear:2026,snapshots:{1:{...original,year:2030}}}});
  assert.equal(g.portfolio.dollarBaseYear,2026);assert.equal(g.timeline.snapshots[1].dollarBaseYear,2026);
  assert.deepEqual(migrateGame(g),g);assert.equal(original.salaryOwnershipConfirmed,undefined);
});

test('compact and detailed annual engines agree without changing the input state',()=>{
  const p=household({age:64,retirementAge:64.5,salary:80000,k401ContribRate:.2,has401k:true,
    married:true,spouseAge:60,spouseSalary:40000,spouseK401Balance:50000,spouseHas401k:true,
    spouseK401ContribRate:.1,spouseRetirementWithdrawalPlan:{amount:1000,account:'traditional',early:false,inflationAdjusted:true},
    childcarePlans:[{annualCost:5000,entryPriceIndex:1,startYear:2026,endYearExclusive:2028}]});
  const before=JSON.stringify(p),full=projectOneYear(p,'standard',deterministic);
  const compact=projectOneYear(p,'standard',{...deterministic,compact:true});
  assert.equal(JSON.stringify(p),before);
  assert.deepEqual(computeWorth(compact.state),computeWorth(full.state));assert.deepEqual(compact.tax,full.tax);
  assert.deepEqual(compact.state.taxRecord,full.state.taxRecord);
  assert.equal(compact.statement.unfunded,full.statement.unfunded);
});

test('future-dollar SSA claim captures its price index once then receives COLA',()=>{
  const p=household({age:67,retired:true,employed:false,socialSecurityMonthly:1000,
    socialSecurityClaimAge:67,socialSecurityInFutureDollars:true,priceIndex:2,
    rateOverrides:{inflation:.1,equityReturn:0,equityVolatility:0,bondReturn:0,
      bondVolatility:0,inflationVolatility:0,homeRealGrowth:0,homeVolatility:0,salaryGrowth:0}});
  const a=projectOneYear(p,'standard',deterministic),b=projectOneYear(a.state,'standard',deterministic);
  assert.equal(a.statement.income.socialSecurity,12000);assert.equal(a.state.socialSecurityClaimPriceIndex,2);
  assert.equal(b.statement.income.socialSecurity,13200);assert.equal(b.state.socialSecurityClaimPriceIndex,2);
});

test('a player withdrawal does not reduce the previous year-end balance used for RMD',()=>{
  const p=household({year:2035,age:75,birthYear:1960,k401Balance:246000,retired:true,employed:false});
  const w=withdrawRetirement(p,{amount:5000});
  assert.equal(w.rmdPriorYearBalance,246000);
  assert.equal(projectedIncome(w).traditionalWithdrawals,10000);
  const r=projectOneYear(w,'standard',deterministic);
  assert.equal(r.statement.income.traditionalWithdrawals,10000);assert.equal(r.state.k401Balance,236000);
  assert.equal(r.state.rmdPriorYearBalance,236000);
});
