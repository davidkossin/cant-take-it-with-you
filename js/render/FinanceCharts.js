/**
 * Financial overview charts, drawn by reusable renderers.
 *
 * The Pause > Charts page and Map Compare both call drawFinanceChart(): one dataset gives the
 * normal page, two datasets give the side-by-side compare (same chart type, colors, legend and,
 * where it makes sense, one shared y-axis). Everything a chart draws stays inside its own box.
 *
 * Data only comes from what the engine already produces: the Monte Carlo forecast (series,
 * scenarioSeries, reference rows with yearly statements, failureByYear), computeWorth() for today,
 * and the worthHistory rows recorded while playing.
 */

import { hairline } from './hdText.js';

const FONT = 'px "Press Start 2P", monospace';
const font = px => `${px}${FONT}`;
const num = v => (Number.isFinite(v) ? v : 0);

/** One concept = one color. No color is reused for a different concept anywhere in these charts. */
export const FIN_COLORS = {
  cash: '#7cc4ec', savings: '#5fd0a8', stocks: '#e3b341', k401: '#a98ae8', sk401: '#7a5fc0',
  roth: '#e49ad8', sroth: '#b5609f', home: '#c98a5a', mortgage: '#e0605a', otherDebt: '#9c3434',
  net: '#ffffff', bandOuter: 'rgba(86,136,206,0.32)', bandInner: 'rgba(86,136,206,0.62)', path: '#5ff0ff',
  wages: '#4f8fe0', swages: '#3768b0', ss: '#36b5a8', pension: '#8fd16a', k401w: '#cbb8f7',
  divint: '#f5e6a0', rental: '#4fae6a', living: '#f0a35e', housing: '#cf6f45', health: '#f07c8a',
  kids: '#f2b8d4', college: '#c86fa6', loans: '#b84a4a', unexpected: '#9a7b55', taxes: '#9aa3ad',
  match: '#e2d8ff', federal: '#8193b0', state: '#c3ccd8', payroll: '#5f6f86', niit: '#d8b49a',
  penalties: '#ff8a70', rate: '#ffe08a', unpaid: '#ff4d4d', event: '#ffd34d', risk: '#ef7f7f',
  axis: '#5c6270', grid: 'rgba(255,255,255,0.08)', text: '#e8e8e8', muted: '#9aa0aa', title: '#f0d080',
  today: '#f0d080', cursor: 'rgba(255,255,255,0.55)',
};

export const CHART_KINDS = ['summary', 'networth', 'assets', 'cashflow', 'saving', 'taxes', 'history', 'risk'];
export const CHART_TITLES = {
  summary: 'Summary', networth: 'Net worth outlook', assets: 'Assets & debts', cashflow: 'Money in & out',
  saving: 'Saving & withdrawals', taxes: 'Taxes', history: 'Your years so far', risk: 'Chance of running short',
};
/** Chart kinds with a year axis (zoom and the year cursor apply). */
export const TIME_KINDS = new Set(['networth', 'assets', 'cashflow', 'saving', 'taxes', 'history', 'risk']);
/** Chart kinds that show money (the dollars toggle applies). */
export const MONEY_KINDS = new Set(['summary', 'networth', 'assets', 'cashflow', 'saving', 'taxes', 'history']);

// ---------------------------------------------------------------- formatting

/** Short money for axes and readouts: $0, $950, $12k, $1.2M, -$40k. */
export function shortMoney(v) {
  const a = Math.abs(v), sign = v < 0 ? '-' : '';
  const trim = x => String(Number(x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2)));
  if (a >= 1e9) return `${sign}$${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}$${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}$${trim(a / 1e3)}k`;
  return `${sign}$${Math.round(a)}`;
}
const pct = v => `${Math.round(v * 100)}%`;

// ---------------------------------------------------------------- data

/** Split a computeWorth() result (or a worthHistory row carrying it) into chart categories. */
export function worthParts(w) {
  if (!w || w.cash === undefined || w.homeEquity === undefined) return null;
  const cash = num(w.cash), savings = num(w.savings), stocks = num(w.stocks);
  const k401 = num(w.k401Balance), roth = num(w.rothBalance), sk401 = num(w.spouseK401Balance), sroth = num(w.spouseRothBalance);
  const equity = num(w.homeEquity), debts = Math.max(0, num(w.debts));
  const net = Number.isFinite(w.exactNetWorth) ? w.exactNetWorth : num(w.netWorth);
  // computeWorth reports home equity and total debts; non-mortgage debt is what's left over.
  const financial = cash + savings + stocks + k401 + roth + sk401 + sroth;
  const otherDebt = Math.min(debts, Math.max(0, Math.round(financial + equity - net)));
  const mortgage = Math.max(0, debts - otherDebt);
  const home = Math.max(0, equity + mortgage);
  return { cash, savings, stocks, k401, sk401, roth, sroth, home, mortgage, otherDebt, net: num(w.netWorth) };
}

function statementParts(st) {
  const inc = st.income || {}, ex = st.expenses || {}, tax = st.tax || {};
  const pension = num(st.pensionIncome);
  const k401w = Math.max(0, num(inc.traditionalWithdrawals) - pension);
  const money = {
    wages: num(inc.wages), swages: num(inc.spouseWages), ss: num(inc.socialSecurity), pension,
    k401w, divint: num(inc.interest) + num(inc.qualifiedDividends) + num(inc.ordinaryDividends),
    stockSales: num(st.plannedStockSales), rental: num(st.rentalRevenue),
    living: num(ex.living), housing: num(ex.mortgage) + num(ex.rent) + num(ex.propertyTax) + num(ex.propertyOperating),
    health: num(ex.healthcare), kids: num(ex.childcare) + num(ex.children), college: num(ex.college),
    loans: num(ex.otherLoans) + num(ex.legacyDebt), unexpected: num(ex.unexpected), taxes: num(ex.incomeTax),
    toK401: num(st.employeeContribution), match: num(st.employerContribution), toRoth: num(st.rothContribution),
    federal: num(tax.federal), state: num(tax.state), payroll: num(tax.payroll), niit: num(tax.niit),
    penalties: num(tax.penalties), unpaid: num(st.unfunded),
  };
  money.taxTotal = st.tax ? money.federal + money.state + money.payroll + money.niit + money.penalties : money.taxes;
  money.grossIncome = money.wages + money.swages + money.ss + pension + k401w + money.divint
    + num(inc.shortGains) + num(inc.longGains) + money.rental;
  return money;
}

/**
 * Normalize one timeline's numbers for every chart kind.
 * @param {object} p
 * @param {object|null} p.forecast  finishForecast() result (may be provisional)
 * @param {Array} [p.history]  worthHistory-style rows
 * @param {object|null} [p.today]  computeWorth() of the portfolio at the start of the forecast
 * @param {number} [p.todayPriceIndex]
 * @param {string} [p.label]
 */
export function buildChartData({ forecast = null, history = [], today = null, todayPriceIndex = 1, todayYear, todayAge, label = '', color = null } = {}) {
  const series = forecast?.series || [], scenario = forecast?.scenarioSeries || [], reference = forecast?.reference || [];
  const start = series[0] || scenario[0] || history.at(-1) || {};
  const startYear = todayYear ?? start.year ?? 0, startAge = todayAge ?? start.age ?? 0;
  const deflators = new Map();
  for (const r of scenario) {
    const d = Math.abs(r.realNetWorth) > 1 ? r.netWorth / r.realNetWorth : Math.abs(r.realLiquid) > 1 ? r.liquid / r.realLiquid : null;
    if (d && Number.isFinite(d) && d > 0) deflators.set(r.year, d);
  }
  const balances = [];
  if (today) balances.push({ year: startYear, parts: worthParts(today), index: deflators.get(startYear) || todayPriceIndex || 1 });
  for (const r of reference) {
    if (r.year === startYear && balances.length) continue;
    balances.push({ year: r.year, parts: worthParts(r.worth), index: deflators.get(r.year) || r.priceIndex || 1, events: r.events || [] });
  }
  const flows = [];
  for (const r of reference) {
    const st = r.statement;
    if (!st) continue;
    flows.push({ year: st.year ?? r.year - 1, parts: statementParts(st), index: num(st.priceIndex) || 1, events: r.events || [] });
  }
  const past = (history || []).filter(h => Number.isFinite(h?.year)).map(h => ({
    year: h.year, parts: worthParts(h), net: num(h.netWorth), index: h.legacy ? null : (num(h.priceIndex) || 1),
  }));
  return {
    label, color, forecast, series, scenario, reference, balances, flows, past,
    paths: forecast?.count ?? null, provisional: !!forecast?.provisional || (!reference.length && !!series.length),
    failure: forecast?.failureByYear || [], success: forecast?.successProbability ?? null,
    todayYear: startYear, todayAge: startAge, ageAt: y => startAge + (y - startYear),
    today: today ? worthParts(today) : null, todayIndex: deflators.get(startYear) || todayPriceIndex || 1,
  };
}

const deflate = (v, index, real) => (real && index ? v / index : v);

// ---------------------------------------------------------------- chart specs

const ASSET_CATS = ['cash', 'savings', 'stocks', 'k401', 'sk401', 'roth', 'sroth', 'home'];
const DEBT_CATS = ['mortgage', 'otherDebt'];
const IN_CATS = ['wages', 'swages', 'ss', 'pension', 'k401w', 'stockSales', 'divint', 'rental'];
const OUT_CATS = ['living', 'housing', 'health', 'kids', 'college', 'loans', 'unexpected', 'taxes', 'toK401', 'toRoth'];
const SAVE_IN = ['toK401', 'match', 'toRoth'];
const SAVE_OUT = ['k401w', 'stockSales'];
const TAX_CATS = ['federal', 'state', 'payroll', 'niit', 'penalties'];
const COLOR_OF = { stockSales: 'stocks', toK401: 'k401', toRoth: 'roth' };
const colorOf = key => FIN_COLORS[COLOR_OF[key] || key];

function catLabels(spouse) {
  return {
    cash: 'Cash (checking)', savings: 'Savings', stocks: 'Stocks (taxable)', k401: spouse ? 'Your 401(k)' : '401(k)',
    sk401: 'Spouse 401(k)', roth: spouse ? 'Your Roth' : 'Roth IRA', sroth: 'Spouse Roth', home: 'Home value',
    mortgage: 'Mortgage', otherDebt: 'Other debts', wages: spouse ? 'Your pay' : 'Pay', swages: 'Spouse pay',
    ss: 'Social Security', pension: 'Pension', k401w: '401(k) withdrawals', stockSales: 'Stock sales',
    divint: 'Interest & dividends', rental: 'Rent received', living: 'Living costs', housing: 'Housing',
    health: 'Healthcare', kids: 'Kids', college: 'College', loans: 'Loan payments', unexpected: 'Surprises',
    taxes: 'Taxes', toK401: 'Into 401(k)', match: 'Employer match', toRoth: 'Into Roth',
    federal: 'Federal', state: 'State', payroll: 'Payroll (SS/Medicare)', niit: 'Investment surtax', penalties: 'Penalties',
  };
}

/** Category keys that are non-zero somewhere in these rows, in display order. */
function presentKeys(keys, rowsList) {
  return keys.filter(k => rowsList.some(rows => rows.some(r => Math.abs(r.v?.[k] || 0) >= 1)));
}

function metricKey(opts) {
  return (opts.metric === 'liquid' ? 'liquid' : 'netWorth');
}

/** Year range of a chart's data for one dataset. */
function dataYears(kind, d) {
  if (kind === 'networth') return d.series.map(r => r.year);
  if (kind === 'assets') return d.balances.map(r => r.year);
  if (kind === 'history') return d.past.map(r => r.year);
  if (kind === 'risk') return d.failure.map(r => r.year);
  return d.flows.map(r => r.year);
}

/** Prepared per-dataset rows for a kind: [{year, v:{...}}] in display dollars. */
function prepare(kind, d, opts) {
  const real = !!opts.real;
  if (kind === 'networth') {
    const key = opts.metric === 'liquid' ? (real ? 'realLiquid' : 'liquid') : (real ? 'realNetWorth' : 'netWorth');
    const pathKey = opts.metric === 'liquid' ? (real ? 'realLiquid' : 'liquid') : (real ? 'realNetWorth' : 'netWorth');
    const pathByYear = new Map(d.scenario.map(r => [r.year, r[pathKey]]));
    return d.series.map(r => ({ year: r.year, v: { ...(r[key] || {}), path: pathByYear.get(r.year) } }));
  }
  if (kind === 'assets' || kind === 'history') {
    const rows = kind === 'assets' ? d.balances : d.past;
    return rows.filter(r => !(real && kind === 'history' && r.index == null)).map(r => {
      const v = {};
      if (r.parts) for (const k of [...ASSET_CATS, ...DEBT_CATS]) v[k] = deflate(r.parts[k], r.index, real);
      v.net = deflate(r.parts ? r.parts.net : r.net, r.index, real);
      return { year: r.year, v, partial: !r.parts, events: r.events };
    });
  }
  if (kind === 'risk') return d.failure.map(r => ({ year: r.year, v: { risk: num(r.fraction) } }));
  return d.flows.map(r => {
    const v = {};
    for (const [k, x] of Object.entries(r.parts)) v[k] = deflate(x, r.index, real);
    v.rate = r.parts.grossIncome > 0 ? r.parts.taxTotal / r.parts.grossIncome : 0;
    return { year: r.year, v, events: r.events };
  });
}

const sum = (v, keys) => keys.reduce((a, k) => a + Math.max(0, v[k] || 0), 0);

/** [min, max] money values a chart needs to show for prepared rows. */
function valueExtent(kind, rows, opts) {
  let lo = 0, hi = 0;
  const take = x => { if (Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } };
  for (const r of rows) {
    const v = r.v;
    if (kind === 'networth') { take(v.p10); take(v.p90); take(v.path); }
    else if (kind === 'assets' || kind === 'history') { take(sum(v, ASSET_CATS)); take(-sum(v, DEBT_CATS)); take(v.net); }
    else if (kind === 'cashflow') { take(sum(v, IN_CATS)); take(-sum(v, OUT_CATS)); }
    else if (kind === 'saving') { take(sum(v, SAVE_IN)); take(-sum(v, SAVE_OUT)); }
    else if (kind === 'taxes') take(sum(v, TAX_CATS));
    else if (kind === 'risk') take(v.risk);
  }
  if (opts.log && kind === 'networth') {
    let pos = Infinity;
    for (const r of rows) for (const k of ['p10', 'p50', 'p90', 'path']) if (r.v[k] > 0) pos = Math.min(pos, r.v[k]);
    return [pos, hi, true];
  }
  return [lo, hi, false];
}

// ---------------------------------------------------------------- axes

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** Linear or log y-scale with round tick values. */
export function niceYScale(lo, hi, top, bottom, { log = false, ticks = 5, percent = false } = {}) {
  if (log && hi > 0) {
    const min = Number.isFinite(lo) && lo > 0 ? lo : hi / 1000;
    const a = Math.floor(Math.log10(min)), b = Math.ceil(Math.log10(hi * 1.05));
    const lmin = Math.log10(min) - 0.02, lmax = Math.max(lmin + 0.5, Math.log10(hi * 1.08));
    const project = v => bottom - ((Math.log10(Math.max(v, 10 ** lmin)) - lmin) / (lmax - lmin)) * (bottom - top);
    const values = [];
    for (let e = a; e <= b; e++) for (const m of [1, 2, 5]) { const t = m * 10 ** e; if (t >= 10 ** lmin && t <= 10 ** lmax) values.push(t); }
    const thin = values.length > ticks + 2 ? values.filter(t => Math.abs(Math.log10(t) % 1) < 1e-9) : values;
    return { log: true, project, ticks: thin.length ? thin : values, min: 10 ** lmin, max: 10 ** lmax, zero: bottom };
  }
  if (!(hi > lo)) { hi = lo + (percent ? 0.1 : 1000); }
  const step = niceStep((hi - lo) / ticks);
  const min = lo < 0 ? Math.floor(lo * 1.04 / step - 1e-9) * step : 0;
  const max = hi > 0 ? Math.ceil(hi * 1.04 / step - 1e-9) * step : (min < 0 ? 0 : step);
  const project = v => bottom - ((v - min) / (max - min)) * (bottom - top);
  const values = [];
  for (let t = min; t <= max + step / 2; t += step) values.push(Math.round(t / step) * step);
  return { log: false, project, ticks: values, min, max, zero: project(Math.max(min, Math.min(max, 0))) };
}

function xTickStep(n, width) {
  const fit = Math.max(2, Math.floor(width / 96));
  for (const s of [1, 2, 5, 10, 20, 25, 50]) if (Math.ceil(n / s) <= fit) return s;
  return 100;
}

// ---------------------------------------------------------------- drawing helpers

function text(ctx, str, x, y, px, color, align = 'left', base = 'top') {
  ctx.font = font(px); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
  ctx.fillText(str, x, y);
}

function measure(ctx, str, px) { ctx.font = font(px); return ctx.measureText(str).width || 0; }

/** Greedy word wrap; returns lines (never more than maxLines, last one ellipsized). */
export function wrapLines(ctx, str, px, maxW, maxLines = 3) {
  const words = String(str).split(/\s+/).filter(Boolean), lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(ctx, next, px) > maxW) { lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && measure(ctx, `${last}...`, px) > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}...`;
    return kept;
  }
  return lines;
}

function swatch(ctx, item, x, y, s) {
  if (item.type === 'line') {
    ctx.strokeStyle = item.color; hairline(ctx, 3);
    ctx.beginPath(); ctx.moveTo(x, y + s / 2); ctx.lineTo(x + s, y + s / 2); ctx.stroke();
  } else if (item.type === 'dot') {
    ctx.fillStyle = item.color; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s / 3, 0, Math.PI * 2); ctx.fill();
  } else if (item.type === 'dash') {
    ctx.strokeStyle = item.color; hairline(ctx, 2); ctx.setLineDash?.([4, 3]);
    ctx.beginPath(); ctx.moveTo(x, y + s / 2); ctx.lineTo(x + s, y + s / 2); ctx.stroke(); ctx.setLineDash?.([]);
  } else {
    ctx.fillStyle = item.color; ctx.fillRect(x, y + 1, s, s - 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; hairline(ctx, 1); ctx.strokeRect(x, y + 1, s, s - 2);
  }
}

/** Legend with real swatches: wrapping rows (landscape) or a column grid (portrait). Returns height used. */
export function drawLegend(ctx, items, x, y, w, { px = 12, grid = false, measureOnly = false } = {}) {
  if (!items.length) return 0;
  const s = Math.round(px * 1.1), gap = Math.round(px * 1.6), rowH = Math.round(px * 2);
  if (grid) {
    const widest = Math.max(...items.map(it => measure(ctx, it.label, px)));
    const cols = Math.max(1, Math.min(3, Math.floor(w / (s + 8 + widest + 18))));
    const colW = w / cols, rows = Math.ceil(items.length / cols);
    if (!measureOnly) items.forEach((it, i) => {
      const cx = x + (i % cols) * colW, cy = y + Math.floor(i / cols) * rowH;
      swatch(ctx, it, cx, cy, s);
      let label = it.label;
      while (label.length > 3 && measure(ctx, label, px) > colW - s - 14) label = label.slice(0, -1);
      text(ctx, label, cx + s + 8, cy + 1, px, FIN_COLORS.text);
    });
    return rows * rowH;
  }
  let cx = x, cy = y;
  for (const it of items) {
    const iw = s + 8 + measure(ctx, it.label, px);
    if (cx > x && cx + iw > x + w) { cx = x; cy += rowH; }
    if (!measureOnly) { swatch(ctx, it, cx, cy, s); text(ctx, it.label, cx + s + 8, cy + 1, px, FIN_COLORS.text); }
    cx += iw + gap;
  }
  return cy - y + rowH;
}

function legendItems(kind, prepared, opts, data) {
  const spouse = prepared.some(rows => rows.some(r => (r.v?.sk401 || 0) + (r.v?.sroth || 0) + (r.v?.swages || 0) >= 1));
  const L = catLabels(spouse);
  const box = k => ({ label: L[k], color: colorOf(k) });
  const hasEvents = prepared.some(rows => rows.some(r => r.events?.length));
  if (kind === 'networth') {
    const items = [
      { label: 'Middle outcome', color: FIN_COLORS.net, type: 'line' },
      { label: 'Middle half of futures', color: FIN_COLORS.bandInner },
      { label: '8 in 10 futures', color: FIN_COLORS.bandOuter },
    ];
    if (prepared.some(rows => rows.some(r => Number.isFinite(r.v.path)))) items.push({ label: 'Your sampled future', color: FIN_COLORS.path, type: 'line' });
    if (data.some(d => d.reference.some(r => r.events?.length))) items.push({ label: 'Life event', color: FIN_COLORS.event, type: 'dot' });
    return items;
  }
  if (kind === 'assets' || kind === 'history') {
    const items = [...presentKeys(ASSET_CATS, prepared), ...presentKeys(DEBT_CATS, prepared)].map(box);
    items.push({ label: 'Net worth', color: FIN_COLORS.net, type: 'line' });
    if (hasEvents) items.push({ label: 'Life event', color: FIN_COLORS.event, type: 'dot' });
    return items;
  }
  if (kind === 'cashflow') {
    const items = [...presentKeys(IN_CATS, prepared), ...presentKeys(OUT_CATS, prepared)].map(box);
    if (prepared.some(rows => rows.some(r => r.v.unpaid >= 1))) items.push({ label: 'Unpaid bills', color: FIN_COLORS.unpaid, type: 'dot' });
    if (hasEvents) items.push({ label: 'Life event', color: FIN_COLORS.event, type: 'dot' });
    return items;
  }
  if (kind === 'saving') return [...presentKeys(SAVE_IN, prepared), ...presentKeys(SAVE_OUT, prepared)].map(box);
  if (kind === 'taxes') return [...presentKeys(TAX_CATS, prepared).map(box), { label: 'Effective rate (right axis)', color: FIN_COLORS.rate, type: 'line' }];
  if (kind === 'risk') return [{ label: 'Share of futures that have run short', color: FIN_COLORS.risk }];
  return [];
}

function describe(kind, opts, data) {
  const n = data.find(d => d.paths)?.paths || 1000;
  const unit = opts.real ? `Amounts in ${opts.realLabel || 'starting-year'} dollars.` : 'Amounts in future (nominal) dollars.';
  const cashWord = opts.metric === 'liquid';
  switch (kind) {
    case 'summary': return `The big picture for this timeline, from your balances today and ${n.toLocaleString('en-US')} simulated futures. ${unit}`;
    case 'networth': return `${cashWord ? 'Cash (checking + savings + stocks you could sell)' : 'Net worth (everything you own minus what you owe)'} across ${n.toLocaleString('en-US')} simulated futures. White = the middle outcome; shading = where the middle half and 8 in 10 futures land; cyan = the one future your Hallway follows. ${unit}`;
    case 'assets': return `What you own (above zero) and owe (below zero) each year in your sampled future: the one simulated future your Hallway follows. White line = net worth. ${unit}`;
    case 'cashflow': return `Money coming in (above zero) and going out (below zero) each year in your sampled future, including taxes and what you put into retirement accounts. ${unit}`;
    case 'saving': return `Money moved into your retirement accounts (above zero: your 401(k) and Roth contributions plus your employer's match) and taken out of investments (below zero), in your sampled future. ${unit}`;
    case 'taxes': return `Taxes paid each year in your sampled future, by type. The line is your effective rate: all taxes divided by total income (right axis). ${unit}`;
    case 'history': return `What actually happened in the years you've played: what you owned and owed at the start of each year. White line = net worth. ${unit}`;
    case 'risk': return `Out of ${n.toLocaleString('en-US')} simulated futures, the share where Cash has run out at least once by each year (a stress gauge, not a score).`;
    default: return '';
  }
}

function readout(kind, rows, year, d, opts) {
  const r = rows.find(x => x.year === year);
  const age = d.ageAt(year);
  const head = `${year} (age ${age})`;
  if (!r) return { main: `${head}: no data for this year` };
  const v = r.v, ev = (r.events || []).filter(Boolean);
  const events = ev.length ? `Events: ${ev.join('; ')}` : '';
  if (kind === 'networth') {
    const path = Number.isFinite(v.path) ? ` | your future ${shortMoney(v.path)}` : '';
    const refEvents = d.reference.find(x => (x.statement?.year ?? x.year - 1) === year)?.events || [];
    return { main: `${head}: middle ${shortMoney(v.p50)} | middle half ${shortMoney(v.p25)} to ${shortMoney(v.p75)} | 8 in 10 ${shortMoney(v.p10)} to ${shortMoney(v.p90)}${path}`,
      extra: refEvents.length ? `Events: ${refEvents.join('; ')}` : '' };
  }
  if (kind === 'assets' || kind === 'history') {
    if (r.partial) return { main: `${head}: net worth ${shortMoney(v.net)} (older save: no breakdown)` };
    const retire = (v.k401 || 0) + (v.sk401 || 0) + (v.roth || 0) + (v.sroth || 0);
    return { main: `${head}: net worth ${shortMoney(v.net)} | Cash + savings ${shortMoney((v.cash || 0) + (v.savings || 0))} | stocks ${shortMoney(v.stocks || 0)} | retirement ${shortMoney(retire)} | home ${shortMoney(v.home || 0)} | debts ${shortMoney((v.mortgage || 0) + (v.otherDebt || 0))}`, extra: events };
  }
  if (kind === 'cashflow') {
    const inn = sum(v, IN_CATS), out = sum(v, OUT_CATS);
    const unpaid = v.unpaid >= 1 ? ` | unpaid bills ${shortMoney(v.unpaid)}` : '';
    return { main: `${head}: in ${shortMoney(inn)} | out ${shortMoney(out)} | left over ${shortMoney(inn - out)} | taxes ${shortMoney(v.taxes)}${unpaid}`, extra: events };
  }
  if (kind === 'saving') {
    const inn = sum(v, SAVE_IN), out = sum(v, SAVE_OUT);
    return { main: `${head}: into retirement ${shortMoney(inn)} (match ${shortMoney(v.match)}) | taken out ${shortMoney(out)} | net ${shortMoney(inn - out)}` };
  }
  if (kind === 'taxes') {
    return { main: `${head}: total ${shortMoney(sum(v, TAX_CATS))} | federal ${shortMoney(v.federal)} | state ${shortMoney(v.state)} | payroll ${shortMoney(v.payroll)} | effective rate ${pct(v.rate)}` };
  }
  if (kind === 'risk') return { main: `${head}: ${pct(v.risk)} of futures have run short by this year` };
  return { main: head };
}

// ---------------------------------------------------------------- plot drawing

function drawStackedBars(ctx, rows, P, upKeys, downKeys, yS) {
  const bw = Math.max(1, Math.min(P.slot * 0.78, 46));
  for (const r of rows) {
    const cx = P.xAt(r.year);
    let up = 0, down = 0;
    for (const k of upKeys) {
      const v = Math.max(0, r.v[k] || 0); if (!v) continue;
      const y0 = yS.project(up), y1 = yS.project(up + v);
      ctx.fillStyle = colorOf(k); ctx.fillRect(cx - bw / 2, y1, bw, Math.max(1, y0 - y1)); up += v;
    }
    for (const k of downKeys) {
      const v = Math.max(0, r.v[k] || 0); if (!v) continue;
      const y0 = yS.project(-down), y1 = yS.project(-down - v);
      ctx.fillStyle = colorOf(k); ctx.fillRect(cx - bw / 2, y0, bw, Math.max(1, y1 - y0)); down += v;
    }
  }
}

function drawLine(ctx, pts, color, width) {
  const ok = pts.filter(p => Number.isFinite(p[1]));
  if (!ok.length) return;
  ctx.strokeStyle = color; hairline(ctx, width);
  ctx.beginPath();
  ok.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  if (ok.length === 1) { ctx.fillStyle = color; ctx.fillRect(ok[0][0] - 3, ok[0][1] - 3, 6, 6); }
}

function drawBand(ctx, rows, P, yS, loK, hiK, color) {
  const ok = rows.filter(r => Number.isFinite(r.v[loK]) && Number.isFinite(r.v[hiK]));
  if (ok.length < 2) return;
  ctx.fillStyle = color; ctx.beginPath();
  ok.forEach((r, i) => { const x = P.xAt(r.year), y = yS.project(r.v[hiK]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  for (let i = ok.length - 1; i >= 0; i--) ctx.lineTo(P.xAt(ok[i].year), yS.project(ok[i].v[loK]));
  ctx.closePath(); ctx.fill();
}

function shortEvent(e) {
  const s = String(e).replace(/^Unexpected expense: /, 'Surprise ');
  return s.length > 18 ? `${s.slice(0, 17)}.` : s;
}

/** Event dots along the top of the plot, labeled when there is room. */
function drawEvents(ctx, eventRows, P, { labels = true, px = 10 } = {}) {
  const shown = eventRows.filter(r => r.events?.length && r.year >= P.x0 && r.year <= P.x1);
  for (const r of shown) {
    const x = P.xAt(r.year);
    ctx.fillStyle = FIN_COLORS.event; ctx.beginPath(); ctx.arc(x, P.top + 7, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (!labels) return;
  // Labels sit in two rows under the dots, each on a dark plate; any that would collide are skipped.
  const lastEnd = [-Infinity, -Infinity];
  for (const r of shown) {
    const x = P.xAt(r.year);
    const label = shortEvent(r.events[0]) + (r.events.length > 1 ? ` +${r.events.length - 1}` : '');
    const w = measure(ctx, label, px);
    const lx = Math.min(x - 4, P.left + P.w - w - 10);
    const row = lastEnd[0] <= lx ? 0 : lastEnd[1] <= lx ? 1 : -1;
    if (row < 0) continue;
    const ly = P.top + 16 + row * (px + 10);
    ctx.fillStyle = 'rgba(10,12,18,0.82)'; ctx.fillRect(lx - 3, ly - 3, w + 8, px + 7);
    text(ctx, label, lx + 1, ly, px, FIN_COLORS.event);
    lastEnd[row] = lx + w + 16;
  }
}

/**
 * Draw one plot (axes, data, Today marker, cursor) inside `box`. Clipped to the plot area.
 * Returns the plot geometry so callers can map a tap/hover x to a year.
 */
function drawPlot(ctx, kind, rows, d, box, dom, opts) {
  const px = opts.portrait ? 11 : 12;
  const labelW = Math.max(measure(ctx, '-$999k', px), measure(ctx, '$9.99M', px)) + 14;
  const rightW = kind === 'taxes' ? measure(ctx, '100%', px) + 14 : 10;
  const P = { left: box.x + labelW, top: box.y + 6, w: box.w - labelW - rightW, h: box.h - px * 3 - 18, x0: dom.x0, x1: dom.x1 };
  const n = Math.max(1, dom.x1 - dom.x0 + 1);
  P.slot = P.w / n;
  P.xAt = year => P.left + (year - dom.x0 + 0.5) * P.slot;
  P.yearAt = x => Math.round(dom.x0 + (x - P.left) / P.slot - 0.5);
  const bottom = P.top + P.h;
  const yS = kind === 'risk'
    ? niceYScale(0, Math.max(0.1, dom.hi), P.top, bottom, { percent: true, ticks: 4 })
    : niceYScale(dom.lo, dom.hi, P.top, bottom, { log: dom.log, ticks: opts.portrait ? 4 : 5 });

  // Frame + grid + y labels.
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(P.left, P.top, P.w, P.h);
  for (const t of yS.ticks) {
    const y = yS.project(t);
    if (y < P.top - 1 || y > bottom + 1) continue;
    ctx.fillStyle = t === 0 ? 'rgba(255,255,255,0.35)' : FIN_COLORS.grid; ctx.fillRect(P.left, Math.round(y), P.w, t === 0 ? 2 : 1);
    text(ctx, kind === 'risk' ? pct(t) : shortMoney(t), P.left - 8, y, px, FIN_COLORS.muted, 'right', 'middle');
  }
  // X ticks: round years with the age underneath.
  const step = xTickStep(n, P.w);
  for (let yr = Math.ceil(dom.x0 / step) * step; yr <= dom.x1; yr += step) {
    const x = P.xAt(yr);
    ctx.fillStyle = FIN_COLORS.axis; ctx.fillRect(Math.round(x), bottom, 1, 6);
    text(ctx, String(yr), x, bottom + 9, px, FIN_COLORS.muted, 'center');
    text(ctx, `age ${d.ageAt(yr)}`, x, bottom + 13 + px, px - 2, '#7d838d', 'center');
  }
  ctx.strokeStyle = FIN_COLORS.axis; hairline(ctx, 1); ctx.strokeRect(P.left, P.top, P.w, P.h);

  ctx.save();
  ctx.beginPath(); ctx.rect(P.left, P.top, P.w, P.h); ctx.clip();
  if (kind === 'networth') {
    drawBand(ctx, rows, P, yS, 'p10', 'p90', FIN_COLORS.bandOuter);
    drawBand(ctx, rows, P, yS, 'p25', 'p75', FIN_COLORS.bandInner);
    drawLine(ctx, rows.map(r => [P.xAt(r.year), Number.isFinite(r.v.path) ? yS.project(r.v.path) : NaN]), FIN_COLORS.path, 2);
    drawLine(ctx, rows.map(r => [P.xAt(r.year), Number.isFinite(r.v.p50) ? yS.project(r.v.p50) : NaN]), FIN_COLORS.net, 3);
    drawEvents(ctx, d.flows.map(f => ({ year: f.year, events: f.events })), P, { labels: !opts.portrait && !opts.compare });
  } else if (kind === 'assets' || kind === 'history') {
    drawStackedBars(ctx, rows.filter(r => !r.partial), P, ASSET_CATS, DEBT_CATS, yS);
    drawLine(ctx, rows.map(r => [P.xAt(r.year), yS.project(r.v.net)]), FIN_COLORS.net, 3);
    for (const r of rows) { ctx.fillStyle = FIN_COLORS.net; ctx.fillRect(P.xAt(r.year) - 2, yS.project(r.v.net) - 2, 4, 4); }
    if (kind === 'assets') drawEvents(ctx, rows, P, { labels: !opts.portrait && !opts.compare });
  } else if (kind === 'cashflow') {
    drawStackedBars(ctx, rows, P, IN_CATS, OUT_CATS, yS);
    for (const r of rows) if (r.v.unpaid >= 1) {
      const x = P.xAt(r.year), y = Math.min(bottom - 8, yS.project(-sum(r.v, OUT_CATS)) + 8);
      ctx.fillStyle = FIN_COLORS.unpaid; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    drawEvents(ctx, rows, P, { labels: !opts.portrait && !opts.compare });
  } else if (kind === 'saving') {
    drawStackedBars(ctx, rows, P, SAVE_IN, SAVE_OUT, yS);
  } else if (kind === 'taxes') {
    drawStackedBars(ctx, rows, P, TAX_CATS, [], yS);
  } else if (kind === 'risk') {
    const pts = rows.map(r => [P.xAt(r.year), yS.project(r.v.risk)]);
    if (pts.length) {
      ctx.fillStyle = 'rgba(239,127,127,0.35)'; ctx.beginPath(); ctx.moveTo(pts[0][0], bottom);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(pts.at(-1)[0], bottom); ctx.closePath(); ctx.fill();
      drawLine(ctx, pts, FIN_COLORS.risk, 2);
    }
  }
  // Today marker and the year cursor.
  if (opts.todayYear >= dom.x0 && opts.todayYear <= dom.x1 && kind !== 'history') {
    const x = Math.round(P.xAt(opts.todayYear) - (kind === 'networth' || kind === 'risk' ? 0 : P.slot / 2));
    ctx.fillStyle = FIN_COLORS.today; for (let y = P.top; y < bottom; y += 8) ctx.fillRect(x, y, 2, 4);
    text(ctx, 'Today', x + 6, bottom - px - 6, px, FIN_COLORS.today);
  }
  if (Number.isFinite(opts.cursorYear) && opts.cursorYear >= dom.x0 && opts.cursorYear <= dom.x1) {
    const x = Math.round(P.xAt(opts.cursorYear));
    ctx.fillStyle = FIN_COLORS.cursor; ctx.fillRect(x - 1, P.top, 2, P.h);
  }
  ctx.restore();

  if (kind === 'taxes') {
    // Effective-rate line on its own right-hand percent axis.
    const maxRate = Math.max(0.05, ...rows.map(r => r.v.rate || 0));
    const rS = niceYScale(0, maxRate, P.top, bottom, { percent: true, ticks: 4 });
    for (const t of rS.ticks) text(ctx, pct(t), P.left + P.w + 6, rS.project(t), px, '#c9b877', 'left', 'middle');
    ctx.save(); ctx.beginPath(); ctx.rect(P.left, P.top, P.w, P.h); ctx.clip();
    drawLine(ctx, rows.filter(r => r.v.rate > 0).map(r => [P.xAt(r.year), rS.project(r.v.rate)]), FIN_COLORS.rate, 2);
    ctx.restore();
  }
  return { x: P.left, y: P.top, w: P.w, h: P.h, yearAt: P.yearAt, x0: dom.x0, x1: dom.x1 };
}

// ---------------------------------------------------------------- summary card

function nearestAge(rows, age) {
  return rows.find(r => r.age === age) || null;
}

function summaryLines(d, opts) {
  const real = !!opts.real, L = [];
  const t = d.today;
  if (t) {
    const f = v => shortMoney(deflate(v, d.todayIndex, real));
    const assets = sum(t, ASSET_CATS), debts = t.mortgage + t.otherDebt;
    const isToday = opts.todayYear == null || opts.todayYear === d.todayYear;
    L.push({ head: `${isToday ? 'Today' : 'Timeline start'} (${d.todayYear}, age ${d.todayAge})` });
    L.push({ text: `Net worth ${f(t.net)} = own ${f(assets)} minus owe ${f(debts)}` });
    L.push({ text: `Cash ${f(t.cash)} | savings ${f(t.savings)} | stocks ${f(t.stocks)}` });
    L.push({ text: `Retirement ${f(t.k401 + t.sk401 + t.roth + t.sroth)} | home equity ${f(t.home - t.mortgage)}` });
  }
  const flow = d.flows[0];
  if (flow) {
    const v = flow.parts, f = x => shortMoney(deflate(x, flow.index, real));
    L.push({ head: `${flow.year === opts.todayYear || opts.todayYear == null ? 'This year' : 'First year'} (${flow.year})` });
    L.push({ text: `In ${f(sum(v, IN_CATS))} | out ${f(sum(v, OUT_CATS))} | taxes ${f(v.taxTotal)}` });
    L.push({ text: `Into retirement ${f(v.toK401 + v.match + v.toRoth)} (match ${f(v.match)})` });
  }
  if (d.series.length) {
    const k = real ? 'realNetWorth' : 'netWorth';
    L.push({ head: `Outlook (${(d.paths || 0).toLocaleString('en-US')} futures)` });
    for (const age of [65, 90]) {
      const r = nearestAge(d.series, age);
      if (r?.[k]) L.push({ text: `At ${age}: middle ${shortMoney(r[k].p50)} | 8 in 10: ${shortMoney(r[k].p10)} to ${shortMoney(r[k].p90)}` });
    }
    const last = d.series.at(-1);
    if (last && !nearestAge(d.series, 90) && last[k]) L.push({ text: `At ${last.age}: middle ${shortMoney(last[k].p50)}` });
    let peak = null;
    for (const r of d.series) if (r[k] && (!peak || r[k].p50 > peak[k].p50)) peak = r;
    if (peak) L.push({ text: `Middle outcome peaks at ${shortMoney(peak[k].p50)} (age ${peak.age})` });
  }
  if (d.success != null) L.push({ minor: `Futures where Cash runs out at some point: ${pct(1 - d.success)}` });
  if (d.provisional) L.push({ minor: 'Still simulating: some numbers will appear when it finishes.' });
  return L;
}

function drawSummary(ctx, d, box, opts) {
  const all = summaryLines(d, opts);
  const split = all.findIndex((l, i) => i > 0 && l.head?.startsWith('Outlook'));
  if (!opts.portrait && !opts.compare && box.w > 1100 && split > 0) {
    // Wide page: today and this year on the left, the outlook on the right.
    const half = (box.w - 40) / 2;
    drawSummaryLines(ctx, all.slice(0, split), { ...box, w: half }, opts);
    drawSummaryLines(ctx, all.slice(split), { ...box, x: box.x + half + 40, w: half }, opts);
    return;
  }
  drawSummaryLines(ctx, all, box, opts);
}

function drawSummaryLines(ctx, lines, box, opts) {
  const px = opts.portrait ? 13 : 15, lh = Math.round(px * 1.9);
  let y = box.y;
  for (const line of lines) {
    if (y + lh > box.y + box.h) break;
    if (line.head) { y += 6; text(ctx, line.head, box.x, y, px, FIN_COLORS.title); }
    else if (line.text) {
      const lines = wrapLines(ctx, line.text, px - 1, box.w - 16, 2);
      for (const l of lines) { text(ctx, l, box.x + 16, y, px - 1, FIN_COLORS.text); y += lh; }
      continue;
    } else text(ctx, line.minor, box.x + 16, y, px - 3, FIN_COLORS.muted);
    y += lh;
  }
}

// ---------------------------------------------------------------- public renderer

/**
 * Draw one chart kind for one or two timelines inside `rect`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} kind  one of CHART_KINDS
 * @param {Array} datasets  one (chart page) or two (Map Compare) buildChartData() results
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @param {object} opts  real, realLabel, metric, log, zoomSpan, cursorYear, todayYear, portrait
 * @returns {{plots:Array, x0:number, x1:number}|null}
 */
export function drawFinanceChart(ctx, kind, datasets, rect, opts = {}) {
  const portrait = opts.portrait ?? rect.w < 1000;
  const compare = datasets.length > 1;
  opts = { ...opts, portrait, compare };
  const titlePx = portrait ? 15 : 17, descPx = portrait ? 11 : 12, legendPx = portrait ? 11 : 12;
  let y = rect.y;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();

  // Header: title + plain-English description.
  if (opts.showTitle !== false) {
    text(ctx, CHART_TITLES[kind] || kind, rect.x, y, titlePx, FIN_COLORS.title);
    y += titlePx + 10;
  }
  const desc = wrapLines(ctx, describe(kind, opts, datasets), descPx, rect.w, portrait ? 4 : 2);
  for (const l of desc) { text(ctx, l, rect.x, y, descPx, FIN_COLORS.muted); y += descPx + 8; }
  y += 6;

  const prepared = datasets.map(d => prepare(kind, d, opts));
  if (kind === 'summary') {
    const gap = 30;
    const boxes = compare && !portrait
      ? [0, 1].map(i => ({ x: rect.x + i * (rect.w + gap) / 2, y, w: (rect.w - gap) / 2, h: rect.y + rect.h - y }))
      : compare ? [0, 1].map(i => ({ x: rect.x, y: y + i * (rect.y + rect.h - y) / 2, w: rect.w, h: (rect.y + rect.h - y) / 2 - 10 }))
        : [{ x: rect.x, y, w: rect.w, h: rect.y + rect.h - y }];
    datasets.forEach((d, i) => {
      const b = { ...boxes[i] };
      if (compare) { text(ctx, d.label, b.x, b.y, legendPx + 2, d.color || FIN_COLORS.text); b.y += legendPx + 12; b.h -= legendPx + 12; }
      drawSummary(ctx, d, b, opts);
    });
    ctx.restore();
    return { plots: [], x0: null, x1: null };
  }

  // Shared domain: years and values across every dataset so both sides line up.
  const years = datasets.flatMap((d, i) => prepared[i].length ? dataYears(kind, d) : []);
  const items = legendItems(kind, prepared, opts, datasets);
  if (!years.length) {
    const msg = kind === 'history' ? 'Play through a year to start your history.'
      : datasets.some(d => d.provisional) ? 'Simulating... this chart appears when the run finishes.' : 'No data yet.';
    text(ctx, msg, rect.x, y + 20, legendPx + 1, FIN_COLORS.muted);
    ctx.restore();
    return { plots: [], x0: null, x1: null };
  }
  let x0 = Math.min(...years), x1 = Math.max(...years);
  if (opts.zoomSpan && x1 - x0 + 1 > opts.zoomSpan) {
    const c = Number.isFinite(opts.zoomCenter) ? opts.zoomCenter : (opts.cursorYear ?? x0);
    let a = Math.round(c - opts.zoomSpan / 2);
    a = Math.max(x0, Math.min(x1 - opts.zoomSpan + 1, a));
    x0 = a; x1 = a + opts.zoomSpan - 1;
  }
  const inRange = prepared.map(rows => rows.filter(r => r.year >= x0 && r.year <= x1));
  const ext = inRange.map(rows => valueExtent(kind, rows, opts));
  const log = ext.some(e => e[2]);
  const dom = { x0, x1, log, lo: Math.min(...ext.map(e => e[0]).filter(Number.isFinite)), hi: Math.max(...ext.map(e => e[1])) };
  if (log) dom.lo = Math.min(...ext.map(e => e[0]).filter(v => v > 0 && Number.isFinite(v)), Infinity);

  // Legend: wrapping row above the chart (landscape) or a grid below it (portrait).
  if (!portrait) { y += drawLegend(ctx, items, rect.x, y, rect.w, { px: legendPx }) + 6; }
  const legendH = portrait ? drawLegend(ctx, items, rect.x, 0, rect.w, { px: legendPx, grid: true, measureOnly: true }) + 10 : 0;
  const readPx = portrait ? 11 : 12, readLines = portrait ? 3 : 2;
  const readH = readLines * (readPx + 8) + 6;
  const avail = rect.y + rect.h - y - legendH;
  const gap = compare ? (portrait ? 14 : 34) : 0;
  const panels = compare && !portrait
    ? datasets.map((_, i) => ({ x: rect.x + i * (rect.w + gap) / 2, y, w: (rect.w - gap) / 2, h: avail }))
    : datasets.map((_, i) => ({ x: rect.x, y: y + i * (avail + gap) / datasets.length, w: rect.w, h: (avail - gap * (datasets.length - 1)) / datasets.length }));
  const plots = [];
  datasets.forEach((d, i) => {
    const b = { ...panels[i] };
    if (compare) {
      text(ctx, d.label, b.x, b.y, legendPx + 1, d.color || FIN_COLORS.text);
      b.y += legendPx + 10; b.h -= legendPx + 10;
    }
    const plotBox = { x: b.x, y: b.y, w: b.w, h: Math.max(60, b.h - readH) };
    const plot = drawPlot(ctx, kind, inRange[i], d, plotBox, dom, opts);
    plots.push(plot);
    // Fixed readout row under the plot.
    const year = Number.isFinite(opts.cursorYear) ? opts.cursorYear : x0;
    const ro = readout(kind, prepared[i], year, d, opts);
    let ry = plotBox.y + plotBox.h + 4;
    const lines = wrapLines(ctx, ro.main, readPx, b.w, ro.extra ? readLines - 1 : readLines);
    if (ro.extra) lines.push(...wrapLines(ctx, ro.extra, readPx, b.w, 1));
    lines.slice(0, readLines).forEach((l, j) => {
      text(ctx, l, b.x, ry, readPx, j === 0 ? FIN_COLORS.text : (ro.extra && j === lines.length - 1 ? FIN_COLORS.event : FIN_COLORS.text));
      ry += readPx + 8;
    });
  });
  if (portrait) drawLegend(ctx, items, rect.x, rect.y + rect.h - legendH + 8, rect.w, { px: legendPx, grid: true });
  ctx.restore();
  return { plots, x0, x1 };
}

/** Full year range a kind covers across datasets (for clamping the cursor). */
export function chartYearRange(kind, datasets) {
  const years = datasets.flatMap(d => dataYears(kind, d));
  return years.length ? [Math.min(...years), Math.max(...years)] : null;
}
