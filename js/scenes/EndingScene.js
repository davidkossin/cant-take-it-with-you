import { FRAME_W, FRAME_H, PALETTE, KEYS } from '../config.js';
import { drawWorthChart } from '../render/Charts.js';

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
      ctx.textAlign = 'center';
      // The ending is about leaving material wealth behind: never reveal a final
      // dollar amount here. The charts below intentionally keep the real history.
      ctx.font = '22px "Press Start 2P", monospace';
      ctx.fillStyle = '#666';
      ctx.fillText('Net Worth  ---', FRAME_W / 2, 280);
      ctx.fillText('Cash       ---', FRAME_W / 2, 320);

      ctx.fillStyle = PALETTE.gold;
      ctx.font = '428px "Press Start 2P", monospace';
      ctx.fillText("You can't take", FRAME_W / 2, 420);
      ctx.fillText('it with you…', FRAME_W / 2, 490);

      if (this.phase >= 2) {
        ctx.font = '22px "Press Start 2P", monospace';
        this.menu.forEach((m, i) => {
          const sel = i === this.menuIndex;
          ctx.fillStyle = sel ? PALETTE.gold : PALETTE.uiText;
          ctx.fillText(`${sel ? '▶ ' : '  '}${m.label}`, FRAME_W / 2, 600 + i * 48);
        });
      }
      ctx.textAlign = 'left';
    }

    if (this.phase === 3) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, FRAME_W, FRAME_H);
      ctx.font = '28px "Press Start 2P", monospace';
      ctx.fillStyle = PALETTE.gold;
      ctx.textAlign = 'center';
      ctx.fillText('Your life ledger', FRAME_W / 2, 36);
      ctx.textAlign = 'left';
      drawWorthChart(ctx, this.game?.worthHistory || [], {
        x: 80,
        y: 100,
        w: FRAME_W - 160,
        h: FRAME_H - 200,
        series: ['netWorth', 'bank', 'salary'],
      });
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillStyle = PALETTE.uiText;
      ctx.textAlign = 'center';
      ctx.fillText('Enter / Esc — back', FRAME_W / 2, FRAME_H - 36);
      ctx.textAlign = 'left';
    }
  }
}
