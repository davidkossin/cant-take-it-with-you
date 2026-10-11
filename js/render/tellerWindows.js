/**
 * Decision Room teller windows: polished brass frame with rivets and a
 * speaking grille, a cool clear pane, and a thick limestone counter with a
 * deal tray, set into the wall.
 *
 * Each window is painted once in a canonical orientation (outer wall edge
 * up, room floor down, i.e. a north-wall window), then rotated onto its wall
 * so it shares the wall's light/shadow direction. Only the action icon is
 * drawn after rotation, so it always stays upright. Original art.
 *
 * Logical size is 32×24 on north/south walls and 24×32 at x−2 on east/west,
 * so hit boxes and interaction geometry are unchanged.
 */

import { drawTellerIcon } from './tellerIcons.js';


const S = 8;
const CW = 32;
const CH = 24;
const cache = new Map();

/** Canonical row where the wall tile starts, per wall (sprite-relative). */
const WALL_TOP = { north: 2, south: 4, west: 0, east: 2 };

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ---------- small drawing helpers (logical units; ctx is scaled by S) ----------

function lg(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => {
    if (Array.isArray(s)) g.addColorStop(s[0], s[1]);
    else g.addColorStop(i / (stops.length - 1), s);
  });
  return g;
}

function rg(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach((s, i) => {
    if (Array.isArray(s)) g.addColorStop(s[0], s[1]);
    else g.addColorStop(i / (stops.length - 1), s);
  });
  return g;
}

function box(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}

function rrPath(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

function dot(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function hline(ctx, x0, x1, y, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
}

function vline(ctx, x, y0, y1, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
}

/** Soft shadow only (no fill): ambient occlusion where a piece meets the wall. */
function ao(ctx, pathFn, blur, color, dx = 0, dy = 0) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * S;
  ctx.shadowOffsetX = 1000 * S + dx * S;
  ctx.shadowOffsetY = dy * S;
  ctx.translate(-1000, 0);
  ctx.fillStyle = '#000';
  pathFn();
  ctx.fill();
  ctx.restore();
}

function rectPath(ctx, r, grow = 0) {
  return () => {
    ctx.beginPath();
    ctx.rect(r.x - grow, r.y - grow, r.w + grow * 2, r.h + grow * 2);
  };
}

/** Lit interior seen through a pane: base gradient, lintel shadow, side vignette, lamp glow. */
function interior(ctx, g, base, lamp, lintel = 0.5) {
  box(ctx, g.x, g.y, g.w, g.h, lg(ctx, 0, g.y, 0, g.y + g.h, base));
  if (lamp) {
    ctx.fillStyle = rg(ctx, lamp.x, lamp.y, 0, lamp.r, [lamp.color, lamp.color.replace(/[\d.]+\)$/, '0)')]);
    ctx.fillRect(g.x, g.y, g.w, g.h);
  }
  // Depth: the lintel shades the top of the opening, the jambs shade the sides.
  box(ctx, g.x, g.y, g.w, 2.4, lg(ctx, 0, g.y, 0, g.y + 2.4, [`rgba(10,6,4,${lintel})`, 'rgba(10,6,4,0)']));
  box(ctx, g.x, g.y, 1.4, g.h, lg(ctx, g.x, 0, g.x + 1.4, 0, ['rgba(10,6,4,0.3)', 'rgba(10,6,4,0)']));
  box(ctx, g.x + g.w - 1.4, g.y, 1.4, g.h, lg(ctx, g.x + g.w - 1.4, 0, g.x + g.w, 0, ['rgba(10,6,4,0)', 'rgba(10,6,4,0.3)']));
}

/** Diagonal reflection streaks, clipped to the pane (drawn over the icon, faint). */
function sheen(ctx, g, a = 0.2, clipFn) {
  ctx.save();
  if (clipFn) clipFn();
  else {
    ctx.beginPath();
    ctx.rect(g.x, g.y, g.w, g.h);
  }
  ctx.clip();
  const streak = (x, w, alpha) => {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(x, g.y);
    ctx.lineTo(x + w, g.y);
    ctx.lineTo(x + w - g.h * 0.75, g.y + g.h);
    ctx.lineTo(x - g.h * 0.75, g.y + g.h);
    ctx.closePath();
    ctx.fill();
  };
  streak(g.x + g.w * 0.16, 1.5, a);
  streak(g.x + g.w * 0.16 + 2.1, 0.55, a * 0.7);
  streak(g.x + g.w * 0.86, 0.8, a * 0.45);
  // Top edge catch-light along the glazing bead.
  hline(ctx, g.x, g.x + g.w, g.y + 0.15, 0.3, `rgba(255,255,255,${a * 1.2})`);
  ctx.restore();
}

/** Contact shadow a projecting ledge throws on the floor below it. */
function ledgeShadow(ctx, x, y, w, depth = 1.8, a = 0.42) {
  box(ctx, x, y, w, depth, lg(ctx, 0, y, 0, y + depth, [`rgba(12,8,4,${a})`, 'rgba(12,8,4,0)']));
  box(ctx, x - 0.8, y, 0.8, depth, lg(ctx, x, 0, x - 0.8, 0, [`rgba(12,8,4,${a * 0.5})`, 'rgba(12,8,4,0)']));
  box(ctx, x + w, y, 0.8, depth, lg(ctx, x + w, 0, x + w + 0.8, 0, [`rgba(12,8,4,${a * 0.5})`, 'rgba(12,8,4,0)']));
}

/** Gently mottled stone: a few faint speckles so slabs are not flat fills. */
function speckle(ctx, x, y, w, h, seed, light, dark, n = 18) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rnd() < 0.5 ? light : dark;
    ctx.fillRect(x + rnd() * w, y + rnd() * h, 0.25 + rnd() * 0.35, 0.25);
  }
}

// ---------- brass window ----------

const BRASS = ['#fff4c8', '#efcd78', '#c8963e', '#8e6222', '#5a3a10'];

function brassFill(ctx, y0, y1) {
  return lg(ctx, 0, y0, 0, y1, [[0, BRASS[0]], [0.18, BRASS[1]], [0.55, BRASS[2]], [0.85, BRASS[3]], [1, BRASS[4]]]);
}

function rivet(ctx, x, y) {
  dot(ctx, x + 0.08, y + 0.1, 0.36, 'rgba(40,24,6,0.55)');
  dot(ctx, x, y, 0.32, lg(ctx, x - 0.3, y - 0.3, x + 0.3, y + 0.3, ['#fff6d6', '#d4a24a', '#7a5218']));
  dot(ctx, x - 0.1, y - 0.1, 0.1, 'rgba(255,255,240,0.9)');
}

const WINDOW = {
  glow: { rgb: '255,226,170', spill: 0.3, pane: 0.07 },
  layout(wt) {
    const frame = { x: 3, y: wt + 0.7, w: 26, h: 14.2 };
    const glass = { x: 5.2, y: wt + 3.1, w: 21.6, h: 10.9 };
    return { frame, glass, icon: glass, glow: glass };
  },
  base(ctx, L, wt) {
    const f = L.frame;
    const g = L.glass;
    // Cut into the stone: dark gap plus soft occlusion on the wall around it.
    ao(ctx, rectPath(ctx, f, 0.2), 1.6, 'rgba(0,0,0,0.75)', 0, 0.3);
    box(ctx, f.x - 0.3, f.y - 0.3, f.w + 0.6, f.h + 0.6, '#1a120c');
    // Brass frame body with bevels.
    box(ctx, f.x, f.y, f.w, f.h, brassFill(ctx, f.y, f.y + f.h));
    box(ctx, f.x, f.y, f.w, f.h, lg(ctx, f.x, 0, f.x + f.w, 0, ['rgba(255,250,220,0.18)', 'rgba(255,250,220,0)', 'rgba(60,30,0,0.18)']));
    hline(ctx, f.x, f.x + f.w, f.y + 0.15, 0.3, 'rgba(255,252,230,0.9)');
    vline(ctx, f.x + 0.15, f.y, f.y + f.h, 0.3, 'rgba(255,246,210,0.55)');
    vline(ctx, f.x + f.w - 0.15, f.y, f.y + f.h, 0.3, 'rgba(70,40,8,0.6)');
    // Raised inner molding around the glass.
    const m = { x: g.x - 0.9, y: g.y - 0.9, w: g.w + 1.8, h: g.h + 1.8 };
    ctx.strokeStyle = 'rgba(80,46,10,0.75)';
    ctx.lineWidth = 0.3;
    ctx.strokeRect(m.x, m.y, m.w, m.h);
    ctx.strokeStyle = 'rgba(255,244,200,0.65)';
    ctx.lineWidth = 0.2;
    ctx.strokeRect(m.x + 0.3, m.y + 0.3, m.w - 0.6, m.h - 0.6);
    // Rivets along the rails (gap at the centre for the speaking grille).
    for (const x of [4.3, 7.2, 10.1, 21.9, 24.8, 27.7]) rivet(ctx, x, f.y + 1.15);
    for (const y of [g.y + 1.4, g.y + 4.4, g.y + 7.4, g.y + 10.2]) {
      rivet(ctx, f.x + 1.05, y);
      rivet(ctx, f.x + f.w - 1.05, y);
    }
    // Speaking grille plate.
    rrPath(ctx, 12.6, f.y + 0.35, 6.8, 1.75, 0.85);
    ctx.fillStyle = lg(ctx, 0, f.y + 0.35, 0, f.y + 2.1, ['#7a5218', '#3e2808']);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,190,0.7)';
    ctx.lineWidth = 0.18;
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const x = 13.5 + i * 0.84;
      vline(ctx, x, f.y + 0.75, f.y + 1.75, 0.34, '#120a04');
      vline(ctx, x + 0.2, f.y + 0.8, f.y + 1.75, 0.1, 'rgba(255,230,160,0.45)');
    }
    // Glass: cool clear pane in front of a warmly lit counter hall.
    box(ctx, g.x - 0.35, g.y - 0.35, g.w + 0.7, g.h + 0.7, '#20160c');
    interior(ctx, g, ['#e8eef0', '#b7cad6', '#86a2b6'],
      { x: 16, y: g.y + g.h, r: 11, color: 'rgba(255,214,150,0.38)' }, 0.42);
    // Thick limestone counter with brass nosing, projecting onto the floor.
    const sy = g.y + g.h - 0.1;
    const top = { x: 2, y: sy, w: 28, h: 2.9 };
    ao(ctx, rectPath(ctx, { x: 2, y: sy, w: 28, h: 3.7 }), 1.2, 'rgba(0,0,0,0.55)', 0, 0.6);
    box(ctx, top.x, top.y, top.w, top.h, lg(ctx, 0, top.y, 0, top.y + top.h, ['#f4ede0', '#e2d7c2', '#cbbda3']));
    speckle(ctx, top.x, top.y + 0.4, top.w, top.h - 0.6, 3, 'rgba(255,255,255,0.5)', 'rgba(120,100,70,0.25)', 34);
    // Veining.
    ctx.strokeStyle = 'rgba(150,130,100,0.35)';
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(4, top.y + 2.2);
    ctx.bezierCurveTo(8, top.y + 0.9, 11, top.y + 2.6, 15, top.y + 1.5);
    ctx.moveTo(19.5, top.y + 0.8);
    ctx.bezierCurveTo(22, top.y + 2.4, 25, top.y + 1.1, 28.5, top.y + 2.1);
    ctx.stroke();
    hline(ctx, top.x, top.x + top.w, top.y + 0.2, 0.4, BRASS[1]);
    hline(ctx, top.x, top.x + top.w, top.y + 0.08, 0.14, 'rgba(255,252,230,0.95)');
    // Front face of the slab.
    box(ctx, top.x, top.y + top.h, top.w, 0.85, lg(ctx, 0, top.y + top.h, 0, top.y + top.h + 0.85, ['#a8977a', '#6e5f48']));
    hline(ctx, top.x, top.x + top.w, top.y + top.h + 0.05, 0.12, 'rgba(255,248,230,0.8)');
    // Recessed deal tray under the glass.
    rrPath(ctx, 12.2, top.y + 0.6, 7.6, 1.5, 0.6);
    ctx.fillStyle = lg(ctx, 0, top.y + 0.6, 0, top.y + 2.1, ['#3a2a18', '#7a6448']);
    ctx.fill();
    ctx.strokeStyle = BRASS[2];
    ctx.lineWidth = 0.22;
    ctx.stroke();
    ledgeShadow(ctx, top.x, top.y + top.h + 0.85, top.w, 2, 0.4);
  },
  overlay(ctx, L) {
    sheen(ctx, L.glass, 0.2);
  },
};
// ---------- orientation ----------

function mapRect(r, side) {
  if (side === 'south') return { x: CW - r.x - r.w, y: CH - r.y - r.h, w: r.w, h: r.h };
  if (side === 'west') return { x: r.y, y: CW - r.x - r.w, w: r.h, h: r.w };
  if (side === 'east') return { x: CH - r.y - r.h, y: r.x, w: r.h, h: r.w };
  return { ...r };
}

function mapPoint(x, y, side) {
  if (side === 'south') return { x: CW - x, y: CH - y };
  if (side === 'west') return { x: y, y: CW - x };
  if (side === 'east') return { x: CH - y, y: x };
  return { x, y };
}

function orient(ctx, side, k) {
  if (side === 'south') {
    ctx.translate(CW * k, CH * k);
    ctx.rotate(Math.PI);
  } else if (side === 'west') {
    ctx.translate(0, CW * k);
    ctx.rotate(-Math.PI / 2);
  } else if (side === 'east') {
    ctx.translate(CH * k, 0);
    ctx.rotate(Math.PI / 2);
  }
}

/**
 * Teller window sprite for one action and wall. Logical size 32×24 on
 * north/south walls, 24×32 at x−2 on east/west.
 * @param {string} action
 * @param {'south'|'west'|'east'|'north'} wallSide
 */
export function paintTeller(action, wallSide = 'south') {
  const P = WINDOW;
  const vertical = wallSide === 'west' || wallSide === 'east';
  const lw = vertical ? 24 : 32;
  const lh = vertical ? 32 : 24;
  const key = `teller-${action}-${wallSide}`;
  if (cache.has(key)) return cache.get(key);

  const wt = WALL_TOP[wallSide] ?? 2;
  const L = P.layout(wt);

  const base = mk(CW * S, CH * S);
  const bc = base.getContext('2d');
  bc.scale(S, S);
  P.base(bc, L, wt);

  const over = mk(CW * S, CH * S);
  const oc = over.getContext('2d');
  oc.scale(S, S);
  P.overlay(oc, L);

  const c = mk(lw * S, lh * S);
  c.lw = lw;
  c.lh = lh;
  c.ox = vertical ? -2 : 0;
  c.oy = 0;
  const ctx = c.getContext('2d');
  ctx.save();
  orient(ctx, wallSide, S);
  ctx.drawImage(base, 0, 0);
  ctx.restore();

  // Upright icon, fitted to the glass without stretching, with a soft dark
  // halo so it reads against the pane.
  const ir = mapRect(L.icon, wallSide);
  const icon = mk(c.width, c.height);
  drawTellerIcon(icon.getContext('2d'), action, ir.x * S, ir.y * S, ir.w * S, ir.h * S);
  ctx.save();
  ctx.shadowColor = 'rgba(18,10,4,0.55)';
  ctx.shadowBlur = 5;
  ctx.drawImage(icon, 0, 0);
  ctx.restore();

  ctx.save();
  orient(ctx, wallSide, S);
  ctx.drawImage(over, 0, 0);
  ctx.restore();

  c.glowRect = mapRect(L.glow, wallSide);
  cache.set(key, c);
  return c;
}

/**
 * Warm light spilling from the window onto the floor in front of it. Call
 * before the window sprites (it sits on the floor). Flicker uses the same
 * timing as the room lanterns.
 */
export function drawTellerSpill(ctx, obj, sx, sy, animTime = 0) {
  const P = WINDOW;
  const side = obj.wallSide || 'south';
  const vertical = side === 'west' || side === 'east';
  const ox = sx + (vertical ? -2 : 0);
  const oy = sy;
  const wt = WALL_TOP[side] ?? 2;
  const f = tellerFlicker(obj, animTime);
  const center = mapPoint(16, wt + 16, side);
  const clip = mapRect({ x: -8, y: wt + 16, w: CW + 16, h: 20 }, side);
  const rx = vertical ? 10 : 16;
  const ry = vertical ? 16 : 10;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox + clip.x, oy + clip.y, clip.w, clip.h);
  ctx.clip();
  ctx.translate(ox + center.x, oy + center.y);
  ctx.scale(rx, ry);
  const a = P.glow.spill * f;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(${P.glow.rgb},${a})`);
  g.addColorStop(0.5, `rgba(${P.glow.rgb},${a * 0.45})`);
  g.addColorStop(1, `rgba(${P.glow.rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Faint flicker of the booth lamp on the pane (drawn over the sprite). */
export function drawTellerPaneGlow(ctx, spr, sx, sy, obj, animTime = 0) {
  const P = WINDOW;
  if (!spr.glowRect) return;
  const r = spr.glowRect;
  const f = tellerFlicker(obj, animTime);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(${P.glow.rgb},${(P.glow.pane * (f - 0.55)).toFixed(3)})`;
  ctx.fillRect(sx + spr.ox + r.x, sy + spr.oy + r.y, r.w, r.h);
  ctx.restore();
}

function tellerFlicker(obj, t) {
  const frame = Math.floor(t / 8) % 4;
  return 0.9 + 0.08 * Math.sin(t / 5 + (obj.x || 0) * 0.37 + (obj.y || 0) * 0.11) + (frame % 2 ? 0.02 : -0.02);
}
