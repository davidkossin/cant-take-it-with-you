import { PALETTE } from '../config.js';
import { formatMoneyDisplay } from './Dialog.js';

export const TIMELINE_COLORS = ['#72d5ee', '#e4b75c', '#ba96ed', '#7dcc9b', '#ee91ae', '#99b6ff', '#d9d081'];
const font = px => `${px}px "Press Start 2P", monospace`;

/** Calendar years shared by all lanes; pagination keeps point labels readable. */
export function drawTimelineMap(ctx, model, rect, selection, addHit, activate) {
  const { x, y, w, h } = rect;
  const laneLimit = 7, rowLimit = 12;
  const laneStart = Math.floor(selection.timeline / laneLimit) * laneLimit;
  const lanes = model.timelines.slice(laneStart, laneStart + laneLimit);
  const years = [...model.years].reverse();
  const selected = model.timelines[selection.timeline];
  const selectedYear = selected?.points[selection.point]?.year;
  const rowStart = Math.floor(Math.max(0, years.indexOf(selectedYear)) / rowLimit) * rowLimit;
  const visibleYears = years.slice(rowStart, rowStart + rowLimit);
  const top = y + 62, bottom = y + h - 26;
  const yearY = year => top + visibleYears.indexOf(year) * (bottom - top) / Math.max(1, visibleYears.length - 1);
  const columnWidth = (w - 145) / Math.max(1, lanes.length);
  const laneX = index => x + 145 + (index + .5) * columnWidth;
  ctx.save(); ctx.textBaseline = 'middle';
  ctx.font = font(16); ctx.fillStyle = '#aaa';
  ctx.fillText('YEAR', x + 12, y + 16);
  for (const year of visibleYears) {
    const yy = yearY(year);
    ctx.strokeStyle = 'rgba(190,200,220,.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 120, yy); ctx.lineTo(x + w, yy); ctx.stroke();
    ctx.fillStyle = '#c7c7c7'; ctx.fillText(String(year), x + 12, yy);
  }
  lanes.forEach((timeline, i) => {
    const xx = laneX(i), index = laneStart + i;
    const color = TIMELINE_COLORS[(timeline.number - 1) % TIMELINE_COLORS.length];
    const active = selection.timeline === index;
    if (active) { ctx.fillStyle = 'rgba(170,190,210,.08)'; ctx.fillRect(xx - columnWidth / 2 + 6, y, columnWidth - 12, h); }
    ctx.textAlign = 'center'; ctx.font = font(18); ctx.fillStyle = color;
    ctx.fillText(String(timeline.number) + (timeline.isCurrent ? ' *' : ''), xx, y + 16);
    addHit({ key: `timeline:${timeline.id}`, x: xx - columnWidth / 2, y, w: columnWidth, h: 34,
      activate: () => activate('timeline', index) });
    const pointsInPage = timeline.points.filter(p => visibleYears.includes(p.year));
    const lineTop = timeline.terminalYear > Math.max(...visibleYears) ? top - 8 : yearY(timeline.terminalYear);
    const lineBottom = timeline.startYear < Math.min(...visibleYears) ? bottom + 8 : yearY(timeline.startYear);
    if (pointsInPage.length || (timeline.startYear < Math.min(...visibleYears) && timeline.terminalYear > Math.max(...visibleYears))) {
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(xx, Math.max(top - 8, lineTop)); ctx.lineTo(xx, Math.min(bottom + 8, lineBottom)); ctx.stroke();
    }
    timeline.points.forEach((point, pi) => {
      if (!visibleYears.includes(point.year)) return;
      const sameYear = timeline.points.filter(p => p.year === point.year);
      const offset = sameYear.length > 1 ? (sameYear.findIndex(p => p.id === point.id) - (sameYear.length - 1) / 2) * 32 : 0;
      const px = xx + offset, py = yearY(point.year);
      const focused = active && selection.focus === 'point' && selection.point === pi;
      ctx.fillStyle = focused ? '#fff1bc' : color;
      ctx.beginPath(); ctx.arc(px, py, focused ? 10 : 7, 0, Math.PI * 2); ctx.fill();
      ctx.font = font(16); ctx.fillText(point.letter, px + 22, py - 14);
      addHit({ key: `point:${point.id}`, x: px - 18, y: py - 23, w: 60, h: 46,
        activate: () => activate('point', index, pi) });
    });
  });
  // Branch origins connect to the exact parent decision point, including same-year choices.
  model.timelines.forEach(child => {
    if (!child.parentTimelineId || !visibleYears.includes(child.startYear)) return;
    const ci = lanes.findIndex(t => t.id === child.id), pi = lanes.findIndex(t => t.id === child.parentTimelineId);
    if (ci < 0 || pi < 0) return;
    const yy = yearY(child.startYear);
    ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.strokeStyle = '#aaa';
    ctx.beginPath(); ctx.moveTo(laneX(pi) + 12, yy); ctx.lineTo(laneX(ci) - 12, yy); ctx.stroke(); ctx.setLineDash([]);
  });
  ctx.textAlign = 'left'; ctx.font = font(12); ctx.fillStyle = '#888';
  ctx.fillText(`Timelines ${laneStart + 1}–${laneStart + lanes.length} of ${model.timelines.length} · decision-year rows ${rowStart + 1}–${rowStart + visibleYears.length} of ${years.length}`, x + 12, y + h + 8);
  ctx.restore();
}

/** All three comparison charts use the same absolute-year and dollar-value axes. */
export function comparisonDomain(timelines, metric = 'realNetWorth') {
  const rows = timelines.flatMap(t => t.forecast?.series || []);
  const values = rows.flatMap(r => [r[metric]?.p10, r[metric]?.p90]).filter(Number.isFinite);
  const actual = timelines.flatMap(t => t.forecast?.scenarioSeries || []).map(r => r[metric]).filter(Number.isFinite);
  const min = Math.min(0, ...values, ...actual), rawMax = Math.max(1, ...values, ...actual);
  return { firstYear: Math.min(...rows.map(r => r.year)), lastYear: Math.max(...rows.map(r => r.year)),
    min, max: rawMax + Math.max(1, rawMax - min) * .05 };
}

function drawProjection(ctx, timelines, rect, domain, title, metric) {
  const { x, y, w, h } = rect;
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(x, y, w, h);
  const left = x + 110, right = x + w - 20, top = y + 54, bottom = y + h - 38;
  const px = year => left + (year - domain.firstYear) / Math.max(1, domain.lastYear - domain.firstYear) * (right - left);
  const py = v => bottom - (v - domain.min) / Math.max(1, domain.max - domain.min) * (bottom - top);
  ctx.font = font(14); ctx.textBaseline = 'top'; ctx.fillStyle = PALETTE.gold; ctx.fillText(title, x + 16, y + 13);
  ctx.font = font(12); ctx.textBaseline = 'middle';
  for (let i = 0; i <= 3; i++) {
    const v = domain.min + (domain.max - domain.min) * i / 3, yy = py(v);
    ctx.strokeStyle = '#30323b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke();
    ctx.fillStyle = '#a9a9b2'; ctx.fillText(compact(v), x + 10, yy);
  }
  timelines.forEach((timeline, index) => {
    const f = timeline.forecast;
    const color = timeline.compareColor;
    const band = (lo, hi, alpha) => {
      ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
      f.series.forEach((r, i) => i ? ctx.lineTo(px(r.year), py(r[metric][hi])) : ctx.moveTo(px(r.year), py(r[metric][hi])));
      [...f.series].reverse().forEach(r => ctx.lineTo(px(r.year), py(r[metric][lo])));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    };
    band('p10', 'p90', timelines.length > 1 ? .12 : .18); band('p25', 'p75', timelines.length > 1 ? .14 : .24);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
    f.series.forEach((r, i) => i ? ctx.lineTo(px(r.year), py(r[metric].p50)) : ctx.moveTo(px(r.year), py(r[metric].p50))); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.beginPath();
    (f.scenarioSeries || []).forEach((r, i) => i ? ctx.lineTo(px(r.year), py(r[metric])) : ctx.moveTo(px(r.year), py(r[metric]))); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = color; ctx.font = font(12); ctx.textBaseline = 'top';
    const legendX = left + index * 350;
    ctx.fillRect(legendX, y + 33, 17, 4); ctx.fillText(`Timeline ${timeline.number}`, legendX + 24, y + 27);
  });
  ctx.fillStyle = '#aaa'; ctx.font = font(12); ctx.textBaseline = 'top';
  ctx.fillText(String(domain.firstYear), left, bottom + 12); ctx.fillText(String(domain.lastYear), right - 54, bottom + 12);
  ctx.restore();
}

export function drawTimelineComparison(ctx, timelines, rect, originalYear, metric = 'realNetWorth') {
  const { x, y, w, h } = rect;
  const selected = timelines.map((t, i) => ({ ...t, compareColor: TIMELINE_COLORS[i] }));
  const domain = comparisonDomain(selected, metric);
  const gap = 24, topH = Math.floor((h - gap) * .43), width = (w - gap) / 2;
  selected.forEach((t, i) => drawProjection(ctx, [t], { x: x + i * (width + gap), y, w: width, h: topH },
    domain, `Timeline ${t.number} · ${t.forecast.count.toLocaleString()} paths`, metric));
  drawProjection(ctx, selected, { x, y: y + topH + gap, w, h: h - topH - gap }, domain,
    `Overlay · ${metric === 'realNetWorth' ? `${originalYear} buying power` : 'nominal dollars'}`, metric);
}

function compact(value) {
  const n = Math.round(value), a = Math.abs(n);
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'k';
  return formatMoneyDisplay(n, null, { alreadyDisplay: true });
}
