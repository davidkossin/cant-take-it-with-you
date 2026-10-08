/**
 * Authoritative game state + timeline branch nodes.
 */

import { CURRENT_YEAR, MAX_AGE } from '../config.js';
import { cloneState, computeWorth } from '../finance/Engine.js';
import { normalizePortfolio } from '../finance/Schema.js';
import { ensureTimelineSystem, currentTimeline, recordTimelineDecision, createHallwayTimeline, eraseTimeline } from './TimelineSystem.js';

export function createDefaultSetup() {
  return {
    financeVersion: 2,
    socialSecurityMonthly: 0,
    socialSecurityClaimAge: 67,
    spouseName: 'Partner', spouseAge: 30, spouseHairColor: 'dark', spouseHairLength: 'short', spouseShirtColor: 'blue',
    spouseRetirementAge: 65, spouseEmployed: true, spouseRetired: false,
    spouseSalary: 0,
    householdVersion: 1, salaryOwnership: 'individual', salaryOwnershipConfirmed: true,
    inflationAdjusted: true, dollarBaseYear: CURRENT_YEAR, childcarePlans: [],
    investmentFee: 0.002,
    annualCollegeCost: 28000,
    playerName: 'Traveler',
    year: CURRENT_YEAR,
    age: 30,
    hairColor: 'dark',
    hairLength: 'short',
    shirtColor: 'blue',
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
 * Cash $155,000, savings $35,000 @ 2%, stocks $85,000 (basis $72,250),
 * 401(k) $62,000 (6% contribution, 100% match on the first 3% of salary).
 * ZIP 85001, Standard difficulty.
 *
 * Starting Cash $155,000, starting net worth $447,000.
 * Only Cash pays bills (cash-only funding), so Cash sets when the first glass wall
 * arrives: the deterministic projection runs out of Cash in 2040 (age 44, wall at
 * Hallway year index 15); the 1,000-path median first wall is 2039 (age 43).
 * Any Cash from $154k to $159k gives index 15. Everything else about Starman is unchanged.
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
    spouseName: 'Partner', spouseAge: 30, spouseHairColor: 'dark', spouseHairLength: 'short', spouseShirtColor: 'blue',
    spouseRetirementAge: 65, spouseEmployed: true, spouseRetired: false,
    spouseSalary: 0,
    householdVersion: 1, salaryOwnership: 'individual', salaryOwnershipConfirmed: true,
    inflationAdjusted: true, dollarBaseYear: CURRENT_YEAR, childcarePlans: [],
    socialSecurityMonthly: 0,
    socialSecurityClaimAge: 67,
    investmentFee: .002,
    playerName: 'Starman',
    year: CURRENT_YEAR,
    age: 30,
    hairColor: 'dark',
    hairLength: 'short',
    shirtColor: 'blue',
    cash: 155000,
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
    shirtColor: setup.shirtColor || 'blue',
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
    settings: { inflationAdjusted: portfolio.inflationAdjusted !== false },
    hallwayScenario: null,
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
        priceIndex: portfolio.priceIndex || 1,
      },
    ],
    flags: {
      setupComplete: true,
    },
    lastWorth: worth,
    eventLog: [],
  };

  ensureTimelineSystem(game);
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
  ensureTimelineSystem(game);
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
    timelineId: game.timeline.activeTimelineId,
  };
  game.timeline.currentNodeId = id;
  pushWorth(game, p);
  return id;
}

/**
 * Record entering the Hallway of Time (for pause map jump-back).
 */
export function commitHallwayNode(game) {
  ensureTimelineSystem(game);
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
  createHallwayTimeline(game, game.timeline.nodes[id]);
  game.timeline.currentNodeId = id;
  pushWorth(game, p);
  return id;
}

/**
 * Record a decision visit on the parent timeline. Leaving north creates a new
 * numbered timeline; entering the room alone does not replace a projection.
 * The Hallway's first door is its own start year: that room is entered with
 * the Hallway's start state and no elapsed years.
 */
export function enterYearRoom(game, projectedPortfolio, elapsed = []) {
  ensureTimelineSystem(game);
  const p = cloneState(projectedPortfolio);
  p.inflationAdjusted = (game.settings?.inflationAdjusted ?? game.portfolio.inflationAdjusted) !== false;
  p.dollarBaseYear = game.timeline.startYear;
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
    elapsedPathId: currentTimeline(game)?.actualPathId || null,
    elapsedFromYear: elapsed[0]?.state?.year ?? p.year,
    elapsedToYear: p.year,
    elapsedHistory: currentTimeline(game)?.actualPathId ? [] : elapsed.map(result => {
      const state = cloneState(result.state); delete state.transactions;
      return { year: state.year, age: state.age, portfolio: state, worth: result.worth || computeWorth(state) };
    }),
    /** True when this entry splits a new timeline off an already-explored parent */
    isFork,
    /** Entered through a Hallway year door (including the same-year first door). */
    viaYearDoor: true,
  };
  recordTimelineDecision(game, game.timeline.nodes[id], parentId);
  game.timeline.currentNodeId = id;
  game.worthHistory = reconstructWorthAlongPath(game, parentId);
  for (const result of elapsed) pushWorth(game, result.state);
  pushWorth(game, p);
  game.scene = 'room';
  return id;
}

/**
 * Jump back to a prior Hallway of Time node — restore that branch state.
 * Reconstructs worthHistory from the selected branch's immutable snapshots.
 */
export function jumpToHallwayNode(game, nodeId) {
  ensureTimelineSystem(game);
  const node = game.timeline.nodes[nodeId];
  if (!node || node.type !== 'hallway') return false;
  const record = game.timeline.records[node.timelineId];
  const snap = record?.baseline || game.timeline.snapshots[node.snapshotId];
  if (!snap) return false;
  const inflationAdjusted = game.settings?.inflationAdjusted ?? game.portfolio.inflationAdjusted;
  game.portfolio = cloneState(snap);
  game.portfolio.inflationAdjusted = inflationAdjusted !== false;
  game.timeline.currentNodeId = nodeId;
  game.timeline.activeTimelineId = node.timelineId;
  game.hallwayScenario = record?.scenario ? cloneState(record.scenario) : null;
  game.scene = 'hallway';
  game.worthHistory = reconstructWorthAlongPath(game, nodeId);
  game.lastWorth = computeWorth(game.portfolio);
  if (game.flags) game.flags.journeyComplete = false;
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
 * A room entered through a Hallway year door always qualifies, including the
 * first door, which shares the Hallway's own year. (Older saves mark rooms
 * entered through a year door only by a differing year, and the retired
 * south-door return by enteredViaSouth.) The room that opened a hallway
 * qualifies only once a later year door has split it, which only older saves
 * can contain: the south door now erases the hallway it leaves.
 * @param {object} game
 * @returns {object|null}
 */
export function westReturnHallway(game) {
  const cur = currentNode(game);
  if (!cur || cur.type !== 'room') return null;
  const hall = findPriorHallwayNode(game);
  // This room was entered through a year door off a hallway.
  if (hall && (cur.viaYearDoor || cur.enteredViaSouth || cur.year !== hall.year || cur.age !== hall.age)) return hall;
  if (cur.kind === 'begin') {
    const splitHall = hallwaySplitFromRoom(game, cur);
    if (splitHall) return splitHall;
  }
  return null;
}

/**
 * The Hallway node whose south door the player is using, or null.
 * @param {object} game
 * @returns {object|null}
 */
export function southDoorHallway(game) {
  const cur = currentNode(game);
  return cur?.type === 'hallway' ? cur : null;
}

/**
 * South door: erase the current Hallway's timeline (its Hallway, the rooms and
 * hallways reached from it, its forecast and every timeline branching from it)
 * and return to the Decision Room that opened it, with the finances the player
 * had when leaving that room. That room becomes the live node again, so it
 * behaves exactly as before the player left it. Timeline 1 is reset rather
 * than removed. Checkpoints saved earlier keep their copies.
 * @param {object} game
 * @returns {null|{originRoomId:string, activeTimelineId:string, erasedTimelineIds:string[], reset:boolean, timelineNumber:number}}
 */
export function returnToLeftDecisionRoom(game) {
  const hall = southDoorHallway(game);
  if (!hall) return null;
  const inflationAdjusted = game.settings?.inflationAdjusted ?? game.portfolio.inflationAdjusted;
  const erased = eraseTimeline(game, hall.timelineId);
  if (!erased) return null;
  const p = cloneState(erased.state);
  p.inflationAdjusted = inflationAdjusted !== false;
  p.dollarBaseYear = game.timeline.startYear;
  game.portfolio = p;
  game.timeline.currentNodeId = erased.originRoomId;
  game.worthHistory = reconstructWorthAlongPath(game, erased.originRoomId);
  pushWorth(game, p);
  if (game.flags) game.flags.journeyComplete = false;
  game.scene = 'room';
  const { state, ...summary } = erased;
  return summary;
}

export function yearsRemaining(game) {
  return Math.max(0, MAX_AGE - game.portfolio.age);
}

export function hallwayDoorCount(game) {
  // Doors from leaveAge (the current year, nothing elapsed) through age 99
  const leaveAge = game.portfolio.age;
  return Math.max(0, MAX_AGE - leaveAge);
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

/** Branch nodes refer to the immutable selected path instead of duplicating yearly portfolios. */
function elapsedEntries(game, node) {
  const path = game.timeline.actualPaths?.[node.elapsedPathId];
  if (!path) return node.elapsedHistory || [];
  return path.filter(frame => frame.state.year >= node.elapsedFromYear && frame.state.year <= node.elapsedToYear)
    .map(frame => ({ year: frame.state.year, age: frame.state.age, portfolio: frame.state, worth: frame.worth }));
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
    for (const entry of elapsedEntries(game, n)) {
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

export function portfolioAtYearOnBranch(game, tipNodeId, year) {
  const y = Math.round(Number(year));
  const path = pathFromRoot(game, tipNodeId);
  const entries = [];
  for (const node of path) {
    for (const entry of elapsedEntries(game, node)) entries.push({ node, portfolio: entry.portfolio, year: entry.year });
    const p = game.timeline.snapshots[node.snapshotId];
    if (p) entries.push({ node, portfolio: p, year: p.year });
  }
  const exact = entries.filter(e => e.year === y).at(-1);
  if (exact) return { status: 'ok', year: y, age: exact.portfolio.age, ...exact, worth: computeWorth(exact.portfolio) };
  const years = entries.map(e => e.year);
  return { status: !years.length ? 'empty' : y < Math.min(...years) ? 'before' : y > Math.max(...years) ? 'after' : 'gap', year: y };
}

/** Commit the final financial state once so ending, chart and map agree. */
export function completeJourney(game, projectedPortfolio, elapsed = []) {
  if (game.flags?.journeyComplete) return game.timeline.currentNodeId;
  const id = enterYearRoom(game, projectedPortfolio, elapsed);
  game.timeline.nodes[id].kind = 'terminal';
  const record = currentTimeline(game);
  if (record) record.decisions = record.decisions.filter(point => point.nodeId !== id);
  game.timeline.nodes[id].label = 'End of the line ' + game.portfolio.year;
  game.flags ||= {}; game.flags.journeyComplete = true; game.scene = 'ending';
  return id;
}
