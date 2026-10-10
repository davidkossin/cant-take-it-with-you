import { copy, nonnegative, ensureHoldings, stockBook, money } from './Books.js';
import { monthlyPayment } from './Loans.js';
import { resolveDifficultyId } from './marketAssumptions.js';
import { isCurrentJourneyScenario } from './Journey.js';

export function normalizePortfolio(input, { legacy = input.financeVersion !== 2 } = {}) {
  const s = copy(input);
  const dynamic = ['No Social Security','Property tax basis','Roth basis/opening','Spouse wage ownership','Spouse age','Holding dates'];
  s.modelWarnings = (s.modelWarnings || []).filter(w => !dynamic.some(prefix => w.startsWith(prefix)));
  const warn = text => { if (!s.modelWarnings.includes(text)) s.modelWarnings.push(text); };
  if (legacy) {
    const b = s.spendingBreakdown;
    if (b && (b.incomeTax || b.mortgage || b.propertyTax || b.rent)) {
      s.annualSpending = b.other != null ? nonnegative(b.other)
        : Math.max(0, nonnegative(s.annualSpending) - nonnegative(b.incomeTax)
          - nonnegative(b.mortgage) - nonnegative(b.propertyTax) - nonnegative(b.rent));
      warn('Legacy budget converted to living costs; verify the amount in Planning inputs.');
    }
    warn('Earlier recorded outcomes used the legacy engine. Future years use financial engine v2.');
    if (s.socialSecurity && s.socialSecurityMonthly == null) warn('Legacy salary-based Social Security removed; enter the SSA statement benefit.');
  }
  s.financeVersion = 2; s.difficulty = resolveDifficultyId(s.difficulty);
  s.householdVersion ??= 1;
  s.salaryOwnershipConfirmed ??= !s.married;
  s.inflationAdjusted ??= true;s.dollarBaseYear ??= s.year;
  s.simulationSeed ??= 20261004; s.birthYear ??= s.year - Math.floor(s.age);
  s.priceIndex ??= 1; s.childCostInflator ??= 1;
  s.annualSpending = nonnegative(s.annualSpending, 30000);
  s.spendingBreakdown = { other: s.annualSpending };
  s.socialSecurityMonthly ??= 0; s.socialSecurityClaimAge ??= 67;
  s.socialSecurity = 0; s.investmentFee ??= .002;
  s.taxInflation ??= .025; s.annualCollegeCost ??= 28000;
  s.k401Allocation ??= { equity: 1 }; s.rothAllocation ??= { equity: 1 };
  s.spouseK401Allocation ??= {equity:1};s.spouseRothAllocation ??= {equity:1};
  if (s.spouseAge!=null) s.spouseBirthYear ??= s.year-Math.floor(s.spouseAge);
  s.spouseRetirementAge ??= 65;
  s.spouseSocialSecurityMonthly ??= 0;s.spouseSocialSecurityClaimAge ??= 67;
  // Presentation only (stripped from forecast state): saves from before the
  // shirt palette keep the original blue shirt.
  s.shirtColor ??= 'blue'; s.spouseShirtColor ??= 'blue';
  s.childcarePlans ||= [];
  for (const plan of s.childcarePlans) {
    plan.entryPriceIndex ??= plan.enteredPriceIndex ?? s.priceIndex;
    plan.startYear ??= s.year;
    if (plan.endYearExclusive==null && plan.years!=null) plan.endYearExclusive=plan.startYear+Math.max(0,Math.floor(plan.years));
  }
  s.homes ||= []; s.otherLoans ||= []; s.kids ||= [];
  for (const h of s.homes) {
    h.rate = nonnegative(h.rate, .065);
    h.remainingMonths ??= Math.round(nonnegative(h.remainingTerm, 30) * 12);
    h.remainingTerm = h.remainingMonths / 12;
    h.monthlyPayment ??= monthlyPayment(h.mortgageOwed, h.rate, h.remainingMonths);
    h.basisKnown ??= h.costBasis != null;
    if (!h.basisKnown) warn('Property tax basis is missing; enter it before a sale.');
    if ((h.type === 'rental' || h.type === 'investment')) warn('Rental passive losses and depreciation recapture need external verification.');
  }
  for (const l of s.otherLoans) {
    l.rate = nonnegative(l.rate);
    l.remainingMonths ??= Math.round(nonnegative(l.remainingTerm, 5) * 12);
    l.monthlyPayment ??= monthlyPayment(l.principal, l.rate, l.remainingMonths);
  }
  if (legacy && s.otherDebt > 0) warn('Legacy unsecured debt uses 10% APR over 60 months unless edited.');
  if (s.stocksCostBasis == null) { s.stocksCostBasis = nonnegative(s.stocksTotal); s.basisKnown = false; }
  if (legacy && s.stocksHoldings?.length && input.stocksTotal != null) {
    const book = stockBook(s), savedValue = nonnegative(input.stocksTotal);
    if (Math.abs(book.value - savedValue) > .01) {
      let valueLeft = money(savedValue), basisLeft = money(nonnegative(input.stocksCostBasis, book.basis));
      s.stocksHoldings.forEach((h,i) => {
        const weight = book.value > 0 ? nonnegative(h.value, nonnegative(h.shares)*nonnegative(h.price))/book.value : 1/s.stocksHoldings.length;
        const last = i === s.stocksHoldings.length - 1;
        h.value = last ? valueLeft : money(savedValue*weight);
        h.costBasis = last ? basisLeft : money(nonnegative(input.stocksCostBasis,book.basis)*weight);
        valueLeft = money(valueLeft-h.value); basisLeft = money(basisLeft-h.costBasis);
        h.shares = h.value/(h.price || 100);
      });
      warn('Legacy lot totals conflicted with saved aggregate balances. Lots were reconciled to those balances; verify brokerage records.');
    }
  }
  ensureHoldings(s);
  // Legacy saves never recorded a game-start stock baseline; fall back to the value as of this
  // migration so the Stock Broker's "since start" change has something honest to compare against.
  s.initialStocksTotal ??= s.stocksTotal;
  for (const h of s.stocksHoldings) {
    if (h.value > 0 && h.acquiredDate == null) warn('Holding dates are unknown; existing lots provisionally use long-term treatment.');
    if (!h.basisKnown) warn('Investment tax basis is missing; forecast tax uses provisional basis.');
  }
  if (s.rothBalance > 0 && (s.rothContributionBasis == null || s.rothOpenedYear == null))
    warn('Roth basis/opening year are missing; unknown earnings are unavailable for spending.');
  if (!s.socialSecurityMonthly && !s.socialSecurityMonthlyAtFRA && s.socialSecurityEligible !== false)
    warn('No Social Security benefit entered; projections include $0 until supplied.');
  if (s.married && !s.salaryOwnershipConfirmed) warn('Spouse wage ownership is not confirmed; split or confirm the existing salary total without duplicating income.');
  if (s.married && s.spouseAge == null) warn('Spouse age is unknown; enter it to model independent retirement and account access.');
  if (s.spouseRothBalance>0 && (s.spouseRothContributionBasis==null || s.spouseRothOpenedYear==null))
    warn('Roth basis/opening year are missing for the spouse; unknown earnings are unavailable for spending.');
  return s;
}
/** Migration reads a clone; original localStorage entries remain available unchanged. */
export function migrateGame(input) {
  const game = copy(input), legacy = game.portfolio?.financeVersion !== 2;
  const dollarBaseYear=game.dollarBaseYear ?? game.timeline?.startYear ?? game.timeline?.nodes?.[game.timeline?.rootId]?.year
    ?? Math.min(...Object.values(game.timeline?.nodes || {}).map(n=>n.year).filter(Number.isFinite),game.portfolio.year);
  game.portfolio = normalizePortfolio(game.portfolio);
  game.portfolio.dollarBaseYear=input.portfolio?.dollarBaseYear ?? dollarBaseYear;
  for (const [id, p] of Object.entries(game.timeline?.snapshots || {})) {
    game.timeline.snapshots[id]=normalizePortfolio(p);
    game.timeline.snapshots[id].dollarBaseYear=p.dollarBaseYear ?? dollarBaseYear;
  }
  if (legacy) {
    for (const row of game.worthHistory || []) row.legacy = true;
    for (const node of Object.values(game.timeline?.nodes || {})) node.legacy = true;
    game.flags ||= {}; game.flags.financeMigrated = true;
  }
  // A Hallway path chosen under an older selection or funding rule is dropped; the next Hallway reselects it.
  if (game.hallwayScenario != null && !isCurrentJourneyScenario(game.hallwayScenario)) game.hallwayScenario = null;
  return game;
}
