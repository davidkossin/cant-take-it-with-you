/**
 * Curated static federal income-tax brackets by year.
 * Single filer tables stored; Married Filing Jointly ≈ 2× bracket tops + 2× std deduction.
 * Used offline. Hook for live IRS / Tax Foundation fetch is in Tax.js.
 *
 * Amounts are approximate historical / projected figures for gameplay.
 * Not tax advice. Documented for later API swap.
 */

/** @type {Record<number, { brackets: Array<{upTo:number|null, rate:number}>, stdDeduction: number }>} */
export const FEDERAL_BY_YEAR = {
  2020: {
    stdDeduction: 12400,
    brackets: [
      { upTo: 9875, rate: 0.10 },
      { upTo: 40125, rate: 0.12 },
      { upTo: 85525, rate: 0.22 },
      { upTo: 163300, rate: 0.24 },
      { upTo: 207350, rate: 0.32 },
      { upTo: 518400, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
  },
  2021: {
    stdDeduction: 12550,
    brackets: [
      { upTo: 9950, rate: 0.10 },
      { upTo: 40525, rate: 0.12 },
      { upTo: 86375, rate: 0.22 },
      { upTo: 164925, rate: 0.24 },
      { upTo: 209425, rate: 0.32 },
      { upTo: 523600, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
  },
  2022: {
    stdDeduction: 12950,
    brackets: [
      { upTo: 10275, rate: 0.10 },
      { upTo: 41775, rate: 0.12 },
      { upTo: 89075, rate: 0.22 },
      { upTo: 170050, rate: 0.24 },
      { upTo: 215950, rate: 0.32 },
      { upTo: 539900, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
  },
  2023: {
    stdDeduction: 13850,
    brackets: [
      { upTo: 11000, rate: 0.10 },
      { upTo: 44725, rate: 0.12 },
      { upTo: 95375, rate: 0.22 },
      { upTo: 182100, rate: 0.24 },
      { upTo: 231250, rate: 0.32 },
      { upTo: 578125, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
  },
  2024: {
    stdDeduction: 14600,
    brackets: [
      { upTo: 11600, rate: 0.10 },
      { upTo: 47150, rate: 0.12 },
      { upTo: 100525, rate: 0.22 },
      { upTo: 191950, rate: 0.24 },
      { upTo: 243725, rate: 0.32 },
      { upTo: 609350, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
  },
  2025: {
    stdDeduction: 15000,
    brackets: [
      { upTo: 11925, rate: 0.10 },
      { upTo: 48475, rate: 0.12 },
      { upTo: 103350, rate: 0.22 },
      { upTo: 197300, rate: 0.24 },
      { upTo: 250525, rate: 0.32 },
      { upTo: 626350, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
  },
  2026: {
    stdDeduction: 15750,
    brackets: [
      { upTo: 12400, rate: 0.10 },
      { upTo: 50400, rate: 0.12 },
      { upTo: 107550, rate: 0.22 },
      { upTo: 205350, rate: 0.24 },
      { upTo: 260800, rate: 0.32 },
      { upTo: 652050, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
  },
};

/** Fallback when year is outside curated table — inflate from nearest known year. */
export const FALLBACK_YEAR = 2026;

/**
 * Get federal table for a calendar year, inflating brackets if needed.
 * @param {number} year
 * @param {number} [inflation=0.025]
 * @param {'single'|'married'|boolean} [filing='single']
 *   true / 'married' → Married Filing Jointly (≈ double single tops + std deduction)
 */
export function getFederalTable(year, inflation = 0.025, filing = 'single') {
  const years = Object.keys(FEDERAL_BY_YEAR).map(Number).sort((a, b) => a - b);
  let baseYear = FALLBACK_YEAR;
  if (FEDERAL_BY_YEAR[year]) baseYear = year;
  else if (year < years[0]) baseYear = years[0];
  else if (year > years[years.length - 1]) baseYear = years[years.length - 1];
  else {
    baseYear = years.filter((y) => y <= year).pop() || FALLBACK_YEAR;
  }

  const base = FEDERAL_BY_YEAR[baseYear];
  const yearsDiff = year - baseYear;
  const factor = yearsDiff === 0 ? 1 : Math.pow(1 + inflation, yearsDiff);
  let table = {
    stdDeduction: Math.round(base.stdDeduction * factor),
    brackets: base.brackets.map((b) => ({
      upTo: b.upTo == null ? null : Math.round(b.upTo * factor),
      rate: b.rate,
    })),
    filing: 'single',
  };

  const married = filing === true || filing === 'married' || filing === 'mfj';
  if (married) {
    table = {
      stdDeduction: Math.round(table.stdDeduction * 2),
      brackets: table.brackets.map((b) => ({
        upTo: b.upTo == null ? null : Math.round(b.upTo * 2),
        rate: b.rate,
      })),
      filing: 'married',
    };
  }
  return table;
}
