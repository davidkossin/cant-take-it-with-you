import { projectYears, computeWorth, FUNDING_RULE } from './Engine.js';
import { copy } from './Books.js';

export const HALLWAY_PATHS = 1000;
/**
 * The Hallway follows the path whose first glass wall (first unfunded year; never = Infinity) is the
 * median of the selection paths; ties go to the ending net worth closest to those paths' median.
 */
export const HALLWAY_SELECTION = 'median-first-wall';
export const HALLWAY_SELECTION_LABEL = 'Median first glass wall';

export function isJourneyScenario(scenario) {
  return scenario?.version === 1 && Number.isFinite(scenario.seed)
    && Number.isInteger(scenario.simulationIndex) && scenario.simulationIndex >= 0
    && Number.isInteger(scenario.originYear);
}

/** A stored Hallway path chosen under the current selection and funding rules (older saves are reselected). */
export function isCurrentJourneyScenario(scenario) {
  return isJourneyScenario(scenario) && scenario.selection === HALLWAY_SELECTION && scenario.fundingRule === FUNDING_RULE;
}

/** Replay one complete Monte Carlo path. Calendar-year keys survive room changes and rewinds. */
export function projectJourney(baseline, scenario, opts = {}) {
  if (!isJourneyScenario(scenario)) throw new TypeError('Invalid Hallway scenario');
  const years = Math.max(0, Math.min(100 - baseline.age, opts.years ?? 100 - baseline.age));
  return [
    { state: copy(baseline), worth: computeWorth(baseline), events: [], statement: null },
    ...projectYears(baseline, years, baseline.difficulty, {
      ...opts, deterministic: false, seed: scenario.seed,
      simulationIndex: scenario.simulationIndex, startYear: scenario.originYear,
    }),
  ];
}
