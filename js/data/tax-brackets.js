/** Federal rules: IRS Rev. Proc. 2025-32; future years are indexed projections. */
export const TAX_RULE_VERSION = 'irs-2026-1';
export const TAX_SOURCES = {
  federal: 'https://www.irs.gov/irb/2025-45_IRB',
  retirement: 'https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500',
  payroll: 'https://www.ssa.gov/oact/cola/cbb.html',
};
const RATES = [.10, .12, .22, .24, .32, .35, .37];
export const FEDERAL_BY_YEAR = {
  2025: { single: { std: 15750, caps: [11925,48475,103350,197300,250525,626350] },
    married: { std: 31500, caps: [23850,96950,206700,394600,501050,751600] },
    gains: { single: [48350,533400], married: [96700,600050] }, wageBase: 176100 },
  2026: { single: { std: 16100, caps: [12400,50400,105700,201775,256225,640600] },
    married: { std: 32200, caps: [24800,100800,211400,403550,512450,768700] },
    gains: { single: [49450,545500], married: [98900,613700] }, wageBase: 184500 },
};
export const FALLBACK_YEAR = 2026;
export function getFederalTable(year, inflation = .025, filing = 'single') {
  const married = filing === true || filing === 'married' || filing === 'mfj';
  const baseYear = year <= 2025 ? 2025 : 2026;
  const source = FEDERAL_BY_YEAR[baseYear];
  const f = (1 + inflation) ** (year - baseYear);
  const t = source[married ? 'married' : 'single'];
  return { stdDeduction: Math.round(t.std * f), brackets: [...t.caps, null].map((cap, i) =>
    ({ upTo: cap == null ? null : Math.round(cap * f), rate: RATES[i] })),
    gains: source.gains[married ? 'married' : 'single'].map(n => Math.round(n * f)),
    wageBase: Math.round(source.wageBase * f / 300) * 300,
    filing: married ? 'married' : 'single', baseYear, projected: !FEDERAL_BY_YEAR[year],
    ruleVersion: TAX_RULE_VERSION, source: TAX_SOURCES.federal };
}
