/**
 * Painted textures at 8× the logical tile, drawn back down with smoothing
 * so floors and walls are not 16px stamps blown up. Original art, not Nintendo.
 */

const S = 8;
const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Which way the wall faces the floor. */
export function wallFace(map, x, y) {
  const floor = (t) =>
    t === 'square' || t === 'stone' || t === 'floor' || t === 'plank' || t === 'wood' || t === 'carpet';
  const at = (cx, cy) => map[cy] && map[cy][cx];
  if (floor(at(x, y + 1)) && !floor(at(x, y - 1))) return 's';
  if (floor(at(x, y - 1)) && !floor(at(x, y + 1))) return 'n';
  if (floor(at(x + 1, y)) && !floor(at(x - 1, y))) return 'e';
  if (floor(at(x - 1, y)) && !floor(at(x + 1, y))) return 'w';
  return 's';
}

function shadeWall(ctx, w, h, cool, face) {
  const cap = cool ? ['#8ea0b4', '#6d8096'] : ['#a89884', '#7a6a58'];
  const body = cool ? ['#4d5d70', '#2c3848'] : ['#5c4c3c', '#2e261e'];
  // Light on the outer top of the wall, dark where it meets the floor.
  const vertical = face === 's' || face === 'n';
  const darkAtEnd = face === 's' || face === 'e';
  const g = vertical
    ? ctx.createLinearGradient(0, 0, 0, h)
    : ctx.createLinearGradient(0, 0, w, 0);
  if (darkAtEnd) {
    g.addColorStop(0, cap[0]);
    g.addColorStop(0.22, cap[1]);
    g.addColorStop(0.34, body[0]);
    g.addColorStop(1, body[1]);
  } else {
    g.addColorStop(0, body[1]);
    g.addColorStop(0.66, body[0]);
    g.addColorStop(0.78, cap[1]);
    g.addColorStop(1, cap[0]);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = cool ? '#d5e2ee' : '#f0e2cc';
  if (face === 's') ctx.fillRect(0, 0, w, Math.floor(h * 0.18));
  else if (face === 'n') ctx.fillRect(0, Math.floor(h * 0.82), w, Math.ceil(h * 0.18));
  else if (face === 'e') ctx.fillRect(0, 0, Math.floor(w * 0.18), h);
  else ctx.fillRect(Math.floor(w * 0.82), 0, Math.ceil(w * 0.18), h);
  ctx.globalAlpha = 1;
}

export function paintSurface(type, variant = 0, face = 's') {
  const key = `${type}-${variant}-${face}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(16 * S, 16 * S);
  const ctx = c.getContext('2d');
  const n = 16 * S;
  if (type === 'square') {
    const tones = ['#e7dccb', '#efe6d8', '#ddd2c0', '#e3d8c8'];
    const tone = tones[variant % tones.length];
    ctx.fillStyle = '#c9beae';
    ctx.fillRect(0, 0, n, n);
    const g = ctx.createLinearGradient(0, 0, n, n);
    g.addColorStop(0, '#f4eee4');
    g.addColorStop(0.55, tone);
    g.addColorStop(1, '#d4c8b6');
    ctx.fillStyle = g;
    const m = 7;
    ctx.fillRect(m, m, n - m * 2, n - m * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(m + 2, m + 2, n - m * 2 - 6, n - m * 2 - 6);
  } else if (type === 'void') {
    ctx.fillStyle = '#141c2c';
    ctx.fillRect(0, 0, n, n);
  } else if (type === 'stone') {
    const tones = ['#7e8c9c', '#738496', '#8796a6', '#6e7e90'];
    ctx.fillStyle = '#3c4856';
    ctx.fillRect(0, 0, n, n);
    const g = ctx.createLinearGradient(0, 0, n * 0.2, n);
    g.addColorStop(0, '#c5d0dc');
    g.addColorStop(0.4, tones[variant % tones.length]);
    g.addColorStop(1, '#5c6a7a');
    ctx.fillStyle = g;
    roundRect(ctx, 8, 8, n - 16, n - 16, 10);
    ctx.fill();
  } else if (type === 'wall' || type === 'wallPurple') {
    shadeWall(ctx, n, n, type === 'wallPurple', face);
  } else {
    ctx.fillStyle = '#888';
    ctx.fillRect(0, 0, n, n);
  }
  cache.set(key, c);
  return c;
}

/** Soft shadow cast from the wall onto the floor, in logical pixels. */
export function paintWallShadow(face) {
  const key = `shadow-${face}`;
  if (cache.has(key)) return cache.get(key);
  const along = 16 * S;
  const deep = 10 * S;
  const horizontal = face === 'n' || face === 's';
  const c = canvas(horizontal ? along : deep, horizontal ? deep : along);
  const ctx = c.getContext('2d');
  const g = horizontal
    ? ctx.createLinearGradient(0, face === 's' ? 0 : deep, 0, face === 's' ? deep : 0)
    : ctx.createLinearGradient(face === 'e' ? 0 : deep, 0, face === 'e' ? deep : 0, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.38)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  cache.set(key, c);
  return c;
}

export function paintRug(w, h) {
  const key = `hirug-${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const pad = 6;
  const c = canvas((w + pad) * S, (h + pad) * S);
  c.lw = w + pad;
  c.lh = h + pad;
  const ctx = c.getContext('2d');
  const ox = 2 * S;
  const oy = 1 * S;
  const rw = w * S;
  const rh = h * S;
  // No floor shadow under the rug. Wall-to-floor shading is painted separately.
  const g = ctx.createRadialGradient(ox + rw * 0.5, oy + rh * 0.45, 20, ox + rw * 0.5, oy + rh * 0.5, rw * 0.55);
  g.addColorStop(0, '#2a62a0');
  g.addColorStop(0.62, '#163e74');
  g.addColorStop(1, '#0c274c');
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, rw, rh);
  ctx.strokeStyle = '#e6c86a';
  ctx.lineWidth = 5 * (S / 4);
  ctx.strokeRect(ox + 10, oy + 10, rw - 20, rh - 20);
  ctx.strokeStyle = '#8a6230';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox + 18, oy + 18, rw - 36, rh - 36);
  const cx = ox + rw / 2;
  const cy = oy + rh / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#e6c86a';
  ctx.fillRect(-22 * (S / 4), -22 * (S / 4), 44 * (S / 4), 44 * (S / 4));
  ctx.fillStyle = '#0c2a52';
  ctx.fillRect(-12 * (S / 4), -12 * (S / 4), 24 * (S / 4), 24 * (S / 4));
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, 7 * (S / 4), 0, Math.PI * 2);
  ctx.fillStyle = '#f3e2a4';
  ctx.fill();
  cache.set(key, c);
  return c;
}

/**
 * @param {'h'|'v'} facing
 * @param {'wood'|'deaths-door'|'black-gold'|'beige-gold'|'ivory-gold'} [style]
 *   'deaths-door' (alias 'black-gold') is the black/gold End of the Line door.
 *   'beige-gold' (alias 'ivory-gold') is the ivory/gold recolor of that door;
 *   'beige-gold-sloped' is it rotated 180° and foreshortened for the
 *   Hallway's sloped south wall (canvas carries ox/oy draw offsets).
 */
export function paintDoor(facing, style = 'wood') {
  if (style === 'deaths-door' || style === 'black-gold') return paintGoldTrimDoor(facing, 'deaths-door');
  if (style === 'beige-gold' || style === 'ivory-gold') return paintGoldTrimDoor(facing, 'beige-gold');
  if (style === 'beige-gold-sloped') return paintSlopedSouthDoor('beige-gold');
  const key = `hidoor-${facing}`;
  if (cache.has(key)) return cache.get(key);
  const lw = facing === 'h' ? 32 : 16;
  const lh = facing === 'h' ? 16 : 26;
  const c = canvas(lw * S, lh * S);
  c.lw = lw;
  c.lh = lh;
  const ctx = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  const frame = ctx.createLinearGradient(0, 0, 0, H);
  frame.addColorStop(0, '#d5dde6');
  frame.addColorStop(1, '#5c6774');
  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, W, H);
  const ix = 3 * S;
  const iy = 3 * S;
  const iw = W - 6 * S;
  const ih = H - 6 * S;
  const wood = ctx.createLinearGradient(ix, iy, ix + iw, iy);
  wood.addColorStop(0, '#8a5a32');
  wood.addColorStop(0.5, '#c49262');
  wood.addColorStop(1, '#6b4224');
  ctx.fillStyle = wood;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.strokeStyle = 'rgba(74,42,20,0.45)';
  ctx.lineWidth = Math.max(2, S / 2);
  const boards = 4;
  for (let i = 1; i < boards; i++) {
    const x = ix + (iw * i) / boards;
    ctx.beginPath();
    ctx.moveTo(x, iy + 2);
    ctx.lineTo(x, iy + ih - 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#3a3e46';
  const hingeW = Math.min(iw * 0.42, 10 * S);
  const hingeH = Math.max(3 * S, ih * 0.12);
  ctx.fillRect(ix + S, iy + ih * 0.22, hingeW, hingeH);
  ctx.fillRect(ix + S, iy + ih * 0.68, hingeW, hingeH);
  ctx.fillStyle = '#d8dce2';
  const hx = ix + iw - 5 * S;
  const hy = iy + ih / 2 - 2 * S;
  ctx.beginPath();
  ctx.arc(hx + 2 * S, hy + 2 * S, 2.2 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2e34';
  ctx.beginPath();
  ctx.arc(hx + 2 * S, hy + 2 * S, 0.8 * S, 0, Math.PI * 2);
  ctx.fill();
  cache.set(key, c);
  return c;
}

/**
 * Door palettes for the gold-trim slab shared by the Hallway's end door and
 * south-return door. Both use the exact same construction (planks, seams,
 * thin gold trim, two gold bar hinges, gold ring handle); only the body and
 * its shading change. Values for 'deaths-door' are the original black door.
 */
const GOLD_TRIM_DOORS = {
  // Death's Door (internal name; player-facing label is "End of the Line").
  'deaths-door': {
    body: ['#3a3840', '#211f25', '#0b0a0d'],
    altBoard: 'rgba(255,255,255,0.035)',
    seamDark: 'rgba(0,0,0,0.65)',
    seamLit: 'rgba(120,118,128,0.35)',
    sheen: ['rgba(200,196,210,0.14)', 'rgba(200,196,210,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.35)'],
    ink: '#2a1a06',
    innerEdge: 'rgba(0,0,0,0.7)',
    trim: ['#fff0b8', '#e6c86a', '#8a6020'],
    hinge: ['#f6e2a0', '#a8761e'],
    ring: ['#fff6cc', '#e6c86a', '#8a6020'],
    ringHole: '#0c0805',
  },
  // Hallway south-return door: warm ivory body, darker beige panel shading,
  // gold a touch deeper so the trim still reads against the light body.
  'beige-gold': {
    body: ['#f8f1de', '#ebe0c2', '#cdbb94'],
    altBoard: 'rgba(150,118,70,0.12)',
    seamDark: 'rgba(120,90,50,0.5)',
    seamLit: 'rgba(255,250,232,0.55)',
    sheen: ['rgba(255,253,244,0.35)', 'rgba(255,253,244,0)', 'rgba(140,110,60,0)', 'rgba(110,84,44,0.3)'],
    ink: '#4a3414',
    innerEdge: 'rgba(110,80,40,0.55)',
    trim: ['#f3dc94', '#d4a84b', '#7a5418'],
    hinge: ['#f0d890', '#9a6e20'],
    ring: ['#fff6cc', '#d4a84b', '#7a5418'],
    ringHole: '#3a2810',
  },
};

/**
 * Gold-trim door slab. Same slab layout as the wood door (planks, two
 * hinges, ring handle); gold is only a thin trim edge, the hinges and the
 * handle. Plank seams and a soft upper-left sheen keep it reading as a door.
 * Cache key includes the style so each recolor gets its own sprite.
 * @param {'h'|'v'} facing
 * @param {'deaths-door'|'beige-gold'} style
 */
function paintGoldTrimDoor(facing, style) {
  const pal = GOLD_TRIM_DOORS[style] || GOLD_TRIM_DOORS['deaths-door'];
  const key = `hidoor-${facing}-${style}`;
  if (cache.has(key)) return cache.get(key);
  const lw = facing === 'h' ? 32 : 16;
  const lh = facing === 'h' ? 16 : 26;
  const c = canvas(lw * S, lh * S);
  c.lw = lw;
  c.lh = lh;
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  const ink = pal.ink;
  // Slab body, lit from the upper left.
  const body = ctx.createLinearGradient(0, 0, lw * 0.6, lh);
  body.addColorStop(0, pal.body[0]);
  body.addColorStop(0.35, pal.body[1]);
  body.addColorStop(1, pal.body[2]);
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, lw, lh);
  // Planks: every other board shaded, seams with a lit edge.
  const t = 1.1; // trim width
  const boards = facing === 'h' ? 4 : 3;
  const bw = (lw - t * 2) / boards;
  for (let i = 0; i < boards; i++) {
    const x = t + i * bw;
    if (i % 2 === 0) {
      ctx.fillStyle = pal.altBoard;
      ctx.fillRect(x, t, bw, lh - t * 2);
    }
    if (i > 0) {
      ctx.fillStyle = pal.seamDark;
      ctx.fillRect(x - 0.25, t, 0.4, lh - t * 2);
      ctx.fillStyle = pal.seamLit;
      ctx.fillRect(x + 0.15, t, 0.25, lh - t * 2);
    }
  }
  // Sheen along the top of the slab and a darker foot.
  const sheen = ctx.createLinearGradient(0, t, 0, lh - t);
  sheen.addColorStop(0, pal.sheen[0]);
  sheen.addColorStop(0.35, pal.sheen[1]);
  sheen.addColorStop(0.8, pal.sheen[2]);
  sheen.addColorStop(1, pal.sheen[3]);
  ctx.fillStyle = sheen;
  ctx.fillRect(t, t, lw - t * 2, lh - t * 2);
  // Thin gold trim around the edge.
  const gold = ctx.createLinearGradient(0, 0, lw * 0.4, lh);
  gold.addColorStop(0, pal.trim[0]);
  gold.addColorStop(0.4, pal.trim[1]);
  gold.addColorStop(1, pal.trim[2]);
  ctx.strokeStyle = gold;
  ctx.lineWidth = t;
  ctx.strokeRect(t / 2, t / 2, lw - t, lh - t);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.3;
  ctx.strokeRect(0.15, 0.15, lw - 0.3, lh - 0.3);
  ctx.strokeStyle = pal.innerEdge;
  ctx.strokeRect(t + 0.15, t + 0.15, lw - t * 2 - 0.3, lh - t * 2 - 0.3);
  // Small gold strap hinges (bars) on the left stile.
  const hingeW = facing === 'h' ? 5 : 4;
  const hingeH = 1.4;
  for (const fy of [0.26, 0.66]) {
    const hy = t + (lh - t * 2) * fy;
    const hg = ctx.createLinearGradient(0, hy, 0, hy + hingeH);
    hg.addColorStop(0, pal.hinge[0]);
    hg.addColorStop(1, pal.hinge[1]);
    ctx.fillStyle = hg;
    ctx.fillRect(t + 0.4, hy, hingeW, hingeH);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.25;
    ctx.strokeRect(t + 0.4, hy, hingeW, hingeH);
  }
  // Gold ring handle on the right.
  const hx = lw - t - 2.6;
  const hy = lh / 2;
  const ring = ctx.createRadialGradient(hx - 0.4, hy - 0.4, 0.1, hx, hy, 1.4);
  ring.addColorStop(0, pal.ring[0]);
  ring.addColorStop(0.55, pal.ring[1]);
  ring.addColorStop(1, pal.ring[2]);
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(hx, hy, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.25;
  ctx.stroke();
  ctx.fillStyle = pal.ringHole;
  ctx.beginPath();
  ctx.arc(hx, hy, 0.5, 0, Math.PI * 2);
  ctx.fill();
  cache.set(key, c);
  return c;
}

/** Lantern light colors (wall wash, floor pool, flame glow) per glass. */
const LANTERN_LIGHT = {
  purple: {
    washRgb: [[196, 120, 255], [150, 80, 240], [120, 60, 220]],
    poolRgb: [[170, 90, 255], [140, 70, 240]],
    glowRgb: [[255, 236, 255], [210, 150, 255]],
  },
  green: {
    washRgb: [[120, 220, 140], [70, 190, 100], [40, 150, 70]],
    poolRgb: [[90, 210, 120], [50, 160, 80]],
    glowRgb: [[236, 255, 236], [150, 230, 170]],
  },
};

/**
 * Perspective of the Hallway's sloped south wall face. Things mounted on it
 * are foreshortened to fy of their height, and lines running down the slope
 * converge toward a vanishing point vp px above the door's threshold, so
 * they flare outward toward the rim.
 */
const SOUTH_SLOPE = { fy: 0.85, vp: 100 };

/**
 * South door face geometry for a slab rect (world or wall-local px):
 * threshold yT at the floor edge, lintel side yB, center cx, and spread()
 * which maps a horizontal offset at the threshold to the offset at y.
 */
function southDoorFace(door) {
  const { fy, vp } = SOUTH_SLOPE;
  const yT = door.y;
  return {
    fy,
    vp,
    cx: door.x + door.w / 2,
    yT,
    yB: yT + door.h * fy,
    spread: (off, y) => (off * (vp + (y - yT))) / vp,
  };
}

/**
 * Gold-trim door for the sloped south wall: the same slab (paintGoldTrimDoor)
 * rotated 180° and drawn as a trapezoid foreshortened along the slope,
 * narrow at the threshold (top) and widening toward the lintel side. The
 * canvas is wider than the slab rect; ox/oy offset it so the threshold
 * edge lines up with the slab rect's top edge.
 */
function paintSlopedSouthDoor(style) {
  const key = `hidoor-h-${style}-south-sloped-v1`;
  if (cache.has(key)) return cache.get(key);
  const src = paintGoldTrimDoor('h', style);
  const dw = 32;
  const dh = 16;
  const face = southDoorFace({ x: 0, y: 0, w: dw, h: dh });
  const hLog = face.yB; // foreshortened height
  const extra = Math.ceil(face.spread(dw / 2, hLog) - dw / 2);
  const lw = dw + extra * 2;
  const lh = Math.ceil(hLog);
  const c = canvas(lw * S, lh * S);
  c.lw = lw;
  c.lh = lh;
  c.ox = -extra;
  c.oy = 0;
  // Rotate the slab 180° first.
  const rot = canvas(src.width, src.height);
  const rctx = rot.getContext('2d');
  rctx.translate(src.width, src.height);
  rctx.rotate(Math.PI);
  rctx.drawImage(src, 0, 0);
  // Then warp it row by row into the trapezoid.
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  const rows = Math.ceil(hLog * S);
  const cx = lw / 2;
  for (let j = 0; j < rows; j++) {
    const t0 = j / (hLog * S);
    const t1 = Math.min(1, (j + 1) / (hLog * S));
    if (t0 >= 1) break;
    const yMid = ((t0 + t1) / 2) * hLog;
    const half = face.spread(dw / 2, yMid);
    ctx.drawImage(
      rot,
      0, t0 * src.height, src.width, Math.max(0.5, (t1 - t0) * src.height),
      (cx - half) * S, j, half * 2 * S, 1
    );
  }
  // Slight shade toward the threshold, deeper in the recess.
  const shade = ctx.createLinearGradient(0, 0, 0, hLog * S);
  shade.addColorStop(0, 'rgba(40,30,15,0.18)');
  shade.addColorStop(0.5, 'rgba(40,30,15,0)');
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo((cx - dw / 2) * S, 0);
  ctx.lineTo((cx + dw / 2) * S, 0);
  ctx.lineTo((cx + face.spread(dw / 2, hLog)) * S, hLog * S);
  ctx.lineTo((cx - face.spread(dw / 2, hLog)) * S, hLog * S);
  ctx.closePath();
  ctx.fill();
  cache.set(key, c);
  return c;
}

/**
 * Wall lantern flanking a Hallway door, logical 8×12, anchor at top-center.
 * Dark iron cap, cage and base with thin gold rims; purple or green glass
 * and flame. Glow and flicker are added live by drawDoorLanterns.
 * @param {'purple'|'green'} [glassColor]
 */
function paintWallLantern(glassColor = 'purple') {
  const key = `hi-wall-lantern-${glassColor}`;
  if (cache.has(key)) return cache.get(key);
  const lw = 8;
  const lh = 12;
  const c = canvas(lw * S, lh * S);
  c.lw = lw;
  c.lh = lh;
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.lineJoin = 'round';
  const ink = '#08070a';
  const iron = (x0, x1) => {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#4a4852');
    g.addColorStop(0.4, '#26242b');
    g.addColorStop(1, '#0e0d11');
    return g;
  };
  const gold = '#d4a84b';
  // Wall plate with a gold rivet, and the short arm the lantern hangs from.
  ctx.fillStyle = iron(2.6, 5.4);
  ctx.fillRect(2.6, 0.2, 2.8, 2);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.3;
  ctx.strokeRect(2.6, 0.2, 2.8, 2);
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.arc(4, 1.2, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a191e';
  ctx.fillRect(3.65, 2.2, 0.7, 1.2);
  // Cap (roof) with a gold rim along its lower edge.
  ctx.beginPath();
  ctx.moveTo(2.9, 3.3);
  ctx.lineTo(5.1, 3.3);
  ctx.lineTo(6.9, 4.8);
  ctx.lineTo(1.1, 4.8);
  ctx.closePath();
  ctx.fillStyle = iron(1.1, 6.9);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.3;
  ctx.stroke();
  ctx.fillStyle = gold;
  ctx.fillRect(1.2, 4.55, 5.6, 0.35);
  // Colored glass, brightest around the flame.
  const glass = ctx.createRadialGradient(4, 7.4, 0.2, 4, 7.2, 3.4);
  if (glassColor === 'green') {
    glass.addColorStop(0, '#e8ffe8');
    glass.addColorStop(0.35, '#7cf4a0');
    glass.addColorStop(0.75, '#2e9a48');
    glass.addColorStop(1, '#145028');
  } else {
    glass.addColorStop(0, '#f6e0ff');
    glass.addColorStop(0.35, '#c27cf4');
    glass.addColorStop(0.75, '#7a34c4');
    glass.addColorStop(1, '#3e1670');
  }
  ctx.fillStyle = glass;
  ctx.fillRect(1.5, 4.9, 5, 4.8);
  // Flame.
  ctx.beginPath();
  ctx.moveTo(4, 5.6);
  ctx.quadraticCurveTo(5.1, 7.4, 4, 8.5);
  ctx.quadraticCurveTo(2.9, 7.4, 4, 5.6);
  ctx.fillStyle = glassColor === 'green' ? '#f4fff4' : '#fff4ff';
  ctx.fill();
  // Iron cage: frame and two bars.
  ctx.strokeStyle = '#141317';
  ctx.lineWidth = 0.45;
  ctx.strokeRect(1.5, 4.9, 5, 4.8);
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(3.1, 4.9);
  ctx.lineTo(3.1, 9.7);
  ctx.moveTo(4.9, 4.9);
  ctx.lineTo(4.9, 9.7);
  ctx.stroke();
  // Base with a gold rim on top, and a small drip finial.
  ctx.beginPath();
  ctx.moveTo(1.1, 9.7);
  ctx.lineTo(6.9, 9.7);
  ctx.lineTo(5.4, 11);
  ctx.lineTo(2.6, 11);
  ctx.closePath();
  ctx.fillStyle = iron(1.1, 6.9);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.3;
  ctx.stroke();
  ctx.fillStyle = gold;
  ctx.fillRect(1.2, 9.6, 5.6, 0.35);
  ctx.fillStyle = '#1a191e';
  ctx.beginPath();
  ctx.moveTo(3.5, 11);
  ctx.lineTo(4.5, 11);
  ctx.lineTo(4, 11.9);
  ctx.closePath();
  ctx.fill();
  cache.set(key, c);
  return c;
}

function paintDeathsDoorLantern() {
  return paintWallLantern('purple');
}

/**
 * Two colored wall lanterns flanking a door slab, with a soft wash on the
 * wall, a faint floor pool, and a gentle flicker from animTime. Draws in
 * world space. Same spacing and height for every wall: each lantern centers
 * 9 px outside the slab, its plate 2 px above the slab top.
 * @param {number|null} wallFloorY world y where the wall face meets the
 *   floor (pool drawn just below it), or null for no floor pool.
 * @param {'purple'|'green'} glassColor
 */
function drawDoorLanterns(ctx, door, wallFloorY, camX, camY, animTime = 0, glassColor = 'purple') {
  const spr = paintWallLantern(glassColor);
  const gap = 9;
  const top = door.y - 2;
  const glassY = top + 7.3;
  const xs = [door.x - gap, door.x + door.w + gap];
  const { washRgb, poolRgb, glowRgb } = LANTERN_LIGHT[glassColor] || LANTERN_LIGHT.purple;
  ctx.save();
  xs.forEach((wx, i) => {
    const phase = i * 2.1;
    const f = 0.88 + 0.07 * Math.sin(animTime / 11 + phase) + 0.05 * Math.sin(animTime / 4.7 + phase * 1.7);
    const cx = wx - camX;
    const cy = glassY - camY;
    const wash = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, 11);
    wash.addColorStop(0, `rgba(${washRgb[0].join(',')},${0.34 * f})`);
    wash.addColorStop(0.5, `rgba(${washRgb[1].join(',')},${0.14 * f})`);
    wash.addColorStop(1, `rgba(${washRgb[2].join(',')},0)`);
    ctx.fillStyle = wash;
    ctx.fillRect(cx - 11, cy - 11, 22, 22);
    if (wallFloorY != null) {
      ctx.save();
      ctx.translate(cx, wallFloorY - camY + 3.2);
      ctx.scale(1, 0.36);
      const pool = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 9);
      pool.addColorStop(0, `rgba(${poolRgb[0].join(',')},${0.24 * f})`);
      pool.addColorStop(1, `rgba(${poolRgb[1].join(',')},0)`);
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(spr, cx - spr.lw / 2, top - camY, spr.lw, spr.lh);
    const glow = ctx.createRadialGradient(cx, cy, 0.1, cx, cy, 3.2);
    glow.addColorStop(0, `rgba(${glowRgb[0].join(',')},${0.55 * f})`);
    glow.addColorStop(1, `rgba(${glowRgb[1].join(',')},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 3.2, cy - 3.2, 6.4, 6.4);
  });
  ctx.restore();
}

/**
 * Two purple lanterns on the end wall, one each side of Death's Door, with a
 * soft violet wash on the wall, a faint pool on the floor, and a gentle
 * flicker from animTime. Draws in world space (caller's transform).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w:number,h:number}} door door slab rect, world px
 * @param {number} wallBottom world y of the wall face's floor line
 */
export function drawDeathsDoorLanterns(ctx, door, wallBottom, camX, camY, animTime = 0) {
  drawDoorLanterns(ctx, door, wallBottom, camX, camY, animTime, 'purple');
}

/**
 * Two green lanterns on the Hallway's sloped south wall, one each side of
 * the south-return door. Like everything mounted on that face they are
 * rotated 180° (plate and cap toward the rim, the bottom of the screen) and
 * foreshortened and slanted along the band's perspective so they sit flush
 * on the slope. Same lantern, spacing, wash, glow and flicker as the purple
 * pair on the end wall; the shadow falls toward the floor edge, which is
 * "down" on this face.
 * @param {{x:number,y:number,w:number,h:number}} door door slab rect, world px
 */
export function drawSouthDoorLanterns(ctx, door, camX, camY, animTime = 0) {
  const spr = paintWallLantern('green');
  const { washRgb, glowRgb } = LANTERN_LIGHT.green;
  const F = southDoorFace(door);
  const gap = 9;
  const off = door.w / 2 + gap; // same spacing as the end wall, at the threshold
  // Plate sits 2 px (foreshortened) past the lintel side of the door,
  // mirroring the end wall where it sits 2 px above the door top.
  const ay = F.yB + 2 * F.fy;
  const glassV = 7.3; // glass center, in lantern sprite px from the plate
  ctx.save();
  [-off, off].forEach((o, i) => {
    const phase = i * 2.1;
    const f = 0.88 + 0.07 * Math.sin(animTime / 11 + phase) + 0.05 * Math.sin(animTime / 4.7 + phase * 1.7);
    const ax = F.cx + F.spread(o, ay) - camX;
    const sy = ay - camY;
    // Perspective slant: toward the floor edge (up the screen) the lantern
    // leans in along the same lines as the door jambs.
    const k = (o / F.vp) * F.fy;
    const gx = ax - k * glassV;
    const gy = sy - F.fy * glassV;
    const wash = ctx.createRadialGradient(gx, gy, 0.5, gx, gy, 11);
    wash.addColorStop(0, `rgba(${washRgb[0].join(',')},${0.34 * f})`);
    wash.addColorStop(0.5, `rgba(${washRgb[1].join(',')},${0.14 * f})`);
    wash.addColorStop(1, `rgba(${washRgb[2].join(',')},0)`);
    ctx.fillStyle = wash;
    ctx.fillRect(gx - 11, gy - 11, 22, 22);
    // Shadow on the slope just past the lantern's free end, toward the floor
    // edge ("below" it on this face).
    const shV = spr.lh + 1.2;
    ctx.save();
    ctx.translate(ax - k * shV + 0.6, sy - F.fy * shV);
    ctx.scale(1, 0.38);
    const drop = ctx.createRadialGradient(0, 0, 0.2, 0, 0, 3.6);
    drop.addColorStop(0, 'rgba(8,12,20,0.45)');
    drop.addColorStop(1, 'rgba(8,12,20,0)');
    ctx.fillStyle = drop;
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Lantern body: rotated 180° about the plate, foreshortened (fy) and
    // sheared along the slope.
    ctx.save();
    ctx.transform(-1, 0, -k, -F.fy, ax, sy);
    ctx.drawImage(spr, -spr.lw / 2, 0, spr.lw, spr.lh);
    ctx.restore();
    const glow = ctx.createRadialGradient(gx, gy, 0.1, gx, gy, 3.2);
    glow.addColorStop(0, `rgba(${glowRgb[0].join(',')},${0.55 * f})`);
    glow.addColorStop(1, `rgba(${glowRgb[1].join(',')},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(gx - 3.2, gy - 3.2, 6.4, 6.4);
  });
  ctx.restore();
}

/**
 * Hallway of Time end wall, logical w×h (world px), in the same cool stone
 * as the corridor walls: a lit top cap, then a face that darkens toward the
 * floor, stone courses, and a dark recess plus lintel where the door sits.
 * @param {number} w @param {number} h
 * @param {number} dx door x in wall-local logical px @param {number} dy
 * @param {number} dw @param {number} dh
 */
export function paintEndWall(w, h, dx, dy, dw, dh) {
  const key = `hiendwall-${w}x${h}-${dx},${dy},${dw},${dh}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w * S, h * S);
  c.lw = w;
  c.lh = h;
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  const cap = Math.round(h * 0.3);
  // Cap: the top of the wall seen from above.
  const capG = ctx.createLinearGradient(0, 0, 0, cap);
  capG.addColorStop(0, '#a9b8c9');
  capG.addColorStop(0.5, '#8ea0b4');
  capG.addColorStop(1, '#6d8096');
  ctx.fillStyle = capG;
  ctx.fillRect(0, 0, w, cap);
  ctx.fillStyle = 'rgba(213,226,238,0.45)';
  ctx.fillRect(0, 0, w, 1);
  // Face: lighter under the cap, darkest where it meets the floor.
  const face = ctx.createLinearGradient(0, cap, 0, h);
  face.addColorStop(0, '#5a6b80');
  face.addColorStop(0.45, '#45556a');
  face.addColorStop(1, '#2a3646');
  ctx.fillStyle = face;
  ctx.fillRect(0, cap, w, h - cap);
  // Ledge shadow under the cap.
  ctx.fillStyle = 'rgba(20,26,36,0.7)';
  ctx.fillRect(0, cap, w, 0.8);
  // Stone courses with staggered joints.
  ctx.lineWidth = 0.35;
  const course = (h - cap) / 3;
  for (let r = 0; r < 3; r++) {
    const y0 = cap + r * course;
    if (r > 0) {
      ctx.strokeStyle = 'rgba(18,24,34,0.5)';
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(w, y0);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(190,205,222,0.14)';
      ctx.beginPath();
      ctx.moveTo(0, y0 + 0.45);
      ctx.lineTo(w, y0 + 0.45);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(18,24,34,0.45)';
    ctx.beginPath();
    for (let x = (r % 2) * 8 + 8; x < w; x += 16) {
      ctx.moveTo(x, y0 + 0.8);
      ctx.lineTo(x, y0 + course);
    }
    ctx.stroke();
  }
  // Baseboard where the wall meets the floor.
  ctx.fillStyle = '#1c2430';
  ctx.fillRect(0, h - 1.2, w, 1.2);
  // Outer ends of the wall meet the void.
  ctx.fillStyle = 'rgba(10,14,22,0.55)';
  ctx.fillRect(0, 0, 0.8, h);
  ctx.fillRect(w - 0.8, 0, 0.8, h);
  // Door recess and stone lintel, so the door reads as set into the wall.
  ctx.fillStyle = '#141a24';
  ctx.fillRect(dx - 1, dy - 1, dw + 2, dh + 1);
  const lt = dy - 3.6;
  const lintel = ctx.createLinearGradient(0, lt, 0, dy - 1);
  lintel.addColorStop(0, '#9aabbe');
  lintel.addColorStop(1, '#5c6d82');
  ctx.fillStyle = lintel;
  ctx.fillRect(dx - 2.5, lt, dw + 5, 2.6);
  ctx.strokeStyle = 'rgba(18,24,34,0.8)';
  ctx.lineWidth = 0.4;
  ctx.strokeRect(dx - 2.5, lt, dw + 5, 2.6);
  // Jambs either side of the door.
  ctx.fillStyle = '#5c6d82';
  ctx.fillRect(dx - 2.5, dy - 1, 1.5, dh + 1);
  ctx.fillStyle = '#3a4758';
  ctx.fillRect(dx + dw + 1, dy - 1, 1.5, dh + 1);
  cache.set(key, c);
  return c;
}

/**
 * Hallway of Time south wall, logical w×h (world px), seen from above as a
 * bevelled band: its inner edge (top, next to the floor) is the top of the
 * slope, and the face angles down and outward toward the bottom of the
 * screen. Same cool stone palette as the corridor walls: darkest at the
 * floor edge, lighter toward the outer rim, like the side walls' inner face.
 * Diagonal miter seams join it to the side walls (sideT thick); the side
 * walls' own tiles fill the corner triangles above the miters. The door is
 * set into the slope rotated 180° (the face looks back north at the room):
 * a recessed opening whose jambs flare with the slope, a worn threshold at
 * the floor edge and a stone lintel on the rim side.
 * @param {number} w @param {number} h
 * @param {number} dx door x in wall-local logical px @param {number} dy
 * @param {number} dw @param {number} dh
 * @param {number} [sideT] side wall thickness in logical px
 */
export function paintSouthWall(w, h, dx, dy, dw, dh, sideT = 32) {
  const key = `hisouthwall-bevel-v2-${w}x${h}-${dx},${dy},${dw},${dh}-${sideT}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w * S, h * S);
  c.lw = w;
  c.lh = h;
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  const T = 16;

  // Corner triangles above the miters: the side walls continue down into
  // the corners with their own tiles (outer column 's', inner face 'e'/'w').
  const sideTiles = (x0, faces) => {
    for (let col = 0; col < faces.length; col++) {
      for (let row = 0; row < Math.ceil(h / T); row++) {
        ctx.drawImage(paintSurface('wallPurple', 0, faces[col]), x0 + col * T, row * T, T, T);
      }
    }
  };
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(sideT, 0);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.clip();
  sideTiles(0, ['s', 'e']);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w - sideT, 0);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.clip();
  sideTiles(w - sideT, ['w', 's']);
  ctx.restore();

  // The sloped band: a trapezoid from the inner (floor) edge out to the rim.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sideT, 0);
  ctx.lineTo(w - sideT, 0);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.clip();
  const face = ctx.createLinearGradient(0, 0, 0, h);
  face.addColorStop(0, '#2f3b4b');
  face.addColorStop(0.4, '#45556a');
  face.addColorStop(0.82, '#6d8096');
  face.addColorStop(1, '#8ea0b4');
  ctx.fillStyle = face;
  ctx.fillRect(0, 0, w, h);
  // Brick courses parallel to the band, foreshortened: shallower near the
  // floor edge, taller toward the rim. Joints staggered per course.
  const courses = [0, 6.5, 14.5, 23.5, h];
  ctx.lineWidth = 0.35;
  for (let r = 0; r < courses.length - 1; r++) {
    const y0 = courses[r];
    const y1 = courses[r + 1];
    if (r > 0) {
      ctx.strokeStyle = 'rgba(18,24,34,0.55)';
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(w, y0);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(200,214,230,0.16)';
      ctx.beginPath();
      ctx.moveTo(0, y0 + 0.45);
      ctx.lineTo(w, y0 + 0.45);
      ctx.stroke();
    }
    const brick = 10 + r * 2;
    ctx.strokeStyle = 'rgba(18,24,34,0.42)';
    ctx.beginPath();
    for (let x = (r % 2) * (brick / 2) + brick / 2; x < w; x += brick) {
      ctx.moveTo(x, y0 + 0.7);
      ctx.lineTo(x, y1);
    }
    ctx.stroke();
  }
  // Light catching the outer rim of the slope, as on the side walls.
  ctx.fillStyle = 'rgba(213,226,238,0.32)';
  ctx.fillRect(0, h - 3, w, 3);
  ctx.restore();

  // Miter seams where the band meets the side walls.
  ctx.lineWidth = 0.55;
  ctx.strokeStyle = 'rgba(14,19,28,0.75)';
  ctx.beginPath();
  ctx.moveTo(sideT, 0);
  ctx.lineTo(0, h);
  ctx.moveTo(w - sideT, 0);
  ctx.lineTo(w, h);
  ctx.stroke();
  ctx.lineWidth = 0.3;
  ctx.strokeStyle = 'rgba(200,214,230,0.28)';
  ctx.beginPath();
  ctx.moveTo(sideT + 0.6, 0);
  ctx.lineTo(0.6, h);
  ctx.moveTo(w - sideT - 0.6, 0);
  ctx.lineTo(w - 0.6, h);
  ctx.stroke();
  // Inner (floor) edge: a dark contact line and a thin lit lip.
  ctx.fillStyle = 'rgba(14,19,28,0.8)';
  ctx.fillRect(sideT, 0, w - sideT * 2, 0.7);
  ctx.fillStyle = 'rgba(190,205,222,0.22)';
  ctx.fillRect(sideT, 0.7, w - sideT * 2, 0.35);

  // Doorway cut into the slope, oriented like everything mounted on this
  // face (rotated 180°): threshold at the floor edge (top of the band),
  // lintel on the outer side (toward the rim). Opening, jambs and lintel all
  // follow the band's perspective, flaring toward the rim.
  const F = southDoorFace({ x: dx, y: dy, w: dw, h: dh });
  const at = (off, y) => F.cx + F.spread(off, y);
  const poly = (pts, fill) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const quad = (o0, o1, y0, y1) => [[at(o0, y0), y0], [at(o1, y0), y0], [at(o1, y1), y1], [at(o0, y1), y1]];
  const inO = dw / 2 + 1; // recess half-width at the threshold
  const frO = inO + 2.5; // outer edge of the jambs
  const rT = F.yT - 0.6; // recess starts just inside the floor edge
  const rB = F.yB + 0.6; // and ends at the lintel
  // Recess.
  poly(quad(-inO, inO, rT, rB), '#141a24');
  // Jambs: the slanted reveals, lit on the left and shaded on the right
  // (same scene light as the end wall).
  const jambL = ctx.createLinearGradient(at(-frO, rT), 0, at(-inO, rT), 0);
  jambL.addColorStop(0, '#8698ac');
  jambL.addColorStop(1, '#5c6d82');
  poly(quad(-frO, -inO, rT, rB), jambL);
  const jambR = ctx.createLinearGradient(at(inO, rT), 0, at(frO, rT), 0);
  jambR.addColorStop(0, '#3a4758');
  jambR.addColorStop(1, '#4d5d70');
  poly(quad(inO, frO, rT, rB), jambR);
  // Stone lintel on the outer (rim) side of the opening, foreshortened;
  // its lit face is the side away from the door, as on the end wall.
  const l0 = rB;
  const l1 = rB + 2.6 * F.fy;
  const lintel = ctx.createLinearGradient(0, l0, 0, l1);
  lintel.addColorStop(0, '#5c6d82');
  lintel.addColorStop(1, '#9aabbe');
  poly(quad(-frO, frO, l0, l1), lintel);
  ctx.strokeStyle = 'rgba(18,24,34,0.8)';
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  for (const [o0, o1, y0, y1] of [[-frO, -frO, rT, l1], [frO, frO, rT, l1]]) {
    ctx.moveTo(at(o0, y0), y0);
    ctx.lineTo(at(o1, y1), y1);
  }
  ctx.moveTo(at(-frO, l0), l0);
  ctx.lineTo(at(frO, l0), l0);
  ctx.moveTo(at(-frO, l1), l1);
  ctx.lineTo(at(frO, l1), l1);
  ctx.stroke();
  // Worn stone threshold where the opening meets the floor edge.
  poly(quad(-inO, inO, rT - 0.5, rT + 0.15), 'rgba(170,186,204,0.55)');
  cache.set(key, c);
  return c;
}

/**
 * Decision Room corner pieces, drawn for the same 3/4 top-down camera as the
 * room: tops of things are visible (ellipse rims, seat tops) with a short
 * front face below, light from the upper left, a soft contact shadow pushed
 * down-right, and a thin dark outline so they sit with the pixel character.
 * Logical box stays 18×18 so placement in buildDecisionRoom is unchanged.
 * Coordinates below are in logical (world) pixels; the canvas is 8× that.
 * @param {'pillar'|'plant'|'sconce'|'armchair'} kind
 */
export function paintDecor(kind) {
  const key = `hidecor-${kind}`;
  if (cache.has(key)) return cache.get(key);
  const lw = 18;
  const lh = 18;
  const c = canvas(lw * S, lh * S);
  c.lw = lw;
  c.lh = lh;
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const draw = DECOR[kind] || DECOR.pillar;
  draw(ctx);
  cache.set(key, c);
  return c;
}

const DECOR_OUTLINE = 0.5;

function ellipsePath(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
}

function fillOutline(ctx, fill, stroke, lw = DECOR_OUTLINE) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Soft contact shadow. Light is upper-left, so it sits a touch down-right. */
function contactShadow(ctx, cx, cy, rx, ry, alpha = 0.36) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
  g.addColorStop(0, `rgba(28,16,8,${alpha})`);
  g.addColorStop(0.65, `rgba(28,16,8,${alpha * 0.7})`);
  g.addColorStop(1, 'rgba(28,16,8,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function hGrad(ctx, x0, x1, stops) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
  return g;
}

function dGrad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
  return g;
}

const DECOR = {
  /** Stone column seen from above: round capital top, fluted shaft, square plinth. */
  pillar(ctx) {
    const ink = '#262a32';
    contactShadow(ctx, 10, 15.4, 8, 2.6);
    // Plinth: lit top face, darker south face.
    ctx.beginPath();
    ctx.rect(2.4, 13.6, 13.2, 2.4);
    fillOutline(ctx, hGrad(ctx, 2.4, 15.6, ['#8c96a2', '#6a7380', '#4c5460']), ink);
    ctx.beginPath();
    ctx.rect(2.4, 10.4, 13.2, 3.2);
    fillOutline(ctx, dGrad(ctx, 2.4, 10.4, 15.6, 13.6, ['#f2f5f8', '#c8d0d8', '#9ba5b0']), ink);
    // Soft shade on the plinth top where the shaft stands.
    ellipsePath(ctx, 9.6, 12.7, 5.4, 1.4);
    ctx.fillStyle = 'rgba(40,48,60,0.28)';
    ctx.fill();
    // Shaft (cylinder): light on the left, shade on the right.
    ctx.beginPath();
    ctx.moveTo(5, 4.6);
    ctx.lineTo(5, 11.8);
    ctx.ellipse(9, 11.8, 4, 1.1, 0, Math.PI, 0, true);
    ctx.lineTo(13, 4.6);
    ctx.closePath();
    fillOutline(ctx, hGrad(ctx, 5, 13, ['#e9edf2', '#cbd2da', '#9aa4af', '#68717c']), ink);
    ctx.strokeStyle = 'rgba(56,64,76,0.4)';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    for (const fx of [7, 9, 11]) {
      ctx.moveTo(fx, 6.4);
      ctx.lineTo(fx, 11.4);
    }
    ctx.stroke();
    // Base molding: a short curved band wrapping the front of the shaft.
    ctx.beginPath();
    ctx.ellipse(9, 12.7, 5.1, 1.3, 0, 0, Math.PI);
    ctx.lineTo(3.9, 11.4);
    ctx.ellipse(9, 11.4, 5.1, 1.3, 0, Math.PI, 0, true);
    ctx.closePath();
    fillOutline(ctx, hGrad(ctx, 3.9, 14.1, ['#eef1f4', '#b6bfc8', '#7a838e']), ink);
    // Capital: short front band, then the round top seen from above.
    ctx.beginPath();
    ctx.ellipse(9, 5.2, 6.2, 2.5, 0, 0, Math.PI);
    ctx.lineTo(2.8, 3.6);
    ctx.ellipse(9, 3.6, 6.2, 2.5, 0, Math.PI, 0, true);
    ctx.closePath();
    fillOutline(ctx, hGrad(ctx, 2.8, 15.2, ['#b8c0c9', '#8d97a2', '#5f6873']), ink);
    ellipsePath(ctx, 9, 3.6, 6.2, 2.5);
    const top = ctx.createRadialGradient(6.8, 2.6, 0.4, 9, 3.6, 6.4);
    top.addColorStop(0, '#ffffff');
    top.addColorStop(0.5, '#dfe4ea');
    top.addColorStop(1, '#a9b2bc');
    fillOutline(ctx, top, ink);
    ellipsePath(ctx, 9, 3.6, 3.6, 1.4);
    ctx.strokeStyle = 'rgba(80,90,104,0.35)';
    ctx.lineWidth = 0.35;
    ctx.stroke();
  },

  /** Leafy plant in a round terracotta pot, rim and soil seen from above. */
  plant(ctx) {
    const ink = '#2a160c';
    const leafInk = '#123a1c';
    contactShadow(ctx, 10, 16, 6.6, 2);
    // Pot body: tapers to the base, rounded front.
    ctx.beginPath();
    ctx.moveTo(3.2, 11);
    ctx.lineTo(4.7, 15.4);
    ctx.quadraticCurveTo(9, 17.3, 13.3, 15.4);
    ctx.lineTo(14.8, 11);
    ctx.closePath();
    fillOutline(ctx, hGrad(ctx, 3.2, 14.8, ['#e6a478', '#c47648', '#97522f', '#6c3720']), ink);
    // Rim (ellipse from above) and dark soil inside it.
    ellipsePath(ctx, 9, 11, 6, 2.4);
    fillOutline(ctx, dGrad(ctx, 3, 8.6, 15, 13.4, ['#f6c8a0', '#d8946a', '#a95e38']), ink);
    ellipsePath(ctx, 9, 11.15, 4.7, 1.7);
    fillOutline(ctx, dGrad(ctx, 4.3, 9.5, 13.7, 12.8, ['#22140a', '#4a2e1a']), null);
    const leaf = (deg, len, wid, light) => {
      const a = (deg * Math.PI) / 180;
      ctx.save();
      ctx.translate(9 + Math.cos(a) * 0.8, 10.6 + Math.sin(a) * 0.4);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
      ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
      const tones = light > 0.66
        ? ['#9be27a', '#4fb24c']
        : light > 0.33
          ? ['#62c056', '#2f8a3a']
          : ['#3e9a44', '#1f5e2c'];
      ctx.fillStyle = tones[1];
      ctx.fill();
      ctx.strokeStyle = leafInk;
      ctx.lineWidth = 0.4;
      ctx.stroke();
      // Lit half of the blade.
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
      ctx.closePath();
      ctx.fillStyle = tones[0];
      ctx.fill();
      ctx.strokeStyle = 'rgba(18,58,28,0.55)';
      ctx.lineWidth = 0.25;
      ctx.beginPath();
      ctx.moveTo(0.6, 0);
      ctx.lineTo(len * 0.9, 0);
      ctx.stroke();
      ctx.restore();
    };
    // Broad leaves fan up and out from the back of the soil; one droops over
    // the front-left of the rim so the rim ellipse still reads.
    leaf(-150, 7.0, 2.6, 0.55);
    leaf(-28, 6.8, 2.6, 0.15);
    leaf(-172, 5.4, 2.2, 0.45);
    leaf(-6, 5.4, 2.2, 0.1);
    leaf(-120, 8.4, 2.8, 0.9);
    leaf(-60, 8.0, 2.8, 0.4);
    leaf(-92, 8.8, 2.9, 0.75);
    leaf(-104, 5.4, 2.2, 0.95);
    leaf(146, 4.4, 2.0, 0.5);
  },

  /** Standing brass candle stand from above: round foot, pole, drip dish, lit candle. */
  sconce(ctx) {
    const ink = '#3a2408';
    const brass = (x0, x1) => hGrad(ctx, x0, x1, ['#fbe9a8', '#e0b452', '#a8761e', '#6e4a12']);
    // Warm light pooled on the floor around the stand.
    const pool = ctx.createRadialGradient(9, 10, 0.5, 9, 10, 9);
    pool.addColorStop(0, 'rgba(255,206,120,0.34)');
    pool.addColorStop(0.6, 'rgba(255,190,90,0.14)');
    pool.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, 18, 18);
    contactShadow(ctx, 9.8, 15.8, 5.2, 1.6, 0.4);
    // Foot: thin south face, then the round top.
    ellipsePath(ctx, 9, 15.3, 4.5, 1.8);
    fillOutline(ctx, '#7a5216', ink);
    ellipsePath(ctx, 9, 14.6, 4.5, 1.8);
    fillOutline(ctx, brass(4.5, 13.5), ink);
    ellipsePath(ctx, 8.2, 14.2, 1.8, 0.6);
    ctx.fillStyle = 'rgba(255,248,220,0.55)';
    ctx.fill();
    // Pole and collar.
    ctx.beginPath();
    ctx.rect(8.25, 7.6, 1.5, 7);
    fillOutline(ctx, brass(8.25, 9.75), ink, 0.4);
    ellipsePath(ctx, 9, 11.2, 1.4, 0.6);
    fillOutline(ctx, brass(7.6, 10.4), ink, 0.4);
    // Drip dish.
    ellipsePath(ctx, 9, 7.9, 3.9, 1.6);
    fillOutline(ctx, '#7a5216', ink);
    ellipsePath(ctx, 9, 7.3, 3.9, 1.6);
    fillOutline(ctx, brass(5.1, 12.9), ink);
    ellipsePath(ctx, 9, 7.3, 2.6, 0.95);
    ctx.fillStyle = 'rgba(110,74,18,0.45)';
    ctx.fill();
    // Candle: cylinder with its wax top showing.
    ctx.beginPath();
    ctx.rect(7.9, 3.8, 2.2, 3.5);
    fillOutline(ctx, hGrad(ctx, 7.9, 10.1, ['#fffaf0', '#efe4cc', '#c9b894']), '#6a5434', 0.4);
    ellipsePath(ctx, 9, 3.8, 1.1, 0.5);
    fillOutline(ctx, '#fffdf6', '#6a5434', 0.35);
    // Flame and halo.
    const halo = ctx.createRadialGradient(9, 2.4, 0.2, 9, 2.4, 3.8);
    halo.addColorStop(0, 'rgba(255,236,170,0.75)');
    halo.addColorStop(0.5, 'rgba(255,190,80,0.3)');
    halo.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(9, 2.4, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(9, 0.5);
    ctx.quadraticCurveTo(10.4, 2.4, 9, 3.5);
    ctx.quadraticCurveTo(7.6, 2.4, 9, 0.5);
    const flame = ctx.createRadialGradient(8.9, 2.7, 0.1, 9, 2.4, 1.6);
    flame.addColorStop(0, '#fffbe6');
    flame.addColorStop(0.55, '#ffd36a');
    flame.addColorStop(1, '#ff9a2a');
    ctx.fillStyle = flame;
    ctx.fill();
  },

  /**
   * Upholstered armchair from above, facing west into the room: the back
   * runs along the east side, arms north and south, seat cushion between,
   * and only the south face shows as a short front edge.
   */
  armchair(ctx) {
    const ink = '#2a1210';
    contactShadow(ctx, 10, 15.6, 8.4, 2.4);
    // South face of the whole chair (the only side face this camera sees).
    ctx.beginPath();
    ctx.rect(2.4, 14, 13.8, 2.2);
    fillOutline(ctx, hGrad(ctx, 2.4, 16.2, ['#8a3a30', '#6a2620', '#4e1a16']), ink);
    ctx.fillStyle = '#4a2c18';
    ctx.fillRect(2.8, 16.2, 1.2, 0.8);
    ctx.fillRect(14.6, 16.2, 1.2, 0.8);
    // Seat cushion.
    roundRect(ctx, 3.4, 4.4, 9.4, 7.6, 1.4);
    fillOutline(ctx, dGrad(ctx, 3.4, 4.4, 12.8, 12, ['#e48a70', '#c25a46', '#943a30']), ink);
    ctx.strokeStyle = 'rgba(70,20,16,0.45)';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(4.4, 8.2);
    ctx.lineTo(11.8, 8.2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,230,210,0.35)';
    ctx.fillRect(4.2, 5, 4.2, 0.7);
    // Arms (north and south), lit on top.
    const arm = (y) => {
      roundRect(ctx, 2.4, y, 11.2, 3.4, 1.4);
      fillOutline(ctx, dGrad(ctx, 2.4, y, 2.4, y + 3.4, ['#d8735c', '#b04c3c', '#8a3a30']), ink);
      ctx.strokeStyle = '#e6c86a';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(3.4, y + 2.9);
      ctx.lineTo(12.6, y + 2.9);
      ctx.stroke();
    };
    arm(1.4);
    arm(10.8);
    // Back along the east side, taller than the arms.
    roundRect(ctx, 12.2, 0.8, 4, 13.8, 1.6);
    fillOutline(ctx, hGrad(ctx, 12.2, 16.2, ['#d06a54', '#a8443a', '#7a2c24']), ink);
    ctx.fillStyle = '#e6c86a';
    for (const by of [4.2, 7.6, 11]) {
      ellipsePath(ctx, 14.1, by, 0.45, 0.45);
      ctx.fill();
    }
  },
};

/**
 * Decision Room teller window in the same painted language as the doors.
 * Logical size matches the old stamp so hit targets do not move.
 * South windows are wide; east/west windows are tall. Icons stay upright.
 * @param {string} action
 * @param {'south'|'west'|'east'|'north'} wallSide
 */
export function paintTeller(action, wallSide = 'south') {
  const vertical = wallSide === 'west' || wallSide === 'east';
  const lw = vertical ? 24 : 32;
  const lh = vertical ? 32 : 24;
  const key = `hiteller-${action}-${wallSide}-${lw}x${lh}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(lw * S, lh * S);
  c.lw = lw;
  c.lh = lh;
  // Side windows used to be the wide stamp rotated. Footprint stays 24×32 at x-2.
  c.ox = vertical ? -2 : 0;
  c.oy = 0;
  const ctx = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  ctx.fillStyle = tellerWallGradient(ctx, W, H, wallSide);
  ctx.fillRect(0, 0, W, H);

  const wood = ctx.createLinearGradient(0, 0, W, H);
  wood.addColorStop(0, '#e0b07a');
  wood.addColorStop(0.45, '#a56b3c');
  wood.addColorStop(1, '#5c3a22');
  ctx.fillStyle = wood;
  ctx.fillRect(W * 0.07, H * 0.07, W * 0.86, H * 0.86);
  // Plank seams, same idea as the door boards.
  ctx.strokeStyle = 'rgba(74, 42, 20, 0.4)';
  ctx.lineWidth = Math.max(2, S / 2);
  ctx.beginPath();
  if (vertical) {
    ctx.moveTo(W * 0.4, H * 0.1);
    ctx.lineTo(W * 0.4, H * 0.9);
    ctx.moveTo(W * 0.62, H * 0.1);
    ctx.lineTo(W * 0.62, H * 0.9);
  } else {
    ctx.moveTo(W * 0.38, H * 0.1);
    ctx.lineTo(W * 0.38, H * 0.9);
    ctx.moveTo(W * 0.62, H * 0.1);
    ctx.lineTo(W * 0.62, H * 0.9);
  }
  ctx.stroke();

  ctx.fillStyle = '#2e333b';
  ctx.fillRect(W * 0.14, H * 0.14, W * 0.72, H * 0.72);
  // Iron hinges on the outer stile.
  ctx.fillStyle = '#3a3e46';
  if (wallSide === 'east') {
    ctx.fillRect(W * 0.78, H * 0.22, W * 0.1, H * 0.1);
    ctx.fillRect(W * 0.78, H * 0.68, W * 0.1, H * 0.1);
  } else if (vertical) {
    ctx.fillRect(W * 0.12, H * 0.22, W * 0.1, H * 0.1);
    ctx.fillRect(W * 0.12, H * 0.68, W * 0.1, H * 0.1);
  } else {
    ctx.fillRect(W * 0.16, H * 0.78, W * 0.16, H * 0.08);
    ctx.fillRect(W * 0.68, H * 0.78, W * 0.16, H * 0.08);
  }

  const glass = glassRect(W, H, wallSide);
  const gg = ctx.createLinearGradient(glass.x, glass.y, glass.x, glass.y + glass.h);
  gg.addColorStop(0, '#d5e4ef');
  gg.addColorStop(0.45, '#8eafc6');
  gg.addColorStop(1, '#5d7c96');
  ctx.fillStyle = gg;
  ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(glass.x + glass.w * 0.08, glass.y + glass.h * 0.08, glass.w * 0.28, glass.h * 0.18);

  drawTellerSill(ctx, W, H, wallSide);
  paintTellerIcon(ctx, action, glass.x, glass.y, glass.w, glass.h);
  cache.set(key, c);
  return c;
}

function tellerWallGradient(ctx, W, H, wallSide) {
  // Lighter at the outer top of the wall, darker where the wall meets the floor.
  if (wallSide === 'west') {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#c4b6a4');
    g.addColorStop(0.35, '#7a6a58');
    g.addColorStop(1, '#2e261e');
    return g;
  }
  if (wallSide === 'east') {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#2e261e');
    g.addColorStop(0.65, '#7a6a58');
    g.addColorStop(1, '#c4b6a4');
    return g;
  }
  if (wallSide === 'north') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#c4b6a4');
    g.addColorStop(0.4, '#7a6a58');
    g.addColorStop(1, '#2e261e');
    return g;
  }
  // South wall: the room floor is above the window.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2e261e');
  g.addColorStop(0.4, '#5c4c3c');
  g.addColorStop(1, '#c4b6a4');
  return g;
}

function glassRect(W, H, wallSide) {
  if (wallSide === 'west') return { x: W * 0.18, y: H * 0.18, w: W * 0.5, h: H * 0.64 };
  if (wallSide === 'east') return { x: W * 0.32, y: H * 0.18, w: W * 0.5, h: H * 0.64 };
  return { x: W * 0.16, y: H * 0.28, w: W * 0.68, h: H * 0.48 };
}

function drawTellerSill(ctx, W, H, wallSide) {
  ctx.fillStyle = '#6b4224';
  if (wallSide === 'west') {
    ctx.fillRect(W * 0.68, H * 0.12, W * 0.18, H * 0.76);
    ctx.fillStyle = '#e6c86a';
    ctx.fillRect(W * 0.68, H * 0.12, Math.max(3, W * 0.035), H * 0.76);
    return;
  }
  if (wallSide === 'east') {
    ctx.fillRect(W * 0.14, H * 0.12, W * 0.16, H * 0.76);
    ctx.fillStyle = '#e6c86a';
    ctx.fillRect(W * 0.27, H * 0.12, Math.max(3, W * 0.035), H * 0.76);
    return;
  }
  ctx.fillRect(W * 0.1, H * 0.08, W * 0.8, H * 0.16);
  ctx.fillStyle = '#e6c86a';
  ctx.fillRect(W * 0.1, H * 0.22, W * 0.8, Math.max(3, H * 0.04));
}

function paintTellerIcon(ctx, action, x, y, w, h) {
  const pad = Math.min(w, h) * 0.06;
  const ix = x + pad;
  const iy = y + pad;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const draw = TELLER_ICONS[action] || TELLER_ICONS.home;
  draw(ctx, ix, iy, iw, ih);
  ctx.restore();
}

const TELLER_ICONS = {
  home: iconHome,
  stock: iconChart,
  kid: iconKid,
  purchase: iconBag,
  job: iconPaycheck,
  borrow: iconVault,
  portfolio: iconPortfolio,
  bank: iconBank,
};

function iconBank(ctx, x, y, w, h) {
  // Columned bank front with a gold coin: where Savings / 401(k) money becomes Cash.
  ctx.fillStyle = '#f4e7d0';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.08, y + h * 0.34);
  ctx.lineTo(x + w * 0.5, y + h * 0.08);
  ctx.lineTo(x + w * 0.92, y + h * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x + w * 0.1, y + h * 0.8, w * 0.8, h * 0.1);
  ctx.fillStyle = '#c9b48e';
  for (const cx of [0.18, 0.38, 0.58, 0.78]) ctx.fillRect(x + w * cx, y + h * 0.38, w * 0.07, h * 0.42);
  ctx.fillStyle = '#e6c86a';
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.24, Math.min(w, h) * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function iconPortfolio(ctx, x, y, w, h) {
  // Briefcase / ledger
  ctx.fillStyle = '#6b4a2e';
  ctx.fillRect(x + w * 0.12, y + h * 0.28, w * 0.76, h * 0.55);
  ctx.fillStyle = '#e6c86a';
  ctx.fillRect(x + w * 0.12, y + h * 0.28, w * 0.76, h * 0.1);
  ctx.fillStyle = '#f4e7d0';
  ctx.fillRect(x + w * 0.38, y + h * 0.18, w * 0.24, h * 0.14);
  ctx.fillStyle = '#2c6eac';
  ctx.fillRect(x + w * 0.22, y + h * 0.48, w * 0.2, h * 0.08);
  ctx.fillRect(x + w * 0.48, y + h * 0.48, w * 0.3, h * 0.08);
  ctx.fillRect(x + w * 0.22, y + h * 0.62, w * 0.56, h * 0.08);
}

function iconHome(ctx, x, y, w, h) {
  ctx.fillStyle = '#9a342c';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.06, y + h * 0.44);
  ctx.lineTo(x + w * 0.5, y + h * 0.06);
  ctx.lineTo(x + w * 0.94, y + h * 0.44);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4e7d0';
  ctx.fillRect(x + w * 0.18, y + h * 0.42, w * 0.64, h * 0.52);
  ctx.fillStyle = '#5c3a22';
  ctx.fillRect(x + w * 0.42, y + h * 0.64, w * 0.16, h * 0.3);
  ctx.fillStyle = '#3d86b4';
  ctx.fillRect(x + w * 0.26, y + h * 0.52, w * 0.12, h * 0.14);
  ctx.fillRect(x + w * 0.62, y + h * 0.52, w * 0.12, h * 0.14);
}

function iconChart(ctx, x, y, w, h) {
  ctx.strokeStyle = '#e6c86a';
  ctx.lineWidth = Math.max(3, h * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, y + h * 0.84);
  ctx.lineTo(x + w * 0.92, y + h * 0.84);
  ctx.stroke();
  const heights = [0.26, 0.4, 0.56, 0.74];
  const colors = ['#2c6eac', '#3c88c4', '#6eb0dc', '#f0d78a'];
  heights.forEach((bh, i) => {
    const bw = w * 0.14;
    const bx = x + w * (0.16 + i * 0.18);
    const top = y + h * (0.84 - bh);
    ctx.fillStyle = colors[i];
    ctx.fillRect(bx, top, bw, y + h * 0.84 - top);
  });
}

function iconKid(ctx, x, y, w, h) {
  const head = Math.min(w, h) * 0.16;
  ctx.fillStyle = '#efc79a';
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.26, head, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6a4030';
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.22, head, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  ctx.fillStyle = '#3f9a62';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.3, y + h * 0.44);
  ctx.lineTo(x + w * 0.7, y + h * 0.44);
  ctx.lineTo(x + w * 0.76, y + h * 0.72);
  ctx.lineTo(x + w * 0.24, y + h * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2c3c5c';
  ctx.fillRect(x + w * 0.36, y + h * 0.72, w * 0.1, h * 0.22);
  ctx.fillRect(x + w * 0.54, y + h * 0.72, w * 0.1, h * 0.22);
}

function iconBag(ctx, x, y, w, h) {
  ctx.strokeStyle = '#e6c86a';
  ctx.lineWidth = Math.max(3, w * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x + w * 0.38, y + h * 0.3, w * 0.12, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w * 0.62, y + h * 0.3, w * 0.12, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#6a4584';
  roundRect(ctx, x + w * 0.16, y + h * 0.32, w * 0.68, h * 0.58, Math.min(w, h) * 0.08);
  ctx.fill();
  ctx.fillStyle = '#f0d78a';
  ctx.fillRect(x + w * 0.4, y + h * 0.5, w * 0.2, h * 0.18);
}

function iconPaycheck(ctx, x, y, w, h) {
  ctx.fillStyle = '#f7f1e2';
  roundRect(ctx, x + w * 0.06, y + h * 0.16, w * 0.7, h * 0.66, Math.min(w, h) * 0.06);
  ctx.fill();
  ctx.strokeStyle = '#8a7048';
  ctx.lineWidth = Math.max(2, w * 0.035);
  ctx.stroke();
  ctx.strokeStyle = '#c8b898';
  ctx.lineWidth = Math.max(2, h * 0.045);
  ctx.beginPath();
  for (const ly of [0.36, 0.5, 0.64]) {
    ctx.moveTo(x + w * 0.16, y + h * ly);
    ctx.lineTo(x + w * 0.58, y + h * ly);
  }
  ctx.stroke();
  ctx.fillStyle = '#e6c86a';
  ctx.beginPath();
  ctx.arc(x + w * 0.74, y + h * 0.64, Math.min(w, h) * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a6230';
  ctx.beginPath();
  ctx.arc(x + w * 0.74, y + h * 0.64, Math.min(w, h) * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

function iconVault(ctx, x, y, w, h) {
  // Borrow: three gold coins and a curved arrow aimed at the stack.
  // Kept inside the pane so the narrow east window does not clip it.
  const cx = x + w * 0.36;
  const layers = [
    { t: 0.74, rx: 0.22 },
    { t: 0.54, rx: 0.19 },
    { t: 0.35, rx: 0.16 },
  ];
  for (const coin of layers) {
    const cy = y + h * coin.t;
    const rx = w * coin.rx;
    const ry = Math.max(4, h * 0.09);
    ctx.fillStyle = '#6e4c22';
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.5, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6c86a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6e7b0';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.15, cy - ry * 0.15, rx * 0.36, ry * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const r = Math.min(w * 0.22, h * 0.2);
  const acx = x + w * 0.64;
  const acy = y + h * 0.38;
  const a0 = -1.05;
  const a1 = 1.05;
  ctx.strokeStyle = '#f7f1e2';
  ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.055);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(acx, acy, r, a0, a1);
  ctx.stroke();

  const hx = acx + Math.cos(a1) * r;
  const hy = acy + Math.sin(a1) * r;
  const dir = a1 + Math.PI / 2;
  const head = Math.min(w, h) * 0.11;
  ctx.fillStyle = '#f7f1e2';
  ctx.beginPath();
  ctx.moveTo(hx + Math.cos(dir) * head, hy + Math.sin(dir) * head);
  ctx.lineTo(
    hx + Math.cos(dir + 2.45) * head * 0.78,
    hy + Math.sin(dir + 2.45) * head * 0.78
  );
  ctx.lineTo(
    hx + Math.cos(dir - 2.45) * head * 0.78,
    hy + Math.sin(dir - 2.45) * head * 0.78
  );
  ctx.closePath();
  ctx.fill();
}
