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

/**
 * The percentile-band "Hallway path" fan chart. Percentiles are computed across all paths,
 * including paths with funding failures. `opts`: {x,y,w,h, metric, selectedYear, cursorLabel,
 * log, zoomSpan, zoomCenter}. Reads `forecast.reference` (if present) for life-event ticks.
 */
export function drawForecastChart(ctx, forecast, opts={}) {
  const {x=36,y=100,w=1600,h=450,metric='netWorth',selectedYear,cursorLabel,log=false,zoomSpan=null,zoomCenter}=opts;
  ctx.save();ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(x,y,w,h);
  const anchor=zoomCenter ?? forecast.series[0]?.year;
  const {rows:series}=windowByYear(forecast.series,anchor,zoomSpan);
  const {rows:journey}=windowByYear(forecast.scenarioSeries || [],anchor,zoomSpan);
  const {rows:reference}=windowByYear(forecast.reference || [],anchor,zoomSpan);
  if (!series.length) { ctx.restore(); return; }
  const left=x+100,right=x+w-12,top=y+28,bottom=y+h-28;
  const scale=makeYScale([...series.flatMap(r=>[r[metric].p10,r[metric].p90]),...journey.map(r=>r[metric])],{top,bottom,log});
  const px=i=>left+i/Math.max(1,series.length-1)*(right-left);
  const pxYear=year=>px(year-series[0].year);
  ctx.font='14px "Press Start 2P", monospace';ctx.textBaseline='middle';
  for (const v of scale.gridValues(4)) {
    const yy=scale.project(v);
    ctx.strokeStyle='#333';hairline(ctx,1);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();
    ctx.fillStyle='#a5a5a5';ctx.fillText('$'+compact(v),x+4,yy);
  }
  const band=(low,high,color)=>{
    ctx.fillStyle=color;ctx.beginPath();
    series.forEach((r,i)=>i?ctx.lineTo(px(i),scale.project(r[metric][high])):ctx.moveTo(px(i),scale.project(r[metric][high])));
    for (let i=series.length-1;i>=0;i--) ctx.lineTo(px(i),scale.project(series[i][metric][low]));
    ctx.closePath();ctx.fill();
  };
  band('p10','p90','rgba(85,145,205,.22)');band('p25','p75','rgba(85,145,205,.28)');
  ctx.strokeStyle='#d4a84b';hairline(ctx,3);ctx.beginPath();
  series.forEach((r,i)=>i?ctx.lineTo(px(i),scale.project(r[metric].p50)):ctx.moveTo(px(i),scale.project(r[metric].p50)));ctx.stroke();
  ctx.strokeStyle='#80e0ef';hairline(ctx,2);ctx.beginPath();
  journey.forEach((r,i)=>i?ctx.lineTo(pxYear(r.year),scale.project(r[metric])):ctx.moveTo(pxYear(r.year),scale.project(r[metric])));ctx.stroke();
  drawEventTicks(ctx,reference,pxYear,top);
  const selIdx=selectedYear!=null?series.findIndex(r=>r.year===selectedYear):-1;
  if (selIdx>=0) {
    ctx.strokeStyle='#ccc';ctx.setLineDash([4,5]);hairline(ctx,1);
    ctx.beginPath();ctx.moveTo(px(selIdx),top);ctx.lineTo(px(selIdx),bottom);ctx.stroke();ctx.setLineDash([]);
    if (cursorLabel) drawCursorLabel(ctx,cursorLabel,px(selIdx),top,{alignRight:px(selIdx)>right-220});
  }
  ctx.fillStyle='#aaa';ctx.textBaseline='top';
  ctx.fillText(String(series[0].year),left,bottom+8);
  ctx.fillText(String(series.at(-1).year),right-70,bottom+8);
  const shortLegend=w<1000;
  ctx.fillStyle='#d4a84b';ctx.fillText('Median',left+(shortLegend?0:90),y+6);
  ctx.fillStyle='#80e0ef';ctx.fillText('Hallway path',left+(shortLegend?100:220),y+6);
  if (shortLegend) {
    ctx.font='12px "Press Start 2P", monospace';
    ctx.fillStyle='#80c0e0';ctx.fillText('Bands 25–75 / 10–90%',left+(shortLegend?290:440)-0,y+8);
  } else {ctx.fillStyle='#80c0e0';ctx.fillText('Shading: 25–75% and 10–90%',left+440,y+6);}
  ctx.restore();
}

/**
 * Linear or log y-domain + value->pixel projector, built from a flat list of values.
 * Linear domain is [min(0,...values), max*1+headroom]. Log domain anchors to the smallest
 * POSITIVE value instead of 0 (0/negative values are undefined on a log scale); if nothing in
 * `values` is positive, log is silently unavailable and this falls back to linear so callers
 * never have to special-case it themselves.
 */
export function makeYScale(values,{top,bottom,log=false,headroom=.05}={}) {
  const finite=(values || []).filter(Number.isFinite);
  const rawMax=Math.max(1,...finite);
  if (log) {
    const positives=finite.filter(v=>v>0);
    if (positives.length) {
      const min=Math.min(...positives),max=rawMax+Math.max(1,rawMax-min)*headroom;
      const logMin=Math.log(min),logMax=Math.log(max),span=Math.max(1e-9,logMax-logMin);
      return {log:true,min,max,
        project:v=>bottom-(Math.log(Math.max(min,v))-logMin)/span*(bottom-top),
        gridValues:(steps=4)=>Array.from({length:steps+1},(_,i)=>Math.exp(logMin+span*i/steps))};
    }
  }
  const min=Math.min(0,...finite),max=rawMax+Math.max(1,rawMax-min)*headroom,span=Math.max(1,max-min);
  return {log:false,min,max,
    project:v=>bottom-(v-min)/span*(bottom-top),
    gridValues:(steps=4)=>Array.from({length:steps+1},(_,i)=>min+(max-min)*i/steps)};
}

/**
 * Narrows year-indexed `rows` to a window of `span` years centered on `centerYear`, clamped to
 * the data's own bounds (shifting rather than shrinking the window near either edge, so a zoomed
 * view always shows the same number of years once the data is wide enough). `rows` must be sorted
 * ascending by `.year` with no gaps. `span==null` returns the rows unchanged (no zoom).
 */
export function windowByYear(rows,centerYear,span) {
  if (!rows?.length || span==null) return {rows:rows || [],startIndex:0};
  const firstYear=rows[0].year,lastYear=rows[rows.length-1].year;
  let lo=Math.max(firstYear,Math.round(centerYear-span/2)),hi=Math.min(lastYear,Math.round(centerYear+span/2));
  if (hi-lo<span) { if (lo===firstYear) hi=Math.min(lastYear,lo+span); else if (hi===lastYear) lo=Math.max(firstYear,hi-span); }
  const startIndex=rows.findIndex(r=>r.year>=lo),endIndex=rows.findIndex(r=>r.year>hi);
  return {rows:rows.slice(startIndex,endIndex===-1?rows.length:endIndex),startIndex};
}

/** Small tick + dot above the chart for any row with a non-empty `.events`; `pxYear(year)` maps a year to pixel-x. */
export function drawEventTicks(ctx,rows,pxYear,top,opts={}) {
  ctx.save();ctx.fillStyle=opts.color || '#f2c14e';ctx.strokeStyle=opts.color || '#f2c14e';ctx.lineWidth=1;
  for (const row of rows || []) {
    if (!row?.events?.length) continue;
    const x=pxYear(row.year);
    ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+8);ctx.stroke();
    ctx.beginPath();ctx.arc(x,top+4,3,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

/** Floating label near a cursor position, replacing a fixed text row below the chart. */
export function drawCursorLabel(ctx,text,x,top,opts={}) {
  ctx.save();ctx.font='14px "Press Start 2P", monospace';ctx.textBaseline='top';
  const padX=6,padY=4,lineH=14;
  // Narrow frames: break at ' · ' into several lines so the label never runs off the screen.
  const maxW=Math.max(120,(opts.maxW||FRAME_W-24)-padX*2);
  const lines=[];let cur='';
  for (const part of String(text).split(' · ')) {
    const next=cur?cur+' · '+part:part;
    if (cur&&ctx.measureText(next).width>maxW) {lines.push(cur);cur=part;} else cur=next;
  }
  lines.push(cur);
  const w=Math.min(maxW,Math.max(...lines.map(l=>ctx.measureText(l).width)))+padX*2,boxH=lines.length*(lineH+2)-2+padY*2;
  let lx=opts.alignRight?x-w-6:x+6;
  lx=Math.max(8,Math.min(FRAME_W-8-w,lx));
  ctx.fillStyle='rgba(0,0,0,.75)';ctx.fillRect(lx,top,w,boxH);
  ctx.strokeStyle=opts.color || '#ccc';hairline(ctx,1);ctx.strokeRect(lx+.5,top+.5,w-1,boxH-1);
  ctx.fillStyle=opts.color || '#eee';
  lines.forEach((l,i)=>ctx.fillText(l,lx+padX,top+padY+i*(lineH+2)));
  ctx.restore();
}

/** Buckets a year's statement.income into player-facing categories for the cashflow chart. */
export function groupIncome(statement) {
  const income=statement?.income || {},n=k=>income[k] || 0;
  return [
    {key:'wages',label:'Wages',value:n('wages')+n('spouseWages')},
    {key:'ss',label:'Social Security',value:n('socialSecurity')},
    {key:'retirement',label:'Retirement Withdrawals',value:n('traditionalWithdrawals')+n('rmdEligibleWithdrawals')+n('spouseRmdEligibleWithdrawals')},
    {key:'investment',label:'Investment Income',value:n('interest')+n('qualifiedDividends')+n('ordinaryDividends')+n('shortGains')+n('longGains')},
    {key:'rental',label:'Rental',value:n('rentalIncome')},
  ].filter(g=>g.value!==0);
}
/** Buckets a year's statement.expenses into player-facing categories for the cashflow chart. */
export function groupExpenses(statement) {
  const expenses=statement?.expenses || {},n=k=>expenses[k] || 0;
  return [
    {key:'housing',label:'Housing',value:n('propertyTax')+n('propertyOperating')+n('mortgage')+n('rent')},
    {key:'living',label:'Living',value:n('living')},
    {key:'healthcare',label:'Healthcare',value:n('healthcare')},
    {key:'children',label:'Children/College',value:n('childcare')+n('children')+n('college')},
    {key:'debt',label:'Debt Service',value:n('otherLoans')+n('legacyDebt')},
    {key:'unexpected',label:'Unexpected',value:n('unexpected')},
    {key:'taxes',label:'Taxes',value:n('incomeTax')},
  ].filter(g=>g.value!==0);
}

const COMPOSITION_CATEGORIES=[
  {key:'cash',label:'Cash',color:'#80c0e0'},
  {key:'savings',label:'Savings',color:'#80e0a0'},
  {key:'stocks',label:'Stocks',color:'#d4a84b'},
  {key:'retirement',label:'Retirement',color:'#c0a0ff'},
  {key:'homeEquity',label:'Home Equity',color:'#e0c080'},
];
function compositionValue(worth,key) {
  if (key==='retirement') return Math.max(0,(worth.k401Balance||0)+(worth.rothBalance||0)+(worth.spouseK401Balance||0)+(worth.spouseRothBalance||0));
  return Math.max(0,worth[key] || 0);
}
/** Draws a legend row of color swatches + labels starting at (x,y); returns nothing, just paints. */
function drawSwatchLegend(ctx,items,x,y) {
  ctx.font='14px "Press Start 2P", monospace';ctx.textBaseline='top';
  let lx=x;
  for (const item of items) {
    ctx.fillStyle=item.color;ctx.fillRect(lx,y+1,14,10);
    ctx.fillStyle='#ccc';ctx.fillText(item.label,lx+18,y);
    lx+=18+ctx.measureText(item.label).width+16;
  }
}
/** Shared empty/no-reference-data state for the single-Hallway-path views. */
function drawNoDataState(ctx,x,y,w,h) {
  ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(x,y,w,h);
  ctx.fillStyle=PALETTE.uiText;ctx.font='16px "Press Start 2P", monospace';
  ctx.fillText('No data yet',x+8,y+h/2);
}
/** Draws the shared dashed cursor line + optional floating label, given a row index already in the visible window. */
function drawCursorAt(ctx,selIdx,px,top,bottom,right,cursorLabel) {
  if (selIdx<0) return;
  ctx.strokeStyle='#ccc';ctx.setLineDash([4,5]);ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(px(selIdx),top);ctx.lineTo(px(selIdx),bottom);ctx.stroke();ctx.setLineDash([]);
  if (cursorLabel) drawCursorLabel(ctx,cursorLabel,px(selIdx),top,{alignRight:px(selIdx)>right-200});
}

/**
 * Stacked area of the Hallway path's asset mix over time (Cash/Savings/Stocks/Retirement/Home
 * Equity), plus a dashed Net Worth reference line on top -- since each category is floored at
 * zero for the stack, the reference line sits below the stack's top by roughly the year's debt.
 * `opts`: {x,y,w,h, selectedYear, cursorLabel, log, zoomSpan, zoomCenter}. `reference` is a
 * forecast's `reference` array (one entry per simulated year, each `{year,worth,statement,events}`).
 */
export function drawCompositionChart(ctx,reference,opts={}) {
  const {x,y,w,h,selectedYear,cursorLabel,log=false,zoomSpan=null,zoomCenter}=opts;
  ctx.save();
  if (!reference?.length) { drawNoDataState(ctx,x,y,w,h); ctx.restore(); return; }
  ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(x,y,w,h);
  const {rows}=windowByYear(reference,zoomCenter ?? reference[0].year,zoomSpan);
  const totals=rows.map(r=>COMPOSITION_CATEGORIES.reduce((n,c)=>n+compositionValue(r.worth,c.key),0));
  const left=x+100,right=x+w-12,top=y+28,bottom=y+h-28;
  const scale=makeYScale(totals,{top,bottom,log});
  const n=rows.length,px=i=>left+(n<=1?0:i/(n-1))*(right-left);
  ctx.font='14px "Press Start 2P", monospace';ctx.textBaseline='middle';
  for (const v of scale.gridValues(4)) {
    const yy=scale.project(v);
    ctx.strokeStyle='#333';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();
    ctx.fillStyle='#a5a5a5';ctx.fillText('$'+compact(v),x+4,yy);
  }
  let cumBottom=rows.map(()=>0);
  for (const cat of COMPOSITION_CATEGORIES) {
    const cumTop=rows.map((r,i)=>cumBottom[i]+compositionValue(r.worth,cat.key));
    ctx.fillStyle=cat.color;ctx.globalAlpha=.78;ctx.beginPath();
    rows.forEach((r,i)=>i?ctx.lineTo(px(i),scale.project(cumTop[i])):ctx.moveTo(px(i),scale.project(cumTop[i])));
    for (let i=rows.length-1;i>=0;i--) ctx.lineTo(px(i),scale.project(cumBottom[i]));
    ctx.closePath();ctx.fill();ctx.globalAlpha=1;
    cumBottom=cumTop;
  }
  ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.setLineDash([3,3]);ctx.beginPath();
  rows.forEach((r,i)=>i?ctx.lineTo(px(i),scale.project(r.worth.netWorth)):ctx.moveTo(px(i),scale.project(r.worth.netWorth)));
  ctx.stroke();ctx.setLineDash([]);
  drawEventTicks(ctx,rows,year=>px(year-rows[0].year),top);
  drawCursorAt(ctx,selectedYear!=null?rows.findIndex(r=>r.year===selectedYear):-1,px,top,bottom,right,cursorLabel);
  drawSwatchLegend(ctx,COMPOSITION_CATEGORIES,left,y+6);
  ctx.fillStyle='#aaa';ctx.font='14px "Press Start 2P", monospace';ctx.textBaseline='top';
  ctx.fillText(String(rows[0].year),left,bottom+8);ctx.fillText(String(rows.at(-1).year),right-70,bottom+8);
  ctx.restore();
}

/**
 * Diverging stacked bars of the Hallway path's grouped income (above zero) vs. grouped expenses
 * (below zero) per year; years where `statement.fundingSuccess===false` get a red outline. The Y
 * axis is always linear here (diverging data straddling zero has no sensible log form), so `log`
 * is intentionally not an accepted option. `opts`: {x,y,w,h, selectedYear, cursorLabel, zoomSpan,
 * zoomCenter}. `reference` is a forecast's `reference` array.
 */
export function drawCashflowChart(ctx,reference,opts={}) {
  const {x,y,w,h,selectedYear,cursorLabel,zoomSpan=null,zoomCenter}=opts;
  ctx.save();
  if (!reference?.length) { drawNoDataState(ctx,x,y,w,h); ctx.restore(); return; }
  ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(x,y,w,h);
  const {rows}=windowByYear(reference,zoomCenter ?? reference[0].year,zoomSpan);
  const incomeByRow=rows.map(r=>groupIncome(r.statement)),expenseByRow=rows.map(r=>groupExpenses(r.statement));
  const incomeTotals=incomeByRow.map(gs=>gs.reduce((n,g)=>n+g.value,0)),expenseTotals=expenseByRow.map(gs=>gs.reduce((n,g)=>n+g.value,0));
  const left=x+100,right=x+w-12,top=y+28,bottom=y+h-28;
  const scale=makeYScale([...incomeTotals,...expenseTotals.map(v=>-v)],{top,bottom});
  const zeroY=scale.project(0);
  const n=rows.length,barGap=4,slot=(right-left)/Math.max(1,n),barW=Math.max(2,slot-barGap);
  const barX=i=>left+i*slot+(slot-barW)/2;
  ctx.font='14px "Press Start 2P", monospace';ctx.textBaseline='middle';
  for (const v of scale.gridValues(4)) {
    const yy=scale.project(v);
    ctx.strokeStyle=v===0?'#555':'#333';ctx.lineWidth=v===0?1.5:1;
    ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();
    ctx.fillStyle='#a5a5a5';ctx.fillText((v<0?'-$':'$')+compact(Math.abs(v)),x+4,yy);
  }
  const incomeColors={wages:'#80c0e0',ss:'#80e0a0',retirement:'#c0a0ff',investment:'#d4a84b',rental:'#e08080'};
  const expenseColors={housing:'#e08080',living:'#e0c080',healthcare:'#80e0e0',children:'#e080c0',debt:'#c0a0ff',unexpected:'#ff8080',taxes:'#999'};
  rows.forEach((r,i)=>{
    const bx=barX(i);
    let cum=0;
    for (const g of incomeByRow[i]) {
      const y0=scale.project(cum),y1=scale.project(cum+g.value);
      ctx.fillStyle=incomeColors[g.key] || '#fff';ctx.fillRect(bx,y1,barW,y0-y1);
      cum+=g.value;
    }
    cum=0;
    for (const g of expenseByRow[i]) {
      const y0=scale.project(-cum),y1=scale.project(-(cum+g.value));
      ctx.fillStyle=expenseColors[g.key] || '#fff';ctx.fillRect(bx,y0,barW,y1-y0);
      cum+=g.value;
    }
    if (r.statement?.fundingSuccess===false) { ctx.strokeStyle='#ff5050';ctx.lineWidth=1.5;ctx.strokeRect(bx-1,top,barW+2,bottom-top); }
  });
  drawEventTicks(ctx,rows,year=>barX(year-rows[0].year)+barW/2,top);
  drawCursorAt(ctx,selectedYear!=null?rows.findIndex(r=>r.year===selectedYear):-1,i=>barX(i)+barW/2,top,bottom,right,cursorLabel);
  drawSwatchLegend(ctx,[{label:'Income',color:'#80c0e0'},{label:'Expenses',color:'#e08080'}],left,y+6);
  ctx.fillStyle='#aaa';ctx.font='14px "Press Start 2P", monospace';ctx.textBaseline='top';
  ctx.fillText(String(rows[0].year),left,bottom+8);ctx.fillText(String(rows.at(-1).year),right-70,bottom+8);
  ctx.restore();
}

/**
 * Cumulative share of all simulated paths that have hit a glass wall by each year -- works even
 * on preliminary/partial forecasts. The Y axis is always a bounded 0-100% linear scale (no log
 * option: a probability has no useful log form). `opts`: {x,y,w,h, selectedYear, cursorLabel,
 * zoomSpan, zoomCenter}. `failureByYear` is a forecast's `failureByYear` array.
 */
export function drawRiskChart(ctx,failureByYear,opts={}) {
  const {x,y,w,h,selectedYear,cursorLabel,zoomSpan=null,zoomCenter}=opts;
  ctx.save();
  if (!failureByYear?.length) { drawNoDataState(ctx,x,y,w,h); ctx.restore(); return; }
  ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(x,y,w,h);
  const {rows}=windowByYear(failureByYear,zoomCenter ?? failureByYear[0].year,zoomSpan);
  const left=x+100,right=x+w-12,top=y+28,bottom=y+h-28;
  const n=rows.length,px=i=>left+(n<=1?0:i/(n-1))*(right-left);
  const py=frac=>bottom-frac*(bottom-top);
  ctx.font='14px "Press Start 2P", monospace';ctx.textBaseline='middle';
  for (let i=0;i<=4;i++) {
    const frac=i/4,yy=py(frac);
    ctx.strokeStyle='#333';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();
    ctx.fillStyle='#a5a5a5';ctx.fillText((frac*100).toFixed(0)+'%',x+4,yy);
  }
  ctx.fillStyle='rgba(205,85,85,.25)';ctx.beginPath();
  rows.forEach((r,i)=>i?ctx.lineTo(px(i),py(r.fraction)):ctx.moveTo(px(i),py(r.fraction)));
  ctx.lineTo(px(n-1),bottom);ctx.lineTo(px(0),bottom);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#d45555';ctx.lineWidth=2.5;ctx.beginPath();
  rows.forEach((r,i)=>i?ctx.lineTo(px(i),py(r.fraction)):ctx.moveTo(px(i),py(r.fraction)));ctx.stroke();
  drawCursorAt(ctx,selectedYear!=null?rows.findIndex(r=>r.year===selectedYear):-1,px,top,bottom,right,cursorLabel);
  ctx.fillStyle='#aaa';ctx.textBaseline='top';
  ctx.fillText(String(rows[0].year),left,bottom+8);ctx.fillText(String(rows.at(-1).year),right-70,bottom+8);
  ctx.restore();
}
