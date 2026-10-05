/** Currency and authoritative holdings. No scene/DOM dependencies. */
export const money = n => Math.round((Number(n) || 0) * 100) / 100;
export const nonnegative = (n, fallback = 0) => n == null || !Number.isFinite(Number(n))
  ? fallback : Math.max(0, Number(n));
export const copy = obj => JSON.parse(JSON.stringify(obj));

export function stockBook(state) {
  if (Array.isArray(state.stocksHoldings) && (state.stocksHoldings.length || state.stocksMode === 'specific')) {
    let value = 0, basis = 0;
    for (const h of state.stocksHoldings) {
      value += nonnegative(h.value, nonnegative(h.shares) * nonnegative(h.price));
      basis += nonnegative(h.costBasis, nonnegative(h.shares) * nonnegative(h.purchasePrice));
    }
    return { value: money(value), basis: money(basis) };
  }
  return { value: money(nonnegative(state.stocksTotal)), basis: money(nonnegative(state.stocksCostBasis)) };
}
export function syncBook(state) {
  const book = stockBook(state);
  state.stocksTotal = book.value;
  state.stocksCostBasis = book.basis;
  return book.value;
}
export function ensureHoldings(state) {
  if (!state.stocksHoldings?.length && state.stocksMode !== 'specific' && nonnegative(state.stocksTotal) > 0) {
    state.stocksHoldings = [{ id: 'market', ticker: 'MARKET', assetClass: 'equity',
      shares: state.stocksTotal / 100, price: 100, value: state.stocksTotal,
      costBasis: nonnegative(state.stocksCostBasis), basisKnown: state.basisKnown !== false,
      acquiredDate: state.acquiredDate || null, holdingPeriod: state.holdingPeriod || 'long' }];
  }
  state.stocksHoldings ||= [];
  for (let i = 0; i < state.stocksHoldings.length; i++) {
    const h = state.stocksHoldings[i];
    h.id ||= h.ticker || `holding-${i}`;
    h.value = nonnegative(h.value, nonnegative(h.shares) * nonnegative(h.price));
    h.costBasis = nonnegative(h.costBasis, nonnegative(h.shares) * nonnegative(h.purchasePrice));
    h.price = nonnegative(h.price, 100) || 100;
    h.shares = nonnegative(h.shares, h.value / h.price);
    h.basisKnown ??= true;
  }
  return syncBook(state);
}

export function emptyIncome(year) {
  return { year, wages: 0, spouseWages: 0, deferral: 0, spouseDeferral: 0,
    interest: 0, qualifiedDividends: 0, ordinaryDividends: 0, shortGains: 0,
    longGains: 0, traditionalWithdrawals: 0, socialSecurity: 0, rentalIncome: 0,
    mortgageInterest: 0, propertyTaxPaid: 0, penalties: 0, taxPaid: 0 };
}
export function incomeFor(state) {
  if (!state.taxRecord || state.taxRecord.year !== state.year) state.taxRecord = emptyIncome(state.year);
  return state.taxRecord;
}
export function addIncome(state, key, amount) {
  const r = incomeFor(state);
  r[key] = money((r[key] || 0) + amount);
}
export function post(state, type, fields = {}) {
  if (!state._compact) {
    state.transactions ||= [];
    state.transactions.push({ year: state.year, month: state._month || 1, type, ...fields });
    // Keep detail for the current year; statements retain aggregates.
    if (state.transactions.length > 600) state.transactions.splice(0, state.transactions.length - 600);
  }
}
export function isLongTerm(h, date) {
  if (!h.acquiredDate) return h.holdingPeriod !== 'short';
  const acquired = new Date(`${h.acquiredDate}T00:00:00Z`);
  const anniversary = new Date(acquired);
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  return new Date(`${date}T00:00:00Z`) > anniversary;
}

/** Sell proportionally by default, or one selected lot. Never modifies cached totals alone. */
export function liquidate(state, amount, { holdingId = null, date = `${state.year}-01-01` } = {}) {
  ensureHoldings(state);
  const eligible = state.stocksHoldings.filter(h => !h.illiquid && (!holdingId || h.id === holdingId));
  const available = eligible.reduce((n, h) => n + h.value, 0);
  const proceeds = money(Math.min(nonnegative(amount), available));
  if (!proceeds || !available) return { proceeds: 0, basis: 0, gains: 0, shortGains: 0, longGains: 0 };
  let remaining = proceeds, basis = 0, shortGains = 0, longGains = 0;
  eligible.forEach((h, i) => {
    const later = eligible.slice(i + 1).reduce((n, lot) => n + lot.value, 0);
    const take = Math.min(h.value, remaining, Math.max(money(remaining - later),
      i === eligible.length - 1 ? remaining : money(proceeds * h.value / available)));
    const fraction = h.value > 0 ? take / h.value : 0;
    const removed = money(h.costBasis * fraction);
    const gain = money(take - removed);
    if (isLongTerm(h, date)) longGains += gain; else shortGains += gain;
    h.value = money(h.value - take);
    h.costBasis = money(h.costBasis - removed);
    h.shares *= 1 - fraction;
    remaining = money(remaining - take);
    basis += removed;
  });
  addIncome(state, 'shortGains', shortGains);
  addIncome(state, 'longGains', longGains);
  state.cash = money(nonnegative(state.cash) + proceeds);
  syncBook(state);
  const result = { proceeds, basis: money(basis), gains: money(shortGains + longGains),
    shortGains: money(shortGains), longGains: money(longGains) };
  post(state, 'sale', result);
  return result;
}
export function invest(state, amount, { ticker = 'MARKET', holdingId = null, price = 100,
  assetClass = 'equity', acquiredDate = `${state.year}-01-01` } = {}) {
  ensureHoldings(state);
  let h = holdingId && state.stocksHoldings.find(x => x.id === holdingId);
  // A purchase is a new lot; don't rewrite acquisition dates on old shares.
  if (!h) {
    h = { id: `${ticker}-${state.year}-${state.stocksHoldings.length}`, ticker, assetClass,
      value: 0, costBasis: 0, shares: 0, price: nonnegative(price, 100) || 100,
      acquiredDate, basisKnown: true };
    state.stocksHoldings.push(h);
  }
  h.value = money(h.value + amount);
  h.costBasis = money(h.costBasis + amount);
  h.shares += amount / (h.price || 100);
  syncBook(state);
  post(state, 'buy', { amount, holdingId: h.id });
}
