import { MARKET_DIFFICULTIES } from './finance/marketAssumptions.js';

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
export const GAME_VERSION = '0.7.5';

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

/**
 * The 16 hair colors offered for the player and the spouse, in picker order
 * (two rows of eight, dark to light, then the fantasy colors). This list is
 * the only source of hair colors. `dark`, `red` and `blonde` are the original
 * ids and keep their original hex, so older saves look the same.
 * Hexes are the mid tone; makePlayerSprite derives the highlight and shade.
 * `shade` (optional) is how far that shade tone mixes toward black
 * (default 0.55). The very light colors use less so they do not read as gray.
 * @type {{id:string,label:string,hex:string,shade?:number}[]}
 */
export const HAIR_PALETTE = [
  { id: 'black', label: 'Black', hex: '#24242e' },
  { id: 'dark', label: 'Dark Brown', hex: PALETTE.hairDark },
  { id: 'brown', label: 'Brown', hex: '#5c3a22' },
  { id: 'chestnut', label: 'Chestnut', hex: '#80482a' },
  { id: 'auburn', label: 'Auburn', hex: '#7a2c22' },
  { id: 'red', label: 'Red', hex: PALETTE.hairRed },
  { id: 'copper', label: 'Copper', hex: '#c4642c' },
  { id: 'strawberry', label: 'Strawberry Blonde', hex: '#dc8660' },
  { id: 'blonde', label: 'Blonde', hex: PALETTE.hairBlonde },
  { id: 'platinum', label: 'Platinum', hex: '#ece2bc', shade: 0.38 },
  { id: 'gray', label: 'Gray', hex: '#9c9ca4', shade: 0.45 },
  { id: 'white', label: 'White', hex: '#f4f4f0', shade: 0.3 },
  { id: 'blue', label: 'Blue', hex: '#3c64c8' },
  { id: 'green', label: 'Green', hex: '#3c9850' },
  { id: 'purple', label: 'Purple', hex: '#7c48b4' },
  { id: 'pink', label: 'Pink', hex: '#e874a8', shade: 0.48 },
];

/** Hair id → mid-tone hex. Unknown ids fall back to `dark` where used. */
export const HAIR_COLORS = Object.fromEntries(HAIR_PALETTE.map((c) => [c.id, c.hex]));

/** Hair id → shade mix toward black (see HAIR_PALETTE). */
export const HAIR_SHADES = Object.fromEntries(HAIR_PALETTE.map((c) => [c.id, c.shade ?? 0.55]));

/**
 * The 16 shirt colors for the player and the spouse, in picker order (two
 * rows of eight). `blue` is the original shirt (PALETTE.shirt) and the
 * default, so older saves look the same. Hexes are the mid tone; the sprite
 * derives a lit tone (toward white), a shade and a deep shade. `shade`
 * (optional) is the deep shade's mix toward black (default 0.55).
 * Navy is left out on purpose: it would vanish against the navy pants.
 * @type {{id:string,label:string,hex:string,shade?:number}[]}
 */
export const SHIRT_PALETTE = [
  { id: 'blue', label: 'Blue', hex: PALETTE.shirt },
  { id: 'sky', label: 'Sky Blue', hex: '#5ea4dc' },
  { id: 'teal', label: 'Teal', hex: '#2a8c88' },
  { id: 'green', label: 'Green', hex: '#3e9046' },
  { id: 'forest', label: 'Forest', hex: '#2e6038' },
  { id: 'olive', label: 'Olive', hex: '#7c7a36' },
  { id: 'mustard', label: 'Mustard', hex: '#c89c2c' },
  { id: 'orange', label: 'Orange', hex: '#d46c28' },
  { id: 'red', label: 'Red', hex: '#b43232' },
  { id: 'maroon', label: 'Maroon', hex: '#702634' },
  { id: 'pink', label: 'Pink', hex: '#dc74a0', shade: 0.5 },
  { id: 'purple', label: 'Purple', hex: '#6c469c' },
  { id: 'lavender', label: 'Lavender', hex: '#a892d4', shade: 0.48 },
  { id: 'white', label: 'White', hex: '#ece8de', shade: 0.4 },
  { id: 'gray', label: 'Gray', hex: '#808088' },
  { id: 'black', label: 'Black', hex: '#2a2a32' },
];

/** Default shirt id (the original blue shirt). */
export const DEFAULT_SHIRT = 'blue';

/** Shirt id → mid-tone hex. */
export const SHIRT_COLORS = Object.fromEntries(SHIRT_PALETTE.map((c) => [c.id, c.hex]));

/** Shirt id → deep-shade mix toward black (see SHIRT_PALETTE). */
export const SHIRT_SHADES = Object.fromEntries(SHIRT_PALETTE.map((c) => [c.id, c.shade ?? 0.55]));

/** Valid shirt id, or `fallback` (the blue shirt) when the id is unknown. */
export function normalizeShirtColor(id, fallback = DEFAULT_SHIRT) {
  return Object.prototype.hasOwnProperty.call(SHIRT_COLORS, id) ? id : fallback;
}

/** Valid hair id, or `fallback` when the id is not in HAIR_PALETTE. */
export function normalizeHairColor(id, fallback = 'dark') {
  return Object.prototype.hasOwnProperty.call(HAIR_COLORS, id) ? id : fallback;
}

/**
 * Difficulty packs from researched 2016–2025 averages (see marketAssumptions.js).
 * Legacy ids `easy` / `difficult` alias optimistic / grim.
 */
export const DIFFICULTIES = {
  optimistic: MARKET_DIFFICULTIES.optimistic,
  standard: MARKET_DIFFICULTIES.standard,
  grim: MARKET_DIFFICULTIES.grim,
  easy: MARKET_DIFFICULTIES.optimistic,
  difficult: MARKET_DIFFICULTIES.grim,
};

/**
 * Child costs ages 0–17 are state-based by ZIP: see js/data/stateChildCosts.js. College
 * (ages 18–21, Engine.js) defaults to state.annualCollegeCost, $28,000/year if unset.
 */

/** `taxRate` is informational only; Engine.buyHome always defaults new homes to 1.2% regardless of type. */
export const HOME_TYPES = {
  primary: { label: 'Primary Residence', taxRate: 0.012 },
  secondary: { label: 'Secondary / Vacation', taxRate: 0.014 },
  investment: { label: 'Investment Property', taxRate: 0.015 },
};

export const SAVE_KEY = 'ycitwy_saves_v2';
/** Player profiles (setup answers) — separate from game saves. */
export const PROFILE_KEY = 'ycitwy_profiles_v1';
export const MAX_AGE = 100;

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
  // Space is run only; it never confirms or interacts.
  confirm: ['Enter', 'z', 'Z', 'e', 'E'],
  /** Interact with doors, windows and tellers while walking. */
  interact: ['Enter'],
  cancel: ['Escape', 'x', 'X'],
};
/** Held Space while moving. Walk speed is unchanged when Space is up. */
export const RUN_MULTIPLIER = 1.8;
