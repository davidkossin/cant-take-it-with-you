/**
 * Decision Room teller icons: one picture per window, drawn upright on the
 * pane by tellerWindows.js.
 *
 * Every icon is drawn in a 20×16 design box, scaled uniformly into whatever
 * pane rect it gets (wide on north/south walls, tall on east/west), so the
 * proportions never stretch. One shared palette, light from the upper left,
 * and a single dark outer contour so the set reads as one family.
 * Original art.
 */

// ---------- palette ----------

const INK = '#2a170a';
const IV = ['#fffaf0', '#f3e6c8', '#d8c29c', '#a88e66'];
const AU = ['#fff3c0', '#f2d27a', '#cf9f45', '#8e6224'];
const RD = ['#ec8a70', '#c4493a', '#842b22'];
const GN = ['#a6e6ae', '#4fae72', '#2a6c46'];
const BL = ['#b0d8f2', '#5a98c8', '#2c5c88'];
const BR = ['#cc9a66', '#94603a', '#5c361c'];
const SK = ['#ffe2c0', '#f0b88a', '#c08458'];
const NV = ['#33465c', '#1c2838', '#0e1622'];

const DW = 20;
const DH = 16;
const LINE = 0.5; // inner detail weight, design units
const OUTLINE = 0.72; // outer contour, design units

// ---------- helpers (design units) ----------

function grad(ctx, x0, y0, x1, y1, cols) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  cols.forEach((c, i) => g.addColorStop(i / (cols.length - 1), c));
  return g;
}

function vg(ctx, y0, y1, cols) {
  return grad(ctx, 0, y0, 0, y1, cols);
}

function dg(ctx, x0, y0, x1, y1, cols) {
  return grad(ctx, x0, y0, x1, y1, cols);
}

function rr(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

function fill(ctx, build, style) {
  ctx.beginPath();
  build();
  ctx.fillStyle = style;
  ctx.fill();
}

function stroke(ctx, build, w = LINE, color = INK) {
  ctx.beginPath();
  build();
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function poly(ctx, pts) {
  return () => {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
}

function seg(ctx, pts) {
  return () => {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  };
}

function circ(ctx, x, y, r) {
  return () => ctx.arc(x, y, r, 0, Math.PI * 2);
}

function rect(ctx, x, y, w, h, r = 0) {
  return () => (r ? rr(ctx, x, y, w, h, r) : ctx.rect(x, y, w, h));
}

/** Filled shape with an ink edge. */
function solid(ctx, build, style, w = LINE) {
  fill(ctx, build, style);
  stroke(ctx, build, w);
}

/** Small specular glint. */
function glint(ctx, x, y, r = 0.45) {
  fill(ctx, circ(ctx, x, y, r), 'rgba(255,255,248,0.95)');
}

function coin(ctx, x, y, r, mark = true) {
  solid(ctx, circ(ctx, x, y, r), dg(ctx, x - r, y - r, x + r, y + r, [AU[0], AU[1], AU[2], AU[3]]));
  stroke(ctx, circ(ctx, x, y, r * 0.68), Math.max(0.28, r * 0.12), 'rgba(142,98,36,0.85)');
  if (mark) {
    ctx.fillStyle = AU[3];
    ctx.font = `bold ${r * 1.25}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', x, y + r * 0.06);
  }
  glint(ctx, x - r * 0.42, y - r * 0.42, r * 0.2);
}

function person(ctx, cx, top, scale, body, hair) {
  // Rounded-shoulder figure: head + torso, standing on the ground line.
  const hr = 1.75 * scale;
  const hy = top + hr;
  const by = hy + hr + 0.35 * scale;
  const bw = 3.2 * scale;
  const bh = 16 - by - 0.4;
  const torso = () => {
    ctx.moveTo(cx - bw, by + bh);
    ctx.lineTo(cx - bw, by + bw * 0.75);
    ctx.quadraticCurveTo(cx - bw, by, cx, by);
    ctx.quadraticCurveTo(cx + bw, by, cx + bw, by + bw * 0.75);
    ctx.lineTo(cx + bw, by + bh);
    ctx.closePath();
  };
  solid(ctx, torso, dg(ctx, cx - bw, by, cx + bw, by + bh, body));
  solid(ctx, circ(ctx, cx, hy, hr), dg(ctx, cx - hr, hy - hr, cx + hr, hy + hr, SK));
  fill(ctx, () => ctx.arc(cx, hy - hr * 0.1, hr, Math.PI * 1.02, Math.PI * 1.98), hair);
  stroke(ctx, circ(ctx, cx, hy, hr));
  glint(ctx, cx - hr * 0.45, hy - hr * 0.1, 0.3 * scale);
}

function arrowHead(ctx, x, y, ang, size, style) {
  const p = (a, r) => [x + Math.cos(ang + a) * r, y + Math.sin(ang + a) * r];
  solid(ctx, poly(ctx, [p(0, size), p(2.4, size * 0.85), p(-2.4, size * 0.85)]), style);
}

function briefcase(ctx, x, y, w, h) {
  const hx = x + w / 2;
  stroke(ctx, () => {
    ctx.moveTo(hx - w * 0.2, y + 0.2);
    ctx.lineTo(hx - w * 0.2, y - h * 0.22);
    ctx.quadraticCurveTo(hx - w * 0.2, y - h * 0.32, hx - w * 0.1, y - h * 0.32);
    ctx.lineTo(hx + w * 0.1, y - h * 0.32);
    ctx.quadraticCurveTo(hx + w * 0.2, y - h * 0.32, hx + w * 0.2, y - h * 0.22);
    ctx.lineTo(hx + w * 0.2, y + 0.2);
  }, h * 0.2, INK);
  stroke(ctx, () => {
    ctx.moveTo(hx - w * 0.2, y + 0.2);
    ctx.lineTo(hx - w * 0.2, y - h * 0.22);
    ctx.quadraticCurveTo(hx - w * 0.2, y - h * 0.32, hx - w * 0.1, y - h * 0.32);
    ctx.lineTo(hx + w * 0.1, y - h * 0.32);
    ctx.quadraticCurveTo(hx + w * 0.2, y - h * 0.32, hx + w * 0.2, y - h * 0.22);
    ctx.lineTo(hx + w * 0.2, y + 0.2);
  }, h * 0.1, AU[2]);
  solid(ctx, rect(ctx, x, y, w, h, h * 0.16), vg(ctx, y, y + h, BR));
  // Lid seam and highlight.
  stroke(ctx, seg(ctx, [[x + 0.3, y + h * 0.36], [x + w - 0.3, y + h * 0.36]]), LINE, 'rgba(42,23,10,0.8)');
  fill(ctx, rect(ctx, x + 0.8, y + 0.55, w - 1.6, 0.55, 0.25), 'rgba(255,230,190,0.45)');
  // Corner caps and clasp.
  for (const cx of [x + w * 0.22, x + w * 0.78]) solid(ctx, rect(ctx, cx - 0.6, y + h * 0.36 - 0.75, 1.2, 1.5, 0.3), vg(ctx, y, y + h * 0.5, AU));
  solid(ctx, rect(ctx, hx - 1.1, y + h * 0.36 - 0.9, 2.2, 1.9, 0.4), vg(ctx, y + h * 0.2, y + h * 0.55, AU));
}

function house(ctx, x, y, w, h, chimney = true) {
  // x,y = top-left of the roof peak box; w,h overall.
  const eave = y + h * 0.46;
  const wallTop = y + h * 0.42;
  const L = x + w * 0.12;
  const R = x + w * 0.88;
  if (chimney) solid(ctx, rect(ctx, x + w * 0.66, y + h * 0.06, w * 0.11, h * 0.34), vg(ctx, y, y + h * 0.4, RD));
  if (chimney) fill(ctx, rect(ctx, x + w * 0.64, y + h * 0.04, w * 0.15, h * 0.07), IV[2]);
  solid(ctx, rect(ctx, L, wallTop, R - L, y + h - wallTop), dg(ctx, L, wallTop, R, y + h, IV));
  // Roof with eaves.
  solid(ctx, poly(ctx, [[x, eave], [x + w / 2, y], [x + w, eave], [x + w * 0.94, eave + h * 0.06], [x + w * 0.06, eave + h * 0.06]]), dg(ctx, x, y, x + w, eave, RD));
  stroke(ctx, seg(ctx, [[x + w * 0.22, eave - h * 0.07], [x + w * 0.78, eave - h * 0.07]]), LINE * 0.7, 'rgba(90,24,18,0.6)');
  stroke(ctx, seg(ctx, [[x + w * 0.34, eave - h * 0.2], [x + w * 0.66, eave - h * 0.2]]), LINE * 0.7, 'rgba(90,24,18,0.6)');
  stroke(ctx, seg(ctx, [[x + w * 0.08, eave - h * 0.02], [x + w / 2, y + h * 0.04]]), LINE * 0.8, 'rgba(255,214,190,0.75)');
  // Door and windows.
  const dw = w * 0.16;
  const dx = x + w / 2 - dw / 2;
  const dy = y + h * 0.66;
  solid(ctx, () => {
    ctx.moveTo(dx, y + h);
    ctx.lineTo(dx, dy + dw / 2);
    ctx.arc(dx + dw / 2, dy + dw / 2, dw / 2, Math.PI, 0);
    ctx.lineTo(dx + dw, y + h);
    ctx.closePath();
  }, vg(ctx, dy, y + h, BR));
  fill(ctx, circ(ctx, dx + dw * 0.75, dy + (y + h - dy) * 0.6, 0.32), AU[1]);
  for (const wx of [x + w * 0.2, x + w * 0.66]) {
    const ww = w * 0.14;
    const wy = y + h * 0.58;
    const wh = h * 0.17;
    solid(ctx, rect(ctx, wx, wy, ww, wh), vg(ctx, wy, wy + wh, BL));
    stroke(ctx, seg(ctx, [[wx + ww / 2, wy], [wx + ww / 2, wy + wh]]), LINE * 0.6, IV[0]);
    stroke(ctx, seg(ctx, [[wx, wy + wh / 2], [wx + ww, wy + wh / 2]]), LINE * 0.6, IV[0]);
  }
}


// ---------- icons ----------

function homeIcon(ctx) {
  // Cottage with smoking chimney on a strip of lawn.
  for (const [cx, cy, r] of [[15.2, 1.6, 0.9], [16.8, 0.9, 0.75]]) fill(ctx, circ(ctx, cx, cy, r), 'rgba(250,244,230,0.85)');
  house(ctx, 1, 1.4, 18, 13.8, true);
  solid(ctx, rect(ctx, 0.6, 14.6, 18.8, 1.2, 0.5), vg(ctx, 14.6, 15.8, GN));
}

function axis(ctx) {
  solid(ctx, poly(ctx, [[0.8, 0.8], [2.0, 0.8], [2.0, 14.2], [19.4, 14.2], [19.4, 15.4], [0.8, 15.4]]), vg(ctx, 0, 16, AU), LINE * 0.8);
}

function stockIcon(ctx) {
  // Ivory bars with a bold rising arrow.
  axis(ctx);
  const bars = [[3.4, 11.0], [7.0, 9.0], [10.6, 7.2], [14.2, 5.0]];
  for (const [bx, top] of bars) {
    solid(ctx, rect(ctx, bx, top, 2.6, 14.2 - top), dg(ctx, bx, top, bx + 2.6, 14.2, IV));
    fill(ctx, rect(ctx, bx + 0.35, top + 0.35, 0.5, 14.2 - top - 0.6), 'rgba(255,255,250,0.8)');
  }
  const pts = [[2.6, 10.4], [7.2, 6.8], [10.2, 8.2], [16.2, 3.0]];
  stroke(ctx, seg(ctx, pts), 2.2, INK);
  stroke(ctx, seg(ctx, pts), 1.3, GN[1]);
  stroke(ctx, seg(ctx, [[3.0, 9.9], [7.2, 6.6], [10.2, 8.0], [15.6, 3.3]]), 0.35, GN[0]);
  arrowHead(ctx, 18.2, 1.3, Math.atan2(-5.2, 6), 3.2, dg(ctx, 15, 0, 19, 4, GN));
}

function familyIcon(ctx) {
  // Two adults and a child, child in front.
  person(ctx, 4.4, 1.0, 1.0, BL, '#5a3420');
  person(ctx, 15.6, 1.4, 0.95, RD, '#8a4a22');
  person(ctx, 10.0, 6.4, 0.72, GN, '#3a2214');
}

function portfolioIcon(ctx) {
  // Open ledger: leather cover, ruled pages, rising figures, gold ribbon.
  solid(ctx, () => {
    ctx.moveTo(0.4, 3.0);
    ctx.lineTo(10, 4.0);
    ctx.lineTo(19.6, 3.0);
    ctx.lineTo(19.6, 14.6);
    ctx.lineTo(10, 15.6);
    ctx.lineTo(0.4, 14.6);
    ctx.closePath();
  }, vg(ctx, 3, 15.6, BR));
  const page = (sx) => () => {
    ctx.moveTo(10, 3.2);
    ctx.quadraticCurveTo(10 + sx * 4.5, 0.8, 10 + sx * 9, 2.0);
    ctx.lineTo(10 + sx * 9, 13.4);
    ctx.quadraticCurveTo(10 + sx * 4.5, 12.4, 10, 14.6);
    ctx.closePath();
  };
  solid(ctx, page(-1), dg(ctx, 1, 1, 10, 14.6, IV));
  solid(ctx, page(1), dg(ctx, 19, 1, 10, 14.6, IV));
  // Ruled lines on the left page.
  for (let i = 0; i < 4; i++) {
    const ly = 4.6 + i * 2.1;
    stroke(ctx, () => { ctx.moveTo(2.4, ly); ctx.quadraticCurveTo(5.5, ly - 1.0, 8.6, ly + 0.3); }, 0.32, i === 3 ? GN[2] : 'rgba(120,96,60,0.75)');
  }
  // Little bar chart on the right page.
  for (const [bx, top] of [[12.0, 10.0], [14.0, 8.2], [16.0, 5.8]]) {
    solid(ctx, rect(ctx, bx, top, 1.4, 12.0 - top), vg(ctx, top, 12, GN), 0.35);
  }
  stroke(ctx, seg(ctx, [[11.4, 12.0], [17.8, 11.4]]), 0.35, 'rgba(120,96,60,0.9)');
  // Ribbon.
  solid(ctx, poly(ctx, [[9.3, 13.8], [10.7, 13.8], [10.7, 15.9], [10.0, 15.2], [9.3, 15.9]]), vg(ctx, 13.8, 16, AU), 0.35);
  stroke(ctx, seg(ctx, [[10, 3.4], [10, 14.4]]), 0.4, 'rgba(90,60,30,0.8)');
}

function purchaseIcon(ctx) {
  // A new car: the big-ticket buy.
  const body = () => {
    ctx.moveTo(0.6, 12.4);
    ctx.lineTo(0.6, 9.6);
    ctx.quadraticCurveTo(0.8, 8.2, 2.6, 8.0);
    ctx.lineTo(5.2, 7.6);
    ctx.lineTo(7.4, 4.4);
    ctx.quadraticCurveTo(8.0, 3.8, 9.0, 3.8);
    ctx.lineTo(13.6, 3.8);
    ctx.quadraticCurveTo(14.4, 3.8, 15.0, 4.6);
    ctx.lineTo(16.8, 7.6);
    ctx.lineTo(18.4, 8.0);
    ctx.quadraticCurveTo(19.4, 8.4, 19.4, 9.8);
    ctx.lineTo(19.4, 12.4);
    ctx.closePath();
  };
  solid(ctx, body, vg(ctx, 3.8, 12.4, RD));
  // Windows.
  solid(ctx, poly(ctx, [[6.6, 7.6], [8.2, 5.0], [10.8, 5.0], [10.8, 7.6]]), vg(ctx, 5, 7.6, BL), 0.4);
  solid(ctx, poly(ctx, [[11.8, 7.6], [11.8, 5.0], [13.8, 5.0], [15.4, 7.6]]), vg(ctx, 5, 7.6, BL), 0.4);
  stroke(ctx, seg(ctx, [[1.2, 9.0], [18.6, 9.0]]), 0.32, 'rgba(255,220,200,0.8)');
  stroke(ctx, seg(ctx, [[11.3, 7.8], [11.3, 11.6]]), 0.3, 'rgba(60,16,12,0.6)');
  fill(ctx, rect(ctx, 12.6, 8.4, 1.4, 0.4), AU[1]);
  // Lamps and bumper.
  solid(ctx, rect(ctx, 18.1, 9.1, 1.2, 1.0, 0.3), AU[0], 0.3);
  solid(ctx, rect(ctx, 0.6, 9.2, 0.9, 0.9, 0.2), RD[0], 0.3);
  solid(ctx, rect(ctx, 0.2, 11.4, 19.6, 1.2, 0.5), vg(ctx, 11.4, 12.6, IV), 0.4);
  for (const wx of [5.0, 15.0]) {
    solid(ctx, circ(ctx, wx, 12.6, 2.4), NV[1]);
    solid(ctx, circ(ctx, wx, 12.6, 1.2), dg(ctx, wx - 1, 11.6, wx + 1, 13.6, AU), 0.3);
    glint(ctx, wx - 0.4, 12.2, 0.25);
  }
}

function clock(ctx, x, y, r, hh = -2.2, mh = -Math.PI / 2) {
  solid(ctx, circ(ctx, x, y, r), dg(ctx, x - r, y - r, x + r, y + r, AU));
  solid(ctx, circ(ctx, x, y, r * 0.78), dg(ctx, x - r, y - r, x + r, y + r, IV), 0.35);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const r0 = i % 3 ? r * 0.64 : r * 0.56;
    stroke(ctx, seg(ctx, [[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72]]), 0.25, 'rgba(42,23,10,0.8)');
  }
  stroke(ctx, seg(ctx, [[x, y], [x + Math.cos(hh) * r * 0.4, y + Math.sin(hh) * r * 0.4]]), 0.55, INK);
  stroke(ctx, seg(ctx, [[x, y], [x + Math.cos(mh) * r * 0.6, y + Math.sin(mh) * r * 0.6]]), 0.4, INK);
  fill(ctx, circ(ctx, x, y, 0.4), RD[1]);
  glint(ctx, x - r * 0.55, y - r * 0.55, 0.3);
}

function jobIcon(ctx) {
  // Work case with the clock face over its corner.
  briefcase(ctx, 0.6, 6.2, 13.4, 9.4);
  clock(ctx, 14.8, 5.6, 4.8, -0.5, -Math.PI / 2);
}

function borrowIcon(ctx) {
  // Handshake under a gold coin.
  // Sleeves.
  solid(ctx, poly(ctx, [[0.2, 9.2], [3.6, 7.4], [5.6, 12.2], [2.2, 14.2]]), dg(ctx, 0, 7, 5, 14, BL));
  solid(ctx, poly(ctx, [[19.8, 9.2], [16.4, 7.4], [14.4, 12.2], [17.8, 14.2]]), dg(ctx, 15, 7, 20, 14, BR));
  fill(ctx, poly(ctx, [[3.6, 7.4], [4.3, 7.0], [6.3, 11.8], [5.6, 12.2]]), IV[0]);
  fill(ctx, poly(ctx, [[16.4, 7.4], [15.7, 7.0], [13.7, 11.8], [14.4, 12.2]]), IV[0]);
  // Right hand (back, palm reaching over).
  const back = () => {
    ctx.moveTo(15.8, 7.4);
    ctx.quadraticCurveTo(13.0, 6.4, 10.6, 7.0);
    ctx.lineTo(7.6, 8.6);
    ctx.quadraticCurveTo(7.0, 9.6, 8.2, 9.8);
    ctx.lineTo(11.0, 9.0);
    ctx.lineTo(14.2, 12.0);
    ctx.closePath();
  };
  solid(ctx, back, dg(ctx, 8, 6.4, 16, 12, SK));
  // Left hand (front, fingers wrapping).
  const front = () => {
    ctx.moveTo(4.8, 7.6);
    ctx.quadraticCurveTo(7.6, 6.6, 9.6, 7.8);
    ctx.lineTo(13.8, 10.2);
    ctx.quadraticCurveTo(14.6, 11.0, 13.8, 11.6);
    ctx.quadraticCurveTo(13.6, 12.6, 12.6, 12.4);
    ctx.quadraticCurveTo(12.2, 13.2, 11.2, 12.9);
    ctx.quadraticCurveTo(10.6, 13.6, 9.6, 13.0);
    ctx.lineTo(7.4, 12.6);
    ctx.lineTo(5.8, 12.0);
    ctx.closePath();
  };
  solid(ctx, front, dg(ctx, 5, 6.6, 14, 13.4, [SK[0], SK[1], SK[2]]));
  for (const [x0, y0, x1, y1] of [[13.4, 11.2], [12.4, 12.0], [11.0, 12.6]].map(([x, y]) => [x, y, x - 1.6, y - 1.2])) {
    stroke(ctx, seg(ctx, [[x0, y0], [x1, y1]]), 0.3, 'rgba(120,70,40,0.8)');
  }
  stroke(ctx, () => { ctx.moveTo(6.0, 8.2); ctx.quadraticCurveTo(7.8, 7.4, 9.4, 8.2); }, 0.35, 'rgba(255,245,230,0.85)');
  coin(ctx, 10, 3.2, 2.9);
}

function bankIcon(ctx) {
  // Classical bank front: pediment with coin, four fluted columns, steps.
  solid(ctx, poly(ctx, [[0.6, 5.0], [10, 0.4], [19.4, 5.0]]), dg(ctx, 0.6, 0.4, 19.4, 5, IV));
  stroke(ctx, seg(ctx, [[1.6, 4.7], [10, 0.9]]), 0.35, 'rgba(255,255,250,0.95)');
  coin(ctx, 10, 3.3, 1.35, false);
  solid(ctx, rect(ctx, 1.2, 5.0, 17.6, 1.6), vg(ctx, 5, 6.6, [IV[1], IV[2]]));
  fill(ctx, rect(ctx, 1.6, 5.7, 16.8, 0.3), AU[2]);
  for (const cx of [3.4, 7.8, 12.2, 16.6]) {
    solid(ctx, rect(ctx, cx - 1.2, 6.6, 2.4, 6.4), grad(ctx, cx - 1.2, 0, cx + 1.2, 0, [IV[0], IV[1], IV[3]]), 0.4);
    stroke(ctx, seg(ctx, [[cx - 0.35, 7.1], [cx - 0.35, 12.5]]), 0.22, 'rgba(120,96,60,0.7)');
    stroke(ctx, seg(ctx, [[cx + 0.45, 7.1], [cx + 0.45, 12.5]]), 0.22, 'rgba(120,96,60,0.7)');
    solid(ctx, rect(ctx, cx - 1.5, 6.6, 3.0, 0.7), IV[1], 0.35);
  }
  solid(ctx, rect(ctx, 0.9, 13.0, 18.2, 1.2), vg(ctx, 13, 14.2, [IV[1], IV[2]]));
  solid(ctx, rect(ctx, 0.2, 14.2, 19.6, 1.4), vg(ctx, 14.2, 15.6, [IV[2], IV[3]]));
  stroke(ctx, seg(ctx, [[0.6, 14.45], [19.4, 14.45]]), 0.25, 'rgba(255,255,250,0.85)');
}

/** Icon painter per teller action. */
const TELLER_ICONS = {
  home: homeIcon, // cottage with a smoking chimney
  stock: stockIcon, // bars with a rising arrow
  kid: familyIcon, // two adults and a child
  portfolio: portfolioIcon, // open ledger
  purchase: purchaseIcon, // red car
  job: jobIcon, // briefcase and clock
  borrow: borrowIcon, // handshake under a coin
  bank: bankIcon, // columned bank front
};

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/**
 * Draw the icon for `action` centred in the pane rect (device px), scaled
 * uniformly to fit, with a dark outer contour. Unknown actions get the
 * home icon.
 */
export function drawTellerIcon(ctx, action, x, y, w, h) {
  const fn = TELLER_ICONS[action] || TELLER_ICONS.home;
  const margin = 0.95; // design units kept clear around the art (room for the contour)
  const k = Math.min(w / (DW + margin * 2), h / (DH + margin * 2));
  const ow = (DW + margin * 2) * k;
  const oh = (DH + margin * 2) * k;
  // Art on its own layer…
  const art = mk(ow, oh);
  const ac = art.getContext('2d');
  ac.setTransform(k, 0, 0, k, margin * k, margin * k);
  fn(ac);
  // …then one uniform outer contour from its silhouette.
  const sil = mk(ow, oh);
  const sc = sil.getContext('2d');
  sc.drawImage(art, 0, 0);
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = INK;
  sc.fillRect(0, 0, sil.width, sil.height);
  const out = mk(ow, oh);
  const oc = out.getContext('2d');
  const r = OUTLINE * k;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    oc.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
  }
  oc.drawImage(art, 0, 0);
  ctx.drawImage(out, x + (w - ow) / 2, y + (h - oh) / 2);
}
