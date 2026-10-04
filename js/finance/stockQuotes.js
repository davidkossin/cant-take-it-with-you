/**
 * Online stock quote + optional 10y history for growth/volatility.
 *
 * Designed for a static GitHub Pages site (browser fetch, CORS).
 * Primary: Yahoo Finance chart JSON (query1) — often CORS-blocked in browsers.
 * Fallback A: stockprices.dev (keyless JSON; Cloudflare may challenge bots).
 * Fallback B: Stooq daily CSV quote (keyless; CORS varies by network).
 *
 * Never invents prices. Timeout ~10s overall; Loading UI is the caller's job
 * (show after 0.5s). On failure returns { ok:false, error, source }.
 */

const OVERALL_MS = 10000;
const PER_SOURCE_MS = 4500;

/**
 * @param {string} ticker
 * @param {{ signal?: AbortSignal, wantHistory?: boolean }} [opts]
 * @returns {Promise<{
 *   ok: boolean,
 *   price?: number,
 *   growth?: number,
 *   volatility?: number,
 *   source?: string,
 *   error?: string,
 *   historyYears?: number
 * }>}
 */
export async function lookupStock(ticker, opts = {}) {
  const sym = String(ticker || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, '');
  if (!sym) return { ok: false, error: 'Enter a ticker symbol.' };

  const wantHistory = opts.wantHistory !== false;
  const overallCtrl = new AbortController();
  const overallTimer = setTimeout(() => overallCtrl.abort(), OVERALL_MS);
  if (opts.signal) {
    if (opts.signal.aborted) overallCtrl.abort();
    else opts.signal.addEventListener('abort', () => overallCtrl.abort(), { once: true });
  }
  const overall = overallCtrl.signal;
  const finish = (result) => {
    clearTimeout(overallTimer);
    return result;
  };

  const errors = [];
  try {
    // 1) Yahoo chart (price + optional 10y monthly for stats)
    try {
      const y = await fetchYahoo(sym, wantHistory, overall);
      if (y.ok) return finish(y);
      errors.push(y.error || 'Yahoo failed');
    } catch (e) {
      errors.push(e?.message || 'Yahoo error');
    }

    // 2) stockprices.dev (price only)
    try {
      const s = await fetchStockpricesDev(sym, overall);
      if (s.ok) return finish(s);
      errors.push(s.error || 'stockprices.dev failed');
    } catch (e) {
      errors.push(e?.message || 'stockprices.dev error');
    }

    // 3) Stooq CSV quote
    try {
      const st = await fetchStooq(sym, overall);
      if (st.ok) return finish(st);
      errors.push(st.error || 'Stooq failed');
    } catch (e) {
      errors.push(e?.message || 'Stooq error');
    }

    return finish({
      ok: false,
      error: `Online lookup failed (${errors.slice(0, 2).join('; ') || 'timeout'}). Enter price manually — growth/vol use difficulty averages.`,
      source: 'none',
    });
  } catch (e) {
    return finish({
      ok: false,
      error: e?.message || 'Lookup failed',
      source: 'none',
    });
  }
}

async function fetchWithTimeout(url, ms, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      mode: 'cors',
      credentials: 'omit',
      headers: { Accept: 'application/json,text/plain,*/*' },
    });
    return res;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

async function fetchYahoo(sym, wantHistory, signal) {
  const range = wantHistory ? '10y' : '5d';
  const interval = wantHistory ? '1mo' : '1d';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    sym
  )}?interval=${interval}&range=${range}&includePrePost=false`;
  const res = await fetchWithTimeout(url, PER_SOURCE_MS, signal);
  if (!res.ok) return { ok: false, error: `Yahoo HTTP ${res.status}` };
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return { ok: false, error: 'Yahoo: no data' };
  const meta = result.meta || {};
  const price = Number(meta.regularMarketPrice ?? meta.previousClose);
  if (!(price > 0)) return { ok: false, error: 'Yahoo: no price' };

  const out = { ok: true, price, source: 'yahoo-chart' };
  if (wantHistory) {
    const closes = (result.indicators?.adjclose?.[0]?.adjclose ||
      result.indicators?.quote?.[0]?.close ||
      [])
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    const stats = annualStatsFromMonthlyCloses(closes);
    if (stats) {
      out.growth = stats.growth;
      out.volatility = stats.volatility;
      out.historyYears = stats.years;
    }
  }
  return out;
}

async function fetchStockpricesDev(sym, signal) {
  const url = `https://stockprices.dev/api/stocks/${encodeURIComponent(sym)}`;
  const res = await fetchWithTimeout(url, PER_SOURCE_MS, signal);
  if (!res.ok) return { ok: false, error: `stockprices.dev HTTP ${res.status}` };
  const data = await res.json();
  const price = Number(data.Price ?? data.price);
  if (!(price > 0)) return { ok: false, error: 'stockprices.dev: no price' };
  return { ok: true, price, source: 'stockprices.dev' };
}

async function fetchStooq(sym, signal) {
  const s = `${sym.toLowerCase()}.us`;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(s)}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetchWithTimeout(url, PER_SOURCE_MS, signal);
  if (!res.ok) return { ok: false, error: `Stooq HTTP ${res.status}` };
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { ok: false, error: 'Stooq: empty' };
  const cols = lines[1].split(',');
  // Symbol,Date,Time,Open,High,Low,Close,Volume
  const close = Number(cols[6]);
  if (!(close > 0)) return { ok: false, error: 'Stooq: no close' };
  return { ok: true, price: close, source: 'stooq' };
}

/**
 * From monthly adjusted closes, build calendar-year returns and mean/stdev.
 * @param {number[]} closes
 */
export function annualStatsFromMonthlyCloses(closes) {
  if (!closes || closes.length < 24) return null;
  // Approximate year-end as every 12th close from the end
  const yearEnds = [];
  for (let i = closes.length - 1; i >= 0; i -= 12) {
    yearEnds.push(closes[i]);
  }
  yearEnds.reverse();
  if (yearEnds.length < 3) return null;
  const rets = [];
  for (let i = 1; i < yearEnds.length; i++) {
    const a = yearEnds[i - 1];
    const b = yearEnds[i];
    if (a > 0 && b > 0) rets.push(b / a - 1);
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const varSample =
    rets.reduce((s, r) => s + (r - mean) * (r - mean), 0) / (rets.length - 1);
  return {
    growth: mean,
    volatility: Math.sqrt(Math.max(0, varSample)),
    years: rets.length,
  };
}

/**
 * Race a lookup against a loading callbacks schedule.
 * @param {string} ticker
 * @param {{ onLoading?: () => void, loadingAfterMs?: number, wantHistory?: boolean }} [opts]
 */
export async function lookupStockWithLoading(ticker, opts = {}) {
  const loadingAfterMs = opts.loadingAfterMs ?? 500;
  let loadingShown = false;
  const timer = setTimeout(() => {
    loadingShown = true;
    if (typeof opts.onLoading === 'function') opts.onLoading();
  }, loadingAfterMs);
  try {
    return await lookupStock(ticker, { wantHistory: opts.wantHistory });
  } finally {
    clearTimeout(timer);
    if (loadingShown && typeof opts.onLoadingDone === 'function') {
      opts.onLoadingDone();
    }
  }
}
