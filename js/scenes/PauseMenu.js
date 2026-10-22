import { ForecastClient } from '../finance/ForecastClient.js';
import { MODEL_SCOPE, SUCCESS_DEFINITION } from '../finance/Forecast.js';
/**
 * Esc pause — Portfolio overview, Map (timeline graph + jump/compare), and Charts.
 * Map Compare preserves the original Monte Carlo charts for two timelines.
 */

import { PALETTE, frame, FRAME_W, FRAME_H, HUD_H, KEYS } from '../config.js';
import { jumpToHallwayNode, currentNode, reconstructWorthAlongPath } from '../state/GameState.js';
import { currentTimeline, getTimelineForecast, listTimelines, timelineMapModel, timelineForecastOptions } from '../state/TimelineSystem.js';
import { drawTimelineMap } from '../render/TimelineMap.js';
import { setMoneyContext } from '../finance/DollarBasis.js';
import { getSaveStatus, flushSaves, autoSave } from '../state/SaveSystem.js';
import { downloadForecastBundle } from '../state/PlanExport.js';
import { loadFromFile, loadedFileMessage, saveGameToFile, savedFileMessage } from '../state/SaveFile.js';
import { editInflationSettings, inflationToggleLabel, moneyUnitSubtitle } from './PlanningInputs.js';
import { computeWorth, annualMortgagePayment, annualPropertyTax } from '../finance/Engine.js';
import { buildChartData, drawFinanceChart, chartYearRange, CHART_KINDS, CHART_TITLES, TIME_KINDS, MONEY_KINDS } from '../render/FinanceCharts.js';
import { makeDialogChrome } from '../render/Assets.js';
import { formatMoneyDisplay } from '../render/Dialog.js';
import { fitPixelFont } from '../render/FutureSplash.js';

const VIEW_TABS = ['portfolio', 'map', 'charts', 'settings'];
/** Charts screen pages (shared with Map Compare), paged with '[' / ']' or the on-screen arrow buttons. */
const CHART_VIEWS = CHART_KINDS;
/** Settings rows after the Inflation toggle (index 0); each row's index is i + 1. */
const SETTINGS_ROWS = [
  { label: 'Save to File', note: 'This game + all character profiles, as a .json file on your device' },
  { label: 'Load from File', note: 'Replace this game with a saved file; its profiles are added' },
  { label: 'Save now', note: 'Checkpoint in this browser’s storage' },
];
const SETTINGS_COUNT = SETTINGS_ROWS.length + 1;
const MENU_ITEMS = [
  { label: 'Portfolio', value: 'portfolio' },
  { label: 'Map', value: 'map' },
  { label: 'Charts', value: 'charts' },
  { label: 'Settings', value: 'settings' },
  { label: 'Resume', value: 'resume' },
  { label: 'Quit', value: 'quit' },
];
const QUIT_INDEX = MENU_ITEMS.findIndex((item) => item.value === 'quit');
export const QUIT_TITLE = 'Are you sure you want to quit?';
export const QUIT_SUBTITLE = 'Your file saved the last time you passed through a doorway';
/** Quit confirmation rows; No is the default highlight. */
const QUIT_CHOICES = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
];

/** Word-wrap plain text to `maxW` px using the context's current font (measured). */
function wrapPlain(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const indent = /^\s*/.exec(para)[0];
    let line = '';
    for (const word of para.trim().split(' ')) {
      const next = line ? `${line} ${word}` : indent + word;
      if (line && ctx.measureText(next).width > maxW) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Cut `text` to fit `maxW` px, ending in an ellipsis. */
function fitPlain(ctx, text, maxW) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function fontPx(font) {
  return Number(/(\d+(?:\.\d+)?)px/.exec(String(font))?.[1]) || 16;
}

/** Charts remain focused on the current path; timeline comparison lives on Map. */

/**
 * Legacy headline (no longer drawn on the Charts page): when the first glass wall arrives across the Monte Carlo paths
 * (median year/age, P10–P90). A missing year means no wall through age 100.
 */
export function firstWallHeadline(firstWall) {
  if (!firstWall) return 'First glass wall · not available for this forecast';
  const year = (w) => (w ? String(w.year) : 'none');
  const median = firstWall.p50 ? firstWall.p50.year + ' (age ' + Math.round(firstWall.p50.age) + ')' : 'no wall by age 100';
  return 'First glass wall · median ' + median + ' · P10–P90 ' + year(firstWall.p10) + '–' + year(firstWall.p90);
}

export class PauseMenu {
  constructor() {
    this.open = false;
    this.forecast = new ForecastClient();
    this.chartMode = 'forecast';
    this.chartReal = true;
    this.chartForecast = null;
    this.chartMetric = 'netWorth';
    this.chartYear = 0;
    this.forecastPaths = 1000;
    /** Which of CHART_VIEWS is showing. */
    this.chartView = 'summary';
    /** History page cursor (calendar year; null = latest). */
    this.historyYear = null;
    /** Map Compare: which chart page and which year the cursor is on (null = first year). */
    this.compareView = 'networth';
    this.compareCursor = null;
    this._compareCache = null;
    /** Y-axis log-scale toggle and year-range zoom window (null span = full horizon). */
    this.chartScaleLog = false;
    this.chartZoomSpan = null;
    this.chartZoomCenter = null;
    this.screen = 'menu'; // menu | portfolio | map | charts | confirmQuit
    /** Quit confirmation highlight: index into QUIT_CHOICES (1 = No). */
    this.quitChoice = 1;
    this.quitChrome = null;
    this.selected = 0;
    this.portfolioPage = 0; // 0 = summary, 1 = homes and loans
    this.portfolioDetailPage = 0;
    this.chrome = null;
    /** Map compare: overview | select | result. */
    this.mapMode = 'overview';
    /** Map Compare's own Y-axis readability controls, same idea as the Charts screen's. */
    this.compareScaleLog = false;
    this.compareZoomSpan = null;
    this.compareZoomCenter = null;
    /** @type {import('../render/Dialog.js').Dialog|null} */
    this.dialog = null;
    /** Map overview focus: timeline index + point index (or Compare). */
    this.mapTimelineIndex = 0;
    this.mapPointIndex = 0;
    /** @type {'point'|'compare'} */
    this.mapFocus = 'point';
    /** @type {object[]} Hallway jump targets for the selected timeline. */
    this.mapJumpPoints = [];
    /** @type {object|null} Cached map model from last refresh. */
    this.mapModel = null;
    this.compareSelectionIndex = 0;
    this.selectedComparison = [];
    /**
     * Pointer hit regions for the frame last drawn, in 1920×1080 frame px.
     * draw() rebuilds them from the same rects it paints, so hit-testing
     * always matches what is on screen.
     * @type {Array<{key:string,x:number,y:number,w:number,h:number,hover?:Function,activate:Function}>}
     */
    this._hits = [];
    /** Key of the hit region under the mouse (hint links highlight on hover). */
    this.hoverKey = null;
  }

  show(game, dialog = null) {
    this.open = true;
    this.chartReal = game?.portfolio?.inflationAdjusted !== false;
    setMoneyContext(game.portfolio);
    this.screen = 'menu';
    this.selected = 0;
    this.portfolioPage = 0;
    this.portfolioDetailPage = 0;
    this.dialog = dialog || this.dialog;
    this.mapMode = 'overview';
    this.refresh(game);
  }

  hide() {
    this.forecast.cancel();
    this.open = false;
    this._hits = [];
    this.hoverKey = null;
  }

  // ---- Shared actions (keyboard / D-pad and mouse / touch run the same code) ----

  /** Escape / B: leave a Map compare mode, then a sub-view, then the pause menu. */
  back() {
    if (this.screen === 'confirmQuit') {
      // Escape / B on the quit question = No: back to the menu, Quit still highlighted.
      this.screen = 'menu';
      this.selected = QUIT_INDEX;
      return undefined;
    }
    if (this.screen === 'map' && this.mapMode !== 'overview') {
      this.mapMode = 'overview';
      this.compareScaleLog = false; this.compareZoomSpan = null; this.compareZoomCenter = null;
      return undefined;
    }
    if (this.screen !== 'menu') {
      this.forecast.cancel();
      if (this.screen === 'charts') this.resetChartViewState();
      this.screen = 'menu';
      this.selected = 0;
      return undefined;
    }
    this.hide();
    return 'close';
  }

  /** Charts screen state that shouldn't silently persist across visits. */
  resetChartViewState() {
    this.chartScaleLog = false;
    this.chartZoomSpan = null;
    this.chartZoomCenter = null;
  }

  /** Enter / A on a main-menu row. */
  activateMenuItem(index, game) {
    const choice = MENU_ITEMS[index]?.value;
    if (!choice) return undefined;
    this.selected = index;
    if (choice === 'resume') {
      this.hide();
      return 'close';
    }
    if (choice === 'quit') {
      this.screen = 'confirmQuit';
      this.quitChoice = 1; // default No
      return undefined;
    }
    this.screen = choice;
    this.selected = 0;
    this.portfolioPage = 0;
    this.portfolioDetailPage = 0;
    this.refresh(game);
    return undefined;
  }

  /** Quit confirmation: Yes quits to the title (as Quit did before); No returns to the menu. */
  answerQuit(index) {
    if (QUIT_CHOICES[index]?.value === true) {
      this.hide();
      return 'quit';
    }
    return this.back();
  }

  /** Tab / Q: cycle the pause views. */
  nextTab(game) {
    if (this.screen === 'charts') this.resetChartViewState();
    const current = VIEW_TABS.indexOf(this.screen);
    this.screen = VIEW_TABS[(current + 1) % VIEW_TABS.length];
    this.selected = 0;
    this.portfolioPage = 0;
    this.portfolioDetailPage = 0;
    if (this.screen === 'map') this.syncMapSelection(game, { resetFocus: true });
    return undefined;
  }

  togglePortfolioPage() {
    this.portfolioPage = this.portfolioPage === 0 ? 1 : 0;
    this.portfolioDetailPage = 0;
    return undefined;
  }

  stepPortfolioDetailPage(game, dir = 1) {
    const pages = this.portfolioDetailPages(game.portfolio).length;
    if (pages > 1) this.portfolioDetailPage = (this.portfolioDetailPage + (dir > 0 ? 1 : pages - 1)) % pages;
    return undefined;
  }

  /** Map overview ←/→ (or a click on a column number): pick a timeline, focus its nearest hallway. */
  selectMapTimeline(game, index) {
    const timelines = this.mapModel?.timelines || listTimelines(game);
    if (!timelines.length) return;
    this.mapTimelineIndex = (index + timelines.length) % timelines.length;
    this.mapPointIndex = 0; this.mapFocus = 'point';
    this.syncMapSelection(game);
  }

  /** Restore the selected timeline at its selected year without rerolling its future. */
  activateMapFocus(game) {
    if (this.mapFocus === 'compare') return this.toggleMapCompare(game);
    const timeline = this.mapModel?.timelines[this.mapTimelineIndex];
    const point = timeline?.points[this.mapPointIndex];
    if (timeline?.hallwayNodeId && jumpToHallwayNode(game, timeline.hallwayNodeId)) {
      game.timeline.mapJumpYear = point?.year ?? timeline.startYear;
      this.chartYear = Math.max(0, game.timeline.mapJumpYear - timeline.startYear);
      this.hide(); return { jump: timeline.hallwayNodeId };
    }
    return undefined;
  }

  /** After the south door erases a timeline: drop map focus and Compare picks that may name it. */
  forgetTimelineSelection() {
    this.mapMode = 'overview';
    this.mapTimelineIndex = 0; this.mapPointIndex = 0; this.mapFocus = 'point';
    this.mapJumpPoints = [];
    this.compareSelectionIndex = 0; this.selectedComparison = [];
  }

  /** Map C: toggle Compare selection. */
  toggleMapCompare(game) {
    if (listTimelines(game).length < 2) return undefined;
    this.mapMode = 'select'; this.selectedComparison = []; this.compareCursor = null;
    this.compareSelectionIndex = this.mapTimelineIndex;
    this.compareScaleLog = false; this.compareZoomSpan = null; this.compareZoomCenter = null;
    return undefined;
  }

  /** Map Compare '+': toggle a 15-year zoom window around the year cursor. */
  toggleCompareZoom() {
    if (this.compareZoomSpan == null) { this.compareZoomSpan = 15; this.compareZoomCenter = this.compareCursor; }
    else { this.compareZoomSpan = null; this.compareZoomCenter = null; }
  }

  /** Map Compare: move the shared year cursor (camera-follows when zoomed). */
  stepCompareCursor(dir) {
    const range = this._compareRange;
    if (!range) return;
    const cur = this.compareCursor ?? range[0];
    this.setCompareCursor(Math.max(range[0], Math.min(range[1], cur + dir)));
  }

  setCompareCursor(year) {
    this.compareCursor = year;
    if (this.compareZoomSpan != null) {
      const half = this.compareZoomSpan / 2, c = this.compareZoomCenter ?? year;
      if (year > c + half) this.compareZoomCenter = year - half;
      else if (year < c - half) this.compareZoomCenter = year + half;
      else this.compareZoomCenter = c;
    }
  }

  /** Chart data for two compared timelines (forecast, its starting balances, and the played history), cached per pair. */
  compareDatasets(game, selected) {
    const key = selected.map(t => `${t.id}:${t.forecast?.count}:${t.points.length}`).join('|') + `|${(game.worthHistory || []).length}`;
    if (this._compareCache?.key === key) return this._compareCache.data;
    const data = selected.map(t => {
      const tip = [...t.points].reverse().find(p => p.nodeId)?.nodeId;
      let history = [];
      try { history = tip ? reconstructWorthAlongPath(game, tip) : []; } catch { history = []; }
      const baseline = t.baseline || t.forecast?.inputSnapshot?.portfolio;
      return buildChartData({ forecast: t.forecast, history, today: baseline ? computeWorth(baseline) : null,
        todayPriceIndex: baseline?.priceIndex || 1, label: `Timeline ${t.number}${t.isCurrent ? ' (current)' : ''}` });
    });
    this._compareCache = { key, data };
    return data;
  }

  /** Map Compare: page through the same chart pages as Pause > Charts. */
  pageCompare(dir) {
    const i = CHART_KINDS.indexOf(this.compareView);
    this.compareView = CHART_KINDS[(i + dir + CHART_KINDS.length) % CHART_KINDS.length];
  }

  selectComparisonTimeline(game, index) {
    const timelines = listTimelines(game), timeline = timelines[index];
    if (!timeline || this.selectedComparison.includes(timeline.id)) return undefined;
    this.selectedComparison.push(timeline.id);
    this.compareSelectionIndex = (index + 1) % timelines.length;
    if (this.selectedComparison.length === 2) this.mapMode = 'result';
    return undefined;
  }

  /** Charts shortcuts by name (keys F/R/L/P/C/E, ←/→, Enter). */
  chartAction(name, game) {
    if (name === 'options') void this.showChartOptions(game);
    if (name === 'history') { this.chartView = this.chartView === 'history' ? 'networth' : 'history'; this.historyYear = null; }
    if (name === 'real') { this.chartReal = !this.chartReal; game.portfolio.inflationAdjusted = this.chartReal; game.settings = { ...game.settings, inflationAdjusted: this.chartReal }; setMoneyContext(game.portfolio); }
    if (name === 'liquid') this.chartMetric = this.chartMetric === 'netWorth' ? 'liquid' : 'netWorth';
    if (name === 'paths') this.forecastPaths = this.forecastPaths === 1000 ? 5000 : this.forecastPaths === 5000 ? 10000 : 1000;
    if (name === 'viewPrev' || name === 'viewNext') {
      const i = CHART_VIEWS.indexOf(this.chartView);
      const dir = name === 'viewNext' ? 1 : -1;
      this.chartView = CHART_VIEWS[(i + dir + CHART_VIEWS.length) % CHART_VIEWS.length];
    }
    if (name === 'scale') this.chartScaleLog = !this.chartScaleLog;
    if (name === 'zoom') {
      if (this.chartZoomSpan == null) {
        this.chartZoomSpan = 15;
        this.chartZoomCenter = (this.chartForecast?.series[0]?.year ?? 0) + this.chartYear;
      } else {
        this.chartZoomSpan = null;
        this.chartZoomCenter = null;
      }
    }
    if (this.chartView === 'history' && (name === 'next' || name === 'prev')) {
      const years = (game.worthHistory || []).map(r => r.year).filter(Number.isFinite);
      if (years.length) {
        const lo = Math.min(...years), hi = Math.max(...years);
        const cur = this.historyYear ?? hi;
        this.historyYear = Math.max(lo, Math.min(hi, cur + (name === 'next' ? 1 : -1)));
      }
      return undefined;
    }
    if (name === 'next') this.chartYear = Math.min(100 - game.portfolio.age, this.chartYear + 1);
    if (name === 'prev') this.chartYear = Math.max(0, this.chartYear - 1);
    if ((name === 'next' || name === 'prev') && this.chartZoomSpan != null && this.chartForecast) {
      // Camera-follow: shift (don't recenter) the zoom window only once the cursor would leave it.
      const year = this.chartForecast.series[0].year + this.chartYear;
      const half = this.chartZoomSpan / 2;
      if (year > this.chartZoomCenter + half) this.chartZoomCenter = year - half;
      else if (year < this.chartZoomCenter - half) this.chartZoomCenter = year + half;
    }
    if (name === 'coverage') void this.showModelCoverage(game);
    if (name === 'export') this.exportForecast(game);
    return undefined;
  }

  // ---- Pointer (mouse / touch on the canvas) ----

  /** Topmost-closest hit region containing frame point (lx, ly), else null. */
  hitAt(lx, ly) {
    let best = null;
    let bestDist = Infinity;
    for (const h of this._hits) {
      if (lx < h.x || lx > h.x + h.w || ly < h.y || ly > h.y + h.h) continue;
      const d = Math.hypot(lx - (h.x + h.w / 2), ly - (h.y + h.h / 2));
      if (d < bestDist) { bestDist = d; best = h; }
    }
    return best;
  }

  /**
   * Mouse hover: highlight / move the selection like the arrow keys would.
   * @returns {boolean} whether the pointer is over a clickable item
   */
  handlePointerMove(lx, ly, game) {
    if (!this.open) return false;
    this._pointer = { x: lx, y: ly };
    const hit = this.hitAt(lx, ly);
    this.hoverKey = hit?.key ?? null;
    if (hit?.hover) hit.hover(game);
    return !!hit;
  }

  /**
   * Click / tap: activate the item exactly as Enter / A (or Esc / B for Back).
   * Clicks outside every item do nothing.
   * @returns {{handled:boolean, result?:'close'|'quit'|{jump:string}|undefined}}
   */
  handlePointerDown(lx, ly, game) {
    if (!this.open) return { handled: false };
    this._pointer = { x: lx, y: ly };
    const hit = this.hitAt(lx, ly);
    if (!hit) return { handled: false };
    const result = hit.activate(game);
    // Regions belong to the frame that was clicked; the next draw rebuilds them.
    this._hits = [];
    this.hoverKey = null;
    return { handled: true, result };
  }

  _addHit(hit) {
    this._hits.push(hit);
    return hit;
  }

  /**
   * Draw a hint line left to right in the current font. Parts with `action`
   * become clickable links (gold + underline on hover) using the same rects.
   * @param {Array<{text:string, action?:Function, key?:string}>} parts
   */
  drawLinks(ctx, parts, x, y, maxW = 0) {
    const px = fontPx(ctx.font);
    const base = ctx.fillStyle;
    let cx = x;
    const lineH = Math.round(px * 1.9);
    for (const part of parts) {
      const w = ctx.measureText(part.text).width;
      // Width-aware: start a new row (dropping the separator) instead of running off the box.
      if (maxW > 0 && cx > x && cx + w > x + maxW) {
        if (/^\s*·\s*$/.test(part.text)) continue;
        cx = x;
        y += lineH;
        if (/^\s*·/.test(part.text)) { part.text = part.text.replace(/^\s*·\s*/, ''); }
      }
      if (part.action) {
        const key = part.key || `link:${part.text}`;
        const hovered = this.hoverKey === key;
        this._addHit({ key, x: cx - 6, y: y - 8, w: w + 12, h: px + 16, activate: part.action });
        ctx.fillStyle = hovered ? PALETTE.gold : base;
        ctx.fillText(part.text, cx, y);
        if (hovered) ctx.fillRect(cx, y + px + 3, w, 2);
      } else {
        ctx.fillStyle = base;
        ctx.fillText(part.text, cx, y);
      }
      cx += w;
    }
    ctx.fillStyle = base;
    return y + lineH;
  }

  /** Draw wrapped plain text (measured); returns the y below the last line. */
  drawWrapped(ctx, text, x, y, maxW, lineH) {
    for (const line of wrapPlain(ctx, text, maxW)) { ctx.fillText(line, x, y); y += lineH; }
    return y;
  }

  refresh(game) {
    this.syncMapSelection(game, { resetFocus: true });
  }

  /**
   * Keep map timeline/point selection coherent with the live tree.
   * On resetFocus (open/refresh): pick timeline containing currentNodeId and
   * the hallway nearest to live portfolio year (or the current hallway node).
   */
  syncMapSelection(game, { resetFocus = false } = {}) {
    this.mapModel = timelineMapModel(game);
    const timelines = this.mapModel.timelines;
    if (resetFocus) {
      this.mapTimelineIndex = Math.max(0, timelines.findIndex(t => t.isCurrent));
      this.mapPointIndex = 0; this.mapFocus = 'point';
    }
    this.mapTimelineIndex = Math.min(this.mapTimelineIndex, Math.max(0, timelines.length - 1));
    this.mapJumpPoints = timelines[this.mapTimelineIndex]?.points || [];
    this.mapPointIndex = Math.min(this.mapPointIndex, Math.max(0, this.mapJumpPoints.length - 1));
  }

  /** Focus list for ↑/↓ on the selected timeline: jump points then optional Compare. */
  mapFocusItems(game) {
    const items = (this.mapJumpPoints || []).map((point, index) => ({ kind: 'point', index, point }));
    if (listTimelines(game).length >= 2) items.push({ kind: 'compare' });
    return items;
  }

  /**
   * @returns {'close'|null|{jump:string}|undefined}
   */
  handleKey(e, game) {
    if (!this.open) return null;
    if (e.key === ' ' && e.repeat) {
      e.preventDefault();
      return undefined;
    }

    if (KEYS.cancel.includes(e.key)) {
      e.preventDefault();
      return this.back();
    }

    if (this.screen === 'confirmQuit') {
      if (KEYS.up.includes(e.key) || KEYS.down.includes(e.key) || KEYS.left.includes(e.key) || KEYS.right.includes(e.key)) {
        this.quitChoice = (this.quitChoice + 1) % QUIT_CHOICES.length;
        e.preventDefault();
        return undefined;
      }
      if (KEYS.confirm.includes(e.key)) {
        e.preventDefault();
        return this.answerQuit(this.quitChoice);
      }
      return undefined; // Tab / shortcuts do nothing while the question is up
    }

    if (this.screen === 'menu') {
      if (KEYS.up.includes(e.key)) {
        this.selected = (this.selected - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
        e.preventDefault();
        return undefined;
      }
      if (KEYS.down.includes(e.key)) {
        this.selected = (this.selected + 1) % MENU_ITEMS.length;
        e.preventDefault();
        return undefined;
      }
      if (KEYS.confirm.includes(e.key)) {
        e.preventDefault();
        return this.activateMenuItem(this.selected, game);
      }
      return undefined;
    }

    // Tab / Q keeps the original quick-switch behavior between pause views.
    if (e.key === 'Tab' || e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      return this.nextTab(game);
    }

    if (this.screen === 'portfolio') {
      if (this.portfolioPage === 1 && (KEYS.up.includes(e.key) || KEYS.down.includes(e.key))) {
        e.preventDefault();
        return this.stepPortfolioDetailPage(game, KEYS.down.includes(e.key) ? 1 : -1);
      }
      if (KEYS.confirm.includes(e.key)) {
        e.preventDefault();
        return this.togglePortfolioPage();
      }
      return undefined;
    }

    if (this.screen === 'settings') {
      if (KEYS.up.includes(e.key) || KEYS.down.includes(e.key)) {
        this.selected = (this.selected + (KEYS.down.includes(e.key) ? 1 : SETTINGS_COUNT - 1)) % SETTINGS_COUNT;
        e.preventDefault(); return undefined;
      }
      if (KEYS.confirm.includes(e.key)) { e.preventDefault(); void this.settingsAction(this.selected, game); }
      return undefined;
    }

    if (this.screen === 'map') {
      this.syncMapSelection(game);
      const timelines = this.mapModel.timelines;
      if (e.key.toLowerCase() === 'c') { e.preventDefault(); return this.toggleMapCompare(game); }
      if (this.mapMode === 'select') {
        if ([...KEYS.left, ...KEYS.up, ...KEYS.right, ...KEYS.down].includes(e.key)) {
          const dir = KEYS.left.includes(e.key) || KEYS.up.includes(e.key) ? -1 : 1;
          this.compareSelectionIndex = (this.compareSelectionIndex + dir + timelines.length) % timelines.length;
          e.preventDefault(); return undefined;
        }
        if (KEYS.confirm.includes(e.key)) { e.preventDefault(); return this.selectComparisonTimeline(game, this.compareSelectionIndex); }
        return undefined;
      }
      if (this.mapMode === 'result') {
        const k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); this.compareScaleLog = !this.compareScaleLog; return undefined; }
        if (k === '+' || k === '=') { e.preventDefault(); this.toggleCompareZoom(); return undefined; }
        if (k === 'r') { e.preventDefault(); this.chartAction('real', game); return undefined; }
        if (k === 'l') { e.preventDefault(); this.chartAction('liquid', game); return undefined; }
        if (k === '[' || k === ']') { e.preventDefault(); this.pageCompare(k === ']' ? 1 : -1); return undefined; }
        if (KEYS.left.includes(e.key) || KEYS.right.includes(e.key)) {
          e.preventDefault(); this.stepCompareCursor(KEYS.right.includes(e.key) ? 1 : -1); return undefined;
        }
        if (KEYS.confirm.includes(e.key)) { e.preventDefault(); return this.toggleMapCompare(game); }
        return undefined;
      }
      if (KEYS.left.includes(e.key) || KEYS.right.includes(e.key)) {
        this.selectMapTimeline(game, this.mapTimelineIndex + (KEYS.right.includes(e.key) ? 1 : -1));
        e.preventDefault(); return undefined;
      }
      if (KEYS.up.includes(e.key) || KEYS.down.includes(e.key)) {
        const items = this.mapFocusItems(game);
        const current = this.mapFocus === 'compare' ? items.length - 1 : this.mapPointIndex;
        // Later years appear higher on the map, so Up advances along the lane.
        const next = items[(current + (KEYS.up.includes(e.key) ? 1 : -1) + items.length) % items.length];
        if (next) { this.mapFocus = next.kind; if (next.kind === 'point') this.mapPointIndex = next.index; }
        e.preventDefault(); return undefined;
      }
      if (KEYS.confirm.includes(e.key)) { e.preventDefault(); return this.activateMapFocus(game); }
      return undefined;
    }

    if (this.screen === 'charts') {
      if (KEYS.confirm.includes(e.key) && e.key.toLowerCase() !== 'e') { e.preventDefault(); return this.chartAction('options', game); }
      // Z is a confirm key everywhere, so zoom lives on '+' (or '=').
      const byKey = { f: 'history', r: 'real', l: 'liquid', p: 'paths', c: 'coverage', e: 'export', s: 'scale', '+': 'zoom', '=': 'zoom' };
      if (byKey[e.key.toLowerCase()]) this.chartAction(byKey[e.key.toLowerCase()], game);
      if (e.key === '[') this.chartAction('viewPrev', game);
      if (e.key === ']') this.chartAction('viewNext', game);
      if (KEYS.right.includes(e.key)) this.chartAction('next', game);
      if (KEYS.left.includes(e.key)) this.chartAction('prev', game);
      e.preventDefault(); return undefined;
    }

    return undefined;
  }

  draw(ctx, game) {
    if (!this.open) return;
    this._hits = [];
    setMoneyContext(game.portfolio);
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);

    // Stay below the HUD band and above a bottom margin, same convention as Dialog.js's _layout().
    const topMargin = 28, bottomMargin = 28;
    const availTop = HUD_H + topMargin, availH = FRAME_H - availTop - bottomMargin;
    // Narrow (portrait) frames: nearly full width and compact layouts below.
    this.narrow = FRAME_W < 1300;
    const boxW = Math.min(FRAME_W - (this.narrow ? 40 : 160), FRAME_W - frame.safeX * 2);
    const boxH = availH;
    const x = Math.floor((FRAME_W - boxW) / 2);
    const y = availTop;
    if (!this.chrome || this.chrome.width !== boxW || this.chrome.height !== boxH) {
      this.chrome = makeDialogChrome(boxW, boxH);
    }
    ctx.drawImage(this.chrome, x, y);

    if (this.screen === 'confirmQuit') {
      // Pause menu stays visible underneath; only the question is clickable.
      this.drawMenu(ctx, x, y, boxW, boxH);
      this._hits = [];
      this.drawQuitConfirm(ctx);
    } else if (this.screen === 'menu') {
      this.drawMenu(ctx, x, y, boxW, boxH);
    } else {
      this.drawSubView(ctx, game, x, y, boxW, boxH);
    }
  }

  /** Main-menu row rects — shared by drawMenu and pointer hit-testing. */
  menuItemRects(x, y, boxW, boxH = 9999) {
    // Short frames (landscape phones): tighten the header and the row pitch so every row clears the footer.
    const short = boxH < 640;
    const start = short ? 104 : 152, pitch = short ? Math.min(64, Math.floor((boxH - start - 70) / (MENU_ITEMS.length - 1))) : 64;
    return MENU_ITEMS.map((item, i) => ({ ...item, index: i, x: x + 40, y: y + start + i * pitch, w: boxW - 80, h: short ? Math.min(48, pitch - 4) : 48 }));
  }

  drawMenu(ctx, x, y, boxW, boxH) {
    ctx.font = '32px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.gold;
    const short = boxH < 640;
    ctx.fillText('Pause', x + 48, y + (short ? 22 : 48));
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.fillStyle = PALETTE.uiText;
    ctx.fillText('Choose a view', x + 48, y + (short ? 66 : 100));

    for (const row of this.menuItemRects(x, y, boxW, boxH)) {
      const selected = row.index === this.selected;
      this._addHit({
        key: `menu:${row.value}`, x: row.x, y: row.y, w: row.w, h: row.h,
        hover: () => { this.selected = row.index; },
        activate: (g) => this.activateMenuItem(row.index, g),
      });
      if (selected) {
        ctx.fillStyle = 'rgba(200,160,80,0.25)';
        ctx.fillRect(row.x, row.y, row.w, row.h);
        ctx.fillStyle = PALETTE.gold;
      } else {
        ctx.fillStyle = PALETTE.uiText;
      }
      ctx.font = '28px "Press Start 2P", monospace';
      ctx.fillText(`${selected ? '▶' : ' '} ${row.label}`, row.x + 16, row.y + (row.h >= 48 ? 8 : Math.round((row.h - 28) / 2)));
    }

    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillStyle = '#777';
    this.drawLinks(ctx, [{ text: 'Enter select · ' }, { text: 'Esc resume', action: () => this.back() }], x + 48, y + boxH - 20);
  }

  /** Yes / No row rects for the quit question — shared by drawing and hit-testing. */
  quitChoiceRects(x, top, innerW) {
    return QUIT_CHOICES.map((choice, i) => ({ ...choice, index: i, x, y: top + i * 76, w: innerW, h: 60 }));
  }

  /**
   * "Are you sure you want to quit?" panel, centered in the 80% title-safe
   * area; title / subtitle / rows are fitted with fitPixelFont so they stay
   * inside it at any canvas scale (phone portrait / landscape, 1920×1080).
   */
  drawQuitConfirm(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    const boxW = Math.round(FRAME_W * 0.8);
    const boxH = 470;
    const x = Math.round((FRAME_W - boxW) / 2);
    const y = Math.round((FRAME_H - boxH) / 2);
    if (!this.quitChrome || this.quitChrome.width !== boxW || this.quitChrome.height !== boxH) {
      this.quitChrome = makeDialogChrome(boxW, boxH);
    }
    ctx.drawImage(this.quitChrome, x, y);

    const pad = 64;
    const innerW = boxW - pad * 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let ty = y + 56;
    const titlePx = fitPixelFont(ctx, [QUIT_TITLE], 44, innerW);
    ctx.font = `${titlePx}px "Press Start 2P", monospace`;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(QUIT_TITLE, x + pad, ty);
    ty += titlePx + 26;

    const subPx = fitPixelFont(ctx, [QUIT_SUBTITLE], 24, innerW);
    ctx.font = `${subPx}px "Press Start 2P", monospace`;
    ctx.fillStyle = '#a89878';
    ctx.fillText(QUIT_SUBTITLE, x + pad, ty);
    ty += subPx + 52;

    const rows = this.quitChoiceRects(x + pad - 16, ty, innerW + 32);
    const rowPx = fitPixelFont(ctx, rows.map((r) => `▶ ${r.label}`), 30, innerW);
    for (const row of rows) {
      const selected = row.index === this.quitChoice;
      this._addHit({
        key: `quit:${row.label}`, x: row.x, y: row.y, w: row.w, h: row.h,
        hover: () => { this.quitChoice = row.index; },
        activate: () => this.answerQuit(row.index),
      });
      if (selected) {
        ctx.fillStyle = 'rgba(200,160,80,0.25)';
        ctx.fillRect(row.x, row.y, row.w, row.h);
        ctx.fillStyle = PALETTE.gold;
      } else {
        ctx.fillStyle = PALETTE.uiText;
      }
      ctx.font = `${rowPx}px "Press Start 2P", monospace`;
      ctx.fillText(`${selected ? '▶' : ' '} ${row.label}`, row.x + 16, row.y + Math.round((row.h - rowPx) / 2));
    }

    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillStyle = '#777';
    this.drawLinks(ctx, [{ text: 'Enter select · ' }, { text: 'Esc no', key: 'quit:esc', action: () => this.back() }],
      x + pad, y + boxH - 48);
  }

  drawSubView(ctx, game, x, y, boxW, boxH) {
    ctx.font = '22px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.gold;
    const title =
      this.screen === 'portfolio'
        ? this.portfolioPage === 0
          ? 'Portfolio Overview'
          : 'Portfolio Details'
        : this.screen === 'map'
          ? 'Timeline Map'
          : this.screen === 'settings' ? 'Settings' : this.chartTitle(game);
    // Portfolio pages: title inset from the gold border, aligned with the row column (x + 36).
    const narrow = boxW < 1500;
    const headParts = [
      { text: 'Tab next', key: 'head:tab', action: (g) => this.nextTab(g) },
      { text: ' · ' },
      { text: 'Esc back', key: 'head:back', action: () => this.back() },
    ];
    if (narrow) {
      // Title on its own line (fitted to the box), hint line under it; content shifts down.
      const tpx = fitPixelFont(ctx, [title], 22, boxW - 72, 12);
      ctx.font = `${tpx}px "Press Start 2P", monospace`;
      ctx.fillText(title, x + 36, y + 22);
      ctx.fillStyle = '#888';
      ctx.font = '13px "Press Start 2P", monospace';
      this.drawLinks(ctx, headParts, x + 36, y + 22 + tpx + 12);
      const dy = 30;
      y += dy; boxH -= dy;
    } else {
      if (this.screen === 'portfolio') ctx.fillText(title, x + 36, y + 24);
      else ctx.fillText(title, x + 12, y + 10);
      ctx.fillStyle = '#666';
      ctx.font = '14px "Press Start 2P", monospace';
      this.drawLinks(ctx, headParts, x + boxW - 360, y + 28);
    }

    if (this.screen === 'portfolio') {
      this.drawPortfolio(ctx, game.portfolio, x, y, boxW, boxH, game);
    } else if (this.screen === 'map') {
      this.drawMap(ctx, game, x, y, boxW, boxH);
    } else if (this.screen === 'settings') {
      this.drawSettings(ctx, game, x, y, boxW, boxH);
    } else {
      this.drawCharts(ctx, game, x, y, boxW, boxH);
    }
  }

  chartTitle() {
    return 'Charts';
  }

  async showChartOptions(game) {
    if (!this.dialog || this.dialog.active) return;
    const choice = await this.dialog.menu('Chart options', [
      {label:'Chart: ' + CHART_TITLES[this.chartView],value:'view'},
      {label:this.chartReal ? 'Show future (nominal) dollars' : 'Show ' + this.realDollarLabel(game) + ' dollars',value:'real'},
      {label:this.chartMetric === 'netWorth' ? 'Outlook: show Cash' : 'Outlook: show net worth',value:'metric'},
      {label:'Y-axis: ' + (this.chartScaleLog ? 'Log' : 'Linear'),value:'scale'},
      {label:this.chartZoomSpan == null ? 'Zoom to 15 years' : 'Show all years',value:'zoom'},
      {label:'Simulation count (' + this.forecastPaths + ')',value:'paths'},
      {label:'Model coverage / input warnings (' + (this.chartForecast?.warnings?.length || 0) + ')',value:'coverage'},
      {label:'Export forecast, inputs and plan',value:'export'},
      {label:'Back',value:null}], {title:'Charts'});
    if (choice === 'zoom') this.chartAction('zoom', game);
    if (choice === 'real') this.chartAction('real', game);
    if (choice === 'metric') this.chartMetric = this.chartMetric === 'netWorth' ? 'liquid' : 'netWorth';
    if (choice === 'view') {
      const view = await this.dialog.menu('Chart view', [
        ...CHART_VIEWS.map(v => ({label:CHART_TITLES[v],value:v})),
        {label:'Back',value:null}], {title:'Chart view'});
      if (view) this.chartView = view;
    }
    if (choice === 'scale') this.chartAction('scale', game);
    if (choice === 'paths') {
      const count = await this.dialog.menu('Monte Carlo paths', [{label:'1,000 (preview)',value:1000},
        {label:'5,000 (full)',value:5000},{label:'10,000 (full)',value:10000},{label:'Back',value:null}],{title:'Simulation count'});
      if (count) this.forecastPaths = count;
    }
    if (choice === 'coverage') await this.showModelCoverage(game);
    if (choice === 'export') this.exportForecast(game);
  }

  async showModelCoverage(game) {
    if (!this.dialog || this.dialog.active) return;
    for (const text of [SUCCESS_DEFINITION, ...MODEL_SCOPE, ...(this.chartForecast?.warnings || this.forecast.result?.warnings || game.portfolio.modelWarnings || [])]) {
      await this.dialog.show(text, { title: 'Forecast coverage' });
    }
  }

  exportForecast(game) {
    const f = this.chartForecast || this.forecast.result;
    if (!f || f.provisional || !game) return;
    const timeline = currentTimeline(game);
    const baseline = f.inputSnapshot || (currentNode(game)?.type === 'hallway' ? timeline?.baseline : game.portfolio);
    downloadForecastBundle(game, f, { baseline, settings: { inflationAdjusted: game.portfolio.inflationAdjusted !== false } });
  }

  /** Context-only, touch-sized button. Returns its width. */
  drawChip(ctx, label, x, y, key, action, { px = 13, h = 44, active = false, minW = 0, glyph = null } = {}) {
    ctx.font = `${px}px "Press Start 2P", monospace`;
    const w = Math.max(minW, glyph ? h : Math.ceil(ctx.measureText(label).width) + px * 2);
    const hovered = this.hoverKey === key;
    ctx.fillStyle = hovered ? '#34405a' : active ? '#2a3348' : '#1b2030';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = active || hovered ? PALETTE.gold : '#5a6275';
    ctx.fillRect(x, y, w, 2); ctx.fillRect(x, y + h - 2, w, 2); ctx.fillRect(x, y, 2, h); ctx.fillRect(x + w - 2, y, 2, h);
    if (glyph) {
      // Drawn arrow (font-safe): a filled triangle pointing left or right.
      const cx = x + w / 2, cy = y + h / 2, s = h * 0.22;
      ctx.fillStyle = hovered ? PALETTE.gold : '#e8e8e8';
      ctx.beginPath();
      if (glyph === 'left') { ctx.moveTo(cx + s * 0.7, cy - s); ctx.lineTo(cx + s * 0.7, cy + s); ctx.lineTo(cx - s * 0.8, cy); }
      else { ctx.moveTo(cx - s * 0.7, cy - s); ctx.lineTo(cx - s * 0.7, cy + s); ctx.lineTo(cx + s * 0.8, cy); }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = hovered ? PALETTE.gold : active ? '#ffffff' : '#d8d8d8';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2 + 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
    this._addHit({ key, x, y, w, h, activate: action });
    return w;
  }

  /** True on touch layouts (the on-screen pad is showing): keyboard hints are hidden there. */
  isTouchLayout() {
    return typeof document !== 'undefined' && !!document.body?.classList?.contains('has-virtual-pad');
  }

  /**
   * The pager row ("< 2/8 Net worth outlook >") and the context chips for one chart kind.
   * Shared by Pause > Charts and Map Compare. Returns the y below the controls.
   */
  drawChartControls(ctx, kind, x, y, w, { onPage, onReal, onMetric, onLog, onZoom, onMore, real, metric, log, zoomed, realLabel, idPrefix }) {
    const narrow = w < 1000, h = narrow ? 48 : 44, px = narrow ? 13 : 13;
    const index = CHART_KINDS.indexOf(kind);
    let cx = x;
    cx += this.drawChip(ctx, '', cx, y, `${idPrefix}:prev`, g => onPage(-1, g), { h, glyph: 'left' }) + 10;
    const label = `${index + 1}/${CHART_KINDS.length} ${CHART_TITLES[kind]}`;
    ctx.font = `${narrow ? 14 : 15}px "Press Start 2P", monospace`;
    const labelW = narrow ? w - 2 * h - 20 : Math.max(ctx.measureText('8/8 Saving & withdrawals').width + 24, ctx.measureText(label).width + 24);
    const pagerKey = `${idPrefix}:page`;
    ctx.fillStyle = this.hoverKey === pagerKey ? PALETTE.gold : '#f0d080'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(label, cx + labelW / 2, y + h / 2 + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    this._addHit({ key: pagerKey, x: cx, y, w: labelW, h, activate: g => onPage(1, g) });
    cx += labelW + 10;
    cx += this.drawChip(ctx, '', cx, y, `${idPrefix}:next`, g => onPage(1, g), { h, glyph: 'right' }) + 10;
    const chips = [];
    if (MONEY_KINDS.has(kind)) chips.push({ label: real ? `${realLabel} $` : 'Future $', key: 'real', action: onReal, active: real });
    if (kind === 'networth') {
      chips.push({ label: metric === 'liquid' ? 'Cash' : 'Net worth', key: 'metric', action: onMetric, active: metric === 'liquid' });
      chips.push({ label: log ? 'Log' : 'Linear', key: 'log', action: onLog, active: log });
    }
    if (TIME_KINDS.has(kind)) chips.push({ label: zoomed ? 'All years' : 'Zoom', key: 'zoom', action: onZoom, active: zoomed });
    if (onMore) chips.push({ label: 'More', key: 'more', action: onMore });
    let rowY = y;
    if (narrow) { cx = x; rowY = y + h + 12; }
    for (const c of chips) {
      ctx.font = `${px}px "Press Start 2P", monospace`;
      const cw = Math.ceil(ctx.measureText(c.label).width) + px * 2;
      if (narrow && cx > x && cx + cw > x + w) { cx = x; rowY += h + 10; }
      cx += this.drawChip(ctx, c.label, cx, rowY, `${idPrefix}:${c.key}`, c.action, { px, h, active: c.active }) + 10;
    }
    return rowY + h + (narrow ? 16 : 18);
  }

  /** Plot hit regions: hovering or tapping a plot moves the year cursor to that column. */
  addPlotHits(result, setYear, idPrefix) {
    (result?.plots || []).forEach((p, i) => {
      const pick = () => { if (this._pointer) setYear(Math.max(p.x0, Math.min(p.x1, p.yearAt(this._pointer.x)))); };
      this._addHit({ key: `${idPrefix}:plot${i}`, x: p.x, y: p.y, w: p.w, h: p.h, hover: pick, activate: () => { pick(); return undefined; } });
    });
  }

  /** One short keyboard-hint line at the bottom (desktop only; never wraps). */
  drawKeyHint(ctx, text, x, y, w) {
    if (this.isTouchLayout()) return;
    ctx.font = '12px "Press Start 2P", monospace'; ctx.fillStyle = '#7d828c'; ctx.textBaseline = 'top';
    ctx.fillText(fitPlain(ctx, text, w), x, y);
  }

  realDollarLabel(game) {
    return String(game?.portfolio?.dollarBaseYear ?? game?.timeline?.startYear ?? 'Start');
  }

  drawCharts(ctx, game, x, y, boxW, boxH) {
    const compact = boxW < 1500;
    const innerW = boxW - (compact ? 48 : 64);
    const cx0 = x + (compact ? 24 : 32);
    const act = (name) => (g) => this.chartAction(name, g);
    const timeline = currentTimeline(game);
    const inHallway = currentNode(game)?.type === 'hallway';
    const baseline = inHallway && timeline ? timeline.baseline : game.portfolio;
    const originalForecast = getTimelineForecast(game, timeline);
    const saved = inHallway && originalForecast?.count === this.forecastPaths ? originalForecast : null;
    if (saved) this.forecast.cancel();
    if (!saved) this.forecast.request(baseline, this.forecastPaths, inHallway ? timeline?.scenario || null : null,
      { ...timelineForecastOptions(game), revision: inHallway ? timeline?.id : `${timeline?.id || 'setup'}-preview` });
    const f = saved || this.forecast.result || this.forecast.preview;
    this.chartForecast = f;
    const kind = CHART_KINDS.includes(this.chartView) ? this.chartView : 'networth';
    const top = y + (compact ? 50 : 58);
    const controlsEnd = this.drawChartControls(ctx, kind, cx0, top, innerW, {
      idPrefix: 'chart', real: this.chartReal, metric: this.chartMetric, log: this.chartScaleLog, zoomed: this.chartZoomSpan != null,
      realLabel: this.realDollarLabel(game),
      onPage: (dir, g) => this.chartAction(dir > 0 ? 'viewNext' : 'viewPrev', g), onReal: act('real'), onMetric: act('liquid'),
      onLog: act('scale'), onZoom: act('zoom'), onMore: act('options'),
    });
    const touch = this.isTouchLayout();
    const footH = touch ? 10 : 34;
    const rect = { x: cx0, y: controlsEnd, w: innerW, h: y + boxH - footH - 14 - controlsEnd };
    if (!touch) this.drawKeyHint(ctx, '[ ] chart  < > year  R dollars  L net worth/Cash  S log  + zoom  Enter more  Esc back', cx0, y + boxH - 40, innerW);
    if (!f) {
      ctx.fillStyle = '#d4a84b'; ctx.font = (compact ? '15px' : '18px') + ' "Press Start 2P", monospace';
      const msg = this.forecast.error || 'Simulating ' + this.forecastPaths.toLocaleString('en-US') + ' futures... ' + Math.round(this.forecast.progress * 100) + '%';
      const nextY = this.drawWrapped(ctx, msg, cx0, rect.y + 20, innerW, 28);
      ctx.font = (compact ? '12px' : '14px') + ' "Press Start 2P", monospace'; ctx.fillStyle = '#aaa';
      this.drawWrapped(ctx, 'Forecasts never change your actual balances.', cx0, nextY + 16, innerW, 20);
      return;
    }
    const data = buildChartData({ forecast: f, history: game.worthHistory || [], today: computeWorth(baseline),
      todayPriceIndex: baseline?.priceIndex || 1, label: 'This timeline' });
    this.chartYear = Math.max(0, Math.min(this.chartYear, f.series.length - 1));
    let cursorYear;
    const range = chartYearRange(kind, [data]);
    if (kind === 'history') cursorYear = this.historyYear ?? range?.[1];
    else cursorYear = data.todayYear + this.chartYear;
    if (range) cursorYear = Math.max(range[0], Math.min(range[1], cursorYear));
    const opts = { real: this.chartReal, realLabel: this.realDollarLabel(game), metric: this.chartMetric, log: this.chartScaleLog,
      zoomSpan: this.chartZoomSpan, zoomCenter: this.chartZoomCenter ?? cursorYear, cursorYear, todayYear: game.portfolio.year,
      portrait: compact, showTitle: false };
    let chartRect = rect;
    if (kind === 'risk' && f.stress) {
      ctx.font = '12px "Press Start 2P", monospace'; ctx.fillStyle = '#8e939c'; ctx.textBaseline = 'top';
      const line = `Stress tests: market crash, Cash ${f.stress.crash.success ? 'holds up' : 'runs short'}; high inflation, Cash ${f.stress.inflation.success ? 'holds up' : 'runs short'}.`;
      const end = this.drawWrapped(ctx, line, cx0, rect.y + rect.h - 20, innerW, 18);
      chartRect = { ...rect, h: rect.h - 30 - Math.max(0, end - (rect.y + rect.h)) };
    }
    if (f.provisional) {
      ctx.font = '12px "Press Start 2P", monospace'; ctx.fillStyle = '#d4a84b'; ctx.textBaseline = 'top';
      const status = `Preliminary: ${f.count.toLocaleString('en-US')} futures so far (${Math.round(this.forecast.progress * 100)}%)`;
      ctx.textAlign = 'right'; ctx.fillText(compact ? `${Math.round(this.forecast.progress * 100)}%` : status, cx0 + innerW, top - (compact ? 24 : 22)); ctx.textAlign = 'left';
    }
    const result = drawFinanceChart(ctx, kind, [data], chartRect, opts);
    this.addPlotHits(result, year => {
      if (kind === 'history') this.historyYear = year;
      else this.chartYear = Math.max(0, year - data.todayYear);
    }, 'chart');
  }

  drawPortfolio(ctx, p, x, y, boxW, boxH, game) {
    const worth = computeWorth(p);
    const narrow = boxW < 900;
    let rowPx = narrow ? 19 : 15;
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.uiText;
    const padX = narrow ? 28 : 36;
    // Rows start below the portfolio title with clearance; footer hints sit at the bottom.
    // (Narrow frames: the header block above is two lines, shifted +30 by drawSubView.)
    const top = y + (narrow ? 62 : 60);
    const footH = narrow ? 96 : 84;
    const avail = Math.max(26, boxH - (top - y) - footH);
    let rowH = narrow ? 31 : 26;
    let perCol = Math.max(1, Math.floor(avail / rowH));
    const rows =
      this.portfolioPage === 0
        ? this.portfolioSummaryRows(p, worth)
        : this.portfolioDetailPages(p)[this.portfolioDetailPage] || [];
    const colW = boxW - padX * 2;
    // The summary is too tall for short landscape phones: smaller text in two columns.
    let useCols = 1;
    if (this.portfolioPage === 0 && !narrow && rows.length > perCol && boxW >= 800) {
      useCols = 2; rowPx = 14; rowH = 24;
      perCol = Math.max(1, Math.min(Math.floor(avail / rowH), Math.ceil((rows.length + 1) / 2)));
    }
    ctx.font = `${rowPx}px "Press Start 2P", monospace`;
    // Detail pages are paged by what fits (one column per page).
    this.detailRows = Math.min(narrow ? 16 : 13, Math.max(1, Math.floor(avail / (narrow ? 31 : 26))));
    const cw = useCols === 2 ? Math.floor((colW - 40) / 2) : colW;
    // Wrap long rows (e.g. kids) instead of letting them run off the box.
    const drawn = [];
    for (const row of rows) for (const line of wrapPlain(ctx, row.text, cw)) drawn.push({ text: line, heading: row.heading });
    const cap = useCols * perCol;
    let slice = drawn;
    if (drawn.length > cap) slice = drawn.slice(0, cap - 1).concat([{ text: '…' }]);
    slice.forEach((row, i) => {
      const col = Math.floor(i / perCol), r = i % perCol;
      ctx.fillStyle = row.heading ? PALETTE.gold : PALETTE.uiText;
      ctx.fillText(row.text, x + padX + col * (cw + 40), top + r * rowH);
    });

    ctx.fillStyle = '#777';
    ctx.font = narrow ? '12px "Press Start 2P", monospace' : '13px "Press Start 2P", monospace';
    const innerW = boxW - padX * 2;
    if (this.portfolioPage === 0) {
      this.drawLinks(ctx, [{ text: 'Enter details', action: () => this.togglePortfolioPage() }], x + padX, y + boxH - (narrow ? 64 : 52));
      this.drawLinks(ctx, [
        { text: 'Tab next', key: 'foot:tab', action: (g) => this.nextTab(g) },
        { text: ' · ' },
        { text: 'Esc back', key: 'foot:back', action: () => this.back() },
      ], x + padX, y + boxH - (narrow ? 36 : 28), innerW);
    } else {
      const pages = this.portfolioDetailPages(p).length;
      const pageLabel = pages > 1 ? ` · Page ${this.portfolioDetailPage + 1}/${pages}` : '';
      this.drawLinks(ctx, [{ text: 'Enter summary', action: () => this.togglePortfolioPage() }], x + padX, y + boxH - (narrow ? 64 : 52));
      this.drawLinks(ctx, [pages > 1
        ? { text: `Up/Down page${pageLabel}`, key: 'portfolio:page', action: (g) => this.stepPortfolioDetailPage(g || game, 1) }
        : { text: `Up/Down page${pageLabel}` }], x + padX, y + boxH - (narrow ? 36 : 28), innerW);
    }
  }

  portfolioSummaryRows(p, worth) {
    const kids = p.kids || [];
    const kidsLine = kids.length
      ? `Kids ${kids.length} · ${kids.map((k) => `${(k.name || '?').slice(0, 8)} ${Number(k.age) || 0}`).join(', ')}`
      : 'Kids none';
    const loanTotal =
      (p.otherDebt || 0) + (p.otherLoans || []).reduce((sum, l) => sum + (l.principal || 0), 0);
    const savingsRate = p.savingsRate == null ? '' : ` @ ${percent(p.savingsRate)}`;
    const salaryRows = p.retired
      ? [{ text: 'Retired' }, { text: `Spend ${money(p.annualSpending)}/yr` }]
      : [{ text: `Salary ${money(p.salary)}` }, { text: `Spend ${money(p.annualSpending)}` }];
    const housing =
      p.housing === 'rent'
        ? `Rent ${money(p.monthlyRent)}/mo`
        : `Own · ${(p.homes || []).length} home(s)`;
    const ownedHomes = p.housing === 'rent' ? [] : p.homes || [];
    const mortgagedHomes = ownedHomes.filter((h) => (h.mortgageOwed || 0) > 0);
    const mortgageYr = mortgagedHomes.reduce((sum, h) => sum + annualMortgagePayment(h), 0);
    const propTaxYr = ownedHomes.reduce((sum, h) => sum + annualPropertyTax(h), 0);
    const homeCostRows = ownedHomes.length
      ? [
          { text: mortgagedHomes.length ? `Mortgage ${money(mortgageYr / 12)}/mo (${money(mortgageYr)}/yr)` : 'Mortgage none' },
          { text: `Prop tax ${money(propTaxYr)}/yr` },
        ]
      : [];
    const filing = p.filingStatus === 'married' || p.married ? 'MFJ' : 'Single';
    const zipLine = p.zip ? `ZIP ${p.zip}` : 'ZIP blank (national avg)';
    const holdings = p.stocksHoldings || [];
    const stockLines =
      holdings.length > 0
        ? holdings.slice(0, 3).map((h) => ({
            text: `  ${h.ticker} ${money(h.value)}`,
          }))
        : [];
    return [
      { text: `Year ${p.year} · Age ${p.age} · ${filing}` },
      { text: zipLine },
      ...(p.married ? [{ text: `${p.spouseName || 'Spouse'} · Age ${p.spouseAge ?? '?'} · Salary ${money(p.spouseSalary || 0)}` }] : []),
      ...salaryRows,
      { text: `Cash (checking) ${money(worth.cash)}` },
      { text: `Savings ${money(worth.savings)}${savingsRate}` },
      { text: `Stocks ${money(worth.stocks)}` },
      ...stockLines,
      { text: `Basis ${money(worth.stocksCostBasis)}` },
      { text: `401(k) ${money(worth.k401Balance)}` },
      { text: `Roth IRA ${money(worth.rothBalance || p.rothBalance || 0)}` },
      { text: `Retire @ ${p.retirementAge || 65}` },
      { text: housing },
      ...homeCostRows,
      { text: `Equity ${money(worth.homeEquity)}` },
      { text: `Loans ${money(loanTotal)}` },
      { text: kidsLine },
      { text: `Net worth ${money(worth.netWorth)}`, heading: true },
    ];
  }

  portfolioDetailPages(p) {
    const rows = [];
    const homes = p.homes || [];
    const loans = p.otherLoans || [];
    const holdings = p.stocksHoldings || [];
    if (holdings.length) {
      rows.push({ text: 'Holdings', heading: true });
      holdings.forEach((h) => {
        rows.push({ text: `${h.ticker} ${money(h.value)}` });
        rows.push({
          text: `g ${((h.growth || 0) * 100).toFixed(1)}% vol ${((h.volatility || 0) * 100).toFixed(1)}%`,
        });
      });
    }
    rows.push({ text: 'Retirement', heading: true });
    rows.push({ text: `401(k) ${money(p.k401Balance)}` });
    rows.push({ text: `Roth ${money(p.rothBalance || 0)}` });
    if (p.married) {
      rows.push({ text: `${p.spouseName || 'Spouse'} · Retirement @ ${p.spouseRetirementAge || 65}` });
      rows.push({ text: `401(k) ${money(p.spouseK401Balance || 0)} · Roth ${money(p.spouseRothBalance || 0)}` });
    }
    if (p.housing === 'rent') {
      rows.push({ text: 'Housing: Rent', heading: true });
      rows.push({ text: `${money(p.monthlyRent)}/mo` });
    } else if (homes.length) {
      rows.push({ text: 'Homes', heading: true });
      homes.forEach((home, i) => {
        const label = (home.label || home.type || `Home ${i + 1}`).slice(0, 18);
        rows.push({ text: `${label}` });
        rows.push({ text: `Value ${money(home.value)}` });
        rows.push({ text: `Mortgage ${money(home.mortgageOwed)}` });
        if ((home.mortgageOwed || 0) > 0) {
          rows.push({ text: `Payment ${money(annualMortgagePayment(home) / 12)}/mo` });
        }
        rows.push({ text: `Prop tax ${money(annualPropertyTax(home))}/yr` });
        if (home.monthlyRevenue) {
          rows.push({ text: `Revenue ${money(home.monthlyRevenue)}/mo` });
        }
      });
    } else {
      rows.push({ text: 'Homes: none' });
    }
    rows.push({ text: 'Loans', heading: true });
    if (loans.length) {
      loans.forEach((loan) => {
        const type =
          loan.type === 'heloc'
            ? 'HELOC'
            : loan.type === 'securities'
              ? 'Securities loan'
              : (loan.label || 'Other loan').slice(0, 16);
        rows.push({ text: `${type}: ${money(loan.principal)}` });
      });
    } else {
      rows.push({ text: 'No HELOC or securities loans' });
    }
    if ((p.otherDebt || 0) > 0) rows.push({ text: `Other debt: ${money(p.otherDebt)}` });

    const pages = [];
    const per = Math.max(4, this.detailRows || 13);
    for (let i = 0; i < rows.length; i += per) pages.push(rows.slice(i, i + per));
    return pages.length ? pages : [[{ text: 'No homes or loans.' }]];
  }

  drawMap(ctx, game, x, y, boxW, boxH) {
    this.syncMapSelection(game);
    const timelines = this.mapModel.timelines;
    const compact = boxW < 1500;
    const left = x + (compact ? 24 : 32), top = y + (compact ? 52 : 82), width = boxW - (compact ? 48 : 64);
    ctx.textBaseline = 'top'; ctx.font = (compact ? '13px' : '15px') + ' "Press Start 2P", monospace'; ctx.fillStyle = '#b9b9c5';
    if (this.mapMode === 'select') {
      const selText = `Select ${this.selectedComparison.length ? 'the second' : 'the first'} timeline · arrows + Enter or click`;
      const rowsTop = compact ? this.drawWrapped(ctx, selText, left, top, width, 20) + 14 : top + 62;
      if (!compact) ctx.fillText(selText, left, top);
      const rowStep = compact ? 78 : 61, rowH = compact ? 66 : 49, per = compact ? Math.max(3, Math.min(9, Math.floor((y + boxH - 20 - rowsTop) / rowStep))) : 9;
      const start = Math.floor(this.compareSelectionIndex / per) * per;
      timelines.slice(start, start + per).forEach((timeline, offset) => {
        const index = start + offset, rowY = rowsTop + offset * rowStep;
        const chosen = this.selectedComparison.includes(timeline.id);
        const focused = this.compareSelectionIndex === index;
        ctx.fillStyle = focused ? 'rgba(210,180,95,.24)' : 'rgba(130,150,180,.08)'; ctx.fillRect(left, rowY, width, rowH);
        ctx.fillStyle = chosen ? '#80dda9' : focused ? PALETTE.gold : '#ddd';
        const mark = `${chosen ? '✓' : focused ? '▶' : ' '} `;
        const t1 = `Timeline ${timeline.number} · ${timeline.startYear}–${timeline.terminalYear}`;
        const t2 = timeline.forecast ? timeline.forecast.count.toLocaleString() + ' paths saved' : 'projection not saved';
        if (compact) { ctx.fillText(mark + t1, left + 14, rowY + 10); ctx.fillText('  ' + t2, left + 14, rowY + 36); }
        else ctx.fillText(`${mark}${t1} · ${t2}`, left + 18, rowY + 14);
        this._addHit({ key: `compare:${timeline.id}`, x: left, y: rowY, w: width, h: rowH,
          hover: () => { this.compareSelectionIndex = index; }, activate: g => this.selectComparisonTimeline(g, index) });
      });
      return;
    }
    if (this.mapMode === 'result') {
      const selected = this.selectedComparison.map(id => timelines.find(t => t.id === id)).filter(Boolean);
      const touch = this.isTouchLayout();
      if (selected.length !== 2 || selected.some(t => !t.forecast)) {
        if (compact) {
          let ty = this.drawWrapped(ctx, 'This timeline has no saved projection.', left, top + 10, width, 22) + 14;
          ty = this.drawWrapped(ctx, 'Older saves keep their history, but an old forecast cannot be recovered.', left, ty, width, 22) + 14;
          this.drawWrapped(ctx, 'Walk a new Hallway from a Decision Room to save a new projection.', left, ty, width, 22);
        } else {
          ctx.fillText('This timeline has no saved projection.', left, top + 30);
          ctx.fillText('Older saves keep their history, but an old forecast cannot be recovered.', left, top + 78);
          ctx.fillText('Walk a new Hallway from a Decision Room to save a new projection.', left, top + 118);
        }
      } else {
        const datasets = this.compareDatasets(game, selected);
        const kind = CHART_KINDS.includes(this.compareView) ? this.compareView : 'networth';
        const realLabel = this.realDollarLabel(game);
        const controlsEnd = this.drawChartControls(ctx, kind, left, top - (compact ? 2 : 24), width, {
          idPrefix: 'cmp', real: this.chartReal, metric: this.chartMetric, log: this.compareScaleLog, zoomed: this.compareZoomSpan != null,
          realLabel, onPage: dir => this.pageCompare(dir), onReal: g => this.chartAction('real', g), onMetric: g => this.chartAction('liquid', g),
          onLog: () => { this.compareScaleLog = !this.compareScaleLog; }, onZoom: () => this.toggleCompareZoom(),
          onMore: null,
        });
        const range = chartYearRange(kind, datasets);
        this._compareRange = range;
        let cursorYear = this.compareCursor ?? range?.[0];
        if (range && cursorYear != null) cursorYear = Math.max(range[0], Math.min(range[1], cursorYear));
        const footH = touch ? 64 : 76;
        const result = drawFinanceChart(ctx, kind, datasets, { x: left, y: controlsEnd, w: width, h: y + boxH - footH - controlsEnd }, {
          real: this.chartReal, realLabel, metric: this.chartMetric, log: this.compareScaleLog, zoomSpan: this.compareZoomSpan,
          zoomCenter: this.compareZoomCenter ?? cursorYear, cursorYear, todayYear: game.portfolio.year, portrait: compact, showTitle: false,
        });
        this.addPlotHits(result, year => this.setCompareCursor(year), 'cmp');
      }
      ctx.font = '13px "Press Start 2P", monospace'; ctx.fillStyle = '#aaa'; ctx.textBaseline = 'top';
      const linksY = y + boxH - (touch ? 50 : 62);
      this.drawLinks(ctx, [{ text: 'Choose another pair', key: 'compare:again', action: g => this.toggleMapCompare(g) }, { text: ' · ' },
        { text: 'Back to map', key: 'compare:back', action: () => this.back() }], left, linksY, 0);
      this.drawKeyHint(ctx, '[ ] chart  < > year  R dollars  L net worth/Cash  S log  + zoom  Enter new pair  Esc map', left, y + boxH - 34, width);
      return;
    }
    const helpText = 'Left/Right timeline · Up/Down point · Enter: jump to its year in the saved Hallway';
    const noteText = 'A: start · letters: decision visits · last point: age 100 · * current · original projections stay unchanged';
    const statusAt = (sel, pt) => sel ? `Timeline ${sel.number} · ${pt?.letter || 'A'}: ${pt?.year || sel.startYear} (age ${pt?.age ?? sel.startAge}) · ${sel.forecast ? 'original projection saved' : 'projection pending'}` : 'No timelines';
    let mapTop = top + 45, mapH = boxH - 290;
    let statusY = y + boxH - 120, linksY = y + boxH - 78, noteY = y + boxH - 40;
    if (compact) {
      mapTop = this.drawWrapped(ctx, helpText, left, top, width, 18) + 8;
    } else {
      ctx.fillText(helpText, left, top);
    }
    if (compact) {
      ctx.font = '12px "Press Start 2P", monospace';
      const noteH = wrapPlain(ctx, noteText, width).length * 17;
      ctx.font = '13px "Press Start 2P", monospace';
      const selPre = timelines[this.mapTimelineIndex];
      const statusH = wrapPlain(ctx, statusAt(selPre, selPre?.points[this.mapPointIndex]), width).length * 19;
      noteY = y + boxH - 14 - noteH;
      linksY = noteY - 56;
      statusY = linksY - 12 - statusH;
      mapH = Math.max(120, statusY - 36 - mapTop);
    }
    drawTimelineMap(ctx, this.mapModel, { x: left, y: mapTop, w: width, h: mapH },
      { timeline: this.mapTimelineIndex, point: this.mapPointIndex, focus: this.mapFocus }, hit => this._addHit(hit),
      (kind, index, point = 0) => { this.selectMapTimeline(game, index); this.mapPointIndex = point; });
    const selected = timelines[this.mapTimelineIndex];
    const point = selected?.points[this.mapPointIndex];
    ctx.font = (compact ? '13px' : '14px') + ' "Press Start 2P", monospace'; ctx.fillStyle = '#bbb';
    const status = statusAt(selected, point);
    if (compact) this.drawWrapped(ctx, status, left, statusY, width, 19); else ctx.fillText(status, left, statusY);
    ctx.font = (compact ? '13px' : '14px') + ' "Press Start 2P", monospace';
    this.drawLinks(ctx, [
      { text: 'Jump to selected point', key: 'map:jump', action: g => { this.mapFocus = 'point'; return this.activateMapFocus(g); } },
      { text: ' · ' }, { text: 'Compare two timelines', key: 'map:compare', action: g => this.toggleMapCompare(g) },
    ], left, linksY, compact ? width : 0);
    ctx.fillStyle = '#888'; ctx.font = '12px "Press Start 2P", monospace';
    if (compact) this.drawWrapped(ctx, noteText, left, noteY, width, 17); else ctx.fillText(noteText, left, noteY);
  }

  async settingsAction(index, game) {
    if (index === 0 && this.dialog && !this.dialog.active) {
      await editInflationSettings(game.portfolio, this.dialog);
      this.chartReal = game.portfolio.inflationAdjusted !== false;
      setMoneyContext(game.portfolio);
      game.settings = { ...game.settings, inflationAdjusted: game.portfolio.inflationAdjusted !== false };
      autoSave(game, game.scene === 'room' ? 'begin' : 'end');
    }
    if (index === 1) await this.saveToFile(game);
    if (index === 2) await this.loadFromFile(game);
    if (index === 3) { autoSave(game, game.scene === 'room' ? 'begin' : 'end'); await flushSaves(); }
  }

  /** Settings → Save to File: this game plus every character profile. */
  async saveToFile(game) {
    if (this._fileBusy || !this.dialog || this.dialog.active) return;
    this._fileBusy = true;
    try {
      const result = await saveGameToFile(game, { settings: { inflationAdjusted: game.portfolio.inflationAdjusted !== false } });
      if (result.status === 'saved') await this.dialog.show(`${savedFileMessage(result)}\n${result.detail}`, { title: 'Save to File' });
    } catch (error) {
      await this.dialog.show(error.message || 'The file could not be saved.', { title: 'Save to File' });
    } finally { this._fileBusy = false; }
  }

  /**
   * Settings → Load from File: confirm (No by default), pick a file, import it
   * and switch to its game through onLoadGame (set by main.js). A profiles-only
   * file just merges its profiles and keeps the current game.
   */
  async loadFromFile(game) {
    if (this._fileBusy || !this.dialog || this.dialog.active) return;
    this._fileBusy = true;
    try {
      const confirmed = await this.dialog.menu(
        'Load a game from a save file?\nUnsaved progress since your last doorway save will be replaced.',
        [{ label: 'Yes', value: true }, { label: 'No', value: false }],
        { title: 'Load from File', selected: 1 }
      );
      if (!confirmed) return;
      let loaded;
      try { loaded = await loadFromFile(); } catch (error) {
        await this.dialog.show(error.message || 'This save file could not be loaded.', { title: 'Load from File' });
        return;
      }
      if (!loaded) return;
      await this.dialog.show(loadedFileMessage(loaded), { title: 'Load from File' });
      if (loaded.game && this.open && this.onLoadGame) {
        this.hide();
        this.onLoadGame(loaded.game);
      }
    } finally { this._fileBusy = false; }
  }

  /** Wide layout (desktop landscape); the narrow layout below wraps text instead. */
  drawSettingsWide(ctx, game, x, y, boxW, boxH) {
    ctx.font = '22px "Press Start 2P", monospace'; ctx.fillStyle = PALETTE.gold;
    const left = x + 40, top = y + 110;
    const label = inflationToggleLabel(game.portfolio);
    this._addHit({ key: 'settings:inflation', x: left - 12, y: top - 14, w: boxW - 70, h: 80,
      hover: () => { this.selected = 0; }, activate: g => { void this.settingsAction(0, g); } });
    ctx.fillText(label, left, top);
    ctx.font = '16px "Press Start 2P", monospace'; ctx.fillStyle = '#aaa';
    ctx.fillText(moneyUnitSubtitle(game.portfolio), left, top + 52);
    ctx.fillText('Changes display and entry units; economic balances and scenarios stay intact.', left, top + 92);
    const status = getSaveStatus();
    ctx.fillStyle = status.state === 'error' ? '#ff9999' : '#b3c8bb';
    ctx.fillText('Save status: ' + status.message, left, top + 180);
    SETTINGS_ROWS.forEach(({ label, note }, i) => {
      const index = i + 1, yy = top + 250 + i * 86;
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillStyle = this.selected === index ? PALETTE.gold : '#ddd';
      ctx.fillText((this.selected === index ? '▶ ' : '') + label, left, yy);
      ctx.font = '12px "Press Start 2P", monospace'; ctx.fillStyle = '#999';
      ctx.fillText(note, left + 400, yy + 2);
      this._addHit({ key: `settings:${index}`, x: left - 12, y: yy - 14, w: boxW - 70, h: 64,
        hover: () => { this.selected = index; }, activate: g => { void this.settingsAction(index, g); } });
    });
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Enter/A to change · Tab next view · Esc back', left, y + boxH - 52);
  }

  drawSettings(ctx, game, x, y, boxW, boxH) {
    const narrow = boxW < 1500;
    if (!narrow) return this.drawSettingsWide(ctx, game, x, y, boxW, boxH);
    const left = x + (narrow ? 28 : 40), top = y + 56;
    const innerW = boxW - (narrow ? 56 : 80);
    const label = inflationToggleLabel(game.portfolio);
    const lpx = narrow ? 18 : 22;
    ctx.font = `${lpx}px "Press Start 2P", monospace`; ctx.fillStyle = PALETTE.gold;
    const sm = narrow ? 14 : 16, smH = Math.round(sm * 1.6);
    ctx.font = `${lpx}px "Press Start 2P", monospace`;
    const labelLines = wrapPlain(ctx, label, innerW);
    let yy = top;
    const inflTop = yy;
    for (const line of labelLines) { ctx.fillText(line, left, yy); yy += Math.round(lpx * 1.4); }
    ctx.font = `${sm}px "Press Start 2P", monospace`; ctx.fillStyle = '#aaa';
    yy += 8;
    yy = this.drawWrapped(ctx, moneyUnitSubtitle(game.portfolio), left, yy, innerW, smH);
    yy = this.drawWrapped(ctx, 'Changes display and entry units; economic balances and scenarios stay intact.', left, yy + 6, innerW, smH);
    this._addHit({ key: 'settings:inflation', x: left - 12, y: inflTop - 14, w: boxW - (narrow ? 40 : 70), h: yy - inflTop + 20,
      hover: () => { this.selected = 0; }, activate: g => { void this.settingsAction(0, g); } });
    const status = getSaveStatus();
    yy += 24;
    ctx.fillStyle = status.state === 'error' ? '#ff9999' : '#b3c8bb';
    yy = this.drawWrapped(ctx, 'Save status: ' + status.message, left, yy, innerW, smH);
    yy += narrow ? 30 : 40;
    const noteX = left + 400;
    SETTINGS_ROWS.forEach(({ label, note }, i) => {
      const index = i + 1;
      const rowTop = yy;
      ctx.font = `${sm}px "Press Start 2P", monospace`;
      ctx.fillStyle = this.selected === index ? PALETTE.gold : '#ddd';
      ctx.fillText((this.selected === index ? '▶ ' : '') + label, left, yy);
      ctx.font = `${narrow ? 12 : 12}px "Press Start 2P", monospace`; ctx.fillStyle = '#999';
      if (narrow) {
        yy = this.drawWrapped(ctx, note, left + 20, yy + smH + 4, innerW - 20, 19);
        yy += 14;
      } else {
        ctx.fillText(note, noteX, yy + 2);
        yy += 86;
      }
      this._addHit({ key: `settings:${index}`, x: left - 12, y: rowTop - 14, w: boxW - (narrow ? 40 : 70), h: Math.max(64, yy - rowTop),
        hover: () => { this.selected = index; }, activate: g => { void this.settingsAction(index, g); } });
    });
    ctx.font = `${narrow ? 12 : 16}px "Press Start 2P", monospace`;
    ctx.fillStyle = '#aaa';
    this.drawWrapped(ctx, 'Enter/A to change · Tab next view · Esc back', left, y + boxH - (narrow ? 70 : 52), innerW, 20);
  }
}


function money(value) {
  return formatMoneyDisplay(value);
}

function percent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${+(n * 100).toFixed(2)}%`;
}
