/**
 * ZIP code → US state: the single source of truth for every ZIP lookup in the game
 * (state taxes, property-tax defaults, the setup summary, and child costs in
 * js/data/stateChildCosts.js).
 *
 * The 3-digit prefix table below is generated from address data, not from mail
 * processing centers: GeoNames US/PR/VI/GU postal codes (state of the ZIPs in each
 * prefix), cross-checked against the Census 2020 ZCTA-to-county relationship file
 * (zero disagreements), with the USPS L002 3-Digit ZIP Code Prefix Matrix
 * (effective 2026-11-01) used for the list of assigned prefixes and for the
 * military AA/AE/AP prefixes. L002's label-to facility is sometimes in a neighboring
 * state (e.g. 010–012 label to Hartford CT, 398 to Tallahassee FL, 565 to Fargo ND),
 * so it is not used for the state itself. Prefix 569 (DC parcel-return ZIPs) is not
 * in L002 but its ZIPs are in DC. Prefix 969 covers Guam and the other Pacific
 * islands (MP, MH, FM, PW) and is reported as GU.
 *
 * Tax shape: stateFromZip() returns { state, abbr, stateIncomeTaxApprox,
 * propertyTaxApprox, zip } for tax estimates. Blank / missing ZIP → national averages
 * (not a fake state). Property tax approx = statewide effective residential rate spirit
 * (Tax Foundation / Census-inspired; gameplay — not advice). National average effective
 * property tax ≈ 0.99%.
 */

/** National averages when ZIP is blank. */
export const NATIONAL_AVERAGES = {
  state: 'United States (national average)',
  abbr: 'US',
  stateIncomeTaxApprox: 0.05,
  propertyTaxApprox: 0.0099,
  national: true,
};

export const STATE_NAMES = Object.freeze({
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico',
  VI: 'U.S. Virgin Islands', GU: 'Guam', AA: 'Armed Forces Americas', AE: 'Armed Forces Europe',
  AP: 'Armed Forces Pacific',
});

/**
 * 3-digit ZIP prefix ranges [lo, hi, code] (inclusive, ascending). Prefixes not listed
 * have no ZIP codes (000–004, 213, 269, 343, 345, 348, 353, 419, 428–429, 517–519, 529,
 * 533, 536, 552, 568, 578–579, 589, 621, 632, 642–643, 659, 663, 682, 694–699, 702, 709,
 * 715, 732, 742, 771, 817–819, 839, 848–849, 854, 858, 861–862, 866–869, 872, 886–888,
 * 892, 896, 899, 909, 929, 987) → null.
 * Notable: 005 NY (Holtsville IRS), 055 MA (Andover IRS), 063 CT, 090–099 AE, 201 VA,
 * 340 AA, 398–399 GA, 569 DC, 733 TX (Austin IRS), 885 TX (El Paso), 962–966 AP.
 */
export const ZIP3_RANGES = Object.freeze([
  [5, 5, 'NY'], [6, 7, 'PR'], [8, 8, 'VI'], [9, 9, 'PR'], [10, 27, 'MA'], [28, 29, 'RI'],
  [30, 38, 'NH'], [39, 49, 'ME'], [50, 54, 'VT'], [55, 55, 'MA'], [56, 59, 'VT'], [60, 69, 'CT'],
  [70, 89, 'NJ'], [90, 99, 'AE'], [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'],
  [200, 200, 'DC'], [201, 201, 'VA'], [202, 205, 'DC'], [206, 212, 'MD'], [214, 219, 'MD'],
  [220, 246, 'VA'], [247, 268, 'WV'], [270, 289, 'NC'], [290, 299, 'SC'], [300, 319, 'GA'],
  [320, 339, 'FL'], [340, 340, 'AA'], [341, 342, 'FL'], [344, 344, 'FL'], [346, 347, 'FL'],
  [349, 349, 'FL'], [350, 352, 'AL'], [354, 369, 'AL'], [370, 385, 'TN'], [386, 397, 'MS'],
  [398, 399, 'GA'], [400, 418, 'KY'], [420, 427, 'KY'], [430, 459, 'OH'], [460, 479, 'IN'],
  [480, 499, 'MI'], [500, 516, 'IA'], [520, 528, 'IA'], [530, 532, 'WI'], [534, 535, 'WI'],
  [537, 549, 'WI'], [550, 551, 'MN'], [553, 567, 'MN'], [569, 569, 'DC'], [570, 577, 'SD'],
  [580, 588, 'ND'], [590, 599, 'MT'], [600, 620, 'IL'], [622, 629, 'IL'], [630, 631, 'MO'],
  [633, 641, 'MO'], [644, 658, 'MO'], [660, 662, 'KS'], [664, 679, 'KS'], [680, 681, 'NE'],
  [683, 693, 'NE'], [700, 701, 'LA'], [703, 708, 'LA'], [710, 714, 'LA'], [716, 729, 'AR'],
  [730, 731, 'OK'], [733, 733, 'TX'], [734, 741, 'OK'], [743, 749, 'OK'], [750, 770, 'TX'],
  [772, 799, 'TX'], [800, 816, 'CO'], [820, 831, 'WY'], [832, 838, 'ID'], [840, 847, 'UT'],
  [850, 853, 'AZ'], [855, 857, 'AZ'], [859, 860, 'AZ'], [863, 865, 'AZ'], [870, 871, 'NM'],
  [873, 884, 'NM'], [885, 885, 'TX'], [889, 891, 'NV'], [893, 895, 'NV'], [897, 898, 'NV'],
  [900, 908, 'CA'], [910, 928, 'CA'], [930, 961, 'CA'], [962, 966, 'AP'], [967, 968, 'HI'],
  [969, 969, 'GU'], [970, 979, 'OR'], [980, 986, 'WA'], [988, 994, 'WA'], [995, 999, 'AK'],
]);

/**
 * Income / property tax approximations [stateIncomeTaxApprox, propertyTaxApprox] by code.
 * Codes without an entry (VI, GU, military AA/AE/AP) use the national averages.
 */
const TAX_APPROX = Object.freeze({
  PR: [0.0, 0.006], MA: [0.05, 0.0108], RI: [0.0599, 0.012], NH: [0.0, 0.017],
  ME: [0.0715, 0.0109], VT: [0.0875, 0.018], CT: [0.0699, 0.019], NJ: [0.0637, 0.022],
  NY: [0.0685, 0.014], PA: [0.0307, 0.0135], DE: [0.066, 0.0055], DC: [0.085, 0.0056],
  MD: [0.0575, 0.0098], VA: [0.0575, 0.0078], WV: [0.065, 0.0055], NC: [0.0475, 0.0076],
  SC: [0.064, 0.0053], GA: [0.055, 0.0083], FL: [0.0, 0.0083], AL: [0.05, 0.0037],
  TN: [0.0, 0.0064], MS: [0.05, 0.0072], KY: [0.045, 0.0078], OH: [0.035, 0.0143],
  IN: [0.0315, 0.0079], MI: [0.0425, 0.0134], IA: [0.057, 0.0149], WI: [0.0765, 0.0156],
  MN: [0.0785, 0.0105], SD: [0.0, 0.0114], ND: [0.029, 0.0098], MT: [0.0675, 0.0074],
  IL: [0.0495, 0.0207], MO: [0.048, 0.0091], KS: [0.057, 0.0129], NE: [0.0664, 0.0155],
  LA: [0.0425, 0.0051], AR: [0.049, 0.0057], OK: [0.0475, 0.0083], TX: [0.0, 0.016],
  CO: [0.044, 0.0049], WY: [0.0, 0.0056], ID: [0.058, 0.0059], UT: [0.0465, 0.0055],
  AZ: [0.025, 0.0054], NM: [0.059, 0.0067], NV: [0.0, 0.0053], CA: [0.093, 0.007],
  HI: [0.0825, 0.0028], OR: [0.099, 0.0087], WA: [0.0, 0.0087], AK: [0.0, 0.0104],
});

/** Normalize to a 5-digit ZIP string (ZIP+4 accepted) or null. */
export function zip5(zip) {
  const digits = String(zip ?? '').replace(/\D/g, '');
  if (digits.length !== 5 && digits.length !== 9) return null;
  return digits.slice(0, 5);
}

/**
 * 2-letter USPS code (state, DC, territory, or AA/AE/AP military) for a ZIP,
 * or null when blank/invalid/unassigned.
 * @param {string|number|null|undefined} zip
 * @returns {string|null}
 */
export function stateCodeFromZip(zip) {
  const z = zip5(zip);
  if (!z) return null;
  const prefix = parseInt(z.slice(0, 3), 10);
  for (const [lo, hi, code] of ZIP3_RANGES) {
    if (prefix < lo) return null;
    if (prefix <= hi) return code;
  }
  return null;
}

/**
 * State tax info for a ZIP, built on stateCodeFromZip.
 * Blank → national averages; malformed → national averages with unknown: true;
 * a prefix with no ZIP codes → { state: 'Unknown', abbr: 'XX' } at national rates.
 * @param {string|number|null|undefined} zip
 * @returns {{ state: string, abbr: string, stateIncomeTaxApprox: number, propertyTaxApprox: number, national?: boolean, unknown?: boolean, zip?: string }}
 */
export function stateFromZip(zip) {
  const raw = String(zip ?? '').trim();
  if (!raw) return { ...NATIONAL_AVERAGES };
  const digits = zip5(raw);
  if (!digits) return { ...NATIONAL_AVERAGES, unknown: true };
  const abbr = stateCodeFromZip(digits);
  if (!abbr) {
    return {
      state: 'Unknown',
      abbr: 'XX',
      stateIncomeTaxApprox: NATIONAL_AVERAGES.stateIncomeTaxApprox,
      propertyTaxApprox: NATIONAL_AVERAGES.propertyTaxApprox,
      zip: digits,
    };
  }
  const [rate, prop] = TAX_APPROX[abbr]
    ?? [NATIONAL_AVERAGES.stateIncomeTaxApprox, NATIONAL_AVERAGES.propertyTaxApprox];
  return { state: STATE_NAMES[abbr], abbr, stateIncomeTaxApprox: rate, propertyTaxApprox: prop, zip: digits };
}

export function formatZip(zip) {
  const digits = String(zip || '').replace(/\D/g, '').slice(0, 5);
  return digits;
}

/** Default annual property tax rate for a new home given ZIP (or national). */
export function defaultPropertyTaxRate(zip) {
  return stateFromZip(zip).propertyTaxApprox;
}
