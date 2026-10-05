/**
 * Simple canvas line charts for net worth / bank / portfolio series.
 * Also multi-timeline compare charts (shared year axis + legend labels).
 */

import { PALETTE, FRAME_W, FRAME_H } from '../config.js';
import { hairline } from './hdText.js';

/** Distinct colors for Timeline A/B/C… overlays */
export const BRANCH_COLORS = [
  '#d4a84b', // gold — A
  '#80c0e0', // blue — B
  '#80e0a0', // green — C
  '#e080c0', // pink — D
  '#c0a0ff', // violet — E
  '#e0c080', // tan — F
  '#80e0e0', // cyan — G
  '#e08080', // coral — H
];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{year:number, netWorth:number, bank?:number, portfolio?:number}>} history
 * @param {object} [opts]
 */
export function drawWorthChart(ctx, history, opts = {}) {
  const x = opts.x ?? 16;
  const y = opts.y ?? 36;
  const w = opts.w ?? FRAME_W - 160;
  const h = opts.h ?? FRAME_H - 220;
  const series = opts.series || ['netWorth', 'bank'];

  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.strokeStyle = PALETTE.uiBorder;
  hairline(ctx, 1);
  ctx.strokeRect(x - 4.5, y - 4.5, w + 8, h + 8);

  if (!history?.length) {
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText('No data yet', x + 8, y + h / 2);
    return;
  }

  const colors = {
    netWorth: PALETTE.gold,
    bank: '#80c0e0',
    portfolio: PALETTE.gold,
    salary: '#80e0a0',
  };
  const labels = {
    netWorth: 'Net Worth',
    bank: 'Cash',
    portfolio: 'Portfolio',
    salary: 'Salary',
  };

  let minV = Infinity;
  let maxV = -Infinity;
  for (const row of history) {
    for (const key of series) {
      const v = row[key];
      if (v == null) continue;
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }
  if (!Number.isFinite(minV)) minV = 0;
  if (!Number.isFinite(maxV)) maxV = 1;
  if (minV === maxV) {
    minV -= 1;
    maxV += 1;
  }

  // axes — 1 CSS pixel, not one logical pixel blown up
  hairline(ctx, 1);
  ctx.strokeStyle = '#444';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();

  const n = history.length;
  for (const key of series) {
    ctx.strokeStyle = colors[key] || '#fff';
    hairline(ctx, 2);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = history[i][key];
      if (v == null) continue;
      const px = x + (n === 1 ? w / 2 : (i / (n - 1)) * w);
      const py = y + h - ((v - minV) / (maxV - minV)) * h;
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else ctx.lineTo(px, py);
    }
    if (started) ctx.stroke();
  }

  // legend
  ctx.font = '14px "Press Start 2P", monospace';
  let lx = x + 4;
  const ly = y + 16;
  for (const key of series) {
    ctx.fillStyle = colors[key] || '#fff';
    ctx.fillRect(lx, ly, 18, 12);
    ctx.fillStyle = PALETTE.uiText;
    ctx.fillText(labels[key] || key, lx + 24, ly);
    lx += 24 + ctx.measureText(labels[key] || key).width + 24;
  }

  // year range
  ctx.fillStyle = '#888';
  ctx.fillText(String(history[0].year), x, y + h + 22);
  ctx.fillText(String(history[n - 1].year), x + w - 70, y + h + 22);

  // min/max
  ctx.fillStyle = '#666';
  ctx.fillText(compact(maxV), x + 2, y + 40);
  ctx.fillText(compact(minV), x + 2, y + h - 28);
}

/**
 * Overlay one metric across multiple timeline branches on a shared year axis.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{letter:string,label?:string,history:array,isCurrent?:boolean}>} branches
 * @param {object} [opts]
 * @param {'netWorth'|'bank'|'portfolio'|'salary'} [opts.metric]
 */
export function drawCompareChart(ctx, branches, opts = {}) {
  const x = opts.x ?? 16;
  const y = opts.y ?? 36;
  const w = opts.w ?? FRAME_W - 160;
  const h = opts.h ?? FRAME_H - 220;
  const metric = opts.metric || 'netWorth';

  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.strokeStyle = PALETTE.uiBorder;
  hairline(ctx, 1);
  ctx.strokeRect(x - 4.5, y - 4.5, w + 8, h + 8);

  const usable = (branches || []).filter((b) => b.history?.length);
  if (!usable.length) {
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText('No branch data', x + 8, y + h / 2);
    return;
  }

  const yearSet = new Set();
  let minV = Infinity;
  let maxV = -Infinity;
  for (const b of usable) {
    for (const row of b.history) {
      yearSet.add(row.year);
      const v = row[metric];
      if (v == null) continue;
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }
  const years = [...yearSet].sort((a, b) => a - b);
  if (!Number.isFinite(minV)) minV = 0;
  if (!Number.isFinite(maxV)) maxV = 1;
  if (minV === maxV) {
    minV -= 1;
    maxV += 1;
  }

  hairline(ctx, 1);
  ctx.strokeStyle = '#444';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();

  const xAt = (year) => {
    if (years.length === 1) return x + w / 2;
    const t = (year - years[0]) / (years[years.length - 1] - years[0]);
    return x + t * w;
  };
  const yAt = (v) => y + h - ((v - minV) / (maxV - minV)) * h;

  usable.forEach((b, i) => {
    const color = BRANCH_COLORS[i % BRANCH_COLORS.length];
    ctx.strokeStyle = color;
    hairline(ctx, b.isCurrent ? 2.25 : 1.25);
    ctx.beginPath();
    let started = false;
    const sorted = [...b.history].sort((a, c) => a.year - c.year || a.age - c.age);
    for (const row of sorted) {
      const v = row[metric];
      if (v == null) continue;
      const px = xAt(row.year);
      const py = yAt(v);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else ctx.lineTo(px, py);
    }
    if (started) ctx.stroke();
    hairline(ctx, 1);
  });

  // legend — Timeline A / B ★
  ctx.font = '14px "Press Start 2P", monospace';
  let lx = x + 4;
  const ly = y + 4;
  usable.forEach((b, i) => {
    const color = BRANCH_COLORS[i % BRANCH_COLORS.length];
    const tag = `${b.letter || b.shortLabel || i}${b.isCurrent ? '*' : ''}`;
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly, 18, 12);
    ctx.fillStyle = PALETTE.uiText;
    ctx.fillText(tag, lx + 8, ly - 1);
    lx += 8 + ctx.measureText(tag).width + 8;
    if (lx > x + w - 20) {
      lx = x + 4;
    }
  });

  ctx.fillStyle = '#888';
  ctx.fillText(String(years[0]), x, y + h + 6);
  ctx.fillText(String(years[years.length - 1]), x + w - 28, y + h + 6);

  ctx.fillStyle = '#666';
  ctx.fillText(compact(maxV), x + 2, y + 14);
  ctx.fillText(compact(minV), x + 2, y + h - 8);
}

function compact(n) {
  const v = Math.round(n);
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(0) + 'k';
  return String(v);
}

/** Percentiles are computed across all paths, including paths with funding failures. */
export function drawForecastChart(ctx, forecast, opts={}) {
  const {x=36,y=100,w=1600,h=450,metric='netWorth',selected=0}=opts;
  const series=forecast.series;
  ctx.save();ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(x,y,w,h);
  const min=Math.min(0,...series.map(r=>r[metric].p10)), rawMax=Math.max(1,...series.map(r=>r[metric].p90));
  const span=Math.max(1,rawMax-min), max=rawMax+span*.05;
  const left=x+100,right=x+w-12,top=y+28,bottom=y+h-28;
  const px=i=>left+i/Math.max(1,series.length-1)*(right-left);
  const py=v=>bottom-(v-min)/(max-min)*(bottom-top);
  ctx.font='14px "Press Start 2P", monospace';ctx.textBaseline='middle';
  for (let i=0;i<=4;i++) {
    const value=min+(max-min)*i/4, yy=py(value);
    ctx.strokeStyle='#333';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();
    ctx.fillStyle='#a5a5a5';ctx.fillText('$'+compact(value),x+4,yy);
  }
  const band=(low,high,color)=>{
    ctx.fillStyle=color;ctx.beginPath();
    series.forEach((r,i)=>i?ctx.lineTo(px(i),py(r[metric][high])):ctx.moveTo(px(i),py(r[metric][high])));
    for (let i=series.length-1;i>=0;i--) ctx.lineTo(px(i),py(series[i][metric][low]));
    ctx.closePath();ctx.fill();
  };
  band('p10','p90','rgba(85,145,205,.22)');band('p25','p75','rgba(85,145,205,.28)');
  ctx.strokeStyle='#d4a84b';ctx.lineWidth=3;ctx.beginPath();
  series.forEach((r,i)=>i?ctx.lineTo(px(i),py(r[metric].p50)):ctx.moveTo(px(i),py(r[metric].p50)));ctx.stroke();
  ctx.strokeStyle='#ccc';ctx.setLineDash([4,5]);ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(px(selected),top);ctx.lineTo(px(selected),bottom);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#aaa';ctx.textBaseline='top';
  ctx.fillText(String(series[0].year),left,bottom+8);
  ctx.fillText(String(series.at(-1).year),right-70,bottom+8);
  ctx.fillStyle='#d4a84b';ctx.fillText('Median',left+90,y+6);
  ctx.fillStyle='#80c0e0';ctx.fillText('Shading: 25–75% and 10–90%',left+225,y+6);
  ctx.restore();
}
