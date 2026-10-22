import test from 'node:test';
import assert from 'node:assert/strict';
import { makeYScale, windowByYear, groupIncome, groupExpenses, drawEventTicks, drawCursorLabel,
  drawCompositionChart, drawCashflowChart, drawRiskChart, drawForecastChart } from '../js/render/Charts.js';

/** Records every ctx call without a real canvas; mirrors the pattern in test/world-render.test.js. */
class MockCtx {
  constructor() {
    this.calls = [];
    return new Proxy(this, {
      get: (target, key) => {
        if (key === 'calls') return target.calls;
        if (key === 'measureText') return (text) => ({ width: String(text).length * 8 });
        if (key in target) return target[key];
        return (...args) => { target.calls.push({ op: key, args }); };
      },
      set: (target, key, value) => { target[key] = value; return true; },
    });
  }
}

test('makeYScale: linear domain floors at 0, adds headroom above the max, and projects top/bottom correctly', () => {
  const s = makeYScale([10000, 500000], { top: 100, bottom: 500 });
  assert.equal(s.log, false);
  assert.equal(s.min, 0);
  assert.ok(s.max > 500000);
  assert.equal(s.project(s.min), 500); // min maps to the bottom of the plot
  assert.ok(Math.abs(s.project(s.max) - 100) < 1e-6); // max maps to the top
});

test('makeYScale: log domain anchors to the smallest positive value and spaces values geometrically', () => {
  const s = makeYScale([10000, 100000, 1000000], { top: 100, bottom: 500, log: true });
  assert.equal(s.log, true);
  assert.equal(s.min, 10000);
  // Equal ratios should map to equal pixel spacing on a log scale.
  const yAt10k = s.project(10000), yAt100k = s.project(100000), yAt1M = s.project(1000000);
  assert.ok(Math.abs((yAt10k - yAt100k) - (yAt100k - yAt1M)) < 1e-6);
});

test('makeYScale: falls back to linear when log is requested but nothing is positive', () => {
  const s = makeYScale([0, -500, -2000], { top: 100, bottom: 500, log: true });
  assert.equal(s.log, false);
  assert.doesNotThrow(() => s.project(-1000));
});

test('windowByYear: slices to the requested span around the center year', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ year: 2026 + i }));
  const { rows: windowed } = windowByYear(rows, 2040, 10);
  assert.equal(windowed[0].year, 2035);
  assert.equal(windowed.at(-1).year, 2045);
});

test('windowByYear: shifts (not shrinks) the window when the center is near either edge', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ year: 2026 + i }));
  const early = windowByYear(rows, 2026, 10);
  assert.equal(early.rows[0].year, 2026);
  assert.equal(early.rows.at(-1).year, 2036); // full 10-year span, shifted forward
  const late = windowByYear(rows, 2055, 10);
  assert.equal(late.rows.at(-1).year, 2055);
  assert.equal(late.rows[0].year, 2045); // full 10-year span, shifted back
});

test('windowByYear: a null span or empty rows is a no-op', () => {
  const rows = [{ year: 2026 }, { year: 2027 }];
  assert.deepEqual(windowByYear(rows, 2026, null).rows, rows);
  assert.deepEqual(windowByYear([], 2026, 10).rows, []);
});

test('groupIncome/groupExpenses: group the raw statement keys into player-facing categories and drop zero buckets', () => {
  const statement = {
    income: { wages: 60000, spouseWages: 40000, socialSecurity: 20000, traditionalWithdrawals: 5000,
      interest: 100, qualifiedDividends: 200, rentalIncome: 0 },
    expenses: { propertyTax: 4000, mortgage: 18000, living: 30000, healthcare: 6000,
      childcare: 8000, children: 1000, college: 0, otherLoans: 0, unexpected: 0, incomeTax: 9000 },
  };
  const income = groupIncome(statement);
  assert.deepEqual(income.map(g => g.key), ['wages', 'ss', 'retirement', 'investment']); // rental dropped (0)
  assert.equal(income.find(g => g.key === 'wages').value, 100000);
  const expenses = groupExpenses(statement);
  assert.deepEqual(expenses.map(g => g.key), ['housing', 'living', 'healthcare', 'children', 'taxes']); // debt/unexpected dropped (0)
  assert.equal(expenses.find(g => g.key === 'housing').value, 22000);
  assert.equal(expenses.find(g => g.key === 'children').value, 9000); // childcare + children + college
});

test('groupIncome/groupExpenses: an all-zero statement returns no buckets', () => {
  assert.deepEqual(groupIncome({ income: {} }), []);
  assert.deepEqual(groupExpenses({ expenses: {} }), []);
  assert.deepEqual(groupIncome(null), []);
  assert.deepEqual(groupExpenses(undefined), []);
});

test('drawEventTicks: draws a tick only for rows with events, and nothing throws on an empty array', () => {
  const ctx = new MockCtx();
  drawEventTicks(ctx, [], () => 0, 10);
  assert.equal(ctx.calls.filter(c => c.op === 'arc').length, 0);
  const ctx2 = new MockCtx();
  const rows = [{ year: 2026, events: [] }, { year: 2027, events: ['Retired'] }, { year: 2028 }];
  drawEventTicks(ctx2, rows, year => year, 10);
  assert.equal(ctx2.calls.filter(c => c.op === 'arc').length, 1);
});

test('drawCursorLabel: does not throw and renders text at the requested position', () => {
  const ctx = new MockCtx();
  drawCursorLabel(ctx, 'Median $500,000', 100, 20);
  assert.ok(ctx.calls.some(c => c.op === 'fillText' && c.args[0] === 'Median $500,000'));
});

function referenceFixture() {
  const worth = (year) => ({ cash: 10000, savings: 20000, stocks: 50000 + year * 1000, stocksCostBasis: 30000,
    k401Balance: 80000, rothBalance: 10000, spouseK401Balance: 0, spouseRothBalance: 0,
    homeEquity: 150000, debts: 5000, netWorth: 300000 + year * 1000 });
  const statement = (fundingSuccess = true) => ({
    income: { wages: 80000, socialSecurity: 0, traditionalWithdrawals: 0 },
    expenses: { living: 40000, healthcare: 6000, mortgage: 18000, incomeTax: 9000 },
    fundingSuccess,
  });
  return [
    { year: 2026, age: 61, worth: worth(0), statement: statement(), events: [] },
    { year: 2027, age: 62, worth: worth(1), statement: statement(), events: ['Retired'] },
    { year: 2028, age: 63, worth: worth(2), statement: statement(false), events: [] },
  ];
}

test('drawCompositionChart: renders a 3-year fixture, an empty reference, and a cursor year without throwing', () => {
  const opts = { x: 0, y: 0, w: 800, h: 300 };
  assert.doesNotThrow(() => drawCompositionChart(new MockCtx(), [], opts));
  assert.doesNotThrow(() => drawCompositionChart(new MockCtx(), referenceFixture(), opts));
  assert.doesNotThrow(() => drawCompositionChart(new MockCtx(), referenceFixture(),
    { ...opts, selectedYear: 2027, cursorLabel: 'Net worth $301,000', log: true, zoomSpan: 2, zoomCenter: 2027 }));
});

test('drawCashflowChart: renders income/expense bars, flags a shortfall year, and tolerates an empty reference', () => {
  const opts = { x: 0, y: 0, w: 800, h: 300 };
  assert.doesNotThrow(() => drawCashflowChart(new MockCtx(), [], opts));
  const ctx = new MockCtx();
  drawCashflowChart(ctx, referenceFixture(), { ...opts, selectedYear: 2028, cursorLabel: 'Shortfall year' });
  assert.ok(ctx.calls.some(c => c.op === 'strokeRect')); // the fundingSuccess:false year's red outline
});

test('drawRiskChart: renders a cumulative-failure fixture and tolerates an empty array', () => {
  const opts = { x: 0, y: 0, w: 800, h: 300 };
  const failureByYear = [{ year: 2026, age: 61, fraction: 0 }, { year: 2027, age: 62, fraction: .1 }, { year: 2028, age: 63, fraction: .3 }];
  assert.doesNotThrow(() => drawRiskChart(new MockCtx(), [], opts));
  assert.doesNotThrow(() => drawRiskChart(new MockCtx(), failureByYear, { ...opts, selectedYear: 2027, cursorLabel: '10% by year 2' }));
});

function forecastFixture() {
  const years = [2026, 2027, 2028];
  const pct = (p10, p90) => ({ p10, p25: p10, p50: (p10 + p90) / 2, p75: p90, p90 });
  return {
    series: years.map((year, i) => ({ year, age: 60 + i, netWorth: pct(100000 + i * 10000, 500000 + i * 50000) })),
    scenarioSeries: years.map((year, i) => ({ year, age: 60 + i, netWorth: 300000 + i * 20000 })),
    reference: years.map((year, i) => ({ year, age: 60 + i, worth: {}, statement: {}, events: i === 1 ? ['Retired'] : [] })),
  };
}

test('drawForecastChart: renders bands/median/hallway/event-ticks, with log scale, zoom and a cursor label, without throwing', () => {
  const opts = { x: 0, y: 0, w: 800, h: 300, metric: 'netWorth' };
  const f = forecastFixture();
  assert.doesNotThrow(() => drawForecastChart(new MockCtx(), f, opts));
  assert.doesNotThrow(() => drawForecastChart(new MockCtx(), f, { ...opts, selectedYear: 2027, cursorLabel: 'Median $300,000' }));
  assert.doesNotThrow(() => drawForecastChart(new MockCtx(), f, { ...opts, log: true, zoomSpan: 1, zoomCenter: 2027 }));
  const ctx = new MockCtx();
  drawForecastChart(ctx, f, { ...opts, selectedYear: 2027 });
  assert.ok(ctx.calls.some(c => c.op === 'arc')); // the 'Retired' event tick
});

test('FinanceCharts: worthParts splits home value, mortgage and other debts out of computeWorth totals', async () => {
  const { worthParts } = await import('../js/render/FinanceCharts.js');
  // $300k home with a $200k mortgage (equity $100k) plus a $10k car loan; $50k cash/savings/stocks.
  const w = { cash: 10000, savings: 20000, stocks: 20000, k401Balance: 0, rothBalance: 0, spouseK401Balance: 0, spouseRothBalance: 0,
    homeEquity: 100000, debts: 210000, exactNetWorth: 140000, netWorth: 140000 };
  const p = worthParts(w);
  assert.equal(p.home, 300000); assert.equal(p.mortgage, 200000); assert.equal(p.otherDebt, 10000);
  assert.equal(worthParts({ netWorth: 5 }), null, 'older rows without a breakdown are flagged, not invented');
});

test('FinanceCharts: every chart kind renders for one timeline and side by side for two, landscape and portrait', async () => {
  const { buildChartData, drawFinanceChart, CHART_KINDS } = await import('../js/render/FinanceCharts.js');
  const years = [2026, 2027, 2028];
  const pct = v => ({ p10: v * 0.5, p25: v * 0.8, p50: v, p75: v * 1.2, p90: v * 1.6 });
  const worth = { cash: 1000, savings: 2000, stocks: 3000, k401Balance: 4000, rothBalance: 500, spouseK401Balance: 0, spouseRothBalance: 0,
    homeEquity: 50000, debts: 150000, exactNetWorth: 60500, netWorth: 60500 };
  const statement = year => ({ year, priceIndex: 1.03, income: { wages: 90000, interest: 100 }, expenses: { living: 40000, mortgage: 20000, incomeTax: 15000 },
    tax: { federal: 9000, state: 3000, payroll: 3000 }, employeeContribution: 9000, employerContribution: 4500, unfunded: year === 2027 ? 500 : 0 });
  const forecast = { count: 1000, successProbability: 0.9, failureByYear: years.map((year, i) => ({ year, age: 40 + i, fraction: i * 0.02 })),
    series: years.map((year, i) => ({ year, age: 40 + i, netWorth: pct(60000 + i * 1e4), realNetWorth: pct(60000), liquid: pct(6000), realLiquid: pct(6000) })),
    scenarioSeries: years.map((year, i) => ({ year, age: 40 + i, netWorth: 61000 * 1.03 ** i, realNetWorth: 61000, liquid: 6000, realLiquid: 6000 })),
    reference: years.slice(1).map(year => ({ year, worth, statement: statement(year - 1), events: year === 2027 ? ['Retired'] : [] })) };
  const history = [{ year: 2025, netWorth: 50000, priceIndex: 1 }, { year: 2026, ...worth, priceIndex: 1 }];
  const d = buildChartData({ forecast, history, today: worth, label: 'Timeline 1' });
  for (const kind of CHART_KINDS) {
    for (const rect of [{ x: 0, y: 0, w: 1700, h: 800 }, { x: 0, y: 0, w: 700, h: 1300 }]) {
      for (const real of [true, false]) {
        assert.doesNotThrow(() => drawFinanceChart(new MockCtx(), kind, [d], rect, { real, cursorYear: 2027, todayYear: 2026 }), kind);
        assert.doesNotThrow(() => drawFinanceChart(new MockCtx(), kind, [d, { ...d, label: 'Timeline 2' }], rect,
          { real, log: true, zoomSpan: 2, cursorYear: 2027, todayYear: 2026, metric: 'liquid' }), kind);
      }
    }
  }
  const empty = buildChartData({ forecast: null });
  for (const kind of CHART_KINDS) assert.doesNotThrow(() => drawFinanceChart(new MockCtx(), kind, [empty], { x: 0, y: 0, w: 900, h: 600 }, {}));
});
