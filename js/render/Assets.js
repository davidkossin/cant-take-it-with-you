/**
 * Procedural LTTP-inspired pixel sprites (canvas → Image / pattern).
 * No Nintendo assets — original tiny sprites in muted earthy palette.
 */

import {
  PALETTE, HAIR_COLORS, HAIR_SHADES, SHIRT_COLORS, SHIRT_SHADES, TILE,
  normalizeHairColor, normalizeShirtColor,
} from '../config.js';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function px(ctx, x, y, color, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Sprite ramp inputs for a shirt id (unknown ids get the default blue). */
function shirtBase(shirtColor) {
  const id = normalizeShirtColor(shirtColor);
  return { hex: SHIRT_COLORS[id], shade: SHIRT_SHADES[id] };
}

/**
 * 16×24 original player. Eight walk frames per direction.
 * Shaded hair, face, shirt, and legs. Body lifts on the passing poses;
 * the hair lags a pixel behind that lift.
 * @param {'down'|'up'|'left'|'right'} facing
 * @param {number} frame 0..7
 */
export function makePlayerSprite(
  hairColor = 'dark',
  hairLength = 'short',
  gray = 0,
  facing = 'down',
  frame = 0,
  shirtColor = 'blue'
) {
  const shirtId = normalizeShirtColor(shirtColor);
  const key = `player-${hairColor}-${hairLength}-${shirtId}-${gray.toFixed(2)}-${facing}-${frame}`;
  if (cache.has(key)) return cache.get(key);

  const c = canvas(16, 24);
  const ctx = c.getContext('2d');
  const hairId = normalizeHairColor(hairColor);
  const base = { hex: HAIR_COLORS[hairId], shade: HAIR_SHADES[hairId], shirt: shirtBase(shirtId) };
  const standing = frame < 0;
  const f = standing ? 0 : ((frame % 8) + 8) % 8;
  const white = Math.max(0, Math.min(1, Number.isFinite(gray) ? gray : 0));
  // Shadow stays on the ground so the step reads as a lift, not a slide.
  px(ctx, 4, 22, 'rgba(0,0,0,0.35)', 8, 2);

  if (facing === 'left' || facing === 'right') {
    drawSide(ctx, base, hairLength, f, facing === 'left', standing, white);
  } else if (facing === 'up') {
    drawUp(ctx, base, hairLength, f, standing, white);
  } else {
    drawDown(ctx, base, hairLength, f, standing, white);
  }

  cache.set(key, c);
  return c;
}

function standPose() {
  return { bob: 0, hair: 0, sway: 0, lx: 0, rx: 0, ll: 0, rl: 0, arm: 0 };
}

function walkPose(f) {
  // Eight distinct steps. bob lifts the body; hair is offset from that
  // so it rises a frame late and settles a frame late. lx/rx shift the
  // left and right feet. ll/rl lift a foot. arm swings the opposite way.
  return [
    { bob:  0, hair:  0, sway:  0, lx: -1, rx:  1, ll: 0, rl: 1, arm:  1 },
    { bob: -1, hair:  0, sway:  0, lx: -1, rx:  0, ll: 0, rl: 1, arm:  1 },
    { bob: -1, hair: -1, sway:  1, lx:  0, rx:  0, ll: 1, rl: 0, arm:  0 },
    { bob:  0, hair: -1, sway:  0, lx:  1, rx: -1, ll: 1, rl: 0, arm: -1 },
    { bob:  0, hair:  0, sway:  0, lx:  1, rx: -1, ll: 1, rl: 0, arm: -1 },
    { bob: -1, hair:  0, sway:  0, lx:  0, rx: -1, ll: 1, rl: 0, arm: -1 },
    { bob: -1, hair: -1, sway: -1, lx:  0, rx:  0, ll: 0, rl: 1, arm:  0 },
    { bob:  0, hair: -1, sway:  0, lx: -1, rx:  1, ll: 0, rl: 1, arm:  1 },
  ][f];
}

/**
 * Highlight / mid / shade ramps. Light comes from the upper left.
 * `white` is 0 at age 50 and below, 1 at age 100. It tints hair pixels only
 * (H / h / d). The old sprite mixed the flat hair color toward gray, then
 * this ramp mixed the dark hair pixels back toward black, so the white never
 * showed. The black mix eases off as `white` rises.
 * `hair` is `{ hex, shade?, shirt?: { hex, shade? } }`; the shirt defaults to
 * the original blue (PALETTE.shirt).
 */
function playerTones(hair, white = 0) {
  const t = Math.max(0, Math.min(1, white));
  const aged = mixHex(hair.hex, '#ffffff', t);
  const shade = (hair.shade ?? 0.55) * (1 - t) + 0.07 * t;
  const shirt = hair.shirt || { hex: PALETTE.shirt, shade: 0.55 };
  const lift = 0.28 * (1 - t) + 0.02 * t;
  const mid = 0.1 * (1 - t);
  return {
    H: mixHex(aged, '#ffffff', lift),
    h: mixHex(aged, '#ffffff', mid),
    d: mixHex(aged, '#000000', shade),
    S: '#f8dcb8',
    s: '#e8b878',
    k: '#c09058',
    n: '#8d5c38',
    e: '#241810',
    C: mixHex(shirt.hex, '#ffffff', 0.5),
    c: shirt.hex,
    u: mixHex(shirt.hex, '#061018', 0.32),
    U: mixHex(shirt.hex, '#000000', shirt.shade ?? 0.55),
    P: mixHex(PALETTE.pants, '#ffffff', 0.38),
    p: PALETTE.pants,
    q: mixHex(PALETTE.pants, '#000000', 0.45),
    G: '#f0d48a',
    g: PALETTE.goldDark,
    F: '#b09880',
    f: '#4a382c',
    z: '#1c140e',
  };
}

/**
 * Highlight / mid / shade of a hair color exactly as the sprite draws it
 * (no aging), for the hair palette swatches.
 * @returns {{light:string, mid:string, shade:string}}
 */
export function hairTones(hairColor) {
  const id = normalizeHairColor(hairColor);
  const pal = playerTones({ hex: HAIR_COLORS[id], shade: HAIR_SHADES[id] }, 0);
  return { light: pal.H, mid: pal.h, shade: pal.d };
}

/**
 * Lit / mid / deep-shade tones of a shirt color as the sprite draws it,
 * for the shirt palette swatches.
 * @returns {{light:string, mid:string, shade:string}}
 */
export function shirtTones(shirtColor) {
  const pal = playerTones({ hex: HAIR_COLORS.dark, shirt: shirtBase(shirtColor) }, 0);
  return { light: pal.C, mid: pal.c, shade: pal.U };
}

function blit(ctx, rows, ox, oy, pal) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      px(ctx, ox + x, oy + y, pal[ch]);
    }
  }
}

function blitCols(ctx, rows, ox, oy, pal) {
  blit(ctx, rows, ox, oy, pal);
}

/** Round leg: light on the left, shade on the right, shoe with a top highlight. */
function drawLeg(ctx, pal, x, y, lift) {
  blit(ctx, ['Ppq', 'Ppq', 'ppq', 'qpq'], x, y, pal);
  blit(ctx, ['Ffz', 'zfz'], x, y + 4 - lift, pal);
}

function drawArms(ctx, pal, sx, y, arm, back) {
  const dropL = arm < 0 ? 1 : 0;
  const dropR = arm > 0 ? 1 : 0;
  const left = back ? ['uc', 'uu', 'uu', 'sk'] : ['sC', 'sc', 'su', 'sk'];
  const right = back ? ['cu', 'uu', 'uu', 'ks'] : ['Cc', 'cu', 'uU', 'ks'];
  // A sleeve pixel stays on the shoulder so a swung arm does not detach.
  if (dropL) px(ctx, sx + 3, y, pal.u);
  if (dropR) px(ctx, sx + 12, y, pal.u);
  blitCols(ctx, left, sx + 2, y + dropL, pal);
  blitCols(ctx, right, sx + 12, y + dropR, pal);
}

function drawDown(ctx, hair, hairLength, f, standing, white = 0) {
  const p = standing ? standPose() : walkPose(f);
  const pal = playerTones(hair, white);
  const sx = p.sway;
  const by = p.bob;
  drawLeg(ctx, pal, 4 + sx + p.lx, 16 + by, p.ll);
  drawLeg(ctx, pal, 9 + sx + p.rx, 16 + by, p.rl);
  blit(ctx, [
    '....uCCCCCCu....',
    '....cCUUUUCc....',
    '....cCuuuuCc....',
    '....ucuUUUcu....',
    '....ugGGGGgu....',
    '....uggggggu....',
  ], sx, 10 + by, pal);
  drawArms(ctx, pal, sx, 11 + by, p.arm, false);
  // Face under the bangs. Cheek highlight upper-left, shade under the eyes.
  blit(ctx, [
    '...hdssSSssdh...',
    '...h.se..es.h...',
    '....dsknnksd....',
    '....hss.mssh....',
    '.....ssssss.....',
    '......skks......',
  ], sx, 5 + by, pal);
  if (hairLength === 'long') {
    for (let i = 0; i < 7; i++) {
      px(ctx, sx + 2, 6 + by + i, pal.h);
      px(ctx, sx + 3, 6 + by + i, pal.d);
      px(ctx, sx + 12, 6 + by + i, pal.d);
      px(ctx, sx + 13, 6 + by + i, pal.d);
    }
  }
  // Bangs and crown. hair < 0 lifts this a pixel after the face has settled.
  blit(ctx, [
    '.......H........',
    '....hhhhhhh.....',
    '...hddddddddh...',
    '..hh..dddd..hh..',
  ], sx, 2 + by + p.hair, pal);
}

function drawUp(ctx, hair, hairLength, f, standing, white = 0) {
  const p = standing ? standPose() : walkPose(f);
  const pal = playerTones(hair, white);
  const sx = p.sway;
  const by = p.bob;
  drawLeg(ctx, pal, 4 + sx + p.lx, 16 + by, p.ll);
  drawLeg(ctx, pal, 9 + sx + p.rx, 16 + by, p.rl);
  // Back of the shirt: lit shoulders, a darker spine, waist in shade.
  blit(ctx, [
    '..uuCCCCCCCCCuu.',
    '.s.cuUUUUUUUuc.s',
    '..s.cuUUUUUuc.s.',
    '...ucuUUUUUcu...',
    '....ugGGGGggu...',
    '....ugggggggu...',
  ], sx, 10 + by, pal);
  drawArms(ctx, pal, sx, 11 + by, p.arm, true);
  if (hairLength === 'long') {
    blit(ctx, [
      '....hhHHHHh.....',
      '...hddddddddh...',
      '....hddddddh....',
      '.....hddddh.....',
      '......hddh......',
    ], sx, 10 + by, pal);
  }
  // Ears, neck, and the back of the skull. Not a solid hair block.
  blit(ctx, [
    '....dddddddd....',
    '..s.dddddddd.s..',
    '..skddddddddks..',
    '...kdddddddk....',
    '.....sskkss.....',
  ], sx, 5 + by, pal);
  blit(ctx, [
    '......hh........',
    '....hhHHHhh.....',
    '...hddddddddh...',
    '..hddhhhhhhddh..',
  ], sx, 2 + by + p.hair, pal);
}

function drawSide(ctx, hair, hairLength, f, flip, standing, white = 0) {
  const p = standing ? standPose() : walkPose(f);
  const pal = playerTones(hair, white);
  const y = p.bob;
  const stride = standing ? 0 : [-1, -2, 0, 1, 2, 1, 0, -1][f];
  const rear = standing ? 0 : [1, 0, 0, -1, -1, -2, 0, 1][f];
  const frontUp = standing ? 0 : [0, 1, 1, 0, 0, 1, 0, 0][f];
  const rearUp = standing ? 0 : [1, 0, 0, 1, 1, 0, 1, 1][f];
  // Facing right in this stamp. flip mirrors x so the lit side stays the face.
  const put = (rows, ox, oy) => {
    for (let ry = 0; ry < rows.length; ry++) {
      const row = rows[ry];
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        if (ch === '.' || ch === ' ') continue;
        const x = ox + rx;
        px(ctx, flip ? 15 - x : x, oy + ry, pal[ch]);
      }
    }
  };
  const leg = ['qpP', 'qpP', 'qpP', 'qpq'];
  const shoe = ['zfF', 'zfz'];
  put(leg, 3 + rear, 16 + y);
  put(shoe, 3 + rear, 20 + y - rearUp);
  put(leg, 7 + stride, 16 + y);
  put(shoe, 7 + stride, 20 + y - frontUp);
  put([
    '....ucCCCC......',
    '...sucUUCC......',
    '...s.cuuUC......',
    '....u.uuuC......',
    '....uggGGG......',
    '....uggggg......',
  ], 0, 10 + y);
  // Near arm, in front of the chest, hand at the bottom.
  const armDrop = stride < 0 ? 1 : 0;
  put(['C', 'c', 'u', 's'], 9, 11 + y + armDrop);
  if (armDrop) put(['u'], 8, 11 + y);
  put([
    '...hddssSS......',
    '...sdds.eS......',
    '...hddsssn......',
    '....hdssmk......',
    '.....dskk.......',
  ], 0, 5 + y);
  if (hairLength === 'long') {
    put([
      'd...............',
      'd...............',
      'h...............',
      'h...............',
      'd...............',
      'd...............',
    ], 3, 7 + y);
  }
  put([
    '.....hhH........',
    '....hhhhh.......',
    '...hdddddh......',
    '..hhdddddd......',
  ], 0, 2 + y + p.hair);
}

export function makeTile(type) {
  const key = `tile-${type}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(TILE, TILE);
  const ctx = c.getContext('2d');

  if (type === 'floor') {
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y += 2) {
      for (let x = (y / 2) % 2; x < 16; x += 2) {
        px(ctx, x, y, PALETTE.floorDark);
      }
    }
    px(ctx, 3, 5, PALETTE.floorLight);
    px(ctx, 11, 10, PALETTE.floorLight);
  } else if (type === 'wall') {
    ctx.fillStyle = PALETTE.wall;
    ctx.fillRect(0, 0, 16, 16);
    px(ctx, 0, 0, PALETTE.wallEdge, 16, 2);
    px(ctx, 0, 14, PALETTE.wallEdge, 16, 2);
    px(ctx, 2, 4, PALETTE.floorLight, 3, 2);
    px(ctx, 10, 8, PALETTE.floorDark, 4, 2);
  } else if (type === 'wallPurple') {
    // Cool blue-gray brick, not warm brown.
    ctx.fillStyle = '#3e4c5c';
    ctx.fillRect(0, 0, 16, 16);
    px(ctx, 0, 0, '#2a3442', 16, 1);
    px(ctx, 0, 8, '#2a3442', 16, 1);
    px(ctx, 0, 0, '#2a3442', 1, 8);
    px(ctx, 8, 8, '#2a3442', 1, 8);
    px(ctx, 1, 1, '#5c6d80', 6, 1);
    px(ctx, 9, 9, '#526378', 6, 1);
    px(ctx, 4, 4, '#2c3848', 2, 2);
    px(ctx, 12, 12, '#2c3848', 2, 1);
  } else if (type === 'plank') {
    // Horizontal boards, grain, one nail per board (second floor sample).
    const boards = ['#a67b4e', '#8f6840', '#b89062', '#7c5a38'];
    for (let i = 0; i < 4; i++) {
      const y = i * 4;
      px(ctx, 0, y, boards[i], 16, 3);
      px(ctx, 0, y + 3, '#4a321c', 16, 1);
      px(ctx, 2, y + 1, '#3a2814');
      px(ctx, 3, y + 1, '#e4c89a');
      px(ctx, 7 + (i % 3), y + 1, '#6a482c', 3, 1);
      if (i % 2 === 0) px(ctx, 12, y + 2, '#c4a070', 2, 1);
    }
  } else if (type === 'void') {
    ctx.fillStyle = '#121a2a';
    ctx.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = (y % 2); x < 16; x += 2) {
        px(ctx, x, y, '#0c121c');
      }
    }
    px(ctx, 3, 7, '#080c14');
    px(ctx, 11, 2, '#080c14');
    px(ctx, 8, 13, '#1c2838');
  } else if (type === 'wood') {
    ctx.fillStyle = PALETTE.wood;
    ctx.fillRect(0, 0, 16, 16);
    px(ctx, 0, 4, PALETTE.woodDark, 16, 1);
    px(ctx, 0, 10, PALETTE.woodDark, 16, 1);
    px(ctx, 7, 0, PALETTE.woodDark, 1, 16);
  } else if (type === 'grass') {
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 8; i++) {
      px(ctx, (i * 5) % 16, (i * 7) % 16, PALETTE.grassDark, 1, 2);
    }
  } else if (type === 'stone') {
    // Cool blue-gray flagstone. Mortar is darker, not warm.
    ctx.fillStyle = '#6a7888';
    ctx.fillRect(0, 0, 16, 16);
    px(ctx, 0, 0, '#3a4554', 16, 1);
    px(ctx, 0, 8, '#3a4554', 16, 1);
    px(ctx, 0, 0, '#3a4554', 1, 8);
    px(ctx, 8, 8, '#3a4554', 1, 8);
    px(ctx, 1, 1, '#7e8c9c', 6, 2);
    px(ctx, 9, 9, '#8494a4', 6, 2);
    px(ctx, 3, 4, '#556270', 2, 2);
    px(ctx, 11, 12, '#556270', 2, 1);
  } else if (type === 'carpet') {
    ctx.fillStyle = '#5a3040';
    ctx.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y += 2) {
      for (let x = (y / 2) % 2; x < 16; x += 2) {
        px(ctx, x, y, '#4a2434');
      }
    }
    px(ctx, 0, 0, '#8a5060', 16, 1);
    px(ctx, 0, 15, '#8a5060', 16, 1);
  } else {
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, 16, 16);
  }

  cache.set(key, c);
  return c;
}

/**
 * Top-down door, flush in the wall. 'h' is a north/south wall (wide),
 * 'v' is an east/west wall (tall). Wood planks, two iron straps, round handle, stone frame.
 * @param {'h'|'v'} facing
 */
export function makeInWallDoor(facing = 'v') {
  const key = `inwall-door-${facing}`;
  if (cache.has(key)) return cache.get(key);
  const w = facing === 'h' ? 32 : 16;
  const h = facing === 'h' ? 16 : 26;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  px(ctx, 0, 0, '#8d98a6', w, h);
  px(ctx, 1, 1, '#5c6774', w - 2, h - 2);
  px(ctx, 2, 2, '#c8d0da', w - 4, 1);
  const ix = 3;
  const iy = 3;
  const iw = w - 6;
  const ih = h - 6;
  px(ctx, ix, iy, '#6b4a2c', iw, ih);
  if (facing === 'h') {
    for (let x = ix; x < ix + iw; x += 3) px(ctx, x, iy, '#4a3218', 1, ih);
    px(ctx, ix, iy + 3, '#3a3e46', 8, 2);
    px(ctx, ix, iy + ih - 5, '#3a3e46', 8, 2);
    px(ctx, ix + 7, iy + 3, '#6a7078', 2, 2);
    px(ctx, ix + 7, iy + ih - 5, '#6a7078', 2, 2);
    px(ctx, ix + iw - 5, iy + Math.floor(ih / 2) - 1, '#d8dce2', 3, 3);
    px(ctx, ix + iw - 4, iy + Math.floor(ih / 2), '#2a2e34', 1, 1);
  } else {
    for (let x = ix; x < ix + iw; x += 3) px(ctx, x, iy, '#4a3218', 1, ih);
    px(ctx, ix, iy + 3, '#3a3e46', iw - 4, 2);
    px(ctx, ix, iy + ih - 6, '#3a3e46', iw - 4, 2);
    px(ctx, ix + iw - 6, iy + 3, '#6a7078', 2, 2);
    px(ctx, ix + iw - 6, iy + ih - 6, '#6a7078', 2, 2);
    const hy = iy + Math.floor(ih / 2) - 1;
    px(ctx, ix + iw - 4, hy, '#d8dce2', 3, 3);
    px(ctx, ix + iw - 3, hy + 1, '#2a2e34', 1, 1);
  }
  cache.set(key, c);
  return c;
}

export function makeDoor(frame = true) {
  return makeInWallDoor(frame ? 'v' : 'h');
}

/** Burgundy field, gold border, center medallion, drop shadow. Logical pixels. */
export function makeRug(w, h) {
  const key = `rug-${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w + 4, h + 4);
  const ctx = c.getContext('2d');
  px(ctx, 3, 3, '#1a100c', w, h);
  px(ctx, 0, 0, '#6a1828', w, h);
  px(ctx, 2, 2, '#8a2030', w - 4, h - 4);
  px(ctx, 4, 4, '#c6a24a', w - 8, h - 8);
  px(ctx, 6, 6, '#7a1c2c', w - 12, h - 12);
  px(ctx, 8, 8, '#9a3040', w - 16, h - 16);
  // border ticks
  for (let x = 8; x < w - 10; x += 6) {
    px(ctx, x, 4, '#e6c86a', 3, 2);
    px(ctx, x, h - 6, '#e6c86a', 3, 2);
    px(ctx, x + 3, 5, '#6a1828', 1, 1);
  }
  for (let y = 8; y < h - 10; y += 6) {
    px(ctx, 4, y, '#e6c86a', 2, 3);
    px(ctx, w - 6, y, '#e6c86a', 2, 3);
  }
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  // diamond medallion
  const ring = [
    [0, -8], [3, -6], [6, -3], [8, 0], [6, 3], [3, 6], [0, 8],
    [-3, 6], [-6, 3], [-8, 0], [-6, -3], [-3, -6],
  ];
  for (const [dx, dy] of ring) px(ctx, cx + dx, cy + dy, '#e6c86a', 2, 2);
  px(ctx, cx - 3, cy - 3, '#c6a24a', 6, 6);
  px(ctx, cx - 1, cy - 1, '#7a1c2c', 3, 3);
  px(ctx, cx, cy, '#f0d78a', 1, 1);
  cache.set(key, c);
  return c;
}

/** @param {'pillar'|'plant'|'sconce'|'bracket'} kind */
export function makeCornerDecor(kind) {
  const key = `decor-${kind}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(18, 18);
  const ctx = c.getContext('2d');
  if (kind === 'pillar') {
    px(ctx, 3, 14, '#1a1e24', 12, 2);
    px(ctx, 2, 10, '#8a929c', 14, 4);
    px(ctx, 3, 11, '#c5ccd4', 12, 1);
    px(ctx, 4, 4, '#6a727c', 10, 6);
    px(ctx, 5, 5, '#9aa3ad', 3, 4);
    px(ctx, 3, 2, '#a8b0ba', 12, 3);
    px(ctx, 4, 2, '#e4e8ee', 8, 1);
  } else if (kind === 'plant') {
    px(ctx, 6, 15, '#1a1008', 8, 2);
    px(ctx, 5, 10, '#a86840', 8, 5);
    px(ctx, 6, 11, '#c48458', 6, 2);
    px(ctx, 8, 9, '#5a4030', 2, 2);
    px(ctx, 4, 6, '#2f8a3a', 3, 4);
    px(ctx, 8, 4, '#3cb04a', 4, 5);
    px(ctx, 11, 6, '#1f7030', 3, 4);
    px(ctx, 7, 3, '#8ee08a', 2, 2);
  } else if (kind === 'sconce') {
    px(ctx, 8, 12, '#3a3e46', 2, 5);
    px(ctx, 6, 11, '#5a6068', 6, 2);
    px(ctx, 7, 8, '#ffd27a', 4, 3);
    px(ctx, 8, 6, '#fff0c0', 2, 3);
    px(ctx, 8, 4, '#ff8844', 2, 2);
    px(ctx, 6, 7, '#ffaa44', 1, 2);
    px(ctx, 11, 7, '#ff6622', 1, 2);
  } else {
    px(ctx, 2, 2, '#8a5a32', 14, 3);
    px(ctx, 2, 2, '#e6c89a', 14, 1);
    px(ctx, 2, 5, '#6b4224', 3, 11);
    px(ctx, 5, 6, '#a87448', 4, 2);
    px(ctx, 8, 8, '#a87448', 3, 2);
    px(ctx, 10, 6, '#c49468', 2, 2);
    px(ctx, 6, 10, '#5c3a22', 2, 2);
    px(ctx, 11, 9, '#5c3a22', 3, 2);
  }
  cache.set(key, c);
  return c;
}

/** Flickering lantern — frame 0..3 */
export function makeLamp(frame = 0) {
  const f = frame % 4;
  const key = `lamp-${f}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(16, 16);
  const ctx = c.getContext('2d');
  px(ctx, 7, 12, '#3a2a18', 2, 4);
  px(ctx, 5, 4, PALETTE.goldDark, 6, 1);
  // flame flicker
  const flame = ['#ffcc66', '#ffaa22', '#ffe088', '#ff8822'][f];
  const core = ['#fff0c0', '#ffe8a0', '#ffffff', '#ffd080'][f];
  const h = 5 + (f % 2);
  px(ctx, 6, 5, flame, 4, h);
  px(ctx, 7, 6, core, 2, Math.max(2, h - 2));
  if (f === 1 || f === 3) px(ctx, 8, 4, flame, 1, 1);
  cache.set(key, c);
  return c;
}

/** Blue-flame wall torch — frame 0..3 (cool cyan vs red lanterns). */
export function makeBlueTorch(frame = 0) {
  const f = frame % 4;
  const key = `bluetorch-${f}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(16, 16);
  const ctx = c.getContext('2d');
  // iron bracket / haft
  px(ctx, 7, 11, '#2a2a38', 2, 5);
  px(ctx, 5, 10, '#3a3a4a', 6, 2);
  px(ctx, 4, 9, '#4a4a5a', 8, 1);
  // cool flame
  const flame = ['#66ccff', '#4488ff', '#88e0ff', '#3366ee'][f];
  const core = ['#e8ffff', '#c0f0ff', '#ffffff', '#a0d8ff'][f];
  const h = 5 + (f % 2);
  px(ctx, 6, 4, flame, 4, h);
  px(ctx, 7, 5, core, 2, Math.max(2, h - 2));
  if (f === 1 || f === 3) px(ctx, 5, 3, flame, 1, 2);
  if (f === 0 || f === 2) px(ctx, 10, 3, flame, 1, 2);
  // tip spark
  if (f % 2 === 0) px(ctx, 7, 2, '#ffffff', 2, 1);
  cache.set(key, c);
  return c;
}

/** Tiny HUD icons: age, year, bank, portfolio, salary */
export function makeHudIcon(kind) {
  const key = `hudicon-${kind}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(8, 8);
  const ctx = c.getContext('2d');
  if (kind === 'age') {
    // person silhouette
    px(ctx, 3, 0, PALETTE.skin, 2, 2);
    px(ctx, 2, 2, '#3868a0', 4, 3);
    px(ctx, 2, 5, '#2a3a58', 1, 3);
    px(ctx, 5, 5, '#2a3a58', 1, 3);
  } else if (kind === 'year') {
    // calendar
    px(ctx, 1, 1, PALETTE.gold, 6, 6);
    px(ctx, 2, 2, '#181818', 4, 4);
    px(ctx, 2, 0, PALETTE.goldDark, 1, 2);
    px(ctx, 5, 0, PALETTE.goldDark, 1, 2);
  } else if (kind === 'bank') {
    // coin / cash
    px(ctx, 1, 1, PALETTE.gold, 6, 6);
    px(ctx, 2, 2, PALETTE.goldDark, 4, 4);
    px(ctx, 3, 3, PALETTE.gold, 2, 2);
  } else if (kind === 'portfolio') {
    // bag / chest
    px(ctx, 1, 3, '#8a6830', 6, 4);
    px(ctx, 2, 2, PALETTE.gold, 4, 1);
    px(ctx, 3, 4, PALETTE.gold, 2, 1);
  } else if (kind === 'salary') {
    // briefcase
    px(ctx, 1, 2, '#3a5a78', 6, 5);
    px(ctx, 3, 1, '#2a3a58', 2, 1);
    px(ctx, 2, 4, PALETTE.gold, 4, 1);
  }
  cache.set(key, c);
  return c;
}

/** Small gold-framed item box like LTTP */
export function makeHudBox(w, h) {
  const key = `hudbox-${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = PALETTE.uiBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.strokeStyle = PALETTE.uiBorderDark;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  cache.set(key, c);
  return c;
}

export function makeDialogChrome(w, h) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = PALETTE.uiBorderDark;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PALETTE.uiBorder;
  ctx.fillRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = PALETTE.uiBg;
  ctx.fillRect(4, 4, w - 8, h - 8);
  const o = PALETTE.gold;
  px(ctx, 3, 3, o, 3, 1);
  px(ctx, 3, 3, o, 1, 3);
  px(ctx, w - 6, 3, o, 3, 1);
  px(ctx, w - 4, 3, o, 1, 3);
  px(ctx, 3, h - 4, o, 3, 1);
  px(ctx, 3, h - 6, o, 1, 3);
  px(ctx, w - 6, h - 4, o, 3, 1);
  px(ctx, w - 4, h - 6, o, 1, 3);
  return c;
}

function mixHex(a, b, t) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex) {
  if (typeof hex === 'string' && hex.startsWith('rgb')) {
    const m = hex.match(/\d+/g).map(Number);
    return { r: m[0], g: m[1], b: m[2] };
  }
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function clearAssetCache() {
  cache.clear();
}
