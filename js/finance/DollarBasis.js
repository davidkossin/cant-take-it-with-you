/**
 * Currency presentation only. Portfolio balances and transaction amounts remain
 * nominal dollars; changing this preference must never change a projection.
 */
let currentContext = null;

const positive = (value, fallback = 1) => Number.isFinite(Number(value)) && Number(value) > 0
  ? Number(value) : fallback;

/** Capture at dialog open so walking through another year cannot change input units. */
export function captureMoneyContext(portfolio = currentContext) {
  return Object.freeze({
    priceIndex: positive(portfolio?.priceIndex ?? portfolio?.inflationIndex),
    inflationAdjusted: portfolio?.inflationAdjusted !== false,
    dollarBaseYear: portfolio?.dollarBaseYear ?? null,
    year: portfolio?.year ?? null,
  });
}

export function setMoneyContext(portfolio) {
  currentContext = portfolio == null ? null : captureMoneyContext(portfolio);
  return currentContext;
}

export function getMoneyContext() { return currentContext; }

/** amountScale converts a stored base-year amount (e.g. SSA) to current nominal dollars. */
export function toDisplayMoney(amount, portfolio = currentContext, { amountScale = 1, alreadyDisplay = false } = {}) {
  const value = Number(amount) || 0;
  if (alreadyDisplay) return value;
  const context = captureMoneyContext(portfolio);
  return value * positive(amountScale) / (context.inflationAdjusted ? context.priceIndex : 1);
}

/** Convert an entered/displayed amount back to the field's stored currency basis. */
export function fromDisplayMoney(amount, portfolio = currentContext, { amountScale = 1 } = {}) {
  const context = captureMoneyContext(portfolio);
  return (Number(amount) || 0) * (context.inflationAdjusted ? context.priceIndex : 1) / positive(amountScale);
}

export function formatMoneyDisplay(amount, portfolio = currentContext, options = {}) {
  const value = Math.round(toDisplayMoney(amount, portfolio, options));
  return (value < 0 ? '-' : '') + '$' + Math.abs(value).toLocaleString('en-US');
}

export function moneyUnitSubtitle(portfolio = currentContext) {
  const context = captureMoneyContext(portfolio);
  return context.inflationAdjusted
    ? `${context.dollarBaseYear ?? 'Starting-year'} buying power`
    : `${context.year ?? 'Displayed-year'} dollars`;
}

export function inflationToggleLabel(portfolio = currentContext) {
  return `Inflation Adjustment: ${portfolio?.inflationAdjusted === false ? 'Off' : 'On'}`;
}
