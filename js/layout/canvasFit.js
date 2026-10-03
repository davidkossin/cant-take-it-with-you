/**
 * Window fit for the fixed logical canvas (VIEW_W × CANVAS_H).
 * The bitmap stays at the logical resolution and is nearest-neighbor
 * scaled by CSS so pixels stay crisp and pointer math stays in logical space.
 */

/**
 * Largest scale of the logical view that fits in availW × availH.
 * Snaps to a whole number of device pixels only when that still covers
 * at least 96% of the fit, so a 1080p window is not dropped to a small frame.
 *
 * @param {number} availW
 * @param {number} availH
 * @param {number} viewW
 * @param {number} viewH
 * @param {number} [dpr]
 * @returns {number}
 */
export function chooseCanvasScale(availW, availH, viewW, viewH, dpr = 1) {
  if (!(viewW > 0) || !(viewH > 0)) return 1;
  const fit = Math.min(availW / viewW, availH / viewH);
  const safe = Math.max(0.25, Number.isFinite(fit) ? fit : 0.25);
  const ratio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const intDevice = Math.floor(safe * ratio + 1e-4);
  if (intDevice >= 1) {
    const snapped = intDevice / ratio;
    if (snapped <= safe + 1e-6 && snapped >= safe * 0.96) return snapped;
  }
  return safe;
}

/**
 * CSS pixel size for that scale, clamped so rounding cannot overflow the box.
 * @param {number} scale
 * @param {number} viewW
 * @param {number} viewH
 * @param {number} availW
 * @param {number} availH
 * @returns {{ cssW: number, cssH: number }}
 */
export function canvasCssSize(scale, viewW, viewH, availW, availH) {
  let cssW = Math.round(viewW * scale);
  let cssH = Math.round(viewH * scale);
  if (cssW > availW || cssH > availH) {
    const fix = Math.min(availW / Math.max(1, cssW), availH / Math.max(1, cssH));
    cssW = Math.max(1, Math.floor(cssW * fix));
    cssH = Math.max(1, Math.floor(cssH * fix));
  }
  return {
    cssW: Math.max(1, cssW),
    cssH: Math.max(1, cssH),
  };
}
