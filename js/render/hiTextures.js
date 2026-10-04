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
  const W = c.width;
  const H = c.height;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, 10 * S, 8 * S, w * S, h * S, 8);
  ctx.fill();
  const ox = 2 * S;
  const oy = 1 * S;
  const rw = w * S;
  const rh = h * S;
  const g = ctx.createRadialGradient(ox + rw * 0.5, oy + rh * 0.45, 20, ox + rw * 0.5, oy + rh * 0.5, rw * 0.55);
  g.addColorStop(0, '#a33a48');
  g.addColorStop(0.7, '#7c2432');
  g.addColorStop(1, '#5c1824');
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
  ctx.fillStyle = '#7c2432';
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
