import { money, nonnegative } from './Books.js';

export function monthlyPayment(principal, annualRate, months) {
  const p = nonnegative(principal), n = Math.max(0, Math.round(months));
  if (!p || !n) return p;
  const r = nonnegative(annualRate) / 12;
  return r === 0 ? p / n : p * r / -Math.expm1(-n * Math.log1p(r));
}
/** Preview, then commit only the amount actually funded. */
export function loanDue(loan, mortgage = false) {
  const principal = nonnegative(mortgage ? loan.mortgageOwed : loan.principal);
  const months = Math.max(0, Math.round(nonnegative(loan.remainingMonths, nonnegative(loan.remainingTerm) * 12)));
  const interest = money(principal * nonnegative(loan.rate) / 12);
  const scheduled = nonnegative(loan.monthlyPayment, monthlyPayment(principal, loan.rate, months));
  const payment = money(Math.min(principal + interest, months <= 1 ? principal + interest : scheduled));
  return { principal, interest, payment, months, scheduled };
}
export function payLoan(loan, paid, mortgage = false) {
  const due = loanDue(loan, mortgage);
  const payment = money(Math.min(nonnegative(paid), due.payment));
  const unpaidInterest = Math.max(0, due.interest - payment);
  const principalPaid = Math.min(due.principal, Math.max(0, payment - due.interest));
  const balance = money(due.principal - principalPaid + unpaidInterest);
  if (mortgage) loan.mortgageOwed = balance; else loan.principal = balance;
  loan.monthlyPayment = due.scheduled;
  loan.remainingMonths = Math.max(0, due.months - 1);
  loan.remainingTerm = loan.remainingMonths / 12;
  if (payment + .01 < due.payment) loan.inArrears = true;
  return { paid: payment, interest: Math.min(payment, due.interest), principal: principalPaid,
    balance, shortfall: money(due.payment - payment) };
}
