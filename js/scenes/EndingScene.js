import { FRAME_W, FRAME_H, PALETTE, KEYS } from '../config.js';
import { drawWorthChart } from '../render/Charts.js';
import { moneyUnitSubtitle } from '../finance/DollarBasis.js';

const FONT = '"Press Start 2P", monospace';

/** Historic amounts need each row's CPI, rather than the terminal-year CPI. */
export function ledgerHistory(game) {
  const adjusted = (game?.settings?.inflationAdjusted ?? game?.portfolio?.inflationAdjusted) !== false;
  return (game?.worthHistory || []).map(row => {
    const result = { ...row };
    for (const key of ['netWorth', 'bank', 'salary']) {
      if (row[key] == null) continue;
      result[key] = adjusted && (!(row.priceIndex > 0) || row.legacy)
        ? null : row[key] / (adjusted ? row.priceIndex : 1);
    }
    return result;
  });
}

/**
 * Press Start 2P is one em per glyph. Cap `maxPx`, then shrink until the
 * longest line fits in `maxWidth`. Char-count × size is the floor so a
 * fallback face (webfont not loaded yet) cannot pick a size that overflows
 * this monospace once Press Start 2P swaps in.
 */
function fitPixelFont(ctx, lines, maxPx, maxWidth) {
  const longest = lines.reduce((n, line) => Math.max(n, String(line).length), 1);
  let px = Math.max(8, Math.min(Math.floor(maxPx), Math.floor(maxWidth / longest)));
  const tooWide = (size) => {
    ctx.font = `${size}px ${FONT}`;
    return lines.some((line) => ctx.measureText(line).width > maxWidth);
  };
  while (px > 8 && tooWide(px)) px -= 1;
  return px;
}

export class EndingScene {
  constructor() {
    this.phase = 0; // 0 fade, 1 text, 2 menu, 3 charts
    this.alpha = 0;
    this.timer = 0;
    this.done = false;
    this.waitKey = false;
    this.game = null;
    this.menuIndex = 0;
    this.menu = [
      { label: 'See your charts', value: 'charts' },
      { label: 'New Game', value: 'new' },
    ];
  }

  enter(game = null) {
    this.phase = 0;
    this.alpha = 0;
    this.timer = 0;
    this.done = false;
    this.waitKey = false;
    this.game = game;
    this.menuIndex = 0;
  }

  update() {
    this.timer += 1;
    if (this.phase === 0) {
      this.alpha = Math.min(1, this.timer / 90);
      if (this.alpha >= 1) {
        this.phase = 1;
        this.timer = 0;
      }
    } else if (this.phase === 1) {
      if (this.timer > 60) {
        this.phase = 2;
        this.waitKey = true;
      }
    }
  }

  handleKey(e) {
    if (e.key === ' ' && e.repeat) {
      e.preventDefault();
      return true;
    }
    if (this.phase === 3) {
      if (KEYS.confirm.includes(e.key) || KEYS.cancel.includes(e.key)) {
        this.phase = 2;
        this.waitKey = true;
        return true;
      }
      return false;
    }

    if (!this.waitKey || this.phase !== 2) return false;

    if (KEYS.up.includes(e.key)) {
      this.menuIndex = (this.menuIndex - 1 + this.menu.length) % this.menu.length;
      e.preventDefault();
      return true;
    }
    if (KEYS.down.includes(e.key)) {
      this.menuIndex = (this.menuIndex + 1) % this.menu.length;
      e.preventDefault();
      return true;
    }
    if (KEYS.confirm.includes(e.key)) {
      const choice = this.menu[this.menuIndex].value;
      if (choice === 'charts') {
        this.phase = 3;
        this.waitKey = true;
      } else {
        this.done = true;
      }
      e.preventDefault();
      return true;
    }
    return false;
  }

  render(ctx) {
    ctx.fillStyle = `rgba(0,0,0,${this.alpha})`;
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);

    if (this.phase >= 1 && this.phase < 3) {
      this.drawFarewell(ctx);
    }

    if (this.phase === 3) {
      this.drawLedger(ctx);
    }
  }

  /**
   * Side inset so headlines stay off the gold frame. 6% of the frame, at
   * least 96px on the 1920-wide internal canvas.
   */
  sideMargin() {
    return Math.max(96, Math.round(FRAME_W * 0.06));
  }

  drawFarewell(ctx) {
    const marginX = this.sideMargin();
    const maxW = FRAME_W - marginX * 2;
    const headLines = ["You can't take", 'it with you…'];
    const statLines = ['Net Worth  ---', 'Cash       ---'];
    const menuLines = this.menu.map((m) => `▶ ${m.label}`);

    // 64px matches the title screen on this frame. fitPixelFont shrinks it
    // when a line would pass the side margins (phone and desktop share this
    // 1920×1080 frame; the page only letterboxes it).
    const headPx = fitPixelFont(ctx, headLines, 64, maxW);
    const statPx = fitPixelFont(ctx, statLines, 22, maxW);
    const menuPx = fitPixelFont(ctx, menuLines, 22, maxW);

    const statGap = Math.round(statPx * 0.8);
    const headGap = Math.round(headPx * 0.45);
    const menuGap = Math.round(menuPx * 0.9);
    const blockGap = Math.max(40, Math.round(headPx * 0.65));

    const blockH = (count, px, gap) => px * count + gap * Math.max(0, count - 1);
    const statsH = blockH(statLines.length, statPx, statGap);
    const headH = blockH(headLines.length, headPx, headGap);
    const menuH = blockH(this.menu.length, menuPx, menuGap);
    // Reserve the menu even before it appears so the title does not jump.
    const total = statsH + blockGap + headH + blockGap + menuH;
    const marginY = Math.max(48, Math.round(FRAME_H * 0.05));
    let y = Math.round((FRAME_H - total) / 2);
    if (y < marginY) y = marginY;
    if (y + total > FRAME_H - marginY) y = Math.max(marginY, FRAME_H - marginY - total);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.font = `${statPx}px ${FONT}`;
    ctx.fillStyle = '#666';
    for (let i = 0; i < statLines.length; i++) {
      ctx.fillText(statLines[i], FRAME_W / 2, y);
      y += statPx + (i < statLines.length - 1 ? statGap : 0);
    }
    y += blockGap;

    ctx.font = `${headPx}px ${FONT}`;
    ctx.fillStyle = PALETTE.gold;
    for (let i = 0; i < headLines.length; i++) {
      ctx.fillText(headLines[i], FRAME_W / 2, y);
      y += headPx + (i < headLines.length - 1 ? headGap : 0);
    }
    y += blockGap;

    if (this.phase >= 2) {
      ctx.font = `${menuPx}px ${FONT}`;
      this.menu.forEach((m, i) => {
        const sel = i === this.menuIndex;
        ctx.fillStyle = sel ? PALETTE.gold : PALETTE.uiText;
        ctx.fillText(`${sel ? '▶ ' : '  '}${m.label}`, FRAME_W / 2, y);
        y += menuPx + (i < this.menu.length - 1 ? menuGap : 0);
      });
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  drawLedger(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);

    const maxW = FRAME_W - this.sideMargin() * 2;
    const title = 'Your life ledger';
    const hint = 'Enter / Esc — back';
    const titlePx = fitPixelFont(ctx, [title], 28, maxW);
    const hintPx = fitPixelFont(ctx, [hint], 16, maxW);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `${titlePx}px ${FONT}`;
    ctx.fillStyle = PALETTE.gold;
    // Top of the glyphs, not the baseline, so the heading stays off the frame.
    ctx.fillText(title, FRAME_W / 2, 36);
    ctx.font = `14px ${FONT}`;
    const portfolio = this.game?.portfolio || {};
    const adjusted = (this.game?.settings?.inflationAdjusted ?? portfolio.inflationAdjusted) !== false;
    const units = moneyUnitSubtitle({ ...portfolio, inflationAdjusted: adjusted });
    const legacy = adjusted && (this.game?.worthHistory || []).some(r => r.legacy || !(r.priceIndex > 0));
    ctx.fillText(units + (legacy ? ' · Earlier rows lack verified inflation data' : ''), FRAME_W / 2, 74);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    drawWorthChart(ctx, ledgerHistory(this.game), {
      x: 80,
      y: 100,
      w: FRAME_W - 160,
      h: FRAME_H - 200,
      series: ['netWorth', 'bank', 'salary'],
    });

    ctx.font = `${hintPx}px ${FONT}`;
    ctx.fillStyle = PALETTE.uiText;
    ctx.textAlign = 'center';
    ctx.fillText(hint, FRAME_W / 2, FRAME_H - 36);
    ctx.textAlign = 'left';
  }
}
