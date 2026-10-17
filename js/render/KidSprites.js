/**
 * Child NPC sprites for the Decision Room, in the same small pixel-art style as the adult
 * sprites (Assets.js): 16-wide stamps, light from the upper left, hair and clothing colors
 * from the same palettes. Original art.
 *
 * Baby (age 0-3): 16×16, crawls on hands and knees. Four crawl frames per direction plus
 * a still pose (frame < 0).
 */
import { HAIR_COLORS, HAIR_SHADES, SHIRT_COLORS, SHIRT_SHADES, normalizeHairColor, normalizeShirtColor } from '../config.js';
import { playerTones } from './Assets.js';

export const BABY_SPRITE_W = 16;
export const BABY_SPRITE_H = 16;
export const BABY_FRAMES = 4;

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Tones for a kid: the adult ramps plus a diaper pair. */
function kidTones(hairColor, shirtColor) {
  const hairId = normalizeHairColor(hairColor);
  const shirtId = normalizeShirtColor(shirtColor);
  const pal = playerTones({
    hex: HAIR_COLORS[hairId],
    shade: HAIR_SHADES[hairId],
    shirt: { hex: SHIRT_COLORS[shirtId], shade: SHIRT_SHADES[shirtId] },
  }, 0);
  return { ...pal, W: '#f6f2e8', w: '#cfc6b2', m: pal.n };
}

function put(ctx, rows, ox, oy, pal, flip = false) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(flip ? BABY_SPRITE_W - 1 - (ox + x) : ox + x, oy + y, 1, 1);
    }
  }
}

// Crawl cycle: which hand reaches (l/r = 1 forward), which knee is up, and the body bob.
const CYCLE = [
  { l: 1, r: 0, kl: 0, kr: 1, bob: 0 },
  { l: 0, r: 0, kl: 0, kr: 0, bob: 1 },
  { l: 0, r: 1, kl: 1, kr: 0, bob: 0 },
  { l: 0, r: 0, kl: 0, kr: 0, bob: 1 },
];
const REST = { l: 0, r: 0, kl: 0, kr: 0, bob: 0 };

// Round head (about a third of the sprite, a little larger than an adult's proportion), a little hair on top.
const HEAD_FRONT = [
  '......hhhh......',
  '.....hHhhdh.....',
  '.....sSSSSs.....',
  '....sSeSSeSs....',
  '.....SSnnSs.....',
  '......ssss......',
];

const HEAD_BACK = [
  '......hhhh......',
  '.....hhHhhh.....',
  '....shddddhs....',
  '....shddddhs....',
  '.....hddddh.....',
  '......skks......',
];

function drawBabyDown(ctx, pal, c) {
  const by = c.bob;
  // Knees apart on the floor, little feet behind them.
  put(ctx, ['sSs', 'skk'], 2, 12 + c.kl - 1 + 1 - c.kl, pal);
  put(ctx, ['sSs', 'kks'], 11, 12 + c.kr - 1 + 1 - c.kr, pal);
  // Short torso and diaper.
  put(ctx, [
    '....cCCCCCCu....',
    '....cCccccuu....',
    '....WWWWWWww....',
    '....WWWWWwww....',
  ], 0, 9 - by + 1, pal);
  // Arms planted on the floor; the reaching hand sits one pixel further forward.
  put(ctx, ['cC', 'cc', 'ss', 'sk'], 2, 9 - by + 1 + 0, pal);
  put(ctx, ['uu', 'uu', 'ss', 'ks'], 12, 9 - by + 1 + 0, pal);
  put(ctx, ['ss'], 2, 13 + c.l, pal);
  put(ctx, ['ss'], 12, 13 + c.r, pal);
  put(ctx, HEAD_FRONT, 0, 4 - by, pal);
}

function drawBabyUp(ctx, pal, c) {
  const by = c.bob;
  // Soles of the feet at the back, big round diaper, short back.
  put(ctx, ['kk'], 4, 13 - c.kl, pal);
  put(ctx, ['kk'], 10, 13 - c.kr, pal);
  put(ctx, [
    '....uCCCCCCu....',
    '....cUUUUUUu....',
    '...WWWWWWWWw....',
    '...WWWWWWWww....',
    '....wWWWWwww....',
  ], 0, 8 - by + 1, pal);
  put(ctx, ['c', 'c'], 2, 9 - by + 1 + c.l, pal);
  put(ctx, ['u', 'u'], 13, 9 - by + 1 + c.r, pal);
  put(ctx, HEAD_BACK, 0, 3 - by, pal);
}

// Side view facing right: round head up front, a short torso sloping down to a big diaper,
// one arm propped straight down from the shoulder, bent knee on the floor with the sole of
// the foot up behind. Mirrored for left.
const HEAD_SIDE = [
  '........hhhh....',
  '.......hHhddh...',
  '.......hdsSSSs..',
  '.......hdsSeSs..',
  '.......hsSSnSs..',
  '........sssss...',
];

function drawBabySide(ctx, pal, c, flip) {
  const by = c.bob;
  // Far arm and far leg first (shaded).
  put(ctx, ['uu', 'uk', 'ss'], 9 + c.r, 9 - by + 1, pal, flip);
  put(ctx, ['kk', 'ks'], 6 + c.kr, 12 + 1 - c.kr, pal, flip);
  // Torso sloping down to the diaper.
  put(ctx, [
    '........ucCCCu..',
    '......ucCccccu..',
    '....WWwcCcccuu..',
    '...WWWWwccuuu...',
    '...wWWWwuu......',
  ], 0, 8 - by + 1, pal, flip);
  // Near leg: knee on the floor, shin back, sole of the foot up behind.
  put(ctx, ['sss', 'ssk'], 5 - c.kl, 12 + 1 - c.kl, pal, flip);
  put(ctx, ['kkk'], 2 - c.kl, 13 + 1 - c.kl, pal, flip);
  put(ctx, ['kk'], 2 - c.kl, 12 + 1 - c.kl, pal, flip);
  // Near arm: sleeve at the shoulder, straight down to a small hand (reaching = further out).
  put(ctx, ['cC', 'cc', 'ss', 'sk'], 10 + c.l, 9 - by + 1, pal, flip);
  put(ctx, HEAD_SIDE, 0, 3 - by, pal, flip);
}

/**
 * Crawling baby sprite.
 * @param {string} hairColor hair palette id
 * @param {string} shirtColor shirt palette id (the onesie)
 * @param {'down'|'up'|'left'|'right'} facing
 * @param {number} frame 0..3 crawl frame, or < 0 for the still pose
 */
export function makeBabySprite(hairColor = 'brown', shirtColor = 'sky', facing = 'down', frame = -1) {
  const hairId = normalizeHairColor(hairColor);
  const shirtId = normalizeShirtColor(shirtColor);
  const still = frame < 0;
  const f = still ? 0 : ((frame % BABY_FRAMES) + BABY_FRAMES) % BABY_FRAMES;
  const key = `baby-${hairId}-${shirtId}-${facing}-${still ? 's' : f}`;
  if (cache.has(key)) return cache.get(key);
  const cv = makeCanvas(BABY_SPRITE_W, BABY_SPRITE_H);
  const ctx = cv.getContext('2d');
  const pal = kidTones(hairId, shirtId);
  const c = still ? REST : CYCLE[f];
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(3, 14, 10, 2);
  if (facing === 'left' || facing === 'right') drawBabySide(ctx, pal, c, facing === 'left');
  else if (facing === 'up') drawBabyUp(ctx, pal, c);
  else drawBabyDown(ctx, pal, c);
  cache.set(key, cv);
  return cv;
}

/** Stable small hash of a string (FNV-1a) for seeding per-child looks. */
export function hashString(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Natural-leaning hair ids (the first eleven palette entries) for kids. */
const KID_HAIR_IDS = ['black', 'dark', 'brown', 'chestnut', 'auburn', 'red', 'copper', 'strawberry', 'blonde', 'platinum'];
const KID_SHIRT_IDS = ['sky', 'teal', 'green', 'mustard', 'orange', 'red', 'pink', 'purple', 'lavender', 'white', 'blue', 'olive'];

/**
 * Hair and clothing colors for a child, stable for the same seed (name + position) so they do
 * not change between visits. An explicit `hairColor` / `shirtColor` on the child wins.
 * @param {{name?:string,hairColor?:string,shirtColor?:string}} kid
 * @param {number} index position in the kids list
 */
export function kidLook(kid, index = 0) {
  const h = hashString(`${kid?.name ?? ''}|${index}`);
  const hair = kid?.hairColor && HAIR_COLORS[kid.hairColor] ? kid.hairColor : KID_HAIR_IDS[h % KID_HAIR_IDS.length];
  const shirt = kid?.shirtColor && SHIRT_COLORS[kid.shirtColor] ? kid.shirtColor : KID_SHIRT_IDS[(h >>> 8) % KID_SHIRT_IDS.length];
  return { hair, shirt };
}

// ---------------------------------------------------------------------------------------------
// Child (age 4-12): 16×17, about two-thirds of an adult's height, head about a third of it.
// Four directions, an idle pose, four walk frames and four (longer-stride) run frames.
// ---------------------------------------------------------------------------------------------

export const CHILD_SPRITE_W = 16;
export const CHILD_SPRITE_H = 17;
export const CHILD_FRAMES = 4;

/** Pants colors (mid tones); the ramp is derived like the adult pants. */
export const KID_PANTS = {
  navy: '#34406a',
  denim: '#4a6fa5',
  khaki: '#a8946a',
  olive: '#5e6a3a',
  brown: '#6a4a32',
  gray: '#6c6c76',
  black: '#2c2c34',
  plum: '#5c3a5c',
};
const KID_PANTS_IDS = Object.keys(KID_PANTS);

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

function childTones(look) {
  const pal = kidTones(look.hair, look.shirt);
  const pants = KID_PANTS[look.pants] || KID_PANTS.navy;
  return {
    ...pal,
    P: mix(pants, '#ffffff', 0.3),
    p: pants,
    q: mix(pants, '#000000', 0.4),
  };
}

// Heads (5 rows). Front: eyes on the third row; back: hair; side (facing right): face on the right.
const CH_FRONT = [
  '......hhhh......',
  '.....hHhhdh.....',
  '....sSeSSeSs....',
  '.....SSnnSs.....',
  '......ssss......',
];
const CH_BACK = [
  '......hhhh......',
  '.....hhHhhh.....',
  '....shddddhs....',
  '.....hddddh.....',
  '......skks......',
];
const CH_SIDE = [
  '......hhhh......',
  '.....hhHhdh.....',
  '.....hdsSeSs....',
  '.....hsSSSnS....',
  '......sssss.....',
];

// Pose per frame. bob lifts the body; ll/rl lift a foot; arm = which arm drops (-1 left, 1 right, 0 none).
const CHILD_WALK = [
  { bob: 0, ll: 0, rl: 1, arm: 1, st: -2, lift: 0 },
  { bob: -1, ll: 0, rl: 0, arm: 0, st: 0, lift: 1 },
  { bob: 0, ll: 1, rl: 0, arm: -1, st: 2, lift: 0 },
  { bob: -1, ll: 0, rl: 0, arm: 0, st: 0, lift: 1 },
];
const CHILD_RUN = [
  { bob: -1, ll: 0, rl: 2, arm: 2, st: -3, lift: 0 },
  { bob: 0, ll: 0, rl: 0, arm: 0, st: 0, lift: 2 },
  { bob: -1, ll: 2, rl: 0, arm: -2, st: 3, lift: 0 },
  { bob: 0, ll: 0, rl: 0, arm: 0, st: 0, lift: 2 },
];
const CHILD_IDLE = { bob: 0, ll: 0, rl: 0, arm: 0, st: 0, lift: 0 };

function childLeg(ctx, pal, x, y, lift, flip) {
  put(ctx, ['Ppq', 'ppq', 'qpq'], x, y, pal, flip);
  put(ctx, ['Ffz', 'zfz'], x, y + 3 - lift, pal, flip);
}

function drawChildFront(ctx, pal, pose, back, hairStyle) {
  const by = pose.bob;
  childLeg(ctx, pal, 5, 10 + by, pose.ll, false);
  childLeg(ctx, pal, 8, 10 + by, pose.rl, false);
  const shirt = back
    ? ['uCCCCC', 'cuUUUU', 'cuUUUU', 'ccuUUU', 'uuuuuU']
    : ['CCCCCC', 'CccccU', 'ccccuU', 'cccuuU', 'uuuuuU'];
  put(ctx, shirt, 5, 5 + by, pal);
  // Arms: sleeve two rows, then the hand; a swung arm drops one or two pixels.
  const dl = Math.max(0, pose.arm < 0 ? -pose.arm : 0);
  const dr = Math.max(0, pose.arm > 0 ? pose.arm : 0);
  put(ctx, back ? ['u', 'u', 's'] : ['C', 'c', 's'], 4, 5 + by + dl, pal);
  put(ctx, back ? ['c', 'u', 's'] : ['c', 'u', 's'], 11, 5 + by + dr, pal);
  if (hairStyle === 'long') {
    if (back) put(ctx, ['hddddh', 'hddddh', '.hddh.'], 5, 5 + by, pal);
    else for (let i = 0; i < 4; i++) { put(ctx, ['h'], 4, 2 + by + i, pal); put(ctx, ['d'], 11, 2 + by + i, pal); }
  }
  put(ctx, back ? CH_BACK : CH_FRONT, 0, by, pal);
}

function drawChildSide(ctx, pal, pose, flip, run, hairStyle) {
  const by = pose.bob;
  const lean = run ? 1 : 0;
  const near = pose.st;
  const far = -pose.st;
  // Far leg (behind), body, near leg, then the arm and head.
  put(ctx, ['Ppq', 'ppq', 'qpq'], 6 + far, 10 + by, pal, flip);
  put(ctx, ['Ffz', 'zfz'], 6 + far, 13 + by - (pose.rl ? 1 : 0), pal, flip);
  put(ctx, ['uCCCu', 'ucccu', 'ucccu', 'uccuu', 'uuuuu'], 5 + lean, 5 + by, pal, flip);
  put(ctx, ['Ppq', 'ppq', 'qpq'], 6 + near, 10 + by, pal, flip);
  put(ctx, ['Ffz', 'zfz'], 6 + near, 13 + by - (pose.ll ? 1 : 0), pal, flip);
  const swing = Math.round(-pose.st * (run ? 0.8 : 0.5));
  put(ctx, ['C', 'c', 's'], 8 + swing + lean, 5 + by, pal, flip);
  if (hairStyle === 'long') put(ctx, ['d', 'd', 'h', 'h'], 5 + lean, 3 + by, pal, flip);
  put(ctx, CH_SIDE, lean, by, pal, flip);
}

/**
 * Child sprite (age 4-12).
 * @param {{hair:string,shirt:string,pants?:string,hairStyle?:'short'|'long'}} look
 * @param {'down'|'up'|'left'|'right'} facing
 * @param {number} frame 0..3, or < 0 for the standing pose
 * @param {boolean} [run] longer-stride run frames
 */
export function makeChildSprite(look, facing = 'down', frame = -1, run = false) {
  const hair = normalizeHairColor(look.hair);
  const shirt = normalizeShirtColor(look.shirt);
  const pants = KID_PANTS[look.pants] ? look.pants : 'navy';
  const style = look.hairStyle === 'long' ? 'long' : 'short';
  const still = frame < 0;
  const f = still ? 0 : ((frame % CHILD_FRAMES) + CHILD_FRAMES) % CHILD_FRAMES;
  const key = `child-${hair}-${shirt}-${pants}-${style}-${facing}-${still ? 's' : `${run ? 'r' : 'w'}${f}`}`;
  if (cache.has(key)) return cache.get(key);
  const cv = makeCanvas(CHILD_SPRITE_W, CHILD_SPRITE_H);
  const ctx = cv.getContext('2d');
  const pal = childTones({ hair, shirt, pants });
  const pose = still ? CHILD_IDLE : (run ? CHILD_RUN : CHILD_WALK)[f];
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(4, 15, 8, 2);
  if (facing === 'left' || facing === 'right') drawChildSide(ctx, pal, pose, facing === 'left', run && !still, style);
  else drawChildFront(ctx, pal, pose, facing === 'up', style);
  cache.set(key, cv);
  return cv;
}

/** Pants and hair style for a child, stable per child (same seed as kidLook). */
export function childLook(kid, index = 0) {
  const base = kidLook(kid, index);
  const h = hashString(`${kid?.name ?? ''}|${index}|child`);
  return {
    ...base,
    pants: KID_PANTS[kid?.pantsColor] ? kid.pantsColor : KID_PANTS_IDS[h % KID_PANTS_IDS.length],
    hairStyle: kid?.hairLength === 'long' || kid?.hairLength === 'short' ? kid.hairLength : ((h >>> 9) % 2 ? 'long' : 'short'),
  };
}
