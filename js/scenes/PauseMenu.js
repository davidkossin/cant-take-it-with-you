import { ForecastClient } from '../finance/ForecastClient.js';
import { MODEL_SCOPE, SUCCESS_DEFINITION } from '../finance/Forecast.js';
/**
 * Esc pause — Portfolio overview, Map (timeline graph + jump/compare), and Charts.
 * Map Compare provides side-by-side portfolio snapshots for two timelines.
 */

import { PALETTE, FRAME_W, FRAME_H, KEYS } from '../config.js';
import {
  listTimelineNodes,
  jumpToHallwayNode,
  listCompareBranches,
  portfolioAtYearOnBranch,
  layoutTimelineMap,
  buildTimelineMapModel,
  hallwayNodesForTimeline,
} from '../state/GameState.js';
import { computeWorth } from '../finance/Engine.js';
import { drawWorthChart, drawForecastChart, BRANCH_COLORS } from '../render/Charts.js';
import { makeDialogChrome } from '../render/Assets.js';
import { formatMoneyDisplay } from '../render/Dialog.js';
import { fitPixelFont } from '../render/FutureSplash.js';

const VIEW_TABS = ['portfolio', 'map', 'charts'];
const MENU_ITEMS = [
  { label: 'Portfolio', value: 'portfolio' },
  { label: 'Map', value: 'map' },
  { label: 'Charts', value: 'charts' },
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

function fontPx(font) {
  return Number(/(\d+(?:\.\d+)?)px/.exec(String(font))?.[1]) || 16;
}

/** Charts remain focused on the current path; timeline comparison lives on Map. */

/**
 * Charts headline: when the first glass wall arrives across the Monte Carlo paths
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
    this.chartReal = false;
    this.chartMetric = 'netWorth';
    this.chartYear = 0;
    this.forecastPaths = 1000;
    this.screen = 'menu'; // menu | portfolio | map | charts | confirmQuit
    /** Quit confirmation highlight: index into QUIT_CHOICES (1 = No). */
    this.quitChoice = 1;
    this.quitChrome = null;
    this.selected = 0;
    this.portfolioPage = 0; // 0 = summary, 1 = homes and loans
    this.portfolioDetailPage = 0;
    this.hallwayNodes = [];
    this.chrome = null;
    /** Map compare: overview | select | result. */
    this.mapMode = 'overview';
    this.mapCompareActive = 0;
    this.mapCompareA = 0;
    this.mapCompareB = 1;
    /** Calendar year for Map Compare side-by-side portfolio snapshots. */
    this.compareYear = null;
    this._askingYear = false;
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
    this.screen = 'menu';
    this.selected = 0;
    this.portfolioPage = 0;
    this.portfolioDetailPage = 0;
    this.dialog = dialog || this.dialog;
    this.compareYear = game?.portfolio?.year ?? this.compareYear;
    this.mapMode = 'overview';
    this.mapCompareActive = 0;
    this.mapCompareA = 0;
    this.mapCompareB = 1;
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
      return undefined;
    }
    if (this.screen !== 'menu') {
      this.forecast.cancel();
      this.screen = 'menu';
      this.selected = 0;
      return undefined;
    }
    this.hide();
    return 'close';
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

  /** Tab / Q: cycle Portfolio → Map → Charts. */
  nextTab(game) {
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
    const timelines = this.mapModel?.timelines || [];
    if (!timelines.length) return;
    this.mapTimelineIndex = ((index % timelines.length) + timelines.length) % timelines.length;
    this.mapFocus = 'point';
    this.mapPointIndex = 0;
    this.syncMapSelection(game);
    const liveYear = game.portfolio?.year ?? this.mapModel?.current?.year ?? 0;
    if (this.mapJumpPoints.length) {
      this.mapPointIndex = nearestHallwayIndex(this.mapJumpPoints, liveYear);
      this.syncMapSelection(game);
    }
  }

  /** Map overview Enter / A: open Compare, or jump to the focused hallway. */
  activateMapFocus(game) {
    if (this.mapFocus === 'compare') {
      if (listCompareBranches(game).length >= 2) {
        this.mapMode = 'select';
        this.mapCompareActive = 0;
      }
      return undefined;
    }
    const node = this.mapJumpPoints[this.mapPointIndex];
    if (node && jumpToHallwayNode(game, node.id)) {
      this.hide();
      return { jump: node.id };
    }
    return undefined;
  }

  /** Map C: toggle Compare selection. */
  toggleMapCompare(game) {
    if (listCompareBranches(game).length < 2) return undefined;
    this.mapMode = this.mapMode === 'overview' || this.mapMode === 'result' ? 'select' : 'overview';
    this.mapCompareActive = 0;
    return undefined;
  }

  /** Charts shortcuts by name (keys F/R/L/P/C/E, ←/→, Enter). */
  chartAction(name, game) {
    if (name === 'options') void this.showChartOptions(game);
    if (name === 'history') this.chartMode = this.chartMode === 'forecast' ? 'history' : 'forecast';
    if (name === 'real') this.chartReal = !this.chartReal;
    if (name === 'liquid') this.chartMetric = this.chartMetric === 'netWorth' ? 'liquid' : 'netWorth';
    if (name === 'paths') this.forecastPaths = this.forecastPaths === 1000 ? 5000 : this.forecastPaths === 5000 ? 10000 : 1000;
    if (name === 'next') this.chartYear = Math.min(100 - game.portfolio.age, this.chartYear + 1);
    if (name === 'prev') this.chartYear = Math.max(0, this.chartYear - 1);
    if (name === 'coverage') void this.showModelCoverage(game);
    if (name === 'export') this.exportForecast();
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
  drawLinks(ctx, parts, x, y) {
    const px = fontPx(ctx.font);
    const base = ctx.fillStyle;
    let cx = x;
    for (const part of parts) {
      const w = ctx.measureText(part.text).width;
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
  }

  refresh(game) {
    this.hallwayNodes = listTimelineNodes(game).filter((n) => n.type === 'hallway');
    const branches = listCompareBranches(game);
    if (branches.length < 2) {
      this.mapMode = 'overview';
      this.mapCompareA = 0;
      this.mapCompareB = 1;
    } else {
      this.mapCompareA = Math.min(this.mapCompareA, branches.length - 1);
      this.mapCompareB = Math.min(this.mapCompareB, branches.length - 1);
      if (this.mapCompareA === this.mapCompareB) {
        this.mapCompareB = this.mapCompareA === 0 ? 1 : 0;
      }
    }
    this.syncMapSelection(game, { resetFocus: true });
  }

  /**
   * Keep map timeline/point selection coherent with the live tree.
   * On resetFocus (open/refresh): pick timeline containing currentNodeId and
   * the hallway nearest to live portfolio year (or the current hallway node).
   */
  syncMapSelection(game, { resetFocus = false } = {}) {
    const model = buildTimelineMapModel(game);
    this.mapModel = model;
    const timelines = model.timelines || [];
    if (!timelines.length) {
      this.mapTimelineIndex = 0;
      this.mapPointIndex = 0;
      this.mapFocus = 'point';
      this.mapJumpPoints = [];
      this.selected = 0;
      return;
    }

    if (resetFocus) {
      let ti = timelines.findIndex((t) => t.isCurrent);
      if (ti < 0) ti = 0;
      const currentId = game.timeline?.currentNodeId;
      const curNode = currentId ? game.timeline?.nodes?.[currentId] : null;
      // Prefer deepest timeline whose path/lane matches current when multiple claim isCurrent
      if (curNode) {
        const byLane = timelines.findIndex((t) => t.lane === (model.current?.lane ?? t.lane) && t.isCurrent);
        if (byLane >= 0) ti = byLane;
      }
      this.mapTimelineIndex = ti;
    } else {
      this.mapTimelineIndex = Math.min(this.mapTimelineIndex, timelines.length - 1);
    }

    const tl = timelines[this.mapTimelineIndex];
    this.mapJumpPoints = hallwayNodesForTimeline(game, tl?.tipId);
    const canCompare = listCompareBranches(game).length >= 2;

    if (resetFocus) {
      this.mapFocus = 'point';
      const liveYear = game.portfolio?.year ?? model.current?.year ?? 0;
      const currentId = game.timeline?.currentNodeId;
      const curNode = currentId ? game.timeline?.nodes?.[currentId] : null;
      let pi = 0;
      if (curNode?.type === 'hallway') {
        const exact = this.mapJumpPoints.findIndex((n) => n.id === curNode.id);
        if (exact >= 0) pi = exact;
        else if (this.mapJumpPoints.length) {
          pi = nearestHallwayIndex(this.mapJumpPoints, liveYear);
        }
      } else if (this.mapJumpPoints.length) {
        pi = nearestHallwayIndex(this.mapJumpPoints, liveYear);
      }
      this.mapPointIndex = pi;
    } else if (this.mapFocus === 'compare' && !canCompare) {
      this.mapFocus = 'point';
      this.mapPointIndex = Math.min(this.mapPointIndex, Math.max(0, this.mapJumpPoints.length - 1));
    } else if (this.mapFocus === 'point') {
      if (!this.mapJumpPoints.length) {
        this.mapPointIndex = 0;
        if (canCompare) this.mapFocus = 'compare';
      } else {
        this.mapPointIndex = Math.min(this.mapPointIndex, this.mapJumpPoints.length - 1);
      }
    }

    const sel = this.mapFocus === 'point' ? this.mapJumpPoints[this.mapPointIndex] : null;
    this.selected = sel
      ? Math.max(0, this.hallwayNodes.findIndex((n) => n.id === sel.id))
      : 0;
  }

  /** Focus list for ↑/↓ on the selected timeline: jump points then optional Compare. */
  mapFocusItems(game) {
    const points = this.mapJumpPoints || [];
    const items = points.map((n, i) => ({ kind: 'point', index: i, node: n }));
    if (listCompareBranches(game).length >= 2) {
      items.push({ kind: 'compare' });
    }
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

    if (this.screen === 'map') {
      const branches = listCompareBranches(game);
      if ((e.key === 'c' || e.key === 'C') && branches.length >= 2) {
        e.preventDefault();
        return this.toggleMapCompare(game);
      }

      if (this.mapMode === 'select') {
        if (KEYS.left.includes(e.key) || KEYS.right.includes(e.key)) {
          this.mapCompareActive = KEYS.right.includes(e.key) ? 1 : 0;
          e.preventDefault();
          return undefined;
        }
        if (KEYS.up.includes(e.key) || KEYS.down.includes(e.key)) {
          const dir = KEYS.down.includes(e.key) ? 1 : -1;
          const other = this.mapCompareActive === 0 ? this.mapCompareB : this.mapCompareA;
          let value = this.mapCompareActive === 0 ? this.mapCompareA : this.mapCompareB;
          for (let i = 0; i < branches.length; i += 1) {
            value = (value + dir + branches.length) % branches.length;
            if (value !== other) break;
          }
          if (this.mapCompareActive === 0) this.mapCompareA = value;
          else this.mapCompareB = value;
          e.preventDefault();
          return undefined;
        }
        if (KEYS.confirm.includes(e.key)) {
          e.preventDefault();
          this.promptMapCompareYear(game);
          return undefined;
        }
        return undefined;
      }

      if (this.mapMode === 'result') {
        if (KEYS.confirm.includes(e.key)) {
          e.preventDefault();
          this.promptMapCompareYear(game);
          return undefined;
        }
        return undefined;
      }

      // Overview: ←/→ timeline · ↑/↓ point (and Compare) · Enter jump/Compare
      this.syncMapSelection(game);
      const timelines = this.mapModel?.timelines || [];
      if (KEYS.left.includes(e.key) || KEYS.right.includes(e.key)) {
        if (timelines.length >= 2) {
          // After timeline change, pick hallway nearest live year on that lane
          this.selectMapTimeline(game, this.mapTimelineIndex + (KEYS.right.includes(e.key) ? 1 : -1));
        }
        e.preventDefault();
        return undefined;
      }
      if (KEYS.up.includes(e.key) || KEYS.down.includes(e.key)) {
        const items = this.mapFocusItems(game);
        if (items.length) {
          let cur = 0;
          if (this.mapFocus === 'compare') {
            cur = items.findIndex((it) => it.kind === 'compare');
          } else {
            cur = items.findIndex(
              (it) => it.kind === 'point' && it.index === this.mapPointIndex
            );
          }
          if (cur < 0) cur = 0;
          const dir = KEYS.down.includes(e.key) ? 1 : -1;
          const next = items[(cur + dir + items.length) % items.length];
          if (next.kind === 'compare') {
            this.mapFocus = 'compare';
          } else {
            this.mapFocus = 'point';
            this.mapPointIndex = next.index;
          }
          this.syncMapSelection(game);
        }
        e.preventDefault();
        return undefined;
      }
      if (KEYS.confirm.includes(e.key)) {
        e.preventDefault();
        return this.activateMapFocus(game);
      }
    }

    if (this.screen === 'charts') {
      if (KEYS.confirm.includes(e.key) && e.key.toLowerCase() !== 'e') { e.preventDefault(); return this.chartAction('options', game); }
      const byKey = { f: 'history', r: 'real', l: 'liquid', p: 'paths', c: 'coverage', e: 'export' };
      if (byKey[e.key.toLowerCase()]) this.chartAction(byKey[e.key.toLowerCase()], game);
      if (KEYS.right.includes(e.key)) this.chartAction('next', game);
      if (KEYS.left.includes(e.key)) this.chartAction('prev', game);
      e.preventDefault(); return undefined;
    }

    return undefined;
  }

  /** Start Map Compare's year prompt after two timelines are selected. */
  async promptMapCompareYear(game) {
    if (!this.dialog || this._askingYear) return;
    this._askingYear = true;
    const branches = listCompareBranches(game);
    const defaultYear =
      this.compareYear ?? game.portfolio?.year ?? branches[0]?.yearMax ?? new Date().getFullYear();
    try {
      const year = await this.dialog.prompt('Year to compare across timelines?', {
        title: 'Map Compare',
        defaultValue: String(defaultYear),
        type: 'number',
      });
      if (year != null && year !== '') {
        const y = Math.round(Number(year));
        if (Number.isFinite(y)) {
          this.compareYear = y;
          this.mapMode = 'result';
        }
      }
    } finally {
      this._askingYear = false;
    }
  }


  draw(ctx, game) {
    if (!this.open) return;
    this._hits = [];
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);

    const boxW = 1680;
    const boxH = 880;
    const x = Math.floor((FRAME_W - boxW) / 2);
    const y = 150;
    if (!this.chrome || this.chrome.width !== boxW || this.chrome.height !== boxH) {
      this.chrome = makeDialogChrome(boxW, boxH);
    }
    ctx.drawImage(this.chrome, x, y);

    if (this.screen === 'confirmQuit') {
      // Pause menu stays visible underneath; only the question is clickable.
      this.drawMenu(ctx, x, y, boxW, game);
      this._hits = [];
      this.drawQuitConfirm(ctx);
    } else if (this.screen === 'menu') {
      this.drawMenu(ctx, x, y, boxW, game);
    } else {
      this.drawSubView(ctx, game, x, y, boxW, boxH);
    }
  }

  /** Main-menu row rects — shared by drawMenu and pointer hit-testing. */
  menuItemRects(x, y, boxW) {
    return MENU_ITEMS.map((item, i) => ({ ...item, index: i, x: x + 40, y: y + 152 + i * 64, w: boxW - 80, h: 48 }));
  }

  drawMenu(ctx, x, y, boxW) {
    ctx.font = '32px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('Pause', x + 48, y + 48);
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.fillStyle = PALETTE.uiText;
    ctx.fillText('Choose a view', x + 48, y + 100);

    for (const row of this.menuItemRects(x, y, boxW)) {
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
      ctx.fillText(`${selected ? '▶' : ' '} ${row.label}`, row.x + 16, row.y + 8);
    }

    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillStyle = '#777';
    this.drawLinks(ctx, [{ text: 'Enter select · ' }, { text: 'Esc resume', action: () => this.back() }], x + 48, y + 860);
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
          : this.chartTitle(game);
    ctx.fillText(title, x + 12, y + 10);
    ctx.fillStyle = '#666';
    ctx.font = '14px "Press Start 2P", monospace';
    this.drawLinks(ctx, [
      { text: 'Tab next', key: 'head:tab', action: (g) => this.nextTab(g) },
      { text: ' · ' },
      { text: 'Esc back', key: 'head:back', action: () => this.back() },
    ], x + boxW - 360, y + 28);

    if (this.screen === 'portfolio') {
      this.drawPortfolio(ctx, game.portfolio, x, y, boxW, boxH, game);
    } else if (this.screen === 'map') {
      this.drawMap(ctx, game, x, y, boxW, boxH);
    } else {
      this.drawCharts(ctx, game, x, y, boxW, boxH);
    }
  }

  chartTitle(game) {
    return this.chartMode === 'forecast' ? 'Charts · Financial forecast' : 'Charts · Recorded history';
  }

  async showChartOptions(game) {
    if (!this.dialog || this.dialog.active) return;
    const choice = await this.dialog.menu('Chart options', [
      {label:this.chartMode === 'forecast' ? 'Show recorded history' : 'Show Monte Carlo forecast',value:'mode'},
      {label:this.chartReal ? 'Show nominal dollars' : 'Show real dollars',value:'real'},
      {label:this.chartMetric === 'netWorth' ? 'Show available liquid assets' : 'Show net worth',value:'metric'},
      {label:'Simulation count (' + this.forecastPaths + ')',value:'paths'},
      {label:'Model coverage / input warnings',value:'coverage'},
      {label:'Export forecast CSV',value:'export'},
      {label:'Back',value:null}], {title:'Charts'});
    if (choice === 'mode') this.chartMode = this.chartMode === 'forecast' ? 'history' : 'forecast';
    if (choice === 'real') this.chartReal = !this.chartReal;
    if (choice === 'metric') this.chartMetric = this.chartMetric === 'netWorth' ? 'liquid' : 'netWorth';
    if (choice === 'paths') {
      const count = await this.dialog.menu('Monte Carlo paths', [{label:'1,000 (preview)',value:1000},
        {label:'5,000 (full)',value:5000},{label:'10,000 (full)',value:10000},{label:'Back',value:null}],{title:'Simulation count'});
      if (count) this.forecastPaths = count;
    }
    if (choice === 'coverage') await this.showModelCoverage(game);
    if (choice === 'export') this.exportForecast();
  }

  async showModelCoverage(game) {
    if (!this.dialog || this.dialog.active) return;
    for (const text of [SUCCESS_DEFINITION, ...MODEL_SCOPE, ...(this.forecast.result?.warnings || game.portfolio.modelWarnings || [])]) {
      await this.dialog.show(text, { title: 'Forecast coverage' });
    }
  }

  exportForecast() {
    const f = this.forecast.result;
    if (!f) return;
    const rows = [['year','age','net_worth_p10','net_worth_p50','net_worth_p90','real_net_worth_p50','liquid_p10','liquid_p50','liquid_p90','hallway_net_worth','hallway_liquid','hallway_real_net_worth','hallway_real_liquid','hallway_path_index','hallway_selection_paths','hallway_origin_year','paths','wall_free_rate','first_wall_p10','first_wall_median','first_wall_p90','seed','engine','assumptions','tax_rules'],
      ...f.series.map((r,i) => [r.year,r.age,r.netWorth.p10,r.netWorth.p50,r.netWorth.p90,r.realNetWorth.p50,r.liquid.p10,r.liquid.p50,r.liquid.p90,
        f.scenarioSeries[i].netWorth,f.scenarioSeries[i].liquid,f.scenarioSeries[i].realNetWorth,f.scenarioSeries[i].realLiquid,
        f.scenario.simulationIndex,f.scenario.selectionPaths,f.scenario.originYear,f.count,f.successProbability,
        ...['p10','p50','p90'].map(k => f.firstWall?.[k]?.year ?? 'none'),f.seed,f.engineVersion,f.assumptionVersion,f.taxRuleVersion])];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'cant-take-it-forecast.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  drawCharts(ctx, game, x, y, boxW, boxH) {
    ctx.font = '14px "Press Start 2P", monospace'; ctx.fillStyle = '#aaa';
    const act = (name) => (g) => this.chartAction(name, g);
    this.drawLinks(ctx, [
      { text: 'Enter/A options', action: act('options') }, { text: ' · ' },
      { text: '←', key: 'chart:prev', action: act('prev') }, { text: '/' },
      { text: '→', key: 'chart:next', action: act('next') }, { text: ' year · ' },
      { text: 'F history', action: act('history') }, { text: ' · ' },
      { text: 'R real', action: act('real') }, { text: ' · ' },
      { text: 'L liquid', action: act('liquid') }, { text: ' · ' },
      { text: 'P paths', action: act('paths') }, { text: ' · ' },
      { text: 'C coverage', action: act('coverage') }, { text: ' · ' },
      { text: 'E export', action: act('export') },
    ], x + 28, y + 58);
    if (this.chartMode === 'history') {
      drawWorthChart(ctx, (game.worthHistory || []).map(r => ({ ...r,
        netWorth: this.chartReal && r.legacy ? null : r.netWorth / (this.chartReal ? r.priceIndex || 1 : 1), bank: this.chartReal && r.legacy ? null : r.bank / (this.chartReal ? r.priceIndex || 1 : 1) })),
        { x: x + 36, y: y + 108, w: boxW - 80, h: boxH - 200, series: ['netWorth', 'bank'] });
      ctx.fillText('Recorded journeys; earlier saves may contain reference-path or legacy-engine years.', x + 28, y + boxH - 38);
      return;
    }
    this.forecast.request(game.portfolio, this.forecastPaths, game.hallwayScenario || null);
    const f = this.forecast.result;
    if (!f) {
      ctx.fillStyle = '#d4a84b'; ctx.font = '20px "Press Start 2P", monospace';
      ctx.fillText(this.forecast.error || 'Simulating ' + this.forecastPaths + ' paths · ' + Math.round(this.forecast.progress * 100) + '%', x + 36, y + 140);
      ctx.font = '16px "Press Start 2P", monospace'; ctx.fillStyle = '#aaa';
      ctx.fillText('Forecasts leave gameplay balances unchanged. Esc returns to the menu.', x + 36, y + 190); return;
    }
    this.chartYear = Math.min(this.chartYear, f.series.length - 1);
    const dollars = this.chartReal ? 'real (original setup-year dollars)' : 'nominal dollars';
    const metric = this.chartReal ? (this.chartMetric === 'liquid' ? 'realLiquid' : 'realNetWorth') : this.chartMetric;
    ctx.fillStyle = '#d4a84b';ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText(firstWallHeadline(f.firstWall), x + 28, y + 95);
    ctx.font = '14px "Press Start 2P", monospace';ctx.fillStyle = '#aaa';
    ctx.fillText('Wall-free ' + (f.successProbability * 100).toFixed(1) + '% · 95% sampling interval ' +
      f.successInterval95.map(p => (p * 100).toFixed(1) + '%').join('–') + ' · N=' + f.count, x + 28, y + 122);
    ctx.fillText((this.chartMetric === 'liquid' ? 'Available taxable liquid assets' : 'Net worth') + ' · ' + dollars + ' · includes paths that hit a wall', x + 28, y + 148);
    drawForecastChart(ctx, f, { x: x + 28, y: y + 178, w: boxW - 64, h: boxH - 477, metric, selected: this.chartYear });
    const row = f.series[this.chartYear], v = row[metric], money = formatMoneyDisplay;
    let yy = y + boxH - 275;
    ctx.fillStyle = '#eee';ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText('← / → Year ' + row.year + ' · Age ' + row.age + ' · P10 ' + money(v.p10) + ' · Median ' + money(v.p50) + ' · P90 ' + money(v.p90), x + 28, yy);
    yy += 34;ctx.font = '14px "Press Start 2P", monospace';ctx.fillStyle = '#aaa';
    const reference = f.reference[Math.max(0,this.chartYear - 1)]?.statement;
    if (this.chartYear && reference) {
      ctx.fillText('Hallway ' + money(f.scenarioSeries[this.chartYear][metric]) + ' · costs ' + money(reference.requiredSpending) +
        ' · income/payroll tax ' + money(reference.tax.total) + ' · shortfall ' + money(reference.unfunded), x + 28, yy);
    } else ctx.fillText('Hallway follows one complete simulated path; the median line shows annual ensemble percentiles.', x + 28, yy);
    yy += 30;
    ctx.fillText('Stress: early crash ' + (f.stress.crash.success ? 'funded' : 'shortfall') + ' · persistent 7% inflation ' +
      (f.stress.inflation.success ? 'funded' : 'shortfall') + ' · seed ' + f.seed, x + 28, yy);
    yy += 30;
    ctx.fillText('Equity mean ' + (f.assumptions.equityReturn * 100).toFixed(1) + '% · volatility ' + (f.assumptions.equityVolatility * 100).toFixed(1) +
      '% · CPI ' + (f.assumptions.inflation * 100).toFixed(1) + '% · illustrative inputs', x + 28, yy);
    yy += 30;
    ctx.fillText('Wall-free = Cash paid every bill each month through age 100; nothing is sold or withdrawn for you.', x + 28, yy);
    yy += 30;
    ctx.fillStyle = '#d4a84b';
    ctx.fillText('C: coverage / ' + f.warnings.length + ' input warnings · Future law is projected. Sampling interval excludes model uncertainty.', x + 28, yy);
  }

  drawSnapshotColumn(ctx, branch, snap, year, cx, cy, colW, colH, compact = false) {
    const color =
      BRANCH_COLORS[
        Math.max(0, (branch.letter || 'A').charCodeAt(0) - 65) % BRANCH_COLORS.length
      ];
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(cx, cy, colW, colH);
    ctx.strokeStyle = color;
    ctx.strokeRect(cx + 0.5, cy + 0.5, colW - 1, colH - 1);

    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillStyle = color;
    const head = `${branch.letter}${branch.isCurrent ? '*' : ''}`;
    ctx.fillText(head, cx + 4, cy + 4);

    ctx.font = compact ? '12px "Press Start 2P", monospace' : '14px "Press Start 2P", monospace';
    if (snap.status === 'before') {
      ctx.fillStyle = '#888';
      ctx.fillText('Before branch', cx + 4, cy + 18);
      ctx.fillText(`(starts ${snap.yearMin})`, cx + 4, cy + 28);
      return;
    }
    if (snap.status === 'after') {
      ctx.fillStyle = '#888';
      ctx.fillText('After end', cx + 4, cy + 18);
      ctx.fillText(`(ends ${snap.yearMax})`, cx + 4, cy + 28);
      return;
    }
    if (snap.status === 'gap') {
      ctx.fillStyle = '#888';
      ctx.fillText('n/a this year', cx + 4, cy + 18);
      ctx.fillText('(no snapshot)', cx + 4, cy + 28);
      return;
    }
    if (snap.status !== 'ok' || !snap.portfolio || !snap.worth) {
      ctx.fillStyle = '#888';
      ctx.fillText('n/a', cx + 4, cy + 18);
      return;
    }

    const p = snap.portfolio;
    const w = snap.worth;
    const lines = snapshotLines(p, w, snap);
    let ry = cy + (compact ? 14 : 16);
    for (const line of lines) {
      if (ry > cy + colH - (compact ? 5 : 10)) break;
      ctx.fillStyle = line.heading ? PALETTE.gold : PALETTE.uiText;
      ctx.fillText(clip(line.text, colW - 8), cx + 4, ry);
      ry += compact ? 16 : 20;
    }
  }

  drawPortfolio(ctx, p, x, y, boxW, boxH, game) {
    const worth = computeWorth(p);
    ctx.font = '15px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.uiText;
    const rows =
      this.portfolioPage === 0
        ? this.portfolioSummaryRows(p, worth)
        : this.portfolioDetailPages(p)[this.portfolioDetailPage] || [];
    let ry = y + 32;
    for (const row of rows) {
      ctx.fillStyle = row.heading ? PALETTE.gold : PALETTE.uiText;
      ctx.fillText(row.text, x + 36, ry);
      ry += 26;
    }

    ctx.fillStyle = '#777';
    ctx.font = '5px "Press Start 2P", monospace';
    if (this.portfolioPage === 0) {
      ctx.font = '13px "Press Start 2P", monospace';
      this.drawLinks(ctx, [{ text: 'Enter details', action: () => this.togglePortfolioPage() }], x + 36, y + boxH - 52);
      this.drawLinks(ctx, [
        { text: 'Tab next', key: 'foot:tab', action: (g) => this.nextTab(g) },
        { text: ' · ' },
        { text: 'Esc back', key: 'foot:back', action: () => this.back() },
      ], x + 36, y + boxH - 28);
    } else {
      const pages = this.portfolioDetailPages(p).length;
      const pageLabel = pages > 1 ? ` · Page ${this.portfolioDetailPage + 1}/${pages}` : '';
      ctx.font = '13px "Press Start 2P", monospace';
      this.drawLinks(ctx, [{ text: 'Enter summary', action: () => this.togglePortfolioPage() }], x + 36, y + boxH - 52);
      this.drawLinks(ctx, [pages > 1
        ? { text: `Up/Down page${pageLabel}`, key: 'portfolio:page', action: (g) => this.stepPortfolioDetailPage(g || game, 1) }
        : { text: `Up/Down page${pageLabel}` }], x + 36, y + boxH - 28);
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
        if (home.annualPropertyTax != null) {
          rows.push({ text: `Prop tax ${money(home.annualPropertyTax)}/yr` });
        }
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
    for (let i = 0; i < rows.length; i += 13) pages.push(rows.slice(i, i + 13));
    return pages.length ? pages : [[{ text: 'No homes or loans.' }]];
  }

  /**
   * Vertical timeline tree. Time goes up. Columns 1, 2, 3… are timelines.
   * Left edge is the calendar year. A/B/C only. Dashed below a fork's A.
   * D-pad: ←/→ timeline · ↑/↓ jump point (and Compare) · Enter jump / open Compare.
   */
  drawMap(ctx, game, x, y, boxW, boxH) {
    const compareSelect = this.mapMode === 'select';
    const compareResult = this.mapMode === 'result';
    const yearLabel = this.compareYear == null ? '' : ` · ${this.compareYear}`;
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillStyle = PALETTE.uiText;
    const promptYear = () => { void this.promptMapCompareYear(game); return undefined; };
    const canCompareLink = listCompareBranches(game).length >= 2;
    this.drawLinks(ctx,
      compareResult
        ? [{ text: `Compare${yearLabel} · ` }, { text: 'Enter year', action: promptYear }, { text: ' · ' },
          { text: 'C change', action: (g) => this.toggleMapCompare(g) }]
        : compareSelect
          ? [{ text: 'Compare · ←/→ side · ↑/↓ timeline · ' }, { text: 'Enter year', action: promptYear }]
          : [{ text: '←/→ timeline · ↑/↓ point · ' }, { text: 'Enter jump', action: (g) => this.activateMapFocus(g) },
            { text: ' · ' }, canCompareLink ? { text: 'Compare', key: 'map:compare-link', action: (g) => this.toggleMapCompare(g) } : { text: 'Compare' }],
      x + 28,
      y + 56
    );

    const graphX = x + 28;
    const graphY = y + 100;
    const footer = compareResult ? 300 : compareSelect ? 150 : 120;
    const graphH = Math.min(560, Math.max(180, boxH - (graphY - y) - footer));
    const graphW = boxW - 56;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(graphX, graphY, graphW, graphH);
    ctx.strokeStyle = '#444';
    ctx.strokeRect(graphX + 0.5, graphY + 0.5, graphW - 1, graphH - 1);

    const layout = layoutTimelineMap(game, {
      x: graphX + 10,
      y: graphY + 8,
      w: graphW - 20,
      h: graphH - 16,
    });
    const model = layout.model || buildTimelineMapModel(game);
    this.mapModel = model;
    const timelines = model.timelines || [];
    if (!compareSelect && !compareResult) {
      // Keep jump list in sync while drawing (tree may have changed mid-pause)
      if (timelines.length) {
        this.mapTimelineIndex = Math.min(this.mapTimelineIndex, timelines.length - 1);
        const tl = timelines[this.mapTimelineIndex];
        this.mapJumpPoints = hallwayNodesForTimeline(game, tl?.tipId);
        if (this.mapFocus === 'point' && this.mapJumpPoints.length) {
          this.mapPointIndex = Math.min(this.mapPointIndex, this.mapJumpPoints.length - 1);
        }
      }
    }
    const selectedTl = timelines[this.mapTimelineIndex] || null;
    const selectedJump =
      this.mapFocus === 'point' ? this.mapJumpPoints[this.mapPointIndex] : null;

    // Solid spines, dashed pre-fork past, horizontal forks.
    ctx.save();
    for (const seg of layout.segments || []) {
      ctx.beginPath();
      ctx.setLineDash(seg.kind === 'dashed' ? [8, 6] : []);
      if (seg.kind === 'spine') {
        const selected = selectedTl && seg.timeline === selectedTl.number;
        if (selected) {
          ctx.strokeStyle = '#e8c878';
          ctx.lineWidth = 2;
        } else if (seg.isCurrent) {
          ctx.strokeStyle = '#c8a050';
          ctx.lineWidth = 1.5;
        } else {
          ctx.strokeStyle = '#555';
          ctx.lineWidth = 1;
        }
      } else if (seg.kind === 'dashed') {
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = '#887848';
        ctx.lineWidth = 1.5;
      }
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillStyle = '#888';
    for (const lab of layout.yearLabels || []) {
      ctx.fillText(String(lab.year), lab.x, lab.y - 2);
    }
    const overview = !compareSelect && !compareResult;
    for (const col of layout.columnLabels || []) {
      const selected = selectedTl && col.number === selectedTl.number;
      ctx.fillStyle = selected ? PALETTE.gold : '#888';
      ctx.fillText(String(col.number), col.x - 2, col.y);
      const ti = timelines.findIndex((t) => t.number === col.number);
      if (overview && ti >= 0) {
        const w = Math.max(28, ctx.measureText(String(col.number)).width + 16);
        // Selecting a timeline is a cursor move (←/→), so hover only highlights the number.
        this._addHit({ key: `map:col:${col.number}`, x: col.x - 10, y: col.y - 8, w, h: 30,
          activate: (g) => { this.selectMapTimeline(g, ti); return undefined; } });
      }
    }
    // Hallway jump targets on every timeline. Hover moves the selection (gold box)
    // like ↑/↓ and ←/→; a click on the selected hallway jumps, as Enter does. A tap
    // on an unselected one only selects it, so touch needs a second tap to jump.
    if (overview && layout.xy) {
      timelines.forEach((tl, ti) => {
        hallwayNodesForTimeline(game, tl.tipId).forEach((node, pi) => {
          const p = layout.xy(tl.lane, node.year);
          const isSel = () => this.mapFocus === 'point' && this.mapTimelineIndex === ti && this.mapPointIndex === pi;
          const select = (g) => {
            this.mapTimelineIndex = ti;
            this.mapFocus = 'point';
            this.mapPointIndex = pi;
            this.syncMapSelection(g);
          };
          this._addHit({ key: `map:node:${node.id}`, x: p.x - 14, y: p.y - 14, w: 28, h: 28,
            hover: select,
            activate: (g) => {
              if (isSel()) return this.activateMapFocus(g);
              select(g);
              return undefined;
            } });
        });
      });
    }

    for (const pt of layout.points || []) {
      const r = pt.kind === 'C' ? 10 : 8;
      if (pt.kind === 'A') ctx.fillStyle = PALETTE.gold;
      else if (pt.kind === 'B') ctx.fillStyle = '#80c0e0';
      else ctx.fillStyle = '#c04040';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#aaa';
      ctx.font = '14px "Press Start 2P", monospace';
      const tag = pt.kind === 'B' ? pt.label : pt.kind;
      ctx.fillText(tag, pt.x + 12, pt.y - 12);
    }

    if (!compareResult && layout.currentPos) {
      const cp = layout.currentPos;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(cp.x - 5, cp.y - 5, 10, 10);
      ctx.fillStyle = '#fff';
      ctx.font = '4px "Press Start 2P", monospace';
      ctx.fillText('you', cp.x + 6, cp.y - 4);
    }

    // Selected jump-target year marker (gold box on graph)
    if (!compareSelect && !compareResult && selectedJump && layout.xy && selectedTl) {
      const sp = layout.xy(selectedTl.lane, selectedJump.year);
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 2;
      ctx.strokeRect(sp.x - 6, sp.y - 6, 12, 12);
      ctx.lineWidth = 1;
    }

    ctx.fillStyle = '#666';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText('A start · B branch · C age 100', x + 28, graphY + graphH + 8);

    if (compareSelect) {
      const branches = listCompareBranches(game);
      let ly = graphY + graphH + 13;
      ctx.font = '5px "Press Start 2P", monospace';
      [this.mapCompareA, this.mapCompareB].forEach((branchIndex, side) => {
        const branch = branches[branchIndex];
        const timeline = timelines.find((t) => t.tipId === branch?.tipId);
        const active = this.mapCompareActive === side;
        ctx.fillStyle = active ? PALETTE.gold : PALETTE.uiText;
        const label = `${active ? '▶' : ' '} ${side === 0 ? 'A' : 'B'}: Timeline ${timeline?.number ?? branchIndex + 1}${
          branch?.isCurrent ? '*' : ''
        }`;
        ctx.fillText(label, x + 12, ly);
        // Row = the side (←/→); a click picks the side and asks for the year (Enter).
        this._addHit({ key: `map:side:${side}`, x: x + 8, y: ly - 2, w: Math.max(160, ctx.measureText(label).width + 8), h: 11,
          hover: () => { this.mapCompareActive = side; },
          activate: () => { this.mapCompareActive = side; void this.promptMapCompareYear(game); return undefined; } });
        ly += 11;
      });
      return;
    }

    if (compareResult) {
      const branches = listCompareBranches(game);
      const pair = [branches[this.mapCompareA], branches[this.mapCompareB]].filter(Boolean);
      const snapshotY = graphY + graphH + 14;
      const colW = Math.floor((boxW - 28) / 2);
      pair.forEach((branch, i) => {
        const cx = x + 12 + i * (colW + 4);
        const snap = portfolioAtYearOnBranch(game, branch.tipId, this.compareYear);
        this.drawSnapshotColumn(ctx, branch, snap, this.compareYear, cx, snapshotY, colW, y + boxH - snapshotY - 6, true);
      });
      return;
    }

    // Status line + optional Compare button (replaces scrolled Jump list)
    let ly = graphY + graphH + 32;
    ctx.font = '16px "Press Start 2P", monospace';
    const status = this.mapStatusLine(game, selectedTl, selectedJump);
    ctx.fillStyle = this.mapFocus === 'point' ? PALETTE.gold : PALETTE.uiText;
    ctx.fillText(status, x + 12, ly);
    ly += 28;

    const canCompare = listCompareBranches(game).length >= 2;
    if (canCompare) {
      const focused = this.mapFocus === 'compare';
      const btnX = x + 10;
      const btnW = boxW - 20;
      const btnH = 36;
      this._addHit({ key: 'map:compare', x: btnX, y: ly - 2, w: btnW, h: btnH,
        hover: () => { this.mapFocus = 'compare'; this.syncMapSelection(game); },
        activate: (g) => { this.mapFocus = 'compare'; return this.activateMapFocus(g); } });
      ctx.fillStyle = focused ? 'rgba(200,160,80,0.2)' : 'rgba(0,0,0,0.25)';
      ctx.fillRect(btnX, ly - 2, btnW, btnH);
      ctx.strokeStyle = focused ? PALETTE.gold : '#555';
      ctx.lineWidth = focused ? 2 : 1;
      ctx.strokeRect(btnX + 0.5, ly - 1.5, btnW - 1, btnH - 1);
      ctx.lineWidth = 1;
      ctx.fillStyle = focused ? PALETTE.gold : PALETTE.uiText;
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillText(`${focused ? '▶' : ' '} Compare`, btnX + 12, ly + 10);
    } else if (!this.mapJumpPoints.length) {
      ctx.fillStyle = '#888';
      ctx.fillText('No hallway nodes yet.', x + 12, ly);
    }
  }

  mapStatusLine(game, selectedTl, selectedJump) {
    if (this.mapFocus === 'compare') return 'Compare';
    const n = selectedTl?.number ?? this.mapTimelineIndex + 1;
    if (!selectedJump) {
      return `Timeline ${n} · (no hallway)`;
    }
    const label = selectedJump.label || `Hallway after ${selectedJump.year}`;
    return `Timeline ${n} · ${label} (age ${selectedJump.age})`;
  }
}


function nearestHallwayIndex(hallways, year) {
  if (!hallways?.length) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < hallways.length; i += 1) {
    const d = Math.abs((hallways[i].year ?? 0) - year);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function snapshotLines(p, worth, snap) {
  const age = snap.age ?? p.age;
  const yearLabel = `Y${p.year ?? snap.year} · Age ${age}`;
  const salaryLine = p.retired
    ? 'Retired'
    : `Salary ${money(p.salary)}`;
  const loanTotal =
    (p.otherDebt || 0) + (p.otherLoans || []).reduce((sum, l) => sum + (l.principal || 0), 0);
  const homeN = (p.homes || []).length;
  return [
    { text: yearLabel },
    { text: salaryLine },
    { text: `Cash ${money(worth.cash ?? worth.bank)}` },
    { text: `Save ${money(worth.savings)}` },
    { text: `Stk ${money(worth.stocks)}` },
    { text: `401k ${money(worth.k401Balance)}` },
    { text: `Home×${homeN} Eq ${money(worth.homeEquity)}` },
    { text: `Loans ${money(loanTotal)}` },
    { text: `Net ${money(worth.netWorth)}`, heading: true },
  ];
}

function clip(text, maxPx) {
  // Press Start 2P ~5px/char at 5px font — rough fit for column width
  const maxChars = Math.max(8, Math.floor(maxPx / 12));
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + '…';
}

function money(value) {
  return formatMoneyDisplay(value);
}

function percent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${+(n * 100).toFixed(2)}%`;
}
