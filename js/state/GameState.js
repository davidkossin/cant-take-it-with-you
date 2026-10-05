/**
 * Authoritative game state + timeline branch nodes.
 */

import { CURRENT_YEAR, MAX_AGE } from '../config.js';
import { cloneState, computeWorth } from '../finance/Engine.js';
import { normalizePortfolio } from '../finance/Schema.js';

export function createDefaultSetup() {
  return {
    financeVersion: 2,
    socialSecurityMonthly: 0,
    socialSecurityClaimAge: 67,
    spouseSalary: 0,
    investmentFee: 0.002,
    annualCollegeCost: 28000,
    playerName: 'Traveler',
    year: CURRENT_YEAR,
    age: 30,
    hairColor: 'dark',
    hairLength: 'short',
    cash: 5000,
    salary: 65000,
    savings: 20000,
    savingsRate: 0.025, // APY; editable planning assumption
    homes: [],
    housing: 'own', // 'own' | 'rent'
    monthlyRent: 0,
    stocksTotal: 10000,
    stocksCostBasis: 10000,
    stocksHoldings: [], // per-ticker advanced holdings
    stocksMode: 'total', // 'total' | 'specific'
    has401k: false,
    k401Balance: 0,
    k401ContribRate: 0.06,
    k401MatchRate: 0,
    k401MatchOnFirst: 0,
    hasRoth: false,
    rothBalance: 0,
    rothAnnualContribution: 0,
    retirementAge: 65,
    married: false,
    filingStatus: 'single', // 'single' | 'married'
    kids: [],
    annualSpending: 35000,
    spendingBreakdown: {
      incomeTax: 0,
      mortgage: 0,
      rent: 0,
      propertyTax: 0,
      other: 35000,
    },
    zip: '', // blank → national tax averages
    difficulty: 'standard',
    rateOverrides: {}, // optional numeric overrides of difficulty defaults
    employed: true,
    retired: false,
    otherDebt: 0,
    otherLoans: [],
    milestones: [],
  };
}

/**
 * Standard starter for New Game → Standard portfolio (skip the questionnaire).
 *
 * Starman, age 30, married, no children. Salary $80k, spend $48k.
 * Primary home $380k, mortgage $270k @ 6.5% / 27 years left.
 * Cash $15,000, savings $35,000 @ 2%, stocks $85,000 (basis $72,250),
 * 401(k) $62,000 (6% contribution, 100% match on the first 3% of salary).
 * ZIP 85001, Standard difficulty.
 *
 * Smoke (deterministic hallway / projectYears): glass year index ≈ 15
 * (age ~45), starting Cash $15,000, starting net worth $307,000.
 * Dollar inputs only — engine math unchanged.
 */
export function createStandardPortfolioSetup() {
  const home = {
    type: 'primary',
    label: 'Primary Residence',
    value: 380000,
    mortgageOwed: 270000,
    rate: 0.065,
    remainingTerm: 27,
    propertyTaxRate: 0.012,
    costBasis: 380000,
    basisKnown: true,
  };
  const spend = 48000;
  return {
    financeVersion: 2,
    spouseSalary: 0,
    socialSecurityMonthly: 0,
    socialSecurityClaimAge: 67,
    investmentFee: .002,
    playerName: 'Starman',
    year: CURRENT_YEAR,
    age: 30,
    hairColor: 'dark',
    hairLength: 'short',
    cash: 15000,
    salary: 80000,
    savings: 35000,
    savingsRate: 0.02,
    housing: 'own',
    monthlyRent: 0,
    homes: [home],
    stocksTotal: 85000,
    stocksCostBasis: 72250,
    stocksHoldings: [],
    stocksMode: 'total',
    has401k: true,
    k401Balance: 62000,
    k401ContribRate: 0.06,
    k401MatchRate: 1.0,
    k401MatchOnFirst: 0.03,
    hasRoth: false,
    rothBalance: 0,
    rothAnnualContribution: 0,
    retirementAge: 65,
    married: true,
    filingStatus: 'married',
    kids: [],
    annualSpending: spend,
    spendingBreakdown: {
      incomeTax: 0,
      mortgage: 0,
      rent: 0,
      propertyTax: 0,
      other: spend,
    },
    zip: '85001',
    difficulty: 'standard',
    rateOverrides: {},
    employed: true,
    retired: false,
    otherDebt: 0,
    otherLoans: [],
    milestones: [],
  };
}

/**
 * Build runtime game state from completed setup answers.
 */
export function createGameFromSetup(setup) {
  const stocks = Number(setup.stocksTotal) || 0;
  const married = !!(setup.married || setup.filingStatus === 'married');
  const portfolio = normalizePortfolio({
    ...setup,
    playerName: setup.playerName || 'Traveler',
    year: setup.year || CURRENT_YEAR,
    age: setup.age || 30,
    hairColor: setup.hairColor || 'dark',
    hairLength: setup.hairLength || 'short',
    cash: Number(setup.cash) || 0,
    salary: Number(setup.salary) || 0,
    peakSalary: Number(setup.salary) || 0,
    savings: Number(setup.savings) || 0,
    savingsRate: Number(setup.savingsRate) >= 0 ? Number(setup.savingsRate) : 0.002,
    housing: setup.housing === 'rent' ? 'rent' : 'own',
    monthlyRent: Math.max(0, Number(setup.monthlyRent) || 0),
    homes: (setup.homes || []).map((h, i) => ({
      ...h,
      type: h.type || 'primary',
      label: h.label || `Home ${i + 1}`,
      value: Number(h.value) || 0,
      mortgageOwed: Number(h.mortgageOwed) || 0,
      rate: Number(h.rate ?? 0.065),
      remainingTerm: Number(h.remainingTerm ?? 30),
      propertyTaxRate: Number(h.propertyTaxRate ?? 0.012),
      annualPropertyTax:
        h.annualPropertyTax != null ? Number(h.annualPropertyTax) : undefined,
      monthlyRevenue: Number(h.monthlyRevenue) || 0,
    })),
    stocksTotal: stocks,
    stocksCostBasis: Number(setup.stocksCostBasis) >= 0 ? Number(setup.stocksCostBasis) : stocks,
    stocksHoldings: Array.isArray(setup.stocksHoldings)
      ? setup.stocksHoldings.map((h) => ({ ...h }))
      : [],
    stocksMode: setup.stocksMode === 'specific' ? 'specific' : 'total',
    has401k: !!setup.has401k || (Number(setup.k401Balance) || 0) > 0,
    k401Balance: Math.max(0, Number(setup.k401Balance) || 0),
    k401ContribRate: Math.max(0, Math.min(1, Number(setup.k401ContribRate) || 0)),
    k401MatchRate: Math.max(0, Math.min(1, Number(setup.k401MatchRate) || 0)),
    k401MatchOnFirst: Math.max(0, Math.min(1, Number(setup.k401MatchOnFirst) || 0)),
    hasRoth: !!setup.hasRoth || (Number(setup.rothBalance) || 0) > 0,
    rothBalance: Math.max(0, Number(setup.rothBalance) || 0),
    rothAnnualContribution: Math.max(0, Number(setup.rothAnnualContribution) || 0),
    retirementAge: Math.max(40, Math.min(100, Number(setup.retirementAge) || 65)),
    married,
    filingStatus: married ? 'married' : 'single',
    kids: (setup.kids || []).map((k, i) => ({
      name: k.name || `Child ${i + 1}`,
      ...k,
      age: Number(k.age ?? 0),
    })),
    annualSpending: Number(setup.annualSpending ?? 30000),
    spendingBreakdown: setup.spendingBreakdown || { other: Number(setup.annualSpending ?? 30000) },
    zip: setup.zip == null || setup.zip === '' ? '' : String(setup.zip).replace(/\D/g, '').slice(0, 5),
    difficulty: setup.difficulty || 'standard',
    rateOverrides: setup.rateOverrides && typeof setup.rateOverrides === 'object' ? { ...setup.rateOverrides } : {},
    employed: setup.employed !== false && (Number(setup.salary) || 0) > 0,
    retired: !!setup.retired,
    otherDebt: Number(setup.otherDebt) || 0,
    otherLoans: Array.isArray(setup.otherLoans) ? setup.otherLoans : [],
    milestones: Array.isArray(setup.milestones) ? setup.milestones : [],
    socialSecurity: 0,
    childCostInflator: 1,
  }, { legacy: false });

  const nodeId = `room-${portfolio.year}-0`;
  const worth = computeWorth(portfolio);
  const snapshotId = `snap-${nodeId}`;

  const game = {
    scene: 'room',
    portfolio,
    timeline: {
      nodes: {
        [nodeId]: {
          id: nodeId,
          year: portfolio.year,
          age: portfolio.age,
          type: 'room', // room | hallway
          kind: 'begin',
          parentId: null,
          snapshotId,
          label: `Decision Room ${portfolio.year}`,
        },
      },
      snapshots: {
        [snapshotId]: cloneState(portfolio),
      },
      currentNodeId: nodeId,
      startAge: portfolio.age,
      startYear: portfolio.year,
      branchCounter: 0,
    },
    /** Net worth series for Charts tab / ending */
    worthHistory: [
      {
        year: portfolio.year,
        age: portfolio.age,
        netWorth: worth.netWorth,
        bank: worth.bank,
        portfolio: worth.portfolio,
        salary: portfolio.salary || 0,
      },
    ],
    flags: {
      setupComplete: true,
    },
    lastWorth: worth,
    eventLog: [],
  };

  return game;
}

export function currentNode(game) {
  return game.timeline.nodes[game.timeline.currentNodeId];
}

export function getSnapshot(game, snapshotId) {
  return game.timeline.snapshots[snapshotId];
}

function nextBranchId(game, prefix, year) {
  game.timeline.branchCounter = (game.timeline.branchCounter || 0) + 1;
  return `${prefix}-${year}-${game.timeline.branchCounter}`;
}

function pushWorth(game, p) {
  const worth = computeWorth(p);
  game.worthHistory = game.worthHistory || [];
  const last = game.worthHistory[game.worthHistory.length - 1];
  if (last && last.year === p.year && last.age === p.age) {
    last.netWorth = worth.netWorth;
    last.bank = worth.bank;
    last.portfolio = worth.portfolio;
    last.salary = p.salary || 0;
    last.priceIndex = p.priceIndex || 1;
    last.statement = p.lastStatement || null;
  } else {
    game.worthHistory.push({
      year: p.year,
      age: p.age,
      netWorth: worth.netWorth,
      bank: worth.bank,
      portfolio: worth.portfolio,
      salary: p.salary || 0,
      priceIndex: p.priceIndex || 1,
      statement: p.lastStatement || null,
    });
  }
  game.lastWorth = worth;
}

/**
 * Snapshot portfolio into a room timeline node (begin/end of year).
 */
export function commitRoomDecisions(game, kind = 'end') {
  const p = game.portfolio;
  const id = nextBranchId(game, `room-${kind}`, p.year);
  const snapshotId = `snap-${id}`;
  const parentId = game.timeline.currentNodeId;
  game.timeline.snapshots[snapshotId] = cloneState(p);
  game.timeline.nodes[id] = {
    id,
    year: p.year,
    age: p.age,
    type: 'room',
    kind,
    parentId,
    snapshotId,
    label: kind === 'end' ? `Left room ${p.year}` : `Decision Room ${p.year}`,
  };
  game.timeline.currentNodeId = id;
  pushWorth(game, p);
  return id;
}

/**
 * Record entering the Hallway of Time (for pause map jump-back).
 */
export function commitHallwayNode(game) {
  const p = game.portfolio;
  const id = nextBranchId(game, 'hallway', p.year);
  const snapshotId = `snap-${id}`;
  game.timeline.snapshots[snapshotId] = cloneState(p);
  game.timeline.nodes[id] = {
    id,
    year: p.year,
    age: p.age,
    type: 'hallway',
    kind: 'hallway',
    parentId: game.timeline.currentNodeId,
    snapshotId,
    label: `Hallway after ${p.year}`,
  };
  game.timeline.currentNodeId = id;
  pushWorth(game, p);
  return id;
}

/**
 * Enter a year's Decision Room from hallway door.
 * If the current node already has children, this Decision Room entry is a fork
 * (spawned timeline); otherwise it continues the current timeline.
 */
export function enterYearRoom(game, projectedPortfolio, elapsed = []) {
  const p = cloneState(projectedPortfolio);
  game.portfolio = p;
  const parentId = game.timeline.currentNodeId;
  const parentKids = Object.values(game.timeline.nodes || {}).filter(
    (n) => n.parentId === parentId
  );
  const isFork = parentKids.length > 0;
  const id = nextBranchId(game, 'room-begin', p.year);
  const snapshotId = `snap-${id}`;
  game.timeline.snapshots[snapshotId] = cloneState(p);
  game.timeline.nodes[id] = {
    id,
    year: p.year,
    age: p.age,
    type: 'room',
    kind: 'begin',
    parentId,
    snapshotId,
    label: `Decision Room ${p.year}`,
    elapsedHistory: elapsed.map(result => {
      const state = cloneState(result.state); delete state.transactions;
      return { year: state.year, age: state.age, portfolio: state, worth: result.worth || computeWorth(state) };
    }),
    /** True when this entry splits a new timeline off an already-explored parent */
    isFork,
  };
  game.timeline.currentNodeId = id;
  for (const result of elapsed) pushWorth(game, result.state);
  pushWorth(game, p);
  game.scene = 'room';
  return id;
}

/**
 * Jump back to a prior Hallway of Time node — restore that branch state.
 * Truncates worthHistory to the jump point year where possible.
 */
export function jumpToHallwayNode(game, nodeId) {
  const node = game.timeline.nodes[nodeId];
  if (!node || node.type !== 'hallway') return false;
  const snap = game.timeline.snapshots[node.snapshotId];
  if (!snap) return false;
  game.portfolio = cloneState(snap);
  game.timeline.currentNodeId = nodeId;
  game.scene = 'hallway';
  // Trim history to entries at or before this node's year/age
  if (game.worthHistory?.length) {
    game.worthHistory = game.worthHistory.filter(
      (h) => h.year < node.year || (h.year === node.year && h.age <= node.age)
    );
    if (!game.worthHistory.length) {
      const w = computeWorth(game.portfolio);
      game.worthHistory = [
        {
          year: game.portfolio.year,
          age: game.portfolio.age,
          netWorth: w.netWorth,
          bank: w.bank,
          portfolio: w.portfolio,
          salary: game.portfolio.salary || 0,
        },
      ];
    }
  }
  game.lastWorth = computeWorth(game.portfolio);
  return true;
}

/**
 * Walk parent links from the current (or given) node to find the nearest
 * Hallway of Time timeline node. Root Decision Room has none.
 * @param {object} game
 * @param {string} [fromNodeId]
 * @returns {object|null}
 */
export function findPriorHallwayNode(game, fromNodeId) {
  let id = fromNodeId || game.timeline?.currentNodeId;
  const guard = new Set();
  while (id && !guard.has(id)) {
    guard.add(id);
    const n = game.timeline?.nodes?.[id];
    if (!n) break;
    if (n.type === 'hallway') return n;
    id = n.parentId;
  }
  return null;
}

/**
 * Hallway descended from this room that a year-door begin actually split.
 * @param {object} game
 * @param {object} roomNode
 * @returns {object|null}
 */
function hallwaySplitFromRoom(game, roomNode) {
  const nodes = Object.values(game.timeline?.nodes || {});
  /** @type {Map<string, object[]>} */
  const children = new Map();
  for (const n of nodes) {
    if (!n?.parentId) continue;
    if (!children.has(n.parentId)) children.set(n.parentId, []);
    children.get(n.parentId).push(n);
  }
  const stack = [...(children.get(roomNode.id) || [])];
  const seen = new Set();
  let found = null;
  while (stack.length) {
    const n = stack.pop();
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    if (n.type === 'hallway') {
      for (const kid of children.get(n.id) || []) {
        if (
          kid.type === 'room' &&
          kid.kind === 'begin' &&
          (kid.year !== n.year || kid.age !== n.age)
        ) {
          found = n;
        }
      }
    }
    for (const kid of children.get(n.id) || []) stack.push(kid);
  }
  return found;
}

/**
 * Hallway this Decision Room may return to through the west door, or null.
 * A year-door room (year/age differ from the hallway it came from) always
 * qualifies. The room that opened the hallway — including the starter after
 * a south-door return — qualifies only once a later year door has split it.
 * @param {object} game
 * @returns {object|null}
 */
export function westReturnHallway(game) {
  const cur = currentNode(game);
  if (!cur || cur.type !== 'room') return null;
  const hall = findPriorHallwayNode(game);
  // This room was entered through a year door off a hallway.
  if (hall && (cur.year !== hall.year || cur.age !== hall.age)) return hall;
  // The room that opened the hallway (starter, or a south-door return to it)
  // gets a west door only after a later year door has split that hallway.
  if (cur.kind === 'begin') {
    const splitHall = hallwaySplitFromRoom(game, cur);
    if (splitHall) return splitHall;
  }
  return null;
}

/**
 * South door: restore the Decision Room that opened this hallway.
 * Does not create a new begin node under the hallway (that looked like a
 * year-door split and spawned a west door on the starter room).
 * @param {object} game
 * @param {object} portfolioState finances from when that room was left
 * @returns {string|null} restored begin node id
 */
export function returnToLeftDecisionRoom(game, portfolioState) {
  const p = cloneState(portfolioState);
  let id = game.timeline.currentNodeId;
  const guard = new Set();
  let beginId = null;
  while (id && !guard.has(id)) {
    guard.add(id);
    const n = game.timeline.nodes?.[id];
    if (!n) break;
    if (n.type === 'room' && n.kind === 'begin' && n.year === p.year && n.age === p.age) {
      beginId = n.id;
      break;
    }
    id = n.parentId;
  }
  game.portfolio = p;
  if (beginId) game.timeline.currentNodeId = beginId;
  pushWorth(game, p);
  game.scene = 'room';
  return beginId;
}

export function listTimelineNodes(game) {
  return Object.values(game.timeline.nodes || {}).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function yearsRemaining(game) {
  return Math.max(0, MAX_AGE - game.portfolio.age);
}

export function hallwayDoorCount(game) {
  // Doors from leaveAge+1 through age 99
  const leaveAge = game.portfolio.age;
  return Math.max(0, MAX_AGE - leaveAge - 1);
}


/**
 * Children of each timeline node (parentId → child ids).
 * @param {object} game
 * @returns {Map<string, string[]>}
 */
export function timelineChildrenMap(game) {
  const map = new Map();
  for (const n of Object.values(game.timeline?.nodes || {})) {
    if (!n?.id) continue;
    if (n.parentId) {
      if (!map.has(n.parentId)) map.set(n.parentId, []);
      map.get(n.parentId).push(n.id);
    }
  }
  for (const kids of map.values()) {
    kids.sort((a, b) => {
      const na = game.timeline.nodes[a];
      const nb = game.timeline.nodes[b];
      if (na.year !== nb.year) return na.year - nb.year;
      return String(a).localeCompare(String(b));
    });
  }
  return map;
}

/**
 * Root → node path (inclusive).
 * @param {object} game
 * @param {string} nodeId
 * @returns {object[]}
 */
export function pathFromRoot(game, nodeId) {
  const path = [];
  let id = nodeId;
  const guard = new Set();
  while (id && !guard.has(id)) {
    guard.add(id);
    const n = game.timeline.nodes[id];
    if (!n) break;
    path.push(n);
    id = n.parentId;
  }
  path.reverse();
  return path;
}

/**
 * Leaf tips of the timeline tree (nodes with no children).
 * @param {object} game
 * @returns {object[]}
 */
export function listBranchTips(game) {
  const nodes = game.timeline?.nodes || {};
  const kids = timelineChildrenMap(game);
  return Object.values(nodes)
    .filter((n) => !kids.has(n.id) || kids.get(n.id).length === 0)
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return String(a.id).localeCompare(String(b.id));
    });
}

/**
 * Rebuild a worth series from portfolio snapshots along root→tip.
 * @param {object} game
 * @param {string} tipNodeId
 * @returns {Array<{year:number,age:number,netWorth:number,bank:number,portfolio:number,salary:number}>}
 */
export function reconstructWorthAlongPath(game, tipNodeId) {
  const path = pathFromRoot(game, tipNodeId);
  const history = [];
  for (const n of path) {
    for (const entry of n.elapsedHistory || []) {
      const row = {year: entry.year, age: entry.age, ...entry.worth, priceIndex: entry.portfolio?.priceIndex || 1, nodeId:n.id};
      const last = history.at(-1);
      if (last?.year === row.year) Object.assign(last,row); else history.push(row);
    }
    const snap = game.timeline.snapshots?.[n.snapshotId];
    if (!snap) continue;
    const worth = computeWorth(snap);
    const row = {
      year: snap.year ?? n.year,
      age: snap.age ?? n.age,
      netWorth: worth.netWorth,
      bank: worth.bank,
      portfolio: worth.portfolio,
      salary: snap.salary || 0,
      retired: !!snap.retired,
      priceIndex: snap.priceIndex || 1,
      legacy: !!n.legacy,
      nodeId: n.id,
      snapshotId: n.snapshotId,
    };
    const last = history[history.length - 1];
    if (last && last.year === row.year && last.age === row.age) {
      Object.assign(last, row);
    } else {
      history.push(row);
    }
  }
  return history;
}

const BRANCH_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Distinct explored timelines (one per leaf tip), labeled A/B/C…
 * `isCurrent` marks the tip whose path contains currentNodeId (prefer deepest).
 * @param {object} game
 * @returns {Array<{letter:string,label:string,tipId:string,tip:object,history:array,isCurrent:boolean,yearMin:number,yearMax:number}>}
 */
export function listCompareBranches(game) {
  const tips = listBranchTips(game);
  const currentId = game.timeline?.currentNodeId;
  let currentTipId = null;
  if (currentId) {
    // Prefer a tip that descends from / is the current node
    for (const tip of tips) {
      const path = pathFromRoot(game, tip.id);
      if (path.some((n) => n.id === currentId)) {
        currentTipId = tip.id;
        break;
      }
    }
  }

  return tips.map((tip, i) => {
    const history = reconstructWorthAlongPath(game, tip.id);
    const letter = BRANCH_LETTERS[i] || String(i + 1);
    const forkLabel = tip.label || `Tip ${tip.year}`;
    const yearMin = history.length ? history[0].year : tip.year;
    const yearMax = history.length ? history[history.length - 1].year : tip.year;
    return {
      letter,
      label: `Timeline ${letter}`,
      shortLabel: letter,
      tipId: tip.id,
      tip,
      history,
      isCurrent: tip.id === currentTipId,
      yearMin,
      yearMax,
      forkLabel,
    };
  });
}

/**
 * Best portfolio snapshot on a branch for a calendar year.
 * Prefers the latest node on that path with snap.year === year;
 * falls back to nearest earlier year only when status would otherwise be missing mid-span
 * (we report exact-year only for side-by-side clarity — before/after otherwise).
 *
 * @param {object} game
 * @param {string} tipNodeId
 * @param {number} year
 * @returns {{status:'ok'|'before'|'after'|'empty', year:number, age?:number, portfolio?:object, worth?:object, node?:object}}
 */
export function portfolioAtYearOnBranch(game, tipNodeId, year) {
  const y = Math.round(Number(year));
  if (!Number.isFinite(y)) {
    return { status: 'empty', year: y };
  }
  // Only this timeline's own nodes. Ancestors before the fork are another
  // timeline — years before A have no past.
  const path = timelineOwnNodes(game, tipNodeId);
  if (!path.length) return { status: 'empty', year: y };

  const withSnaps = [];
  for (const n of path) {
    for (const entry of n.elapsedHistory || []) {
      if (entry.year >= path[0].year) withSnaps.push({node:n,snap:entry.portfolio,year:entry.year,age:entry.age});
    }
    const snap = game.timeline.snapshots?.[n.snapshotId];
    if (!snap) continue;
    withSnaps.push({ node: n, snap, year: snap.year ?? n.year, age: snap.age ?? n.age });
  }
  if (!withSnaps.length) return { status: 'empty', year: y };

  const yearMin = withSnaps[0].year;
  const yearMax = withSnaps[withSnaps.length - 1].year;
  if (y < yearMin) {
    return { status: 'before', year: y, yearMin, yearMax };
  }
  if (y > yearMax) {
    return { status: 'after', year: y, yearMin, yearMax };
  }

  const exact = withSnaps.filter((s) => s.year === y);
  if (exact.length) {
    const pick = exact[exact.length - 1];
    return {
      status: 'ok',
      year: y,
      age: pick.age,
      portfolio: pick.snap,
      worth: computeWorth(pick.snap),
      node: pick.node,
      yearMin,
      yearMax,
    };
  }

  return { status: 'gap', year: y, yearMin, yearMax };
}

/**
 * Nodes that belong to the timeline of tipNodeId, starting at that
 * timeline's A (game start, or the year-door begin that opened the column).
 * @param {object} game
 * @param {string} tipNodeId
 * @returns {object[]}
 */
export function timelineOwnNodes(game, tipNodeId) {
  if (!tipNodeId || !game?.timeline?.nodes?.[tipNodeId]) return [];
  const { laneOf } = assignTimelineLanes(game);
  const tipLane = laneOf.get(tipNodeId) ?? 0;
  const path = pathFromRoot(game, tipNodeId);
  let startIdx = 0;
  if (tipLane !== 0) {
    const idx = path.findIndex(
      (n) => (laneOf.get(n.id) ?? 0) === tipLane && isDecisionRoomForkEntry(n)
    );
    if (idx >= 0) startIdx = idx;
  }
  return path.slice(startIdx).filter((n) => (laneOf.get(n.id) ?? 0) === tipLane);
}

export function isDecisionRoomForkEntry(node, _kids) {
  if (!node || node.type !== 'room') return false;
  if (node.kind && node.kind !== 'begin') return false;
  // Root Decision Room is Point A on Timeline 1, not a fork off a parent.
  if (!node.parentId) return false;
  return true;
}

/**
 * Assign each timeline node to a Map lane.
 * Hallway / room-end continue the parent lane; every non-root Decision Room
 * begin spawns a new lane to the right (visible Y fork).
 * @param {object} game
 * @returns {{nodes:object, kids:Map, root:object, laneOf:Map<string,number>, laneCount:number, startYear:number, startAge:number, terminalYear:number}}
 */
export function assignTimelineLanes(game) {
  const nodes = game.timeline?.nodes || {};
  const list = Object.values(nodes);
  const kids = timelineChildrenMap(game);
  const root = list.find((n) => !n.parentId) || list[0] || null;
  const startYear = game.timeline?.startYear ?? root?.year ?? 0;
  const startAge = game.timeline?.startAge ?? root?.age ?? 0;
  const terminalYear = root ? startYear + (MAX_AGE - startAge) : 0;
  const laneOf = new Map();
  let nextLane = 1;

  function assign(id, preferredLane) {
    if (!id || laneOf.has(id)) return;
    laneOf.set(id, preferredLane);
    const children = kids.get(id) || [];
    const ordered = [...children].sort((a, b) => {
      const na = nodes[a];
      const nb = nodes[b];
      const af = isDecisionRoomForkEntry(na) ? 1 : 0;
      const bf = isDecisionRoomForkEntry(nb) ? 1 : 0;
      // Continuations (hallway) before forks when sorting siblings
      if (af !== bf) return af - bf;
      if ((na?.year ?? 0) !== (nb?.year ?? 0)) return (na?.year ?? 0) - (nb?.year ?? 0);
      return String(a).localeCompare(String(b));
    });
    for (const cid of ordered) {
      const child = nodes[cid];
      if (isDecisionRoomForkEntry(child)) {
        assign(cid, nextLane++);
      } else {
        assign(cid, preferredLane);
      }
    }
  }

  if (root) assign(root.id, 0);

  return {
    nodes,
    kids,
    root,
    laneOf,
    laneCount: Math.max(1, nextLane),
    startYear,
    startAge,
    terminalYear,
  };
}

/**
 * Hallway nodes on the selected timeline lane (path root→tipId, same lane as tip).
 * @param {object} game
 * @param {string} tipId
 * @returns {object[]}
 */
export function hallwayNodesForTimeline(game, tipId) {
  if (!tipId || !game?.timeline?.nodes?.[tipId]) return [];
  const { laneOf } = assignTimelineLanes(game);
  const tipLane = laneOf.get(tipId) ?? 0;
  const path = pathFromRoot(game, tipId);
  return path.filter((n) => n.type === 'hallway' && (laneOf.get(n.id) ?? 0) === tipLane);
}

/**
 * Pause Map tree. Time goes up. Each column is one timeline.
 *
 * A — where the timeline begins (game start on column 1; the year-door
 *     Decision Room on a later column).
 * B — on the parent column, the year a child timeline forked off. Drawn on
 *     the same calendar year as that child's A so the fork is horizontal.
 *     The game records the left-behind room on an earlier year than the door
 *     you entered; the shared row is the door year (the year you forked onto).
 * C — age 100, its own point on that year row, only if a node on the column
 *     was actually played to age 100.
 *
 * @param {object} game
 */
export function buildTimelineMapModel(game) {
  const nodes = game.timeline?.nodes || {};
  const list = Object.values(nodes);
  if (!list.length) {
    return {
      timelines: [],
      connectors: [],
      startYear: 0,
      terminalYear: 0,
      current: null,
      laneCount: 0,
    };
  }

  const {
    kids,
    root,
    laneOf,
    laneCount,
    startYear,
    startAge,
    terminalYear,
  } = assignTimelineLanes(game);

  const currentId = game.timeline.currentNodeId;
  const lanes = [...new Set(laneOf.values())].sort((a, b) => a - b);

  function reachedAge100(onLane) {
    for (const n of onLane) {
      if ((n.age ?? 0) >= MAX_AGE || (n.year ?? 0) >= terminalYear) return true;
      const snap = game.timeline.snapshots?.[n.snapshotId];
      if (!snap) continue;
      if ((snap.age ?? 0) >= MAX_AGE || (snap.year ?? 0) >= terminalYear) return true;
    }
    return false;
  }

  const timelines = lanes.map((lane) => {
    const onLane = list
      .filter((n) => (laneOf.get(n.id) ?? 0) === lane)
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return String(a.id).localeCompare(String(b.id));
      });

    let yearA = startYear;
    let spawnNode = null;
    if (lane !== 0) {
      spawnNode = onLane.find((n) => isDecisionRoomForkEntry(n)) || onLane[0] || null;
      if (spawnNode) yearA = spawnNode.year;
    } else if (root) {
      yearA = root.year;
    }

    const leaves = onLane.filter((n) => !(kids.get(n.id) || []).length);
    const hallwaysOnLane = onLane.filter((n) => n.type === 'hallway');
    const tip =
      leaves[leaves.length - 1] ||
      hallwaysOnLane[hallwaysOnLane.length - 1] ||
      onLane[onLane.length - 1] ||
      root;

    const forks = [];
    let forkIdx = 0;
    for (const n of onLane) {
      for (const cid of kids.get(n.id) || []) {
        const child = nodes[cid];
        if (!child || !isDecisionRoomForkEntry(child)) continue;
        const childLane = laneOf.get(cid) ?? 0;
        if (childLane === lane) continue;
        forkIdx += 1;
        forks.push({
          // Same row as the child timeline's A (the year you forked onto).
          year: child.year,
          leaveYear: n.year,
          label: forkIdx === 1 ? 'B' : `B${forkIdx}`,
          hubId: n.id,
          childId: cid,
          childLane,
        });
      }
    }

    const reachedC = reachedAge100(onLane);
    const nodeYears = onLane.map((n) => n.year);
    const playedYearMax = Math.max(yearA, ...nodeYears, ...forks.map((f) => f.year));

    return {
      number: 0,
      lane,
      tipId: tip?.id,
      tip,
      yearA,
      yearC: reachedC ? terminalYear : null,
      reachedC,
      playedYearMax,
      forks,
      isCurrent: (laneOf.get(currentId) ?? 0) === lane,
      spawnNodeId: spawnNode?.id ?? null,
    };
  });

  timelines.forEach((tl, i) => {
    tl.number = i + 1;
  });

  const connectors = [];
  for (const tl of timelines) {
    for (const f of tl.forks) {
      connectors.push({
        fromLane: tl.lane,
        toLane: f.childLane,
        year: f.year,
        label: f.label,
      });
    }
  }

  const cur = currentId ? nodes[currentId] : null;
  const liveYear = game.portfolio?.year ?? cur?.year ?? startYear;
  const liveAge = game.portfolio?.age ?? cur?.age ?? startAge;
  return {
    timelines,
    connectors,
    startYear,
    terminalYear,
    current: cur
      ? {
          year: liveYear,
          age: liveAge,
          id: cur.id,
          lane: laneOf.get(currentId) ?? 0,
          type: cur.type,
          nodeYear: cur.year,
        }
      : null,
    laneCount,
  };
}

export function layoutTimelineMap(game, rect) {
  const model = buildTimelineMapModel(game);
  const labelW = 84;
  const bottomH = 28;
  const plotX = rect.x + labelW;
  const plotY = rect.y + 2;
  const plotW = Math.max(20, rect.w - labelW - 4);
  const plotH = Math.max(16, rect.h - bottomH - 4);

  const years = [];
  for (const tl of model.timelines) {
    years.push(tl.yearA);
    if (tl.reachedC && tl.yearC != null) years.push(tl.yearC);
    for (const f of tl.forks) years.push(f.year);
    years.push(tl.playedYearMax);
  }
  const yMin = years.length ? Math.min(...years) : model.startYear;
  const yMax = years.length ? Math.max(...years) : model.startYear;
  // Pad the scale so a single year is not pinned to the bottom edge of a tall plot.
  const rawSpan = Math.max(1, yMax - yMin);
  const padYears = Math.max(2, rawSpan * 0.25);
  const yLo = yMin - padYears;
  const yHi = yMax + padYears;
  const yearSpan = yHi - yLo;
  const laneCount = Math.max(1, model.timelines.length);
  const maxLane = Math.max(0, ...model.timelines.map((t) => t.lane), 0);

  function xy(lane, year) {
    const t = (year - yLo) / yearSpan;
    const laneT = laneCount <= 1 ? 0.5 : lane / (laneCount - 1);
    return {
      x: plotX + laneT * (plotW - 8),
      y: plotY + (1 - t) * plotH,
    };
  }

  const points = [];
  const segments = [];
  const yearLabels = [];
  const columnLabels = [];
  const labeledYears = new Set();

  function addYearLabel(year) {
    if (labeledYears.has(year)) return;
    labeledYears.add(year);
    const p = xy(0, year);
    yearLabels.push({ year, x: rect.x + 1, y: p.y });
  }

  for (const tl of model.timelines) {
    const a = xy(tl.lane, tl.yearA);
    const topYear = tl.reachedC && tl.yearC != null ? tl.yearC : tl.playedYearMax;
    const top = xy(tl.lane, topYear);
    const solidTopY = Math.abs(top.y - a.y) < 1 ? a.y - 10 : top.y;
    segments.push({
      x1: a.x,
      y1: a.y,
      x2: a.x,
      y2: solidTopY,
      kind: 'spine',
      timeline: tl.number,
      isCurrent: tl.isCurrent,
    });
    // No past before a fork: dashed from the chart bottom up to this column's A.
    if (tl.yearA > yMin) {
      const bottom = xy(tl.lane, yMin);
      segments.push({
        x1: a.x,
        y1: bottom.y,
        x2: a.x,
        y2: a.y,
        kind: 'dashed',
        timeline: tl.number,
      });
    }
    points.push({
      key: `T${tl.number}-A`,
      x: a.x,
      y: a.y,
      lane: tl.lane,
      year: tl.yearA,
      kind: 'A',
      label: 'A',
      timeline: tl.number,
      tipId: tl.tipId,
    });
    addYearLabel(tl.yearA);
    for (const f of tl.forks) {
      const bp = xy(tl.lane, f.year);
      points.push({
        key: `T${tl.number}-${f.label}`,
        x: bp.x,
        y: bp.y,
        lane: tl.lane,
        year: f.year,
        kind: 'B',
        label: f.label,
        timeline: tl.number,
        tipId: tl.tipId,
        leaveYear: f.leaveYear,
      });
      addYearLabel(f.year);
    }
    if (tl.reachedC && tl.yearC != null) {
      const c = xy(tl.lane, tl.yearC);
      points.push({
        key: `T${tl.number}-C`,
        x: c.x,
        y: c.y,
        lane: tl.lane,
        year: tl.yearC,
        kind: 'C',
        label: 'C',
        timeline: tl.number,
        tipId: tl.tipId,
      });
      addYearLabel(tl.yearC);
    }
    const col = xy(tl.lane, yMin);
    columnLabels.push({
      number: tl.number,
      x: col.x,
      y: plotY + plotH + 10,
    });
  }

  for (const conn of model.connectors) {
    const from = xy(conn.fromLane, conn.year);
    const to = xy(conn.toLane, conn.year);
    segments.push({
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      kind: 'fork',
      label: conn.label,
    });
  }

  let currentPos = null;
  if (model.current) {
    const p = xy(model.current.lane, model.current.year);
    currentPos = { ...p, ...model.current };
  }

  const positions = new Map();
  for (const pt of points) {
    positions.set(pt.key, { x: pt.x, y: pt.y, node: pt, lane: pt.lane });
  }

  return {
    model,
    points,
    segments,
    yearLabels,
    columnLabels,
    currentPos,
    positions,
    edges: segments
      .filter((s) => s.kind === 'fork')
      .map((s, i) => ({ from: `fork-${i}-a`, to: `fork-${i}-b` })),
    orientation: 'vertical-up',
    yMin,
    yMax,
    maxLane,
    xy,
  };
}

/** Commit the final financial state once so ending, chart and map agree. */
export function completeJourney(game, projectedPortfolio, elapsed = []) {
  if (game.flags?.journeyComplete) return game.timeline.currentNodeId;
  const id = enterYearRoom(game, projectedPortfolio, elapsed);
  game.timeline.nodes[id].kind = 'terminal';
  game.timeline.nodes[id].label = 'End of the line ' + game.portfolio.year;
  game.flags ||= {}; game.flags.journeyComplete = true; game.scene = 'ending';
  return id;
}
