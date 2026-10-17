import { PALETTE, FRAME_W, FRAME_H, HUD_H } from '../config.js';
import { computeWorth } from '../finance/Engine.js';
import { makeHudIcon, makeHudBox } from './Assets.js';
import { formatMoneyDisplay } from './Dialog.js';
import { householdSalary } from '../scenes/FamilyInputs.js';

/**
 * HUD band above the playfield (not overlaid on the world).
 * Opaque dark strip 0..HUD_H with icon clusters + kids line inside.
 */
export class Hud {
  constructor() {}

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} portfolio
   * @param {object} [worthOverride]
   */
  draw(ctx, portfolio, worthOverride = null) {
    const worth = worthOverride || computeWorth(portfolio);
    const money = n => formatMoneyDisplay(n, portfolio);

    // Opaque dark band — full width, HUD only
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#141018';
    ctx.fillRect(0, 0, FRAME_W, HUD_H);
    ctx.fillStyle = '#2a2430';
    ctx.fillRect(0, HUD_H - 2, FRAME_W, 2);

    const y = 18;
    const boxH = 64;
    const gap = 16;
    const clusters = [
      { icon: 'age', label: String(portfolio.age), w: 220 },
      { icon: 'year', label: String(portfolio.year), w: 280 },
      { icon: 'bank', label: money(worth.bank), w: 420 },
      { icon: 'portfolio', label: money(worth.portfolio), w: 460 },
      { icon: 'salary', label: money(householdSalary(portfolio)), w: 420 },
    ];
    // Narrow (portrait) frames: shrink the boxes and the label font so all five still fit.
    const full = clusters.reduce((s, c) => s + c.w, 0) + gap * (clusters.length - 1);
    const room = FRAME_W - 24;
    const fit = Math.min(1, room / full);
    const narrow = fit < 1;
    const gapPx = narrow ? 6 : gap;
    if (narrow) {
      // Age/year are short; give the money boxes more of the row.
      const weights = [100, 150, 220, 250, 220];
      const avail = room - gapPx * (clusters.length - 1);
      const sum = weights.reduce((s, n) => s + n, 0);
      clusters.forEach((c, i) => { c.w = Math.floor((weights[i] * avail) / sum); });
    }
    const total = clusters.reduce((s, c) => s + c.w, 0) + gapPx * (clusters.length - 1);
    let x = Math.floor((FRAME_W - total) / 2);
    const labelPx = narrow ? 14 : 22;
    const iconSize = narrow ? 24 : 32;
    const textInset = narrow ? 34 : 54;

    ctx.font = `${labelPx}px "Press Start 2P", monospace`;
    ctx.textBaseline = 'top';
    for (const c of clusters) {
      const box = makeHudBox(c.w, boxH);
      ctx.drawImage(box, x, y);
      const icon = makeHudIcon(c.icon);
      ctx.drawImage(icon, x + (narrow ? 8 : 14), y + (narrow ? (boxH - iconSize) / 2 : 16), iconSize, iconSize);
      ctx.fillStyle = PALETTE.uiText;
      let text = c.label;
      if (narrow && text.startsWith('$') && ctx.measureText(text).width > c.w - textInset - 10) {
        // Compact money (e.g. $1.23M, $447K) before resorting to cutting digits off.
        const n = Number(text.replace(/[^0-9.-]/g, ''));
        if (Number.isFinite(n)) {
          const a = Math.abs(n), sign = n < 0 ? '-' : '';
          text = a >= 1e6 ? `${sign}$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${sign}$${Math.round(a / 1e3)}K` : text;
        }
      }
      while (text.length > 1 && ctx.measureText(text).width > c.w - textInset - 10) {
        text = text.slice(0, -1);
      }
      ctx.fillText(text, x + textInset, y + (narrow ? (boxH - labelPx) / 2 : 22));
      c.x = x;
      x += c.w + gapPx;
    }

    const kids = portfolio.kids || [];
    let familyX = clusters[0].x;
    const familyY = y + boxH + 10;
    if (portfolio.married) {
      ctx.font = '18px "Press Start 2P", monospace';
      ctx.fillStyle = '#dbc69c';
      const spouse = `${(portfolio.spouseName || 'Spouse').slice(0, 18)} ${portfolio.spouseAge ?? '?'}`;
      ctx.fillText(spouse, familyX, familyY);
      familyX += ctx.measureText(spouse).width + 28;
    }
    if (kids.length) {
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillStyle = '#a89878';
      const names = kids
        .slice(0, 6)
        .map((k) => `${(k.name || '?').slice(0, 10)} ${k.age}`)
        .join('  ·  ');
      // Narrow frames: never run past the right edge.
      let shownNames = names;
      const room = FRAME_W - familyX - 12;
      while (shownNames.length > 1 && ctx.measureText(shownNames).width > room) shownNames = shownNames.slice(0, -1);
      if (shownNames !== names) shownNames = `${shownNames.slice(0, -1)}…`;
      ctx.fillText(shownNames, familyX, familyY + (portfolio.married ? 2 : 0));
    }
  }
}

/** Backdrop bottom sits this far inside the frame's bottom edge. */
export const ACTION_PROMPT_BOTTOM = 60;

const PROMPT_FONT = 18;
const PROMPT_PAD_Y = 8;

/** Box the interact prompt will occupy. Used so banners can sit above it. */
export function actionPromptBox() {
  const boxH = PROMPT_FONT + PROMPT_PAD_Y * 2;
  const bottom = FRAME_H - ACTION_PROMPT_BOTTOM;
  return { top: bottom - boxH, bottom, boxH };
}

/**
 * Bottom interact line. A text-sized translucent black chip, not a full-width bar.
 * Bottom of the chip is ACTION_PROMPT_BOTTOM px above the frame edge.
 */
export function drawActionPrompt(ctx, label, { bare = false } = {}) {
  // `bare` shows the label alone (the spouse's name); everything else gets the [Enter] prefix.
  const text = bare ? String(label) : `[Enter] ${label}`;
  ctx.save();
  ctx.font = `${PROMPT_FONT}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const padX = 14;
  const tw = Math.ceil(ctx.measureText(text).width);
  const box = actionPromptBox();
  const boxW = tw + padX * 2;
  const boxX = Math.round(FRAME_W / 2 - boxW / 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(boxX, box.top, boxW, box.boxH);
  ctx.fillStyle = '#f0e8c8';
  ctx.fillText(text, FRAME_W / 2, box.top + PROMPT_PAD_Y);
  ctx.restore();
  return box;
}
