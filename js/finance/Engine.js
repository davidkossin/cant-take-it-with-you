/**
 * Financial engine v2: Jan 1 → twelve monthly cash flows → next Jan 1.
 * Gameplay, reference paths and Monte Carlo share this pure, cents-based engine.
 */
import { effectiveDifficulty } from './Difficulty.js';
import { estimateAnnualTax, estimateCapitalGainsTax, employee401kDeferral, employer401kMatch } from './Tax.js';
import { money, nonnegative, copy, stockBook, syncBook, ensureHoldings,
  liquidate, invest, incomeFor, addIncome, post, isLongTerm } from './Books.js';
import { monthlyPayment, loanDue, payLoan } from './Loans.js';
import { economicYear, holdingReturn, accountGross, availableStocks } from './Market.js';
import { monthlyBenefit, benefitEarningsReduction, requiredDistribution, rothLimit } from './Retirement.js';
import { hashSeed, mulberry32 } from './rng.js';
import { HOME_TYPES, CHILD_COST_BANDS, HELOC_CLTV, SB_LTV,
  HELOC_DEFAULT_RATE, SECURITIES_LOAN_DEFAULT_RATE } from '../config.js';

export const ENGINE_VERSION = '2.1.0';
/**
 * Funding rule: only Cash pays bills. The engine never moves savings, sells holdings or
 * withdraws retirement money on its own; the player decides (RMDs and the player's own
 * standing retirement withdrawal are the only automatic moves). A cost Cash cannot cover
 * fails that year, which raises the Hallway's glass wall.
 */
export const FUNDING_RULE = 'cash-only';
export const NOT_ENOUGH_CASH = 'Not enough cash — sell or transfer first.';
export const cloneState = copy;
export const syncStocksTotal = syncBook;
const fmt = n => Math.round(n).toLocaleString('en-US');
const monthGross = g => Math.max(0, g) ** (1 / 12);
const monthlyAmount = (annual, month) => money(annual * month / 12) - money(annual * (month - 1) / 12);
export function annualChildCost(age, difficulty = {}, inflator = 1) {
  if (age >= 18) return 0;
  return money((CHILD_COST_BANDS.find(b => age <= b.maxAge)?.annual ?? 0) * inflator);
}
/** A query must never repair or mutate holdings. */
export function computeWorth(s) {
  const book = stockBook(s), cash = nonnegative(s.cash), savings = nonnegative(s.savings);
  const k401 = nonnegative(s.k401Balance), roth = nonnegative(s.rothBalance);
  const home = (s.homes || []).reduce((n,h) => n + nonnegative(h.value), 0);
  const mortgage = (s.homes || []).reduce((n,h) => n + nonnegative(h.mortgageOwed), 0);
  const other = (s.otherLoans || []).reduce((n,l) => n + nonnegative(l.principal), 0)
    + nonnegative(s.otherDebt) + nonnegative(s.taxPayable) + nonnegative(s.propertyTaxPayable);
  const totalTaxable = money(cash + savings + book.value), liquid = money(cash + savings + availableStocks(s));
  const net = money(totalTaxable + k401 + roth + home - mortgage - other);
  return { bank: Math.round(cash), portfolio: Math.round(net), netWorth: Math.round(net), exactNetWorth: net,
    liquid, availableLiquid: money(cash + savings + availableStocks(s)), illiquid: money(home + k401 + roth + book.value - availableStocks(s)),
    homeEquity: money(home - mortgage), debts: money(mortgage + other), cash, savings, stocks: book.value,
    stocksCostBasis: book.basis, k401Balance: money(k401), rothBalance: money(roth) };
}
export const liquidTotal = s => computeWorth(s).availableLiquid;
export const annualAmortizingPayment = (p,r,t) => monthlyPayment(p,r,Math.max(0,Math.round(t*12))) * 12;
export const annualMortgagePayment = h => (h.monthlyPayment ?? monthlyPayment(h.mortgageOwed,h.rate,
  h.remainingMonths ?? Math.round(h.remainingTerm*12))) * 12;
export const annualLoanPayment = l => (l.monthlyPayment ?? monthlyPayment(l.principal,l.rate,
  l.remainingMonths ?? Math.round(l.remainingTerm*12))) * 12;
function moveSavings(s, amount) {
  const take = money(Math.min(nonnegative(s.savings),nonnegative(amount)));
  s.savings = money(nonnegative(s.savings)-take); s.cash = money(nonnegative(s.cash)+take);
  return take;
}
/** `early`: the player accepted the 10% early-withdrawal penalty for this withdrawal. */
function traditionalWithdrawal(s,amount,age,forced=false,early=false) {
  if (!forced && !early && age < 59.5 && !s.allowEarlyRetirementWithdrawals) return 0;
  const take = money(Math.min(nonnegative(s.k401Balance),amount));
  s.k401Balance = money(nonnegative(s.k401Balance)-take); s.cash = money(nonnegative(s.cash)+take);
  addIncome(s,'traditionalWithdrawals',take);
  addIncome(s,'rmdEligibleWithdrawals',take);
  if (age < 59.5 && !s.earlyWithdrawalPenaltyException) addIncome(s,'penalties',take*.10);
  post(s,forced?'rmd':'traditional-withdrawal',{amount:take});
  return take;
}
function rothWithdrawal(s,amount,age) {
  const qualified = age >= 59.5 && s.rothOpenedYear != null && s.year-s.rothOpenedYear >= 5;
  const accessible = qualified ? nonnegative(s.rothBalance)
    : Math.min(nonnegative(s.rothBalance),nonnegative(s.rothContributionBasis));
  const take = money(Math.min(accessible,amount));
  s.rothBalance = money(nonnegative(s.rothBalance)-take);
  s.rothContributionBasis = money(Math.max(0,nonnegative(s.rothContributionBasis)-take));
  s.cash = money(nonnegative(s.cash)+take); post(s,'roth-withdrawal',{amount:take,qualified});
  return take;
}
/**
 * Cash-only funding: how much of `amount` Cash can cover right now. It never moves savings,
 * sells holdings or withdraws retirement money; the player raises Cash in a Decision Room.
 */
export function raiseCash(s,amount) {
  return money(Math.min(nonnegative(amount),nonnegative(s.cash)));
}
function withdrawFrom(s,amount,age,account,early=false) {
  return account==='roth' ? rothWithdrawal(s,amount,age) : traditionalWithdrawal(s,amount,age,false,early);
}
function payCost(s,amount,label,statement,{age=s.age,debt=false}={}) {
  const required = money(nonnegative(amount));
  const paid = raiseCash(s,required); // Cash only; the unpaid rest is a shortfall.
  s.cash = money(nonnegative(s.cash)-paid);
  const shortfall = money(required-paid);
  statement.expenses[label] = money((statement.expenses[label] || 0)+required);
  statement.paidExpenses = money(statement.paidExpenses+paid);
  statement.unfunded = money(statement.unfunded+shortfall);
  if (shortfall>.01) {
    s.planFailed=true; s.firstFailureYear ??= s.year;
    if (!debt) statement.missedSpending=money(statement.missedSpending+shortfall);
  }
  post(s,'payment',{category:label,required,paid,shortfall});
  return paid;
}
/**
 * Cash-only margin call: Cash repays the loan down to the allowed loan-to-value. There is no
 * savings sweep and no forced sale; any excess Cash cannot repay fails the year (glass wall).
 * The check repeats monthly, so a statement counts only the growth of the unpaid excess.
 */
export function applySecuritiesMarginCall(s,events=[],statement=null) {
  const loans=(s.otherLoans || []).filter(l=>l.type==='securities' && l.principal>0);
  const debt=loans.reduce((n,l)=>n+l.principal,0), collateral=availableStocks(s);
  if (debt<=SB_LTV*collateral+.01) return 0;
  const excess=money(debt-SB_LTV*collateral);
  const pay=money(Math.min(excess,nonnegative(s.cash)));
  s.cash=money(nonnegative(s.cash)-pay);
  let left=pay;
  for (const l of loans) { const take=Math.min(l.principal,left); l.principal=money(l.principal-take); left=money(left-take); }
  const unpaid=money(Math.max(0,excess-pay));
  if (unpaid>.01) {
    s.planFailed=true; s.firstFailureYear ??= s.year;
    const counted=statement?.marginShortfall || 0;
    if (statement && unpaid>counted) { statement.unfunded=money(statement.unfunded+unpaid-counted); statement.marginShortfall=unpaid; }
  }
  if (!s._compact) events.push('Margin call: repaid $'+fmt(pay)+(unpaid>.01?'; not enough Cash for $'+fmt(unpaid):''));
  post(s,'margin-call',{repayment:pay,collateralSold:0,unpaid});
  return pay;
}
function settleTax(s,difficulty,statement,age,events) {
  const record=incomeFor(s), priorPayable=nonnegative(s.taxPayable);
  let tax;
  // Tax funding may create additional taxable income; reconcile to cents after every withdrawal.
  for (let i=0;i<100;i++) {
    tax=estimateAnnualTax(s,difficulty,record);
    const due=money(Math.max(0,tax.total+priorPayable-record.taxPaid));
    if (due<=.01) break;
    const available=raiseCash(s,due); // Cash only: no sales or withdrawals to pay tax.
    if (available>0) {
      s.cash=money(s.cash-available); record.taxPaid=money(record.taxPaid+available);
      post(s,'income-tax',{amount:available});
    }
    applySecuritiesMarginCall(s,events,statement);
    if (available<=.001) break;
  }
  tax=estimateAnnualTax(s,difficulty,record);
  const liability=money(tax.total+priorPayable);
  s.taxPayable=money(Math.max(0,liability-record.taxPaid));
  if (record.taxPaid>liability) s.cash=money(s.cash+record.taxPaid-liability);
  if (s.taxPayable>.01) {
    s.planFailed=true; s.firstFailureYear ??= s.year;
    statement.unfunded=money(statement.unfunded+s.taxPayable);
  }
  statement.tax=tax; statement.expenses.incomeTax=tax.total;
  statement.taxPaid=money(Math.min(record.taxPaid,liability)); statement.taxPayable=s.taxPayable;
  s.capitalLossCarry=copy(tax.meta.lossCarry);
  return tax;
}
export function projectOneYear(state,difficultyId,opts={}) {
  const difficulty=effectiveDifficulty(state,difficultyId || state.difficulty || 'standard');
  const s=copy(state), events=[];
  s._compact=!!opts.compact;
  if (opts.compact) { delete s.transactions; delete s.lastStatement; }
  ensureHoldings(s);
  const beginning=computeWorth(s), year=s.year, age=s.age;
  s.birthYear ??= year-Math.floor(age); s.priceIndex ??=1; s.childCostInflator ??=s.priceIndex;
  const income=incomeFor(s), openingTaxPaid=nonnegative(income.taxPaid), economy=economicYear(s,difficulty,opts);
  const statement={year,age,engineVersion:ENGINE_VERSION,beginning,expenses:{},income,
    paidExpenses:0,taxPaid:0,unfunded:0,missedSpending:0,employeeContribution:0,employerContribution:0,
    rothContribution:0,assetGrowth:0,priceIndex:s.priceIndex,inflation:economy.inflation,
    equityReturn:economy.equity,bondReturn:economy.bond,pensionIncome:0,loanPrincipalPaid:0,unpaidLoanInterest:0};
  const prior401=nonnegative(s.k401Balance);
  const deferralAnnual=employee401kDeferral(s), matchAnnual=employer401kMatch(s,deferralAnnual);
  const workMonths = s.employed && !s.retired ? Math.min(12,Math.max(0,Math.ceil(((s.retirementAge ?? 65)-age)*12))) : 0;
  const spouseMonths = s.spouseEmployed !== false ? Math.min(12,Math.max(0,Math.ceil(((s.spouseRetirementAge ?? s.retirementAge ?? 65)-age)*12))) : 0;
  const expectedCompensation=nonnegative(s.salary)*workMonths/12+nonnegative(s.spouseSalary)*spouseMonths/12;
  const wageWithholding=estimateAnnualTax(s,difficulty,{year,wages:nonnegative(s.salary)*workMonths/12,
    spouseWages:nonnegative(s.spouseSalary)*spouseMonths/12,deferral:deferralAnnual*workMonths/12}).total;
  const factors=new Map(s.stocksHoldings.map(h=>[h.id,monthGross(
    (1+holdingReturn(h,economy,s,opts))*(1-nonnegative(s.investmentFee,economy.investmentFee)))]));
  const divYield=nonnegative(s.equityDividendYield,economy.equityDividendYield);
  const kGross=monthGross(accountGross(economy,s.k401Allocation,s.investmentFee ?? economy.investmentFee));
  const rGross=monthGross(accountGross(economy,s.rothAllocation,s.investmentFee ?? economy.investmentFee));
  const saveGross=monthGross(1+nonnegative(s.savingsRate,economy.savingsRate));
  const homeGross=monthGross(1+economy.homeReturn);
  const rng=mulberry32(hashSeed(opts.seed ?? s.simulationSeed ?? 20261004,opts.simulationIndex ?? 0,year,'life-events'));
  const shock=opts.shockAmount!=null?nonnegative(opts.shockAmount)
    : !opts.deterministic && rng()<(s.shockChance ?? difficulty.shockChance ?? .04)
      ? money((2000+rng()*(s.shockMax ?? difficulty.shockMax ?? 8000))*s.priceIndex):0;
  for (let month=1;month<=12;month++) {
    s._month=month;
    const currentAge=age+(month-1)/12;
    if (s.employed && !s.retired && currentAge>=(s.retirementAge ?? 65)) {
      s.retired=true; s.employed=false; if (!s._compact) events.push('Retired');
    }
    let wages=0;
    if (s.employed && !s.retired) {
      wages=monthlyAmount(nonnegative(s.salary),month);
      const deferral=Math.min(wages,Math.max(0,deferralAnnual-income.deferral),monthlyAmount(deferralAnnual,month)), match=monthlyAmount(matchAnnual,month);
      s.cash=money(nonnegative(s.cash)+wages-deferral);
      s.k401Balance=money(nonnegative(s.k401Balance)+deferral+match);
      addIncome(s,'wages',wages); addIncome(s,'deferral',deferral);
      statement.employeeContribution+=deferral; statement.employerContribution+=match;
    }
    const spouseWorking=s.spouseEmployed!==false && currentAge<(s.spouseRetirementAge ?? s.retirementAge ?? 65);
    const spouseWages=spouseWorking?monthlyAmount(nonnegative(s.spouseSalary),month):0;
    s.cash=money(nonnegative(s.cash)+spouseWages); addIncome(s,'spouseWages',spouseWages);
    // Monthly estimated W-2 withholding; final tax settlement credits every prepayment.
    const wageTax=expectedCompensation>0?money(wageWithholding*(wages+spouseWages)/expectedCompensation):0;
    if (wageTax>0) {
      const paid=raiseCash(s,wageTax);
      s.cash=money(s.cash-paid);income.taxPaid=money(income.taxPaid+paid);post(s,'wage-withholding',{amount:paid});
    }
    const expectedWages = s.employed && !s.retired ? nonnegative(s.salary) * Math.min(1,Math.max(0,(s.retirementAge ?? 65)-age)) : 0;
    const benefit=Math.max(0,money(monthlyBenefit(s,currentAge,s.priceIndex)-benefitEarningsReduction(s,currentAge,expectedWages)));
    s.cash=money(s.cash+benefit); addIncome(s,'socialSecurity',benefit);
    const pension=monthlyAmount(nonnegative(s.annualPension)*(s.pensionCOLA?s.priceIndex:1),month);
    if (currentAge>=(s.pensionStartAge ?? s.retirementAge ?? 65) && pension) {
      s.cash=money(s.cash+pension); addIncome(s,'traditionalWithdrawals',pension);
      statement.pensionIncome=money(statement.pensionIncome+pension);
    }
    // The player's standing retirement withdrawal (set in a Decision Room), paid monthly into Cash.
    const plan=s.retirementWithdrawalPlan;
    if (plan && nonnegative(plan.amount)>0) {
      const got=withdrawFrom(s,monthlyAmount(nonnegative(plan.amount),month),currentAge,plan.account,!!plan.early);
      statement.plannedWithdrawals=money((statement.plannedWithdrawals || 0)+got);
    }
    for (const h of s.stocksHoldings) {
      if (!h.value) continue;
      const g=factors.get(h.id) ?? monthGross(1+economy.equity);
      const y=h.assetClass==='bond'?nonnegative(s.bondIncomeYield,.025)
        : h.assetClass==='cash'?0:nonnegative(h.dividendYield,divYield);
      const ym=monthGross(1+y)-1, before=h.value;
      h.value=money(h.value*g/(1+ym)); if (h.shares) h.price=h.value/h.shares;
      const dividend=money(h.value*ym); s.cash=money(s.cash+dividend);
      addIncome(s,h.assetClass==='bond' || h.qualifiedDividends===false?'ordinaryDividends':'qualifiedDividends',dividend);
      statement.assetGrowth+=h.value-before+dividend;
    }
    syncBook(s);
    const interest=money(nonnegative(s.savings)*(saveGross-1));
    s.savings=money(nonnegative(s.savings)+interest); addIncome(s,'interest',interest); statement.assetGrowth+=interest;
    for (const [key,g] of [['k401Balance',kGross],['rothBalance',rGross]]) {
      const before=nonnegative(s[key]); s[key]=money(before*g); statement.assetGrowth+=s[key]-before;
    }
    let rentalProfit=0;
    for (const home of s.homes || []) {
      const before=nonnegative(home.value); home.value=money(before*homeGross); statement.assetGrowth+=home.value-before;
      const rental=(home.type==='rental' || home.type==='investment');
      const revenue=rental?money(nonnegative(home.monthlyRevenue)*(1-Math.min(1,nonnegative(home.vacancyRate,.05)))):0;
      s.cash=money(s.cash+revenue); statement.rentalRevenue=money((statement.rentalRevenue || 0)+revenue);
      const propertyTax=money((home.annualPropertyTax!=null?nonnegative(home.annualPropertyTax)
        : nonnegative(home.assessedValue,before)*nonnegative(home.propertyTaxRate,.01))/12);
      const operating=money((nonnegative(home.annualMaintenance,before*.01)
        +nonnegative(home.annualInsurance,before*.003)+nonnegative(home.annualHOA))/12);
      const paidProperty=payCost(s,propertyTax,'propertyTax',statement,{age:currentAge});
      const paidOperating=payCost(s,operating,'propertyOperating',statement,{age:currentAge});
      addIncome(s,'propertyTaxPaid',paidProperty);
      s.propertyTaxPayable=money(nonnegative(s.propertyTaxPayable)+propertyTax-paidProperty);
      statement.unpaidPropertyTax=money((statement.unpaidPropertyTax || 0)+propertyTax-paidProperty);
      let interestPaid=0;
      if (home.mortgageOwed>0) {
        const due=loanDue(home,true), paid=payCost(s,due.payment,'mortgage',statement,{age:currentAge,debt:true});
        const schedule=payLoan(home,paid,true); interestPaid=Math.min(paid,due.interest);
        addIncome(s,'mortgageInterest',interestPaid); statement.loanPrincipalPaid+=schedule.principal;
        statement.unpaidLoanInterest+=Math.max(0,due.interest-paid);
        if (home.mortgageOwed<=.01 && !s._compact) events.push('Mortgage paid off: '+(home.label || home.type)+'.');
      }
      if (rental) rentalProfit+=Math.max(0,revenue-paidProperty-paidOperating-interestPaid-nonnegative(home.annualDepreciation)/12);
    }
    addIncome(s,'rentalIncome',rentalProfit);
    for (const loan of s.otherLoans || []) {
      if (!(loan.principal>0)) continue;
      const due=loanDue(loan), paid=payCost(s,due.payment,'otherLoans',statement,{age:currentAge,debt:true});
      const schedule=payLoan(loan,paid); statement.loanPrincipalPaid+=schedule.principal;
      statement.unpaidLoanInterest+=Math.max(0,due.interest-paid);
    }
    if (s.otherDebt>0) {
      const loan={principal:s.otherDebt,rate:s.otherDebtRate ?? .10,remainingMonths:s.otherDebtMonths ?? 60,monthlyPayment:s.otherDebtPayment};
      const due=loanDue(loan), paid=payCost(s,due.payment,'legacyDebt',statement,{age:currentAge,debt:true});
      const schedule=payLoan(loan,paid); statement.loanPrincipalPaid+=schedule.principal;
      statement.unpaidLoanInterest+=Math.max(0,due.interest-paid);
      s.otherDebt=loan.principal; s.otherDebtMonths=loan.remainingMonths; s.otherDebtPayment=loan.monthlyPayment;
    }
    payCost(s,monthlyAmount(nonnegative(s.annualSpending),month),'living',statement,{age:currentAge});
    if (s.housing==='rent') payCost(s,nonnegative(s.monthlyRent),'rent',statement,{age:currentAge});
    if (s.annualHealthcare) payCost(s,monthlyAmount(nonnegative(s.annualHealthcare),month),'healthcare',statement,{age:currentAge});
    for (const kid of s.kids || []) {
      if (month===1 && kid.age===18 && kid.collegeEnabled!==false && !s._compact) events.push((kid.name || 'Child')+' goes to college');
      const college=kid.age>=18 && kid.age<22 && kid.collegeEnabled!==false;
      const cost=college?nonnegative(kid.annualCollegeCost,nonnegative(s.annualCollegeCost,28000))*s.childCostInflator
        : annualChildCost(kid.age,difficulty,s.childCostInflator);
      payCost(s,monthlyAmount(cost,month),college?'college':'children',statement,{age:currentAge});
    }
    if (month===6 && shock) {
      payCost(s,shock,'unexpected',statement,{age:currentAge});
      if (!s._compact) events.push('Unexpected expense: $'+fmt(shock));
    }
    applySecuritiesMarginCall(s,events,statement);
  }
  s.socialSecurity=income.socialSecurity;
  const rmd=requiredDistribution(prior401,age,s.birthYear,
    s.rmdStillWorkingException===true && s.employed && !s.retired && !s.fivePercentOwner);
  if (rmd>(income.rmdEligibleWithdrawals || 0)) traditionalWithdrawal(s,rmd-(income.rmdEligibleWithdrawals || 0),age+11/12,true);
  if (s.propertyTaxPayable>0) {
    const paid=payCost(s,s.propertyTaxPayable,'propertyTaxArrears',statement,{age:age+11/12,debt:true});
    s.propertyTaxPayable=money(s.propertyTaxPayable-paid); statement.loanPrincipalPaid+=paid;
  }
  const preview=estimateAnnualTax(s,difficulty,income);
  // Year-end Roth funding from Cash only (after reserving tax due), legal compensation/MAGI caps,
  // and an explicit five-year clock. Optional: skipped quietly when Cash is short.
  const cap=rothLimit(year,age,preview.meta.agi,s.married,income.wages+income.spouseWages,s.taxInflation ?? .025);
  const roth=money(Math.min(nonnegative(s.rothAnnualContribution),cap,
    Math.max(0,nonnegative(s.cash)-Math.max(0,preview.total+nonnegative(s.taxPayable)-income.taxPaid))));
  if (s.hasRoth!==false && roth>0) {
    s.cash=money(s.cash-roth);
    s.rothBalance=money(nonnegative(s.rothBalance)+roth);
    s.rothContributionBasis=money(nonnegative(s.rothContributionBasis)+roth); s.rothOpenedYear ??=year;
    statement.rothContribution=roth; post(s,'roth-contribution',{amount:roth,eligibleLimit:cap});
  }
  const tax=settleTax(s,difficulty,statement,age+11/12,events);
  for (const key of ['assetGrowth','employeeContribution','employerContribution','loanPrincipalPaid','unpaidLoanInterest']) statement[key]=money(statement[key]);
  statement.ending=computeWorth(s); statement.fundingSuccess=statement.unfunded<=.01;
  statement.requiredSpending=money(Object.values(statement.expenses).reduce((n,v)=>n+v,0));
  const grossIncome=income.wages+income.spouseWages+income.socialSecurity+statement.pensionIncome+(statement.rentalRevenue || 0);
  const consumption=statement.paidExpenses-statement.loanPrincipalPaid;
  statement.reconciliation={beginning:beginning.exactNetWorth,ending:statement.ending.exactNetWorth,
    income:money(grossIncome),employerMatch:statement.employerContribution,marketAndInterest:statement.assetGrowth,
    consumptionAndInterest:money(consumption),taxes:money(tax.total-openingTaxPaid),accruedLoanInterest:statement.unpaidLoanInterest};
  statement.reconciliation.difference=money(statement.ending.exactNetWorth-beginning.exactNetWorth
    -grossIncome-statement.employerContribution-statement.assetGrowth+consumption+tax.total-openingTaxPaid+statement.unpaidLoanInterest+(statement.unpaidPropertyTax || 0));
  s.year=year+1; s.age=money(age+1);
  for (const kid of s.kids || []) kid.age=money(nonnegative(kid.age)+1);
  if (s.employed && !s.retired) s.salary=money(nonnegative(s.salary)*(1+economy.salaryGrowth)); else s.salary=0;
  if (s.spouseSalary && age<(s.spouseRetirementAge ?? s.retirementAge ?? 65)) s.spouseSalary=money(s.spouseSalary*(1+economy.salaryGrowth));
  s.priceIndex*=1+economy.inflation;
  s.childCostInflator*=1+(s.educationInflation ?? economy.inflation);
  s.annualSpending=money(nonnegative(s.annualSpending)*(1+economy.inflation));
  s.monthlyRent=money(nonnegative(s.monthlyRent)*(1+(s.rentGrowth ?? economy.inflation)));
  s.annualHealthcare=money(nonnegative(s.annualHealthcare)*(1+(s.healthcareInflation ?? economy.inflation)));
  if (s.retirementWithdrawalPlan?.amount>0 && s.retirementWithdrawalPlan.inflationAdjusted!==false)
    s.retirementWithdrawalPlan.amount=money(s.retirementWithdrawalPlan.amount*(1+economy.inflation));
  for (const h of s.homes || []) {
    if (h.annualPropertyTax!=null) h.annualPropertyTax=money(h.annualPropertyTax*(1+(h.propertyTaxGrowth ?? economy.inflation)));
    for (const key of ['annualMaintenance','annualInsurance','annualHOA']) if (h[key]!=null) h[key]=money(h[key]*(1+economy.inflation));
    h.monthlyRevenue=money(nonnegative(h.monthlyRevenue)*(1+(h.rentGrowth ?? economy.inflation)));
  }
  s.spendingBreakdown={other:s.annualSpending}; s.otherLoans=(s.otherLoans || []).filter(l=>l.principal>.01);
  if (!opts.compact) s.lastStatement=statement;
  s.fundingStatus={success:statement.fundingSuccess,unfunded:statement.unfunded,firstFailureYear:s.firstFailureYear ?? null};
  delete s._month; delete s._compact;
  return {state:s,events,tax,worth:computeWorth(s),statement};
}
export function projectYears(baseline,years,difficultyId,opts={}) {
  let state=copy(baseline); const snapshots=[], options={...opts,startYear:opts.startYear ?? baseline.year};
  for (let i=0;i<years;i++) { const r=projectOneYear(state,difficultyId,options); snapshots.push(r); state=r.state; }
  return snapshots;
}
export function projectAtProgress(baseline,progress,difficultyId,opts={}) {
  const yearOffset=Math.min(Math.max(0,100-baseline.age),Math.floor(progress*Math.max(0,100-baseline.age)));
  return yearOffset?{...projectYears(baseline,yearOffset,difficultyId,opts).at(-1),yearOffset}
    : {state:copy(baseline),yearOffset,events:[],worth:computeWorth(baseline)};
}
export function findBankInsolvencyIndex(snapshots) {
  for (let k=1;k<(snapshots?.length || 0);k++) if (snapshots[k].state?.planFailed
    || snapshots[k].statement?.fundingSuccess===false || snapshots[k].state?.fundingStatus?.success===false) return k;
  return -1;
}
function rejected(state,reason) { const s=copy(state); s.lastTransaction={accepted:false,reason}; return s; }
function accepted(s,description) { s.lastTransaction={accepted:true,description}; return s; }
/** Atomic purchase from Cash only. Nothing is sold or transferred to cover it. */
function fundPurchase(state,cost) {
  const due=money(nonnegative(cost));
  if (due>nonnegative(state.cash)+.001) return null;
  const s=copy(state); s.cash=money(nonnegative(s.cash)-due); return s;
}
const notEnoughCash=(state,cost)=>NOT_ENOUGH_CASH+'\nNeeds $'+fmt(nonnegative(cost))+'; Cash is $'+fmt(nonnegative(state.cash))+'.';
export function buyHome(state,spec) {
  const value=nonnegative(spec.value),down=nonnegative(spec.downPayment);
  if (!(value>0) || down>value) return rejected(state,'Invalid home value or down payment.');
  const closing=nonnegative(spec.closingCosts,value*.02),s=fundPurchase(state,money(down+closing));
  if (!s) return rejected(state,notEnoughCash(state,down+closing));
  const mortgage=money(value-down),months=Math.round(nonnegative(spec.term,30)*12),rate=nonnegative(spec.rate,.065);
  s.homes ||= []; s.homes.push({...spec,type:spec.type || 'primary',
    label:spec.label || HOME_TYPES[spec.type || 'primary']?.label || 'Home',value,costBasis:money(value+closing),
    mortgageOwed:mortgage,rate,remainingMonths:months,remainingTerm:months/12,
    monthlyPayment:monthlyPayment(mortgage,rate,months),propertyTaxRate:nonnegative(spec.propertyTaxRate,.012),
    monthlyRevenue:nonnegative(spec.monthlyRevenue),acquiredDate:String(s.year)+'-01-01',basisKnown:true});
  post(s,'buy-home',{value,downPayment:down,closingCosts:closing,mortgage});
  return accepted(s,'Home purchased.');
}
export function sellHome(state,index,opts={}) {
  const home=state.homes?.[index];
  if (!home) return rejected(state,'Home does not exist.');
  if (home.basisKnown===false || home.costBasis==null) return rejected(state,'Enter the verified property tax basis before selling this home.');
  if ((home.type==='rental' || home.type==='investment') && nonnegative(home.depreciationTaken)>0 && opts.recaptureTax==null)
    return rejected(state,'Rental sale requires a verified depreciation recapture tax estimate.');
  let s=copy(state); const h=s.homes[index],proceeds=nonnegative(opts.proceeds,h.value),fee=nonnegative(opts.sellingCosts,proceeds*.06);
  const lienIndices=(s.otherLoans || []).map((l,i)=>l.type==='heloc' && l.homeIndex===index?i:-1).filter(i=>i>=0);
  const secured=lienIndices.reduce((n,i)=>n+s.otherLoans[i].principal,0)+h.mortgageOwed,net=money(proceeds-fee-secured);
  if (net<0) {
    const funded=fundPurchase(s,-net);
    if (!funded) return rejected(state,notEnoughCash(state,-net));
    s=funded;
  } else s.cash=money(nonnegative(s.cash)+net);
  const exclusion=h.type==='primary' && opts.exclusionEligible===true?(s.married?500000:250000):0;
  const rawGain=money(proceeds-fee-h.costBasis-exclusion);
  const gain=(h.type==='rental' || h.type==='investment')?rawGain:Math.max(0,rawGain);
  addIncome(s,isLongTerm(h,String(s.year)+'-01-01')?'longGains':'shortGains',gain);
  if (opts.recaptureTax>0) addIncome(s,'penalties',opts.recaptureTax);
  s.homes.splice(index,1); s.otherLoans=(s.otherLoans || []).filter((l,i)=>!lienIndices.includes(i));
  for (const l of s.otherLoans) if (l.type==='heloc' && l.homeIndex>index) l.homeIndex--;
  if (h.type==='primary') s.housing='rent';
  post(s,'sell-home',{proceeds,sellingCosts:fee,liens:secured,gain,netCash:net});
  return accepted(s,'Property sold. Gain is included in this tax year.');
}
export function buyStock(state,amount,opts={}) {
  const cost=money(nonnegative(amount));
  if (!cost || cost>nonnegative(state.cash)+nonnegative(state.savings)) return rejected(state,'The full purchase amount must be available in cash or savings.');
  const s=copy(state); moveSavings(s,Math.max(0,cost-nonnegative(s.cash)));
  s.cash=money(s.cash-cost); invest(s,cost,opts); return accepted(s,'Investment purchased.');
}
export function sellStock(state,opts={},difficulty=null) {
  if ((state.stocksHoldings || []).some(h=>!h.illiquid && h.basisKnown===false && (!opts.holdingId || h.id===opts.holdingId)))
    return {state:rejected(state,'Enter verified tax basis before selling these holdings.'),proceeds:0,netCash:0,gains:0,basis:0,tax:{federal:0,state:0,niit:0,total:0,longTerm:false}};
  const s=copy(state),held=availableStocks(s);
  const amount=opts.percent!=null?held*nonnegative(opts.percent)/100:nonnegative(opts.proceeds);
  const sale=liquidate(s,amount,{holdingId:opts.holdingId,date:opts.date});
  const tax=estimateCapitalGainsTax({...sale,state,difficulty:difficulty || {}});
  const withholding=money(Math.min(nonnegative(tax.total),s.cash));
  s.cash=money(s.cash-withholding); incomeFor(s).taxPaid=money(incomeFor(s).taxPaid+withholding);
  return {state:accepted(s,'Holdings sold.'),tax,netCash:money(sale.proceeds-withholding),...sale};
}
export const sellStockSimple=(s,amount)=>sellStock(s,{proceeds:amount}).state;
export function setEmployment(state,mode) {
  const s=copy(state);
  if (mode==='leave' || mode==='retire') { s.employed=false; s.retired=mode==='retire'; s.salary=0; }
  if (mode==='start') { s.retired=false; s.employed=nonnegative(s.salary)>0; }
  return s;
}
export function addKid(state,kid={}) {
  const s=copy(state); s.kids ||= [];
  if (s.kids.length<4) s.kids.push({...kid,name:kid.name || 'Child '+(s.kids.length+1),age:kid.age ?? 0}); return s;
}
export function largePurchase(state,amount,opts={}) {
  const price=money(nonnegative(amount)),down=opts.financed?Math.min(price,nonnegative(opts.downPayment)):price;
  if (!price) return rejected(state,'Enter a positive purchase amount.');
  const s=fundPurchase(state,down);
  if (!s) return rejected(state,notEnoughCash(state,down));
  const label=opts.label?.trim() || 'Large Purchase';
  if (opts.financed && price>down) {
    const months=Math.max(1,Math.round(nonnegative(opts.term,5)*12)),rate=nonnegative(opts.rate);
    s.otherLoans ||= []; s.otherLoans.push({label,principal:money(price-down),rate,remainingMonths:months,remainingTerm:months/12,
      monthlyPayment:monthlyPayment(price-down,rate,months),originalAmount:price-down});
  }
  s.milestones ||= []; s.milestones.push({year:s.year,age:s.age,message:'Purchased '+label});
  post(s,'large-purchase',{price,down,financed:!!opts.financed}); return accepted(s,'Purchase funded.');
}
export function helocCapacity(s,index) {
  const h=s.homes?.[index]; if (!h) return 0;
  const existing=(s.otherLoans || []).filter(l=>l.type==='heloc' && l.homeIndex===index).reduce((n,l)=>n+l.principal,0);
  return money(Math.max(0,HELOC_CLTV*h.value-h.mortgageOwed-existing));
}
export function securitiesLoanCapacity(s) {
  const existing=(s.otherLoans || []).filter(l=>l.type==='securities').reduce((n,l)=>n+l.principal,0);
  return money(Math.max(0,SB_LTV*availableStocks(s)-existing));
}
function borrow(state,opts,type) {
  const cap=type==='heloc'?helocCapacity(state,Number(opts.homeIndex)):securitiesLoanCapacity(state),amount=money(nonnegative(opts.amount));
  if (!amount || amount>cap) return rejected(state,'Requested borrowing exceeds available collateral capacity.');
  const s=copy(state),rate=nonnegative(opts.rate,type==='heloc'?HELOC_DEFAULT_RATE:SECURITIES_LOAN_DEFAULT_RATE);
  const months=Math.max(1,Math.round(nonnegative(opts.term,type==='heloc'?15:10)*12));
  s.otherLoans ||= []; s.otherLoans.push({type,homeIndex:type==='heloc'?Number(opts.homeIndex):undefined,
    label:opts.label || (type==='heloc'?'HELOC':'Loan against shares'),principal:amount,rate,
    remainingMonths:months,remainingTerm:months/12,monthlyPayment:monthlyPayment(amount,rate,months),originalAmount:amount});
  s.cash=money(nonnegative(s.cash)+amount); post(s,'borrow',{type,amount,rate,months}); return accepted(s,'Loan proceeds added to cash.');
}
/** Player action: move money between Savings and Cash ('toCash' or 'toSavings'). */
export function transferSavings(state,amount,direction='toCash') {
  const want=money(nonnegative(amount)), toSavings=direction==='toSavings';
  const from=toSavings?'cash':'savings', to=toSavings?'savings':'cash';
  if (!(want>0)) return rejected(state,'Enter a positive amount.');
  if (want>nonnegative(state[from])+.001)
    return rejected(state,'Only $'+fmt(nonnegative(state[from]))+' is in '+(toSavings?'Cash':'Savings')+'.');
  const s=copy(state);
  s[from]=money(nonnegative(s[from])-want); s[to]=money(nonnegative(s[to])+want);
  post(s,'transfer',{from,to,amount:want});
  return accepted(s,'Moved $'+fmt(want)+' from '+(toSavings?'Cash to Savings':'Savings to Cash')+'.');
}
/** What the player can withdraw now from 'traditional' (401(k)) or 'roth' under the age/basis rules. */
export function retirementAccess(state,account='traditional',{early=false}={}) {
  const age=state.age;
  if (account==='roth') {
    const qualified=age>=59.5 && state.rothOpenedYear!=null && state.year-state.rothOpenedYear>=5;
    return {available:money(qualified?nonnegative(state.rothBalance)
      :Math.min(nonnegative(state.rothBalance),nonnegative(state.rothContributionBasis))),qualified,penalty:false};
  }
  const gated=age<59.5 && !early && !state.allowEarlyRetirementWithdrawals;
  return {available:gated?0:money(nonnegative(state.k401Balance)),gated,
    penalty:age<59.5 && !state.earlyWithdrawalPenaltyException};
}
/**
 * Player action: one-time withdrawal into Cash. Traditional withdrawals are taxable income
 * (settled at year-end from Cash); before 59½ they need `early` (10% penalty accepted).
 * Roth uses contribution basis first; earnings need 59½ and the five-year clock.
 */
export function withdrawRetirement(state,{amount,account='traditional',early=false}={}) {
  const want=money(nonnegative(amount));
  if (!(want>0)) return rejected(state,'Enter a positive amount.');
  const access=retirementAccess(state,account,{early});
  if (account!=='roth' && access.gated)
    return rejected(state,'Before age 59½ a 401(k) withdrawal needs your OK to pay the 10% early-withdrawal penalty.');
  if (want>access.available+.001)
    return rejected(state,'Only $'+fmt(access.available)+' can be withdrawn from '+(account==='roth'?'the Roth':'the 401(k)')+' now.');
  const s=copy(state), got=withdrawFrom(s,want,s.age,account,early);
  if (!(got>0)) return rejected(state,'Nothing could be withdrawn.');
  return accepted(s,'Withdrew $'+fmt(got)+' from '+(account==='roth'?'the Roth':'the 401(k)')+' into Cash.'
    +(account==='roth'?'':' It is taxed at year-end'+(access.penalty?' with a 10% early-withdrawal penalty':'')+'.'));
}
/**
 * Player action: a standing yearly withdrawal (today's dollars, grows with inflation), paid into
 * Cash in monthly parts. Amount 0 cancels it. Traditional withdrawals wait for 59½ unless `early`.
 */
export function setRetirementWithdrawalPlan(state,{amount,account='traditional',early=false}={}) {
  const s=copy(state), yearly=money(nonnegative(amount));
  if (!(yearly>0)) { delete s.retirementWithdrawalPlan; return accepted(s,'Standing withdrawal cancelled.'); }
  s.retirementWithdrawalPlan={amount:yearly,account:account==='roth'?'roth':'traditional',early:!!early,inflationAdjusted:true};
  post(s,'standing-withdrawal',{...s.retirementWithdrawalPlan});
  return accepted(s,'Standing withdrawal set: $'+fmt(yearly)+' a year from '+(account==='roth'?'the Roth':'the 401(k)')+'.');
}
export const takeHeloc=(s,opts={})=>borrow(s,opts,'heloc');
export const takeSecuritiesLoan=(s,opts={})=>borrow(s,opts,'securities');
export { estimateCapitalGainsTax };
