/**
 * A canvas speech bubble with a tail, in frame pixels. Used for the spouse's brief remarks.
 */
const FONT = '"Press Start 2P", monospace';

/**
 * @param {CanvasRenderingContext2D} ctx identity transform (frame pixels)
 * @param {string} text
 * @param {number} anchorX x of the speaker's head (tail tip), frame px
 * @param {number} anchorY y just above the speaker's head (tail tip), frame px
 * @param {{left:number,right:number,top:number}} bounds bubble stays inside these
 * @param {number} [alpha]
 * @param {number} [px] font size
 */
export function drawSpeechBubble(ctx, text, anchorX, anchorY, bounds, alpha = 1, px = 18) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `${px}px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const padX = 14;
  const padY = 12;
  const tail = 14;
  const maxW = Math.max(120, bounds.right - bounds.left - padX * 2);
  const lines = [];
  let cur = '';
  for (const w of String(text).split(' ')) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = w; } else cur = next;
  }
  lines.push(cur);
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const lineH = Math.round(px * 1.4);
  const w = Math.ceil(textW + padX * 2);
  const h = lines.length * lineH - (lineH - px) + padY * 2;
  let x = Math.round(anchorX - w / 2);
  x = Math.max(bounds.left, Math.min(bounds.right - w, x));
  let y = Math.round(anchorY - tail - h);
  y = Math.max(bounds.top, y);
  const tipX = Math.max(x + 14, Math.min(x + w - 14, anchorX));
  const baseY = y + h;

  ctx.fillStyle = '#fffbe8';
  ctx.strokeStyle = '#1a1230';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  // Tail: a filled triangle that overlaps the bottom border, then re-stroked sides.
  ctx.beginPath();
  ctx.moveTo(tipX - 9, baseY);
  ctx.lineTo(tipX + 9, baseY);
  ctx.lineTo(tipX, Math.max(baseY + 6, Math.min(anchorY, baseY + tail)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fffbe8';
  ctx.fillRect(tipX - 8, baseY - 2, 16, 4);
  ctx.fillStyle = '#1a1230';
  lines.forEach((l, i) => ctx.fillText(l, x + padX, y + padY + i * lineH));
  ctx.restore();
}
