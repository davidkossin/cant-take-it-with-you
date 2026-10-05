import { projectYears, computeWorth } from './Engine.js';
import { copy } from './Books.js';

export const HALLWAY_PATHS = 1000;
export const HALLWAY_SELECTION = 'nearest-terminal-median';

export function isJourneyScenario(scenario) {
  return scenario?.version === 1 && Number.isFinite(scenario.seed)
    && Number.isInteger(scenario.simulationIndex) && scenario.simulationIndex >= 0
    && Number.isInteger(scenario.originYear);
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
