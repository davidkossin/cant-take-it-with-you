/**
 * Birthday cat NPC sprites. David's 21×21 RGBA art, loaded from assets/cats/.
 * Chenchen: white blaze, chest and legs; black back and tail.
 * Yangyang: mostly black, white chest and paws.
 *
 * Side sit + walk face right in the source PNGs. Walking right uses those
 * frames as-is; walking left is the same frames mirrored. Up and down use
 * dedicated sit + two walk frames each (front to the camera, or back with
 * the tail visible). Sitting uses the sit frame for that facing; left/right
 * sit is mirrored so the cat faces the player.
 */
export const CAT_SPRITE_W = 21;
export const CAT_SPRITE_H = 21;
export const CAT_WALK_FRAMES = 2;

const FILES = {
  chenchen: {
    sit: 'chenchen-sit.png',
    walk: ['chenchen-walk-0.png', 'chenchen-walk-1.png'],
    sitDown: 'chenchen-sit-down.png',
    walkDown: ['chenchen-walk-down-0.png', 'chenchen-walk-down-1.png'],
    sitUp: 'chenchen-sit-up.png',
    walkUp: ['chenchen-walk-up-0.png', 'chenchen-walk-up-1.png'],
  },
  yangyang: {
    sit: 'yangyang-sit.png',
    walk: ['yangyang-walk-0.png', 'yangyang-walk-1.png'],
    sitDown: 'yangyang-sit-down.png',
    walkDown: ['yangyang-walk-down-0.png', 'yangyang-walk-down-1.png'],
    sitUp: 'yangyang-sit-up.png',
    walkUp: ['yangyang-walk-up-0.png', 'yangyang-walk-up-1.png'],
  },
};

const emptyPack = () => ({
  sit: null, walk: [null, null],
  sitDown: null, walkDown: [null, null],
  sitUp: null, walkUp: [null, null],
});

const assetUrl = (file) => new URL(`../../assets/cats/${file}`, import.meta.url).href;

const images = { chenchen: emptyPack(), yangyang: emptyPack() };
const cache = new Map();
let ready = false;
let loadPromise = null;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load cat sprite ${url}`));
    img.src = url;
  });
}

function pushJob(jobs, coat, key, file) {
  jobs.push(loadImage(assetUrl(file)).then((img) => { images[coat][key] = img; }));
}

function pushWalk(jobs, coat, key, files) {
  files.forEach((file, i) => {
    jobs.push(loadImage(assetUrl(file)).then((img) => { images[coat][key][i] = img; }));
  });
}

/** Load every cat PNG. Safe to call more than once. */
export function preloadCatSprites() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const jobs = [];
    for (const coat of ['chenchen', 'yangyang']) {
      const f = FILES[coat];
      pushJob(jobs, coat, 'sit', f.sit);
      pushJob(jobs, coat, 'sitDown', f.sitDown);
      pushJob(jobs, coat, 'sitUp', f.sitUp);
      pushWalk(jobs, coat, 'walk', f.walk);
      pushWalk(jobs, coat, 'walkDown', f.walkDown);
      pushWalk(jobs, coat, 'walkUp', f.walkUp);
    }
    await Promise.all(jobs);
    ready = true;
    cache.clear();
  })();
  return loadPromise;
}

export function catSpritesReady() {
  return ready;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function blit(img, flip) {
  const c = makeCanvas(CAT_SPRITE_W, CAT_SPRITE_H);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(CAT_SPRITE_W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, 0, 0);
  return c;
}

/**
 * @param {'yangyang'|'chenchen'} coat
 * @param {'down'|'up'|'left'|'right'} facing
 * @param {number} frame  walk frame 0..1, or < 0 for sitting
 * @param {'left'|'right'} [horiz] last horizontal facing; kept for callers, used only if facing is left/right
 */
export function makeCatSprite(coat, facing, frame = -1, horiz = 'right') {
  const id = coat === 'chenchen' ? 'chenchen' : 'yangyang';
  const sitting = !(frame >= 0);
  const fi = sitting ? -1 : (frame % CAT_WALK_FRAMES);
  const flip = facing === 'left';
  const key = `cat-${id}-${facing}-${sitting ? 'sit' : 'walk'}-${fi}-${flip ? 'L' : 'R'}`;
  if (cache.has(key)) return cache.get(key);
  const pack = images[id];
  let img = null;
  if (facing === 'down') {
    img = sitting ? pack.sitDown : (pack.walkDown[fi] || pack.walkDown[0]);
  } else if (facing === 'up') {
    img = sitting ? pack.sitUp : (pack.walkUp[fi] || pack.walkUp[0]);
  } else {
    img = sitting ? pack.sit : (pack.walk[fi] || pack.walk[0]);
  }
  const c = img ? blit(img, flip) : makeCanvas(CAT_SPRITE_W, CAT_SPRITE_H);
  if (img) cache.set(key, c);
  return c;
}

// Start loading as soon as the module is evaluated (browser only).
if (typeof document !== 'undefined') preloadCatSprites();
