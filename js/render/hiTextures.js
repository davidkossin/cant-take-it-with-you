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

export function paintDoor(facing) {
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

export function paintDecor(kind) {
  const key = `hidecor-${kind}`;
  if (cache.has(key)) return cache.get(key);
  const lw = 18;
  const lh = 18;
  const c = canvas(lw * S, lh * S);
  c.lw = lw;
  c.lh = lh;
  const ctx = c.getContext('2d');
  const n = lw * S;
  if (kind === 'pillar') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(n / 2, n * 0.86, n * 0.32, n * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(n * 0.3, 0, n * 0.7, n);
    g.addColorStop(0, '#e4e8ee');
    g.addColorStop(0.4, '#9aa3ad');
    g.addColorStop(1, '#5c656e');
    ctx.fillStyle = g;
    roundRect(ctx, n * 0.22, n * 0.12, n * 0.56, n * 0.16, 6);
    ctx.fill();
    ctx.fillRect(n * 0.3, n * 0.28, n * 0.4, n * 0.36);
    roundRect(ctx, n * 0.16, n * 0.62, n * 0.68, n * 0.18, 4);
    ctx.fill();
  } else if (kind === 'plant') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(n / 2, n * 0.84, n * 0.22, n * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    const pot = ctx.createLinearGradient(0, n * 0.55, 0, n * 0.84);
    pot.addColorStop(0, '#d4926a');
    pot.addColorStop(1, '#8a4e30');
    ctx.fillStyle = pot;
    ctx.beginPath();
    ctx.moveTo(n * 0.32, n * 0.55);
    ctx.lineTo(n * 0.68, n * 0.55);
    ctx.lineTo(n * 0.6, n * 0.82);
    ctx.lineTo(n * 0.4, n * 0.82);
    ctx.fill();
    ctx.fillStyle = '#2f8a3a';
    ctx.beginPath();
    ctx.ellipse(n * 0.38, n * 0.42, n * 0.16, n * 0.1, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3cb04a';
    ctx.beginPath();
    ctx.ellipse(n * 0.55, n * 0.36, n * 0.18, n * 0.12, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f7030';
    ctx.beginPath();
    ctx.ellipse(n * 0.68, n * 0.46, n * 0.12, n * 0.08, 0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'sconce') {
    ctx.fillStyle = '#4a5058';
    ctx.fillRect(n * 0.44, n * 0.48, n * 0.12, n * 0.32);
    const flame = ctx.createRadialGradient(n * 0.5, n * 0.4, 2, n * 0.5, n * 0.42, n * 0.22);
    flame.addColorStop(0, '#fff4d0');
    flame.addColorStop(0.45, '#ffb04a');
    flame.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.ellipse(n * 0.5, n * 0.38, n * 0.16, n * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, n);
    g.addColorStop(0, '#e6c89a');
    g.addColorStop(1, '#6b4224');
    ctx.fillStyle = g;
    ctx.fillRect(n * 0.1, n * 0.12, n * 0.78, n * 0.14);
    ctx.fillRect(n * 0.12, n * 0.26, n * 0.14, n * 0.58);
    ctx.strokeStyle = '#a87448';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(n * 0.26, n * 0.32);
    ctx.quadraticCurveTo(n * 0.7, n * 0.28, n * 0.72, n * 0.7);
    ctx.stroke();
  }
  cache.set(key, c);
  return c;
}

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
};

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
