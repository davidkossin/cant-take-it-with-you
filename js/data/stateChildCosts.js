/**
 * State-based annual cost of raising a child (ages 0–17), in today's dollars
 * (CURRENT_YEAR base; the engine scales by priceIndex). College (18–21) is separate.
 *
 * State comes from the player's ZIP via the shared lookup in ./state-from-zip.js
 * (the same one used for taxes). DC, Puerto Rico / territories, military (APO/FPO)
 * and unknown/invalid ZIPs fall back to the plain average of the 50 state figures.
 */

import { stateCodeFromZip, STATE_NAMES } from './state-from-zip.js';

/** Annual cost of raising a child by 2-letter state code. */
export const STATE_CHILD_COST = Object.freeze({
  MA: 35841, HI: 35049, CT: 32803, CO: 30425, NY: 30247, CA: 29468, NH: 27849, WA: 27806,
  RI: 27630, MN: 27406, VT: 27170, NV: 26914, NJ: 26870, AK: 26860, OR: 26334, DE: 25867,
  ME: 24917, MD: 24830, PA: 24820, WI: 24064, VA: 24043, AZ: 24026, IL: 23821, MI: 23075,
  OH: 22926, NE: 22773, IA: 22714, ND: 21645, IN: 21584, NC: 21510, FL: 21384, ID: 21214,
  UT: 20955, MT: 20839, TX: 20724, WY: 20579, GA: 20480, SC: 20293, NM: 20060, MO: 19995,
  WV: 19558, OK: 19535, TN: 19525, KS: 19494, SD: 19008, AL: 18653, KY: 18588, LA: 17918,
  AR: 17424, MS: 16151,
});

/** Fallback: average of the 50 state figures, rounded to the dollar. */
export const AVERAGE_CHILD_COST = Math.round(
  Object.values(STATE_CHILD_COST).reduce((sum, v) => sum + v, 0) / Object.keys(STATE_CHILD_COST).length);

/**
 * Child-cost lookup for a ZIP.
 * @returns {{ code: string|null, state: string|null, annual: number, fallback: boolean }}
 */
export function childCostInfoForZip(zip) {
  const code = stateCodeFromZip(zip);
  const annual = code ? STATE_CHILD_COST[code] : undefined;
  if (annual == null) return { code, state: code ? STATE_NAMES[code] ?? code : null, annual: AVERAGE_CHILD_COST, fallback: true };
  return { code, state: STATE_NAMES[code], annual, fallback: false };
}

/** Annual cost (today's dollars) of raising a child aged 0–17 for this ZIP. */
export function annualChildCostForZip(zip) {
  return childCostInfoForZip(zip).annual;
}

/** One-line description, e.g. "Arizona's average of $24,026/year". */
export function childCostLabel(zip) {
  const info = childCostInfoForZip(zip);
  const amount = '$' + info.annual.toLocaleString('en-US');
  return info.fallback ? `the 50-state average of ${amount}/year` : `${info.state}'s average of ${amount}/year`;
}
