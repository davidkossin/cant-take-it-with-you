/** Game-wide constants and LTTP-inspired palette. */

export const TILE = 16;
export const SCALE = 3;
/**
 * Internal frame is exactly 1920×1080. The 16px tile world is integer-scaled
 * (WORLD_SCALE) into the playfield under the HUD. HUD, text, charts, and menus
 * are drawn in frame pixels so they stay sharp.
 */
export const FRAME_W = 1920;
export const FRAME_H = 1080;
export const WORLD_SCALE = 4;
/** HUD band in frame pixels, above the playfield. 120 + 240×4 = 1080. */
export const HUD_H = 120;
/** World pixels. 480×240 tiles fill the 1920×960 playfield at WORLD_SCALE. */
export const VIEW_W = FRAME_W / WORLD_SCALE;
export const VIEW_H = (FRAME_H - HUD_H) / WORLD_SCALE;
export const CANVAS_W = FRAME_W;
export const CANVAS_H = FRAME_H;

/** Bump on each published build so players can confirm cache. */
export const GAME_VERSION = '0.5.18';

export const PALETTE = {
  bg: '#1a1420',
  floor: '#5a4a3a',
  floorLight: '#6b5a48',
  floorDark: '#3d3228',
  wall: '#4a3c2e',
  wallEdge: '#2a2218',
  wood: '#8b6914',
  woodDark: '#5c4510',
  grass: '#4a6b3a',
  grassDark: '#2f4a28',
  stone: '#6a6a72',
  stoneDark: '#3a3a42',
  gold: '#d4a84b',
  goldDark: '#8a6830',
  uiBg: '#181818',
  uiBorder: '#e8d8a0',
  uiBorderDark: '#887848',
  uiText: '#f0e8c8',
  uiShadow: '#000000',
  accent: '#c8a050',
  danger: '#c04040',
  lamp: '#ffcc66',
  lampGlow: '#ffaa22',
  skin: '#e8b878',
  skinDark: '#c09058',
  shirt: '#3868a0',
  pants: '#2a3a58',
  hairDark: '#2a1a10',
  hairBlonde: '#d4b060',
  hairRed: '#a03828',
  hairGray: '#a0a0a8',
  /** Dark purple stippled void (LTTP dungeon exterior) */
  void: '#2a1840',
  voidDot: '#1a0e28',
  voidDeep: '#140818',
  wallPurple: '#3a2a48',
  wallPurpleEdge: '#1e1428',
  wallPurpleLite: '#4a3a58',
};

export const HAIR_COLORS = {
  dark: PALETTE.hairDark,
  blonde: PALETTE.hairBlonde,
  red: PALETTE.hairRed,
};

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'Easy',
    subtext: 'The world becomes a better place for all',
    inflation: 0.02,
    equityReturn: 0.09,
    salaryGrowth: 0.04,
    expensePressure: 0.9,
    taxMult: 0.9,
    collegeCost: 18000,
    shockChance: 0.02,
    shockMax: 5000,
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    subtext: 'The world stays relatively stable',
    inflation: 0.025,
    equityReturn: 0.07,
    salaryGrowth: 0.03,
    expensePressure: 1.0,
    taxMult: 1.0,
    collegeCost: 25000,
    shockChance: 0.04,
    shockMax: 8000,
  },
  difficult: {
    id: 'difficult',
    label: 'Difficult',
    subtext: 'A grim outlook — life gets harder for everyone',
    inflation: 0.035,
    equityReturn: 0.045,
    salaryGrowth: 0.02,
    expensePressure: 1.2,
    taxMult: 1.1,
    collegeCost: 35000,
    shockChance: 0.07,
    shockMax: 12000,
  },
};

/** USDA-style annual child cost bands (2020s USD, pre-pressure / pre-inflation). */
export const CHILD_COST_BANDS = [
  { maxAge: 5, annual: 13500 },
  { maxAge: 12, annual: 14500 },
  { maxAge: 17, annual: 16000 },
  // 18+: college tuition via NATIONAL_AVG_COLLEGE_COST (not double-counted here)
];

/**
 * College Board *Trends in College Pricing* 2024–25:
 * average published tuition & fees for full-time in-state undergraduates
 * at public four-year institutions ≈ $11,610 (sticker price; excludes room/board/aid).
 * Scaled in-engine by difficulty.expensePressure and inflated with childCostInflator.
 */
export const NATIONAL_AVG_COLLEGE_COST = 11610;
/** Inclusive undergrad window (typical 4 years). */
export const COLLEGE_AGE_MIN = 18;
export const COLLEGE_AGE_MAX = 21;

export const HOME_TYPES = {
  primary: { label: 'Primary Residence', taxRate: 0.012 },
  secondary: { label: 'Secondary / Vacation', taxRate: 0.014 },
  investment: { label: 'Investment Property', taxRate: 0.015 },
};

export const SAVE_KEY = 'ycitwy_saves_v2';
/** Player profiles (setup answers) — separate from game saves. */
export const PROFILE_KEY = 'ycitwy_profiles_v1';
export const MAX_AGE = 100;
export const RETIREMENT_AGE = 65;
/** Simplified long-term federal capital gains rate (illustrative). */
export const LTCG_FEDERAL_RATE = 0.15;

/**
 * IRS elective deferral limit (employee 401(k) contributions), tax year 2025.
 * Catch-up contributions for age 50+ are not modeled in this pass.
 */
export const K401_EMPLOYEE_LIMIT = 23500;

/**
 * HELOC combined LTV (CLTV) underwriting rule of thumb: max (new+existing) HELOC
 * principal ≤ max(0, HELOC_CLTV * homeValue − mortgage).
 */
export const HELOC_CLTV = 0.80;

/**
 * Securities-backed / pledged-asset line advance rate against taxable brokerage
 * (stocksTotal only — not 401(k)). Maintenance: if principal > SB_LTV * stocks, margin call.
 */
export const SB_LTV = 0.50;

/**
 * Default HELOC APR — mid-2020s US prime (~7.5–8.5%) + typical bank margin.
 * Player may adjust within HELOC_RATE_MIN..HELOC_RATE_MAX in the Borrow dialog.
 */
export const HELOC_DEFAULT_RATE = 0.085;
export const HELOC_RATE_MIN = 0.06;
export const HELOC_RATE_MAX = 0.12;

/**
 * Default securities-backed loan APR — typically below HELOC (brokerage pledged lines).
 * Mid-2020s spirit ~6.5–7.5%; adjustable within band.
 */
export const SECURITIES_LOAN_DEFAULT_RATE = 0.07;
export const SECURITIES_LOAN_RATE_MIN = 0.055;
export const SECURITIES_LOAN_RATE_MAX = 0.09;

export const CURRENT_YEAR = new Date().getFullYear();

export const KEYS = {
  up: ['ArrowUp', 'w', 'W'],
  down: ['ArrowDown', 's', 'S'],
  left: ['ArrowLeft', 'a', 'A'],
  right: ['ArrowRight', 'd', 'D'],
  confirm: ['Enter', ' ', 'z', 'Z', 'e', 'E'],
  cancel: ['Escape', 'x', 'X'],
};
/** Held Space while moving. Walk speed is unchanged when Space is up. */
export const RUN_MULTIPLIER = 1.8;
