import test from 'node:test';
import assert from 'node:assert/strict';
import { household } from './fixtures.js';
import { projectOneYear, projectYears, sellStock, buyHome, largePurchase, takeSecuritiesLoan,
  computeWorth, applySecuritiesMarginCall, findBankInsolvencyIndex, raiseCash, transferSavings,
  withdrawRetirement, retirementAccess, setRetirementWithdrawalPlan, NOT_ENOUGH_CASH, FUNDING_RULE } from '../js/finance/Engine.js';
import { estimateAnnualTax, capitalNet, taxableSocialSecurity, payrollTax } from '../js/finance/Tax.js';
import { monthlyPayment, loanDue, payLoan } from '../js/finance/Loans.js';
import { contributionLimits, rothLimit, claimFactor, requiredDistribution, benefitEarningsReduction } from '../js/finance/Retirement.js';
import { createGameFromSetup, createDefaultSetup, enterYearRoom, completeJourney, reconstructWorthAlongPath,
  portfolioAtYearOnBranch, commitHallwayNode } from '../js/state/GameState.js';
import { migrateGame, normalizePortfolio } from '../js/finance/Schema.js';
import { stateFromZip } from '../js/data/state-from-zip.js';
const close=(actual,expected,tolerance=.02)=>assert.ok(Math.abs(actual-expected)<=tolerance, actual+' ≠ '+expected);

test('2026 single W-2 federal brackets and payroll: $100k known-answer fixture',()=>{
  const t=estimateAnnualTax(household({salary:100000}));
  assert.equal(t.federal,13170); assert.equal(t.payroll,7650); assert.equal(t.state,0); assert.equal(t.total,20820);
});
test('2026 joint $100k fixture uses joint thresholds and separate owners',()=>{
  const t=estimateAnnualTax(household({salary:60000,spouseSalary:40000,married:true}));
  assert.equal(t.federal,7640); assert.equal(t.payroll,7650); assert.equal(t.total,15290);
  assert.equal(payrollTax(200000,200000,true,184500),30028);
});
test('qualified gains stack on ordinary income; losses retain character',()=>{
  const p=household({salary:100000});p.taxRecord={year:2026,longGains:20000};
  assert.equal(estimateAnnualTax(p).federal,16170);
  assert.deepEqual(capitalNet(-10000,2000),{ordinary:-3000,preferred:0,carry:{short:5000,long:0},lossDeduction:3000});
  assert.equal(taxableSocialSecurity(20000,0,false),0);
  assert.equal(taxableSocialSecurity(20000,100000,false),17000);
});
test('published 2026 contributions, catchups, Roth phaseout and compensation cap',()=>{
  assert.equal(contributionLimits(2026,30).k401,24500);
  assert.equal(contributionLimits(2026,50).k401,32500);
  assert.equal(contributionLimits(2026,61).k401,35750);
  assert.equal(contributionLimits(2026,50).ira,8600);
  assert.equal(contributionLimits(2025,50).ira,8000);
  assert.equal(rothLimit(2026,30,160500,false,160500),3750);
  assert.equal(rothLimit(2026,30,168000,false,168000),0);
  assert.equal(rothLimit(2026,30,1000,false,1000),1000);
});
test('mortgages use monthly amortization; zero APR and final cent payoff',()=>{
  close(monthlyPayment(300000,.06,360),1798.65);
  const l={principal:12000,rate:0,remainingMonths:12};
  for(let i=0;i<12;i++) {assert.equal(loanDue(l).payment,1000);payLoan(l,1000);}
  assert.equal(l.principal,0);assert.equal(l.remainingMonths,0);
  const expired={principal:5000,rate:0,remainingMonths:0,monthlyPayment:100};
  assert.equal(loanDue(expired).payment,5000);payLoan(expired,0);assert.equal(expired.principal,5000);
});
test('shortfalls do not invent credit or erase shocks; unpaid interest is retained',()=>{
  const p=household({cash:0,otherLoans:[{principal:10000,rate:.12,remainingTerm:1}],annualSpending:12000});
  const r=projectOneYear(p,'standard',{deterministic:true,shockAmount:5000});
  assert.equal(r.statement.expenses.unexpected,5000);assert.ok(r.statement.unfunded>17000);
  assert.equal(r.state.otherDebt,0);assert.ok(r.state.otherLoans[0].principal>10000);assert.equal(r.state.planFailed,true);
  close(r.statement.reconciliation.difference,0);
});
test('zero cash with funded costs is solvent; inaccessible retirement wealth is not spendable',()=>{
  const empty=projectOneYear(household({cash:0}),'standard',{deterministic:true});
  assert.equal(empty.state.cash,0);assert.equal(empty.statement.fundingSuccess,true);
  assert.equal(findBankInsolvencyIndex([{state:household()},empty]),-1);
  const blocked=projectOneYear(household({cash:0,k401Balance:100000,annualSpending:10000}),'standard',{deterministic:true});
  assert.equal(blocked.state.k401Balance,100000);assert.equal(blocked.statement.fundingSuccess,false);
});
test('cash-only funding: only Cash pays bills; savings, stocks and retirement money are never used automatically',()=>{
  assert.equal(FUNDING_RULE,'cash-only');
  const s=household({cash:100,savings:50000});assert.equal(raiseCash(s,1000),100);
  assert.equal(s.cash,100);assert.equal(s.savings,50000);
  const p=household({age:62,cash:0,savings:50000,savingsRate:0,stocksTotal:50000,stocksCostBasis:50000,
    k401Balance:50000,rothBalance:10000,rothContributionBasis:10000,rothOpenedYear:2010,annualSpending:12000});
  const r=projectOneYear(p,'standard',{deterministic:true});
  assert.equal(r.statement.fundingSuccess,false);assert.equal(r.state.planFailed,true);assert.equal(r.state.firstFailureYear,2026);
  assert.equal(r.state.savings,50000);assert.equal(r.state.stocksTotal,50000);
  assert.equal(r.state.k401Balance,50000);assert.equal(r.state.rothBalance,10000);
  assert.equal(r.statement.unfunded,12000);assert.equal(findBankInsolvencyIndex([{state:p},r]),1);
  close(r.statement.reconciliation.difference,0);
});
test('player transfers move Savings and Cash both ways and reject overdrafts',()=>{
  const p=household({cash:1000,savings:5000});
  const a=transferSavings(p,4000,'toCash');assert.equal(a.lastTransaction.accepted,true);
  assert.equal(a.cash,5000);assert.equal(a.savings,1000);close(computeWorth(a).netWorth,computeWorth(p).netWorth);
  const b=transferSavings(a,2500,'toSavings');assert.equal(b.cash,2500);assert.equal(b.savings,3500);
  assert.equal(transferSavings(p,6000,'toCash').lastTransaction.accepted,false);
  assert.equal(transferSavings(p,0,'toCash').lastTransaction.accepted,false);
  assert.equal(p.cash,1000);assert.equal(p.savings,5000);
});
test('one-time 401(k) withdrawals respect age 59½, the early penalty and year-end tax',()=>{
  const young=household({age:40,cash:0,k401Balance:100000});
  assert.equal(retirementAccess(young,'traditional').gated,true);
  const blocked=withdrawRetirement(young,{amount:10000});assert.equal(blocked.lastTransaction.accepted,false);
  assert.equal(blocked.k401Balance,100000);
  const early=withdrawRetirement(young,{amount:10000,early:true});assert.equal(early.lastTransaction.accepted,true);
  assert.equal(early.cash,10000);assert.equal(early.k401Balance,90000);
  assert.equal(early.taxRecord.penalties,1000);assert.equal(early.taxRecord.traditionalWithdrawals,10000);
  const older=withdrawRetirement(household({age:60,cash:0,k401Balance:100000}),{amount:20000});
  assert.equal(older.lastTransaction.accepted,true);assert.equal(older.cash,20000);assert.ok(!older.taxRecord.penalties);
  assert.equal(withdrawRetirement(older,{amount:200000}).lastTransaction.accepted,false);
});
test('a standing yearly withdrawal is the player\'s instruction: paid monthly into Cash, taxed, never automatic',()=>{
  const p=household({age:60,cash:0,k401Balance:100000,annualSpending:30000,employed:false});
  const none=projectOneYear(p,'standard',{deterministic:true});
  assert.equal(none.statement.fundingSuccess,false);assert.equal(none.state.k401Balance,100000);
  const planned=setRetirementWithdrawalPlan(p,{amount:40000,account:'traditional'});
  assert.deepEqual(planned.retirementWithdrawalPlan,{amount:40000,account:'traditional',early:false,inflationAdjusted:true});
  const r=projectOneYear(planned,'standard',{deterministic:true});
  assert.equal(r.statement.fundingSuccess,true);assert.equal(r.statement.income.traditionalWithdrawals,40000);
  assert.equal(r.statement.plannedWithdrawals,40000);assert.equal(r.state.k401Balance,60000);
  assert.ok(r.state.taxPayable<=.01);assert.equal(r.state.retirementWithdrawalPlan.amount,40000);
  close(r.statement.reconciliation.difference,0);
  // Before 59½ a traditional standing withdrawal waits unless the player accepted the penalty.
  const waiting=projectOneYear(setRetirementWithdrawalPlan({...p,age:50},{amount:40000}),'standard',{deterministic:true});
  assert.equal(waiting.state.k401Balance,100000);assert.equal(waiting.statement.fundingSuccess,false);
  assert.equal(setRetirementWithdrawalPlan(planned,{amount:0}).retirementWithdrawalPlan,undefined);
});
test('Roth basis can fund early spending only when the player withdraws it; unknown earnings cannot',()=>{
  const p=household({age:45,cash:0,rothBalance:20000,rothContributionBasis:12000,rothOpenedYear:2020,annualSpending:12000});
  assert.equal(projectOneYear(p,'standard',{deterministic:true}).statement.fundingSuccess,false);
  const w=withdrawRetirement(p,{amount:12000,account:'roth'});assert.equal(w.lastTransaction.accepted,true);
  const r=projectOneYear(w,'standard',{deterministic:true});
  assert.equal(r.statement.fundingSuccess,true);assert.equal(r.state.rothBalance,8000);assert.equal(r.tax.total,0);
  const u=withdrawRetirement({...p,rothContributionBasis:0},{amount:1000,account:'roth'});
  assert.equal(u.lastTransaction.accepted,false);assert.equal(u.rothBalance,20000);
});
test('SSA claim timing, COLA, earnings test and cohort RMD',()=>{
  close(claimFactor(62,1965),.70);close(claimFactor(70,1965),1.24);
  const p=household({age:61,retired:true,socialSecurityMonthly:1000,socialSecurityClaimAge:62});
  const a=projectOneYear(p,'standard',{deterministic:true});assert.equal(a.statement.income.socialSecurity,0);
  const b=projectOneYear(a.state,'standard',{deterministic:true});assert.equal(b.statement.income.socialSecurity,12000);
  assert.equal(requiredDistribution(246000,75,1960),10000);
  close(benefitEarningsReduction({age:62,year:2026,birthYear:1964},62,33400)*12,4460,.06);
});
test('rental cashflow is received when the owner rents a residence; operations paid once',()=>{
  const r=projectOneYear(household({housing:'rent',monthlyRent:1000,homes:[{type:'investment',value:100000,
    mortgageOwed:0,rate:0,remainingTerm:0,annualPropertyTax:1200,annualMaintenance:1200,
    annualInsurance:0,monthlyRevenue:2000,vacancyRate:0,costBasis:100000}]}),'standard',{deterministic:true});
  assert.equal(r.statement.rentalRevenue,24000);assert.equal(r.statement.expenses.rent,12000);
  assert.equal(r.statement.expenses.propertyOperating,1200);assert.equal(r.statement.expenses.propertyTax,1200);
  close(r.statement.reconciliation.difference,0);
});
test('nothing is sold automatically; a player sale consumes lots and settles gain tax exactly once',()=>{
  const p=household({cash:0,stocksTotal:100000,stocksCostBasis:0,annualSpending:80000});
  const r=projectOneYear(p,'standard',{deterministic:true});
  assert.equal(r.state.stocksTotal,100000);assert.equal(r.tax.total,0);assert.equal(r.statement.fundingSuccess,false);
  assert.equal(computeWorth(r.state).stocks,r.state.stocksTotal);close(r.statement.reconciliation.difference,0);
  const sale=sellStock(household({salary:100000,stocksTotal:50000,stocksCostBasis:0}),{proceeds:20000});
  const annual=projectOneYear(sale.state,'standard',{deterministic:true});
  assert.equal(annual.statement.income.longGains,20000);assert.ok(annual.statement.income.taxPaid>=sale.tax.total);
  close(annual.statement.reconciliation.difference,0);
});
test('home purchase closing costs and borrowing obey balance sheet conservation',()=>{
  const p=household({cash:100000,stocksTotal:100000,stocksCostBasis:100000});
  const home=buyHome(p,{value:300000,downPayment:60000,rate:0,term:30});
  assert.equal(home.lastTransaction.accepted,true);close(computeWorth(home).netWorth,computeWorth(p).netWorth-6000);
  const borrowed=takeSecuritiesLoan(p,{amount:40000,rate:0,term:10});
  assert.equal(borrowed.lastTransaction.accepted,true);close(computeWorth(borrowed).netWorth,computeWorth(p).netWorth);
  const unfunded=largePurchase(household({cash:1000}),10000);assert.equal(unfunded.lastTransaction.accepted,false);
  assert.ok(unfunded.lastTransaction.reason.startsWith(NOT_ENOUGH_CASH));
  // Purchases use Cash only: stocks and savings are not sold or moved to cover them.
  const rich=household({cash:10000,savings:100000,stocksTotal:100000,stocksCostBasis:100000});
  const home2=buyHome(rich,{value:300000,downPayment:60000,rate:0,term:30});
  assert.equal(home2.lastTransaction.accepted,false);assert.ok(home2.lastTransaction.reason.startsWith(NOT_ENOUGH_CASH));
  assert.equal(home2.stocksTotal,100000);assert.equal(home2.savings,100000);assert.equal(home2.homes.length,0);
});
test('a margin call is repaid from Cash only; no forced sale, and an unpaid excess is a glass wall',()=>{
  const loan=()=>[{type:'securities',principal:60000,rate:0,remainingTerm:10}];
  const p=household({cash:0,savings:50000,stocksTotal:100000,stocksCostBasis:100000,otherLoans:loan()});
  const statement={unfunded:0};
  applySecuritiesMarginCall(p,[],statement);
  assert.equal(p.stocksTotal,100000);assert.equal(p.savings,50000);assert.equal(p.otherLoans[0].principal,60000);
  assert.equal(p.planFailed,true);assert.equal(statement.unfunded,10000);
  applySecuritiesMarginCall(p,[],statement);assert.equal(statement.unfunded,10000); // monthly re-check is not double-counted
  const paid=household({cash:25000,stocksTotal:100000,stocksCostBasis:100000,otherLoans:loan()});
  applySecuritiesMarginCall(paid);
  assert.equal(paid.cash,15000);assert.equal(paid.otherLoans[0].principal,50000);assert.equal(paid.stocksTotal,100000);
  assert.ok(!paid.planFailed);
});
test('year-end income tax is paid from Cash only; an unpaid balance is a glass wall',()=>{
  // A $100k 401(k) withdrawal is taxable at year-end; with Cash spent, savings and stocks are not tapped.
  const p=household({age:60,cash:0,savings:100000,savingsRate:0,stocksTotal:50000,stocksCostBasis:0,k401Balance:200000});
  const withdrawn=withdrawRetirement(p,{amount:100000});assert.equal(withdrawn.lastTransaction.accepted,true);
  const r=projectOneYear({...withdrawn,cash:0},'standard',{deterministic:true});
  assert.ok(r.state.taxPayable>1000);assert.equal(r.statement.fundingSuccess,false);assert.equal(r.state.planFailed,true);
  assert.equal(r.state.savings,100000);assert.equal(r.state.stocksTotal,50000);assert.equal(r.state.k401Balance,100000);
});
test('legacy migration is idempotent, does not edit source saves, and preserves explicit zero values',()=>{
  const g=createGameFromSetup(createDefaultSetup());delete g.portfolio.financeVersion;
  g.portfolio.annualSpending=50000;g.portfolio.spendingBreakdown={other:30000,incomeTax:10000,mortgage:10000};
  const source=JSON.stringify(g), migrated=migrateGame(g);
  assert.equal(migrated.portfolio.annualSpending,30000);assert.equal(JSON.stringify(g),source);
  assert.deepEqual(migrateGame(migrated),migrated);
  assert.equal(normalizePortfolio({year:2026,age:30,annualSpending:0,savingsRate:0,stocksTotal:0}).annualSpending,0);
  assert.equal(stateFromZip('06103').abbr,'CT');assert.equal(stateFromZip('07030').abbr,'NJ');assert.equal(stateFromZip('03301').abbr,'NH');
});
test('yearly history and terminal portfolio agree without duplicated final commits',()=>{
  const g=createGameFromSetup({...createDefaultSetup(),...household({age:97}),age:97});commitHallwayNode(g);
  const snapshots=projectYears(g.portfolio,3,'standard',{deterministic:true});
  const id=completeJourney(g,snapshots.at(-1).state,snapshots);
  assert.equal(g.portfolio.age,100);assert.equal(g.scene,'ending');assert.equal(g.worthHistory.length,4);
  assert.equal(reconstructWorthAlongPath(g,id).length,4);
  assert.equal(portfolioAtYearOnBranch(g,id,2027).status,'ok');
  assert.equal(completeJourney(g,snapshots.at(-1).state,snapshots),id);assert.equal(g.worthHistory.length,4);
});

test('legacy aggregate-only sales migrate without resurrecting sold shares',()=>{
  const p=household({stocksTotal:100000,stocksCostBasis:60000});delete p.financeVersion;
  p.stocksTotal=75000;p.stocksCostBasis=45000;
  const migrated=normalizePortfolio(p);
  assert.equal(computeWorth(migrated).stocks,75000);assert.equal(migrated.stocksHoldings[0].costBasis,45000);
  assert.equal(migrated.stocksHoldings[0].shares,750);
});
test('unpaid property tax remains a liability; funding fails without free credit',()=>{
  const r=projectOneYear(household({cash:0,homes:[{value:100000,mortgageOwed:0,rate:0,
    remainingTerm:0,annualMaintenance:0,annualInsurance:0,annualPropertyTax:1200}]}),'standard',{deterministic:true});
  assert.equal(r.state.propertyTaxPayable,1200);assert.equal(r.worth.exactNetWorth,98800);
  assert.equal(r.statement.fundingSuccess,false);close(r.statement.reconciliation.difference,0);
});
test('year-end contribution limits and senior deduction do not silently disappear',()=>{
  const p=household({cash:10000,salary:100000,age:50,has401k:true,k401ContribRate:1,k401Balance:0});
  const r=projectOneYear(p,'standard',{deterministic:true});assert.equal(r.statement.employeeContribution,32500);
  const senior=estimateAnnualTax(household({age:67,salary:50000}));assert.equal(senior.meta.seniorExtra,6000);
  const future=estimateAnnualTax(household({year:2029,age:67,salary:50000}));assert.equal(future.meta.seniorExtra,0);
});

test('paid W-2 withholding is credited when reserving cash for a Roth contribution',()=>{
  const p=household({cash:0,salary:40000,annualSpending:26000,hasRoth:true,rothAnnualContribution:7500});
  const r=projectOneYear(p,'standard',{deterministic:true});
  assert.ok(r.statement.rothContribution>6000);assert.equal(r.state.taxPayable,0);close(r.statement.reconciliation.difference,0);
});
test('Roth contributions come from Cash only and are skipped quietly when Cash is short',()=>{
  // $20k wages leave well under $1k of Cash after withholding and $18k of living costs; savings stay put.
  const p=household({cash:0,salary:20000,annualSpending:18000,savings:20000,savingsRate:0,hasRoth:true,rothAnnualContribution:5000});
  const r=projectOneYear(p,'standard',{deterministic:true});
  assert.ok(r.statement.rothContribution<1000);assert.equal(r.state.savings,20000);
  assert.equal(r.statement.fundingSuccess,true);assert.ok(r.state.cash>=0);
});
