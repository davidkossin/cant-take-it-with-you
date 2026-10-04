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
import { drawWorthChart, BRANCH_COLORS } from '../render/Charts.js';
import { makeDialogChrome } from '../render/Assets.js';
import { formatMoneyDisplay } from '../render/Dialog.js';

const VIEW_TABS = ['portfolio', 'map', 'charts'];

/** Charts remain focused on the current path; timeline comparison lives on Map. */

export class PauseMenu {
  constructor() {
    this.open = false;
    this.screen = 'menu'; // menu | portfolio | map | charts
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
    this.open = false;
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
      if (this.screen === 'map' && this.mapMode !== 'overview') {
        this.mapMode = 'overview';
        return undefined;
      }
      if (this.screen !== 'menu') {
        this.screen = 'menu';
        this.selected = 0;
        return undefined;
      }
      this.hide();
      return 'close';
    }

    if (this.screen === 'menu') {
      if (KEYS.up.includes(e.key)) {
        this.selected = (this.selected - 1 + 5) % 5;
        e.preventDefault();
        return undefined;
      }
      if (KEYS.down.includes(e.key)) {
        this.selected = (this.selected + 1) % 5;
        e.preventDefault();
        return undefined;
      }
      if (KEYS.confirm.includes(e.key)) {
        e.preventDefault();
        const choice = ['portfolio', 'map', 'charts', 'quit', 'resume'][this.selected];
        if (choice === 'resume') {
          this.hide();
          return 'close';
        }
        if (choice === 'quit') {
          this.hide();
          return 'quit';
        }
        this.screen = choice;
        this.selected = 0;
        this.portfolioPage = 0;
        this.portfolioDetailPage = 0;
        this.refresh(game);
        return undefined;
      }
      return undefined;
    }

    // Tab / Q keeps the original quick-switch behavior between pause views.
    if (e.key === 'Tab' || e.key === 'q' || e.key === 'Q') {
      const current = VIEW_TABS.indexOf(this.screen);
      this.screen = VIEW_TABS[(current + 1) % VIEW_TABS.length];
      this.selected = 0;
      this.portfolioPage = 0;
      this.portfolioDetailPage = 0;
      if (this.screen === 'map') this.syncMapSelection(game, { resetFocus: true });
      e.preventDefault();
      return undefined;
    }

    if (this.screen === 'portfolio') {
      if (this.portfolioPage === 1 && (KEYS.up.includes(e.key) || KEYS.down.includes(e.key))) {
        const pages = this.portfolioDetailPages(game.portfolio).length;
        if (pages > 1) {
          this.portfolioDetailPage =
            (this.portfolioDetailPage + (KEYS.down.includes(e.key) ? 1 : pages - 1)) % pages;
        }
        e.preventDefault();
        return undefined;
      }
      if (KEYS.confirm.includes(e.key)) {
        this.portfolioPage = this.portfolioPage === 0 ? 1 : 0;
        this.portfolioDetailPage = 0;
        e.preventDefault();
        return undefined;
      }
      return undefined;
    }

    if (this.screen === 'map') {
      const branches = listCompareBranches(game);
      if ((e.key === 'c' || e.key === 'C') && branches.length >= 2) {
        this.mapMode = this.mapMode === 'overview' || this.mapMode === 'result' ? 'select' : 'overview';
        this.mapCompareActive = 0;
        e.preventDefault();
        return undefined;
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
          const dir = KEYS.right.includes(e.key) ? 1 : -1;
          this.mapTimelineIndex =
            (this.mapTimelineIndex + dir + timelines.length) % timelines.length;
          this.mapFocus = 'point';
          this.mapPointIndex = 0;
          this.syncMapSelection(game);
          // After timeline change, pick hallway nearest live year on that lane
          const liveYear = game.portfolio?.year ?? this.mapModel?.current?.year ?? 0;
          if (this.mapJumpPoints.length) {
            this.mapPointIndex = nearestHallwayIndex(this.mapJumpPoints, liveYear);
            this.syncMapSelection(game);
          }
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
        if (this.mapFocus === 'compare') {
          if (branches.length >= 2) {
            this.mapMode = 'select';
            this.mapCompareActive = 0;
          }
          return undefined;
        }
        const node = this.mapJumpPoints[this.mapPointIndex];
        if (node) {
          const ok = jumpToHallwayNode(game, node.id);
          if (ok) {
            this.hide();
            return { jump: node.id };
          }
        }
        return undefined;
      }
    }

    if (this.screen === 'charts') {
      // Timeline comparison is deliberately on Map; Charts stays single-path.
      return undefined;
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

    if (this.screen === 'menu') {
      this.drawMenu(ctx, x, y, boxW);
    } else {
      this.drawSubView(ctx, game, x, y, boxW, boxH);
    }
  }

  drawMenu(ctx, x, y, boxW) {
    ctx.font = '32px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('Pause', x + 48, y + 48);
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.fillStyle = PALETTE.uiText;
    ctx.fillText('Choose a view', x + 48, y + 100);

    const options = ['Portfolio', 'Map', 'Charts', 'Quit', 'Resume'];
    let oy = y + 160;
    options.forEach((label, i) => {
      const selected = i === this.selected;
      if (selected) {
        ctx.fillStyle = 'rgba(200,160,80,0.25)';
        ctx.fillRect(x + 40, oy - 8, boxW - 80, 48);
        ctx.fillStyle = PALETTE.gold;
      } else {
        ctx.fillStyle = PALETTE.uiText;
      }
      ctx.font = '28px "Press Start 2P", monospace';
      ctx.fillText(`${selected ? '▶' : ' '} ${label}`, x + 56, oy);
      oy += 64;
    });

    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillStyle = '#777';
    ctx.fillText('Enter select · Esc resume', x + 48, y + 860);
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
    ctx.fillText('Tab next · Esc back', x + boxW - 360, y + 28);

    if (this.screen === 'portfolio') {
      this.drawPortfolio(ctx, game.portfolio, x, y, boxW, boxH);
    } else if (this.screen === 'map') {
      this.drawMap(ctx, game, x, y, boxW, boxH);
    } else {
      this.drawCharts(ctx, game, x, y, boxW, boxH);
    }
  }

  chartTitle(game) {
    return 'Charts · Net worth';
  }

  drawCharts(ctx, game, x, y, boxW, boxH) {
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('Current timeline · Map has Compare', x + 28, y + 56);
    drawWorthChart(ctx, game.worthHistory || [], {
      x: x + 36,
      y: y + 100,
      w: boxW - 80,
      h: boxH - 180,
      series: ['netWorth', 'bank'],
    });
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

  drawPortfolio(ctx, p, x, y, boxW, boxH) {
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
      ctx.fillText('Enter details', x + 36, y + boxH - 52);
      ctx.fillText('Tab next · Esc back', x + 36, y + boxH - 28);
    } else {
      const pages = this.portfolioDetailPages(p).length;
      const pageLabel = pages > 1 ? ` · Page ${this.portfolioDetailPage + 1}/${pages}` : '';
      ctx.font = '13px "Press Start 2P", monospace';
      ctx.fillText('Enter summary', x + 36, y + boxH - 52);
      ctx.fillText(`Up/Down page${pageLabel}`, x + 36, y + boxH - 28);
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
    ctx.fillText(
      compareResult
        ? `Compare${yearLabel} · Enter year · C change`
        : compareSelect
          ? 'Compare · ←/→ side · ↑/↓ timeline · Enter year'
          : '←/→ timeline · ↑/↓ point · Enter jump · Compare',
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
    for (const col of layout.columnLabels || []) {
      const selected = selectedTl && col.number === selectedTl.number;
      ctx.fillStyle = selected ? PALETTE.gold : '#888';
      ctx.fillText(String(col.number), col.x - 2, col.y);
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
        ctx.fillText(
          `${active ? '▶' : ' '} ${side === 0 ? 'A' : 'B'}: Timeline ${timeline?.number ?? branchIndex + 1}${
            branch?.isCurrent ? '*' : ''
          }`,
          x + 12,
          ly
        );
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
