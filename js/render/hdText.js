/**
 * Draw canvas text at the display-pixel size of the current transform.
 * Scenes keep using logical coordinates and logical font px (the 320×280 grid).
 * Glyphs are rasterized at logicalPx × scale so a large window does not blow
 * up an 8px bitmap.
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function installHdText(ctx) {
  const proto = CanvasRenderingContext2D.prototype;
  const fontDesc = Object.getOwnPropertyDescriptor(proto, 'font');
  const rawFill = proto.fillText;
  const rawStroke = proto.strokeText;
  const rawMeasure = proto.measureText;
  if (!fontDesc?.get || !fontDesc?.set) return;

  let logicalFont = fontDesc.get.call(ctx);

  Object.defineProperty(ctx, 'font', {
    configurable: true,
    enumerable: true,
    get() {
      return logicalFont;
    },
    set(value) {
      logicalFont = String(value);
    },
  });

  function scaleOf() {
    const t = ctx.getTransform();
    const sx = Math.abs(t.a || 1);
    const sy = Math.abs(t.d || 1);
    const s = (sx + sy) / 2;
    return { sx: t.a || 1, sy: t.d || 1, s: s > 0 ? s : 1, e: t.e || 0, f: t.f || 0 };
  }

  function deviceFont(s) {
    return logicalFont.replace(/(\d+(?:\.\d+)?)px/g, (_, n) => {
      const px = Math.max(1, Math.round(parseFloat(n) * s * 100) / 100);
      return `${px}px`;
    });
  }

  ctx.fillText = function fillText(text, x, y, maxWidth) {
    const { sx, sy, s, e, f } = scaleOf();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fontDesc.set.call(ctx, deviceFont(s));
    const dx = x * sx + e;
    const dy = y * sy + f;
    if (maxWidth == null) rawFill.call(ctx, String(text), dx, dy);
    else rawFill.call(ctx, String(text), dx, dy, maxWidth * Math.abs(sx));
    ctx.restore();
  };

  ctx.strokeText = function strokeText(text, x, y, maxWidth) {
    const { sx, sy, s, e, f } = scaleOf();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fontDesc.set.call(ctx, deviceFont(s));
    const dx = x * sx + e;
    const dy = y * sy + f;
    if (maxWidth == null) rawStroke.call(ctx, String(text), dx, dy);
    else rawStroke.call(ctx, String(text), dx, dy, maxWidth * Math.abs(sx));
    ctx.restore();
  };

  ctx.measureText = function measureText(text) {
    const { s } = scaleOf();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fontDesc.set.call(ctx, deviceFont(s));
    const metrics = rawMeasure.call(ctx, String(text));
    ctx.restore();
    const logicalWidth = metrics.width / s;
    return new Proxy(metrics, {
      get(target, prop) {
        if (prop === 'width') return logicalWidth;
        const value = target[prop];
        if (typeof value === 'number' && /ascent|descent|bounding|left|right|width/i.test(String(prop))) {
          return value / s;
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
}

/**
 * Stroke width that stays about `cssPx` CSS pixels thick after the logical
 * transform (and after a low-res bitmap is CSS-scaled). Chart lines use this
 * so they don't become chunky blocks on a large window.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cssPx
 */
export function hairline(ctx, cssPx) {
  const t = ctx.getTransform?.();
  const s = t && t.a ? Math.abs(t.a) : 1;
  const canvas = ctx.canvas;
  const bitmapPerCss =
    canvas && canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : 1;
  ctx.lineWidth = (cssPx * bitmapPerCss) / (s || 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}
