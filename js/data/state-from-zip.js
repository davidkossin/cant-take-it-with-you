/**
 * Approximate US state from ZIP prefix.
 * Offline static map — replace/enhance with live geocoding later.
 * Returns { state, abbr, stateIncomeTaxApprox, propertyTaxApprox } for tax estimates.
 *
 * Blank / missing ZIP → national averages (not a fake state).
 *
 * Property tax approx = statewide effective residential rate spirit
 * (Tax Foundation / Census-inspired; gameplay — not advice).
 * National average effective property tax ≈ 0.99%.
 */

/** National averages when ZIP is blank. */
export const NATIONAL_AVERAGES = {
  state: 'United States (national average)',
  abbr: 'US',
  stateIncomeTaxApprox: 0.05,
  propertyTaxApprox: 0.0099,
  national: true,
};

const PREFIX_RANGES = [
  // [lo, hi, abbr, name, stateIncomeTaxApprox, propertyTaxApprox]
  [6, 9, 'PR', 'Puerto Rico', 0.0, 0.006],
  [10, 27, 'MA', 'Massachusetts', 0.05, 0.0108],
  [28, 29, 'RI', 'Rhode Island', 0.0599, 0.012],
  [30, 38, 'NH', 'New Hampshire', 0.0, 0.017],
  [39, 49, 'ME', 'Maine', 0.0715, 0.0109],
  [50, 59, 'VT', 'Vermont', 0.0875, 0.018],
  [60, 69, 'CT', 'Connecticut', 0.0699, 0.019],
  [70, 89, 'NJ', 'New Jersey', 0.0637, 0.022],
  [100, 149, 'NY', 'New York', 0.0685, 0.014],
  [150, 196, 'PA', 'Pennsylvania', 0.0307, 0.0135],
  [197, 199, 'DE', 'Delaware', 0.066, 0.0055],
  [200, 205, 'DC', 'District of Columbia', 0.085, 0.0056],
  [206, 219, 'MD', 'Maryland', 0.0575, 0.0098],
  [220, 246, 'VA', 'Virginia', 0.0575, 0.0078],
  [247, 268, 'WV', 'West Virginia', 0.065, 0.0055],
  [270, 289, 'NC', 'North Carolina', 0.0475, 0.0076],
  [290, 299, 'SC', 'South Carolina', 0.064, 0.0053],
  [300, 319, 'GA', 'Georgia', 0.055, 0.0083],
  [320, 349, 'FL', 'Florida', 0.0, 0.0083],
  [350, 369, 'AL', 'Alabama', 0.05, 0.0037],
  [370, 385, 'TN', 'Tennessee', 0.0, 0.0064],
  [386, 397, 'MS', 'Mississippi', 0.05, 0.0072],
  [400, 427, 'KY', 'Kentucky', 0.045, 0.0078],
  [430, 459, 'OH', 'Ohio', 0.035, 0.0143],
  [460, 479, 'IN', 'Indiana', 0.0315, 0.0079],
  [480, 499, 'MI', 'Michigan', 0.0425, 0.0134],
  [500, 528, 'IA', 'Iowa', 0.057, 0.0149],
  [530, 549, 'WI', 'Wisconsin', 0.0765, 0.0156],
  [550, 567, 'MN', 'Minnesota', 0.0785, 0.0105],
  [570, 577, 'SD', 'South Dakota', 0.0, 0.0114],
  [580, 588, 'ND', 'North Dakota', 0.029, 0.0098],
  [590, 599, 'MT', 'Montana', 0.0675, 0.0074],
  [600, 629, 'IL', 'Illinois', 0.0495, 0.0207],
  [630, 658, 'MO', 'Missouri', 0.048, 0.0091],
  [660, 679, 'KS', 'Kansas', 0.057, 0.0129],
  [680, 693, 'NE', 'Nebraska', 0.0664, 0.0155],
  [700, 715, 'LA', 'Louisiana', 0.0425, 0.0051],
  [716, 729, 'AR', 'Arkansas', 0.049, 0.0057],
  [730, 749, 'OK', 'Oklahoma', 0.0475, 0.0083],
  [750, 799, 'TX', 'Texas', 0.0, 0.016],
  [800, 816, 'CO', 'Colorado', 0.044, 0.0049],
  [820, 831, 'WY', 'Wyoming', 0.0, 0.0056],
  [832, 838, 'ID', 'Idaho', 0.058, 0.0059],
  [840, 847, 'UT', 'Utah', 0.0465, 0.0055],
  [850, 865, 'AZ', 'Arizona', 0.025, 0.0054],
  [870, 884, 'NM', 'New Mexico', 0.059, 0.0067],
  [889, 898, 'NV', 'Nevada', 0.0, 0.0053],
  [900, 961, 'CA', 'California', 0.093, 0.007],
  [967, 968, 'HI', 'Hawaii', 0.0825, 0.0028],
  [970, 979, 'OR', 'Oregon', 0.099, 0.0087],
  [980, 994, 'WA', 'Washington', 0.0, 0.0087],
  [995, 999, 'AK', 'Alaska', 0.0, 0.0104],
];

/**
 * @param {string|number|null|undefined} zip
 * @returns {{ state: string, abbr: string, stateIncomeTaxApprox: number, propertyTaxApprox: number, national?: boolean, zip?: string }}
 */
export function stateFromZip(zip) {
  const raw = String(zip ?? '').trim();
  if (!raw) {
    return { ...NATIONAL_AVERAGES };
  }
  const clean = raw.replace(/\D/g, '');
  if (clean.length !== 5) return { ...NATIONAL_AVERAGES, unknown: true };
  const digits = clean;
  // Still blank after scrub
  if (!digits || digits === '00000' && !/\d/.test(raw)) {
    return { ...NATIONAL_AVERAGES };
  }
  const prefix = parseInt(digits.slice(0, 3), 10);
  if (Number.isNaN(prefix)) {
    return { ...NATIONAL_AVERAGES, zip: digits };
  }
  for (const [lo, hi, abbr, name, rate, prop] of PREFIX_RANGES) {
    if (prefix >= lo && prefix <= hi) {
      return {
        state: name,
        abbr,
        stateIncomeTaxApprox: rate,
        propertyTaxApprox: prop ?? NATIONAL_AVERAGES.propertyTaxApprox,
        zip: digits,
      };
    }
  }
  return {
    state: 'Unknown',
    abbr: 'XX',
    stateIncomeTaxApprox: NATIONAL_AVERAGES.stateIncomeTaxApprox,
    propertyTaxApprox: NATIONAL_AVERAGES.propertyTaxApprox,
    zip: digits,
  };
}

export function formatZip(zip) {
  const digits = String(zip || '').replace(/\D/g, '').slice(0, 5);
  return digits;
}

/** Default annual property tax rate for a new home given ZIP (or national). */
export function defaultPropertyTaxRate(zip) {
  return stateFromZip(zip).propertyTaxApprox;
}
