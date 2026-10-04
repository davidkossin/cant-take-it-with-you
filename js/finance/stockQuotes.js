/**
 * Online stock quote + optional history for growth/volatility.
 *
 * Static GitHub Pages (browser fetch, CORS). Do not invent prices.
 *
 * Primary: CNBC keyless quote JSON. Sends Access-Control-Allow-Origin: *
 * so a page on https://dkossin.com can read it. A browser User-Agent is
 * required by their edge; the browser sets that itself (page script cannot).
 * Fallback A: CNBC harmony chart (different host, same ACAO: *) — recent
 * last close only, never a stale bar.
 * Fallback B: Yahoo chart. Often 200 from Node with a browser UA, but the
 * response has no Access-Control-Allow-Origin, so browsers fail immediately.
 * Fallback C: Stooq CSV. TLS/CORS are unreliable; kept as a last resort.
 *
 * stockprices.dev is not used: Cloudflare error 1000 (DNS to a prohibited IP).
 *
 * Timeout ~10s overall. Loading UI is the caller's job (show after 0.5s).
 * On failure returns { ok:false, error, source }.
 */

const OVERALL_MS = 10000;
const PER_SOURCE_MS = 4500;
/** Chart close older than this is not a "current" price. */
const MAX_PRICE_AGE_DAYS = 10;

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
    // 1) CNBC quote (CORS-open). Price only; history is a second request.
    try {
      const q = await fetchCnbcQuote(sym, overall);
      if (q.ok) {
        if (wantHistory) await attachCnbcHistory(q, sym, overall);
        return finish(q);
      }
      errors.push(q.error || 'CNBC quote failed');
    } catch (e) {
      errors.push(errText(e, 'CNBC quote error'));
    }

    // 2) CNBC chart last close (CORS-open), only if the bar is recent
    try {
      const c = await fetchCnbcChartPrice(sym, overall);
      if (c.ok) {
        if (wantHistory) await attachCnbcHistory(c, sym, overall);
        return finish(c);
      }
      errors.push(c.error || 'CNBC chart failed');
    } catch (e) {
      errors.push(errText(e, 'CNBC chart error'));
    }

    // 3) Yahoo chart — no browser CORS; may still work outside the browser
    try {
      const y = await fetchYahoo(sym, wantHistory, overall);
      if (y.ok) return finish(y);
      errors.push(y.error || 'Yahoo failed');
    } catch (e) {
      errors.push(errText(e, 'Yahoo error'));
    }

    // 4) Stooq CSV quote
    try {
      const st = await fetchStooq(sym, overall);
      if (st.ok) return finish(st);
      errors.push(st.error || 'Stooq failed');
    } catch (e) {
      errors.push(errText(e, 'Stooq error'));
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

function errText(e, fallback) {
  if (e?.name === 'AbortError') return 'timeout';
  return e?.message || fallback;
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
    // No custom headers: CNBC's edge answers OPTIONS with 403, so a
    // preflight would fail the lookup before the GET. Default Accept is
    // CORS-safelisted. The browser supplies User-Agent; do not set it here.
    const res = await fetch(url, {
      signal: ctrl.signal,
      mode: 'cors',
      credentials: 'omit',
    });
    return res;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

function cnbcQuoteUrl(sym) {
  return (
    'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=' +
    encodeURIComponent(sym) +
    '&requestMethod=itv&noCache=1&partnerId=2&fund=1&exthrs=1&output=json'
  );
}

function cnbcChartUrl(sym, range) {
  return (
    'https://ts-api.cnbc.com/harmony/app/charts/' +
    encodeURIComponent(range) +
    '.json?symbol=' +
    encodeURIComponent(sym)
  );
}

function parsePrice(raw) {
  if (typeof raw === 'number') return raw > 0 ? raw : NaN;
  const n = Number(String(raw ?? '').replace(/[$,\s]/g, ''));
  return n > 0 ? n : NaN;
}

async function fetchCnbcQuote(sym, signal) {
  const url = cnbcQuoteUrl(sym);
  const res = await fetchWithTimeout(url, PER_SOURCE_MS, signal);
  if (!res.ok) return { ok: false, error: `CNBC HTTP ${res.status}` };
  const data = await res.json();
  let rows = data?.FormattedQuoteResult?.FormattedQuote;
  if (!rows) return { ok: false, error: 'CNBC: no quote' };
  if (!Array.isArray(rows)) rows = [rows];
  const q =
    rows.find((row) => String(row?.symbol || '').toUpperCase() === sym) || null;
  if (!q) return { ok: false, error: 'CNBC: symbol mismatch' };
  // code 1 (unknown symbol) must not become a price, even if a field is set.
  if (Number(q.code) !== 0) return { ok: false, error: `CNBC: no quote for ${sym}` };
  const price = parsePrice(q.last);
  if (!(price > 0)) return { ok: false, error: 'CNBC: no price' };
  return { ok: true, price, source: 'cnbc' };
}

async function fetchCnbcChartPrice(sym, signal) {
  const url = cnbcChartUrl(sym, '5D');
  const res = await fetchWithTimeout(url, PER_SOURCE_MS, signal);
  if (!res.ok) return { ok: false, error: `CNBC chart HTTP ${res.status}` };
  const data = await res.json();
  if (data?.status === 'ERROR') return { ok: false, error: 'CNBC chart: no data' };
  const bars = data?.barData?.priceBars;
  if (!Array.isArray(bars) || !bars.length) return { ok: false, error: 'CNBC chart: empty' };
  const last = bars[bars.length - 1];
  const stamp = String(last?.tradeTime || '').slice(0, 8);
  const price = parsePrice(last?.close);
  if (!(price > 0) || !/^\d{8}$/.test(stamp)) {
    return { ok: false, error: 'CNBC chart: no close' };
  }
  const age = stampAgeDays(stamp);
  if (age == null || age > MAX_PRICE_AGE_DAYS || age < -1) {
    return { ok: false, error: 'CNBC chart: stale' };
  }
  return { ok: true, price, source: 'cnbc-chart' };
}

async function attachCnbcHistory(out, sym, signal) {
  try {
    const stats = await fetchCnbcHistory(sym, signal);
    if (!stats) return;
    out.growth = stats.growth;
    out.volatility = stats.volatility;
    out.historyYears = stats.years;
  } catch {
    // A missing history must not drop a real price.
  }
}

async function fetchCnbcHistory(sym, signal) {
  const url = cnbcChartUrl(sym, '10Y');
  const res = await fetchWithTimeout(url, PER_SOURCE_MS, signal);
  if (!res.ok) return null;
  const data = await res.json();
  const bars = data?.barData?.priceBars;
  if (!Array.isArray(bars)) return null;
  const dated = [];
  for (const b of bars) {
    const date = String(b?.tradeTime || '').slice(0, 8);
    const close = parsePrice(b?.close);
    if (/^\d{8}$/.test(date) && close > 0) dated.push({ date, close });
  }
  return annualStatsFromDatedCloses(dated);
}

/**
 * Last close in each calendar year → mean and sample stdev of annual returns.
 * Needs at least three year-end points. Short listings (SPCX, IPO 2026) return null.
 * @param {{ date: string, close: number }[]} bars sorted ascending
 */
function annualStatsFromDatedCloses(bars) {
  if (!bars || bars.length < 2) return null;
  const byYear = new Map();
  for (const b of bars) {
    byYear.set(b.date.slice(0, 4), b.close);
  }
  const years = [...byYear.keys()].sort();
  if (years.length < 3) return null;
  const rets = [];
  for (let i = 1; i < years.length; i++) {
    const a = byYear.get(years[i - 1]);
    const b = byYear.get(years[i]);
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

/** YYYYMMDD age vs America/New_York today. */
function stampAgeDays(stamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t)?.value;
  const today = `${g('year')}${g('month')}${g('day')}`;
  if (!/^\d{8}$/.test(today) || !/^\d{8}$/.test(stamp)) return null;
  const toUtc = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  return Math.round((toUtc(today) - toUtc(stamp)) / 86400000);
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
  const got = String(meta.symbol || '').toUpperCase();
  if (got && got !== sym) return { ok: false, error: 'Yahoo: symbol mismatch' };

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
  const got = String(cols[0] || '').toUpperCase();
  if (got && !got.startsWith(sym)) return { ok: false, error: 'Stooq: symbol mismatch' };
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
