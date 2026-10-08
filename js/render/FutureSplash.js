/**
 * "Generating Your Future" — full-frame loading screen shown before the
 * Hallway of Time while its Monte Carlo journey runs in the shared worker.
 * Drawn in 1920×1080 frame pixels; every line is fitted to the title-safe
 * area so it stays legible when the frame is scaled down on phones.
 */
import { FRAME_W, FRAME_H, PALETTE } from '../config.js';

export const SPLASH_TITLE = 'Generating Your Future';
/** Splash → Hallway cross-fade (no extra wait beyond this). */
export const SPLASH_FADE_MS = 300;

const FONT = '"Press Start 2P", monospace';
/** Title-safe area: 10% inset on each axis. */
export const TITLE_SAFE = {
  x: Math.round(FRAME_W * 0.1),
  y: Math.round(FRAME_H * 0.1),
  w: Math.round(FRAME_W * 0.8),
  h: Math.round(FRAME_H * 0.8),
};

/**
 * Press Start 2P is one em per glyph. Cap `maxPx`, then shrink until the
 * longest line fits `maxWidth` (same approach as the ending screen).
 */
export function fitPixelFont(ctx, lines, maxPx, maxWidth, minPx = 8) {
  const longest = lines.reduce((n, line) => Math.max(n, String(line).length), 1);
  let px = Math.max(minPx, Math.min(Math.floor(maxPx), Math.floor(maxWidth / longest)));
  const tooWide = (size) => {
    ctx.font = `${size}px ${FONT}`;
    return lines.some((line) => ctx.measureText(line).width > maxWidth);
  };
  while (px > minPx && tooWide(px)) px -= 1;
  return px;
}

/** Deterministic star field so the backdrop does not shimmer frame to frame. */
const STARS = (() => {
  const out = [];
  let s = 20261007;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 90; i++) out.push({ x: rnd() * FRAME_W, y: rnd() * FRAME_H, r: rnd() < 0.15 ? 6 : 3, p: rnd() * 6.28 });
  return out;
})();

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{progress?:number, paths?:number, error?:string|null, alpha?:number, time?:number}} opts
 *   time — seconds, only drives the twinkle / idle shimmer.
 */
export function drawFutureSplash(ctx, { progress = 0, paths = 1000, error = null, alpha = 1, time = 0 } = {}) {
  const pct = Math.max(0, Math.min(1, Number(progress) || 0));
  const safe = TITLE_SAFE;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;

  // Backdrop: replaces the whole frame (no Hallway / HUD underneath).
  ctx.fillStyle = '#0a0810';
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);
  ctx.fillStyle = PALETTE.voidDot || '#1a0e28';
  for (let y = 0; y < FRAME_H; y += 24) for (let x = (y / 24) % 2 ? 12 : 0; x < FRAME_W; x += 24) ctx.fillRect(x, y, 4, 4);
  for (const st of STARS) {
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.3 + st.p));
    ctx.fillStyle = `rgba(240,232,200,${(0.25 * tw).toFixed(3)})`;
    ctx.fillRect(Math.round(st.x), Math.round(st.y), st.r, st.r);
  }

  // Framed panel inside the title-safe area (gold double rule like dialogs).
  const panelW = safe.w, panelH = Math.round(safe.h * 0.66);
  const px0 = safe.x, py0 = Math.round(FRAME_H / 2 - panelH / 2);
  ctx.fillStyle = 'rgba(16,10,28,0.94)';
  ctx.fillRect(px0, py0, panelW, panelH);
  ctx.fillStyle = PALETTE.uiBorderDark;
  ctx.fillRect(px0, py0, panelW, 8); ctx.fillRect(px0, py0 + panelH - 8, panelW, 8);
  ctx.fillRect(px0, py0, 8, panelH); ctx.fillRect(px0 + panelW - 8, py0, 8, panelH);
  ctx.fillStyle = PALETTE.uiBorder;
  ctx.fillRect(px0 + 12, py0 + 12, panelW - 24, 4); ctx.fillRect(px0 + 12, py0 + panelH - 16, panelW - 24, 4);
  ctx.fillRect(px0 + 12, py0 + 12, 4, panelH - 24); ctx.fillRect(px0 + panelW - 16, py0 + 12, 4, panelH - 24);

  const inner = panelW - 160, cx = FRAME_W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Title
  const titlePx = fitPixelFont(ctx, [SPLASH_TITLE], 88, inner);
  ctx.font = `${titlePx}px ${FONT}`;
  let y = py0 + Math.round(panelH * 0.15);
  ctx.fillStyle = '#000';
  ctx.fillText(SPLASH_TITLE, cx + 5, y + 5);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(SPLASH_TITLE, cx, y);
  y += titlePx + 44;

  const sub = `Simulating ${Number(paths).toLocaleString('en-US')} lifetimes`;
  const subPx = fitPixelFont(ctx, [sub], 40, inner);
  ctx.font = `${subPx}px ${FONT}`;
  ctx.fillStyle = PALETTE.uiText;
  ctx.fillText(sub, cx, y);
  y += subPx + 56;

  // Progress bar
  const barW = inner, barH = 56, bx = Math.round(cx - barW / 2);
  ctx.fillStyle = PALETTE.uiBorderDark;
  ctx.fillRect(bx - 8, y - 8, barW + 16, barH + 16);
  ctx.fillStyle = '#120c1c';
  ctx.fillRect(bx, y, barW, barH);
  if (error) {
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(bx, y, barW, barH);
  } else {
    const fillW = Math.round(barW * pct);
    ctx.fillStyle = PALETTE.goldDark;
    ctx.fillRect(bx, y, fillW, barH);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(bx, y, fillW, barH - 14);
    // Pixel shimmer travelling along the filled part (or the empty bar before progress arrives).
    const span = Math.max(fillW, pct > 0 ? 0 : barW);
    if (span > 32) {
      const sx = bx + ((time * 420) % span);
      ctx.fillStyle = 'rgba(255,240,200,0.35)';
      ctx.fillRect(Math.round(sx), y + 6, 24, barH - 26);
    }
  }
  y += barH + 40;

  const status = error ? 'Projection unavailable' : `${Math.round(pct * 100)}%`;
  const statusPx = fitPixelFont(ctx, [status], 40, inner);
  ctx.font = `${statusPx}px ${FONT}`;
  ctx.fillStyle = error ? '#ff9a8a' : PALETTE.uiText;
  ctx.fillText(status, cx, y);
  y += statusPx + 40;

  if (error) {
    const note = 'Press A / Enter to retry.';
    const notePx = fitPixelFont(ctx, [note], 30, inner);
    ctx.font = `${notePx}px ${FONT}`;
    ctx.fillStyle = '#b8b0a0';
    ctx.fillText(note, cx, y);
  }

  ctx.restore();
}
