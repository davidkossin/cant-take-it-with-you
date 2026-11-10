/**
 * Cat NPC sprites for the birthday Decision Room. 24×16 pixel art, same small
 * outlined style as the adult sprites. Original art from the Yangyang /
 * Chenchen reference photo.
 *
 * Coats: yangyang (mostly black, white chest & paws), chenchen (white blaze,
 * white chest and front legs, black back & tail). Sitting when paused
 * (haunches, straight front legs, tail curled around the feet); 2-frame walk
 * with a long side silhouette.
 */
const PAL = {
  K: '#121216',
  k: '#303038',
  w: '#f5f5f2',
  W: '#d6d6d0',
  e: '#b4d23c',
  E: '#6e8c1c',
  n: '#241616',
  o: '#000000',
  p: '#e8a8b0',
};

export const CAT_SPRITE_W = 24;
export const CAT_SPRITE_H = 16;
export const CAT_WALK_FRAMES = 2;

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function paint(rows) {
  const c = makeCanvas(CAT_SPRITE_W, CAT_SPRITE_H);
  const ctx = c.getContext('2d');
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = PAL[ch] || '#ff00ff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

const FRAMES = {
  yangyang: {
    sit: {
      down:
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKpKooKpKo.......',
          '......oKkKeKKeKKko......',
          '......oKKKKwwKKKKo......',
          '.......oKKwnwKKKo.......',
          '......oKkKwwwKKkko......',
          '.....oKkkoWWWokKko......',
          '.....okwkoWWWokwko......',
          '.....oKKko.o.okKkoo.....',
          '......oKkoo...okKko.....',
          '.......oKooooooKko......',
        ],
      up:
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKKKooKKKo.......',
          '......oKKKKKKKKKko......',
          '.......oKKKKKKKKo.......',
          '......oKKKKKKKKKko......',
          '.....oKKKKooooKKKko.....',
          '.....oKKKko..okKKko.....',
          '.....okKKko..okKKko.....',
          '......oKKkoo.ookKko.....',
          '.......oKkoo..okKko.....',
          '........oKooooooKo......',
        ],
      right:
        [
          '........................',
          '........................',
          '........................',
          '................o.......',
          '...............oKo......',
          '..............oKpKo.....',
          '..........ooooKkKeKo....',
          '.....oooKKKKKKKKwnwKo...',
          '....oKKKKKKKKKKKwwWKo...',
          '....oKKKKKKKoooKWWWko...',
          '....oKKKKKKo...oWWWo....',
          '....okKKKKko...owwwo....',
          '....oKKKKKko...ow.wo....',
          '...ooKKKKko.....o.o.....',
          '..oKKoooooooooooo.......',
          '...ooooooooooooo........',
        ],
      left:
        [
          '........................',
          '........................',
          '........................',
          '.......o................',
          '......oKo...............',
          '.....oKpKo..............',
          '....oKeKkKoooo..........',
          '...oKwnwKKKKKKKKooo.....',
          '...oKWwwKKKKKKKKKKKo....',
          '...okWWWKoooKKKKKKKo....',
          '....oWWWo...oKKKKKKo....',
          '....owwwo...okKKKKko....',
          '....ow.wo...okKKKKKo....',
          '.....o.o.....okKKKKoo...',
          '.......ooooooooooooKKo..',
          '........ooooooooooooo...',
        ],
    },
    walk: {
      down: [
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKpKooKpKo.......',
          '......oKkKeKKeKKko......',
          '......oKKKKwwKKKKo......',
          '.......oKKwnwKKKo.......',
          '......oKKWWWWKKKo.......',
          '......oKkKwwKKkko.......',
          '.....o.owoWWow.o........',
          '.....o..o.WW.o..o.......',
          '........................',
          '........................',
        ],
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKpKooKpKo.......',
          '......oKkKeKKeKKko......',
          '......oKKKKwwKKKKo......',
          '.......oKKwnwKKKo.......',
          '......oKKWWWWKKKo.......',
          '......oKkKwwKKkko.......',
          '......ow.oWWo.wo........',
          '.......o..WW..o.........',
          '........................',
          '........................',
        ],
      ],
      up: [
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKKKooKKKo.......',
          '......oKKKKKKKKKko......',
          '.......oKKKKKKKKo.......',
          '......oKKKKKKKKKko......',
          '......oKKKKoKKKko.......',
          '.....o..oKKKo.o.........',
          '.....o..o.KK.o..o.......',
          '..........oKo...........',
          '..........oKo...........',
          '........................',
        ],
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKKKooKKKo.......',
          '......oKKKKKKKKKko......',
          '.......oKKKKKKKKo.......',
          '......oKKKKKKKKKko......',
          '......oKKKKoKKKko.......',
          '......ow.oKKo.wo........',
          '.......o..KK..o.........',
          '..........oKo...........',
          '...........o............',
          '........................',
        ],
      ],
      right: [
        [
          '........................',
          '........................',
          '........................',
          '.................o......',
          '................oKo.....',
          '...............oKpKo....',
          '...........oooKkKeKo....',
          '...oooooooKKKKKKwnwKo...',
          '..oKKKKKKKKKKKKKwwWKo...',
          '..okKKKKKKKKKKKKWWWko...',
          '...oKk..kKKk..kKWWWo....',
          '...okKo.oKKo...owwwo....',
          '...o..o.o..o...ow.wo....',
          '....o...........o.o.....',
          '........................',
          '........................',
        ],
        [
          '........................',
          '........................',
          '........................',
          '.................o......',
          '................oKo.....',
          '...............oKpKo....',
          '...........oooKkKeKo....',
          '...oooooooKKKKKKwnwKo...',
          '..oKKKKKKKKKKKKKwwWKo...',
          '..okKKKKKKKKKKKKWWWko...',
          '...oKKk.kKKk...KWWWo....',
          '...o.oKo.o.Ko..owwwo....',
          '.....o.o...o.o.ow.wo....',
          '......o.....o...o.o.....',
          '........................',
          '........................',
        ],
      ],
      left: [
        [
          '........................',
          '........................',
          '........................',
          '......o.................',
          '.....oKo................',
          '....oKpKo...............',
          '....oKeKkKooo...........',
          '...oKwnwKKKKKKooooooo...',
          '...oKWwwKKKKKKKKKKKKKo..',
          '...okWWWKKKKKKKKKKKKko..',
          '....oWWWKk..kKKk..kKo...',
          '....owwwo...oKKo.oKko...',
          '....ow.wo...o..o.o..o...',
          '.....o.o...........o....',
          '........................',
          '........................',
        ],
        [
          '........................',
          '........................',
          '........................',
          '......o.................',
          '.....oKo................',
          '....oKpKo...............',
          '....oKeKkKooo...........',
          '...oKwnwKKKKKKooooooo...',
          '...oKWwwKKKKKKKKKKKKKo..',
          '...okWWWKKKKKKKKKKKKko..',
          '....oWWWK...kKKk.kKKo...',
          '....owwwo..oK.o.oKo.o...',
          '....ow.wo.o.o...o.o.....',
          '.....o.o...o.....o......',
          '........................',
          '........................',
        ],
      ],
    },
  },
  chenchen: {
    sit: {
      down:
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKpKooKpKo.......',
          '......oKkKewweKKko......',
          '......oKKwwwwwwwKo......',
          '.......oKwwwnwwko.......',
          '......oKKwwwwwKkko......',
          '.....oKkkowwwokKko......',
          '.....okwkowwwokwko......',
          '.....oKKko.o.okKkoo.....',
          '......oKkoo...okKko.....',
          '.......oKooooooKko......',
        ],
      up:
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKKKooKKKo.......',
          '......oKKKKKKKKKko......',
          '.......oKKKKKKKKo.......',
          '......oKKKKwwwKKko......',
          '.....oKKKKoooowKKko.....',
          '.....oKKKko..okKKko.....',
          '.....okKKko..okKKko.....',
          '......oKKkoo.ookKko.....',
          '.......oKkoo..okKko.....',
          '........oKooooooKo......',
        ],
      right:
        [
          '........................',
          '........................',
          '........................',
          '................o.......',
          '...............oKo......',
          '..............oKpKo.....',
          '..........ooooKwweKo....',
          '.....oooKKKKKKKwwwnko...',
          '....oKKKKKKKKKKwwwWko...',
          '....oKKKKKKKoooWWWWko...',
          '....oKKKKKKo...owwwwo...',
          '....okKKKKko...owwwwo...',
          '....oKKKKKko...ow.wo....',
          '...ooKKKKko.....o.o.....',
          '..oKKoooooooooooo.......',
          '...ooooooooooooo........',
        ],
      left:
        [
          '........................',
          '........................',
          '........................',
          '.......o................',
          '......oKo...............',
          '.....oKpKo..............',
          '....oKewwKoooo..........',
          '...oknwwwKKKKKKKooo.....',
          '...okWwwwKKKKKKKKKKo....',
          '...okWWWWoooKKKKKKKo....',
          '...owwwwo...oKKKKKKo....',
          '...owwwwo...okKKKKko....',
          '....ow.wo...okKKKKKo....',
          '.....o.o.....okKKKKoo...',
          '.......ooooooooooooKKo..',
          '........ooooooooooooo...',
        ],
    },
    walk: {
      down: [
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKpKooKpKo.......',
          '......oKkKewweKKko......',
          '......oKKwwwwwwwKo......',
          '.......oKwwwnwwko.......',
          '......oKWWWWWWKko.......',
          '......oKKwwwwKkko.......',
          '.....o.owoWWow.o........',
          '.....o..o.WW.o..o.......',
          '........................',
          '........................',
        ],
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKpKooKpKo.......',
          '......oKkKewweKKko......',
          '......oKKwwwwwwwKo......',
          '.......oKwwwnwwko.......',
          '......oKWWWWWWKko.......',
          '......oKKwwwwKkko.......',
          '......ow.oWWo.wo........',
          '.......o..WW..o.........',
          '........................',
          '........................',
        ],
      ],
      up: [
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKKKooKKKo.......',
          '......oKKKKKKKKKko......',
          '.......oKKKKKKKKo.......',
          '......oKKKwwwKKKko......',
          '......oKKKKoKKKko.......',
          '.....o..oKKKo.o.........',
          '.....o..o.KK.o..o.......',
          '..........oKo...........',
          '..........oKo...........',
          '........................',
        ],
        [
          '........................',
          '........................',
          '........................',
          '........................',
          '.........o....o.........',
          '........oKo..oKo........',
          '.......oKKKooKKKo.......',
          '......oKKKKKKKKKko......',
          '.......oKKKKKKKKo.......',
          '......oKKKwwwKKKko......',
          '......oKKKKoKKKko.......',
          '......ow.oKKo.wo........',
          '.......o..KK..o.........',
          '..........oKo...........',
          '...........o............',
          '........................',
        ],
      ],
      right: [
        [
          '........................',
          '........................',
          '........................',
          '.................o......',
          '................oKo.....',
          '...............oKpKo....',
          '...........oooKwweKo....',
          '...oooooooKKKKKwwwnko...',
          '..oKKKKKKKKKKKKwwwWko...',
          '..okKKKKKKKKKKKWWWWko...',
          '...oKk..kKKk..kWWWWo....',
          '...okKo.oKKo...owwwwo...',
          '...o..o.o..o...ow.wo....',
          '....o...........o.o.....',
          '........................',
          '........................',
        ],
        [
          '........................',
          '........................',
          '........................',
          '.................o......',
          '................oKo.....',
          '...............oKpKo....',
          '...........oooKwweKo....',
          '...oooooooKKKKKwwwnko...',
          '..oKKKKKKKKKKKKwwwWko...',
          '..okKKKKKKKKKKKWWWWko...',
          '...oKKk.kKKk...WWWWo....',
          '...o.oKo.o.Ko..owwwwo...',
          '.....o.o...o.o.ow.wo....',
          '......o.....o...o.o.....',
          '........................',
          '........................',
        ],
      ],
      left: [
        [
          '........................',
          '........................',
          '........................',
          '......o.................',
          '.....oKo................',
          '....oKpKo...............',
          '....oKewwKooo...........',
          '...oknwwwKKKKKooooooo...',
          '...okWwwwKKKKKKKKKKKKo..',
          '...okWWWWKKKKKKKKKKKko..',
          '....oWWWWk..kKKk..kKo...',
          '...owwwwo...oKKo.oKko...',
          '....ow.wo...o..o.o..o...',
          '.....o.o...........o....',
          '........................',
          '........................',
        ],
        [
          '........................',
          '........................',
          '........................',
          '......o.................',
          '.....oKo................',
          '....oKpKo...............',
          '....oKewwKooo...........',
          '...oknwwwKKKKKooooooo...',
          '...okWwwwKKKKKKKKKKKKo..',
          '...okWWWWKKKKKKKKKKKko..',
          '....oWWWW...kKKk.kKKo...',
          '...owwwwo..oK.o.oKo.o...',
          '....ow.wo.o.o...o.o.....',
          '.....o.o...o.....o......',
          '........................',
          '........................',
        ],
      ],
    },
  },
};

/**
 * @param {'yangyang'|'chenchen'} coat
 * @param {'down'|'up'|'left'|'right'} facing
 * @param {number} frame  walk frame 0..1, or < 0 for sitting
 */
export function makeCatSprite(coat, facing, frame = -1) {
  const id = coat === 'chenchen' ? 'chenchen' : 'yangyang';
  const dir = facing === 'up' || facing === 'left' || facing === 'right' ? facing : 'down';
  const sitting = !(frame >= 0);
  const fi = sitting ? -1 : (frame % CAT_WALK_FRAMES);
  const key = `cat-${id}-${dir}-${fi}`;
  if (cache.has(key)) return cache.get(key);
  const pack = FRAMES[id];
  let rows;
  if (sitting) rows = pack.sit[dir];
  else {
    const walk = pack.walk[dir] || pack.walk.down;
    rows = walk[fi] || walk[0];
  }
  const c = paint(rows);
  cache.set(key, c);
  return c;
}
