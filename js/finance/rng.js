/**
 * Seeded PRNG for reproducible Monte Carlo paths and Hallway playback.
 * Mulberry32 — compact, decent distribution for gameplay noise.
 */

export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.deterministic] - if true, returns constant 0.5 (no noise)
 * @param {number} [opts.seed]
 * @param {function():number} [opts.rng] - existing rng
 */
export function resolveRng(opts = {}) {
  if (opts.deterministic) return () => 0.5;
  if (typeof opts.rng === 'function') return opts.rng;
  if (opts.seed != null) return mulberry32(opts.seed);
  return Math.random;
}
