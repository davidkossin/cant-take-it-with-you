import { PALETTE, FRAME_W, HUD_H } from '../config.js';
import { computeWorth } from '../finance/Engine.js';
import { makeHudIcon, makeHudBox } from './Assets.js';

function money(n) {
  const v = Math.round(n || 0);
  const sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(v).toLocaleString('en-US');
}

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

    // Opaque LTTP-ish dark band — full width, HUD only
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
      { icon: 'salary', label: money(portfolio.salary || 0), w: 420 },
    ];
    const total = clusters.reduce((s, c) => s + c.w, 0) + gap * (clusters.length - 1);
    let x = Math.floor((FRAME_W - total) / 2);

    ctx.font = '22px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    for (const c of clusters) {
      const box = makeHudBox(c.w, boxH);
      ctx.drawImage(box, x, y);
      const icon = makeHudIcon(c.icon);
      ctx.drawImage(icon, x + 14, y + 16, 32, 32);
      ctx.fillStyle = PALETTE.uiText;
      let text = c.label;
      while (text.length > 1 && ctx.measureText(text).width > c.w - 64) {
        text = text.slice(0, -1);
      }
      ctx.fillText(text, x + 54, y + 22);
      c.x = x;
      x += c.w + gap;
    }

    const kids = portfolio.kids || [];
    if (kids.length) {
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillStyle = '#a89878';
      const names = kids
        .slice(0, 6)
        .map((k) => `${(k.name || '?').slice(0, 10)} ${k.age}`)
        .join('  ·  ');
      ctx.fillText(names, clusters[0].x, y + boxH + 10);
    }
  }
}
