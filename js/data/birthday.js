/**
 * Birthday special-instance data. Everything gated on game.flags.special === 'birthday'
 * lives or is keyed from here so the final clue and door codes are easy to edit.
 *
 * Door codes are XOR-scrambled (light obfuscation). A determined reader of the
 * public JS can still recover them; see birthdayCode() if you want a stronger hash.
 */

export const BIRTHDAY_FLAG = 'birthday';

/** True when this save is the birthday clue-hunt instance. */
export function isBirthday(game) {
  return game?.flags?.special === BIRTHDAY_FLAG;
}

/** Ensure flags.birthday progress exists (mutates game.flags). */
export function ensureBirthdayProgress(game) {
  if (!game.flags) game.flags = {};
  if (!game.flags.birthday || typeof game.flags.birthday !== 'object') {
    game.flags.birthday = { solved: {}, unlocked: {} };
  }
  const b = game.flags.birthday;
  b.solved ||= {};
  b.unlocked ||= {};
  return b;
}

export const DAVID_LINES = [
  'Happy Birthday!',
  'Love you!',
  "You're doing great!",
  'I wonder what your gift is?',
];

export const CAT_LINES = {
  Yangyang: [
    'Can I go outside?',
    'Is it my birthday yet?',
    'What do I get for your birthday?',
    'Meoooow',
    'Can you keep the doors open?',
    'Hungry.',
  ],
  Chenchen: [
    'Hungry.',
    'When is food?',
    'Dinner?',
    'Can I have more food?',
    "I ate Yangyang's food.",
    'Treats?',
    'Ding!',
  ],
};

/**
 * Pick a line from a bank, never repeating the previous text when another exists.
 * @param {string[]} bank
 * @param {string|null} lastText
 * @param {() => number} [random]
 */
export function pickBirthdayLine(bank, lastText = null, random = Math.random) {
  const pool = bank.filter((t) => t !== lastText);
  const from = pool.length ? pool : bank;
  return from[Math.floor(random() * from.length)];
}

// --- Door codes (2 digits). Scrambled so they are not plain "27" / "41" in source. ---
const _K = 0x5a;
/** Encoded digit pairs for doors 2 and 3. */
const _ENC = [
  [0x5a ^ 2, 0x5a ^ 7], // door 2 → 27
  [0x5a ^ 4, 0x5a ^ 1], // door 3 → 41
];

/** Decode the 2-digit code for door 2 or 3. */
export function birthdayCode(door) {
  const pair = _ENC[door - 2];
  if (!pair) return '';
  return String(pair[0] ^ _K) + String(pair[1] ^ _K);
}

/** True when `input` matches the code for door 2 or 3. */
export function checkBirthdayCode(door, input) {
  const got = String(input ?? '').replace(/\D/g, '').slice(-2).padStart(2, '0');
  return got === birthdayCode(door);
}

/**
 * Final clue shown after puzzle 3. Edit this string for the real hunt.
 * Keep it short enough for the dialog box.
 */
export const FINAL_CLUE = [
  'PLACEHOLDER FINAL CLUE',
  '',
  'Replace this text in js/data/birthday.js',
  '(export const FINAL_CLUE).',
  '',
  'Happy Birthday, Dora!',
].join('\n');

/** Puzzle 1: step on floor pads in the order shown on the wall plaque. */
export const PUZZLE1 = {
  id: 1,
  title: 'Candle Order',
  /** Walk-on pad ids in the correct sequence. */
  order: ['two', 'four', 'one', 'three'],
  hint: 'Party order: TWO, FOUR, ONE, THREE',
  success: (code) => `The next door opens with code ${code}.`,
};

/**
 * Puzzle 2: three bowls. Cycle each (Empty / Yangyang / Treats / Chenchen)
 * until the arrangement matches the wall clues.
 * Solution index per bowl: 0=Empty, 1=Yangyang, 2=Treats, 3=Chenchen
 * Solution: Yangyang | Treats | Chenchen
 */
export const PUZZLE2 = {
  id: 2,
  title: 'Cat Bowls',
  labels: ['Empty', "Yangyang's food", 'Treats', "Chenchen's food"],
  solution: [1, 2, 3],
  clues: [
    "Chenchen's bowl is not in the middle.",
    'Treats sit between the two food bowls.',
    "Yangyang's food is left of Chenchen's.",
  ],
  success: (code) => `The last door opens with code ${code}.`,
};

/**
 * Puzzle 3: sokoban-style room. Push three colored gift crates onto the
 * three plates named in the wall riddle. Layout legend:
 *   # wall   . floor   = sill (player can walk, crates cannot)
 *   W/M/P window, mid, and plant plates   R/G/B red, gold, blue gifts
 *   @ player spawn
 * Assignment (from the riddle, not shown in the map):
 *   Blue -> Window, Gold -> Mid, Red -> Plant.
 */
export const PUZZLE3 = {
  id: 3,
  title: 'Birthday Gifts',
  gifts: {
    R: { id: 'red', name: 'Red', letter: 'R', wrap: '#b43232', ribbon: '#e8c84a', ink: '#f0e8c8' },
    G: { id: 'gold', name: 'Gold', letter: 'G', wrap: '#c4a030', ribbon: '#6a3030', ink: '#2a2018' },
    B: { id: 'blue', name: 'Blue', letter: 'B', wrap: '#30506a', ribbon: '#f0e8c8', ink: '#f0e8c8' },
  },
  plates: {
    W: { id: 'window', name: 'Window', needs: 'blue' },
    M: { id: 'mid', name: 'Mid', needs: 'gold' },
    P: { id: 'plant', name: 'Plant', needs: 'red' },
  },
  riddle: [
    "The red gift isn't next to the window.",
    'The gold gift isn\'t next to the plant.',
    'The blue gift is left of the gold gift.',
  ].join('\n\n'),
  layout: [
    '####################',
    '####################',
    '####W..M#P.....#####',
    '#####..###.....#####',
    '####.G....#....#####',
    '####......#B...#####',
    '####...R.......#####',
    '####...........#####',
    '##########.#########',
    '#==================#',
    '#==================#',
    '#=========@========#',
    '#==================#',
    '####################',
  ],
  success: 'A sealed note appears.',
};

/** Parse PUZZLE3.layout into walls, sills, plates, gifts, and spawn (tile units). */
export function parsePuzzle3Layout(layout = PUZZLE3.layout) {
  const walls = [];
  const sills = [];
  const plates = [];
  const gifts = [];
  let spawn = { tx: 10, ty: 11 };
  const rows = layout.length;
  const cols = layout[0].length;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < layout[ty].length; tx++) {
      const c = layout[ty][tx];
      if (c === '#') walls.push({ tx, ty });
      else if (c === '=' || c === '@') sills.push({ tx, ty });
      if (PUZZLE3.plates[c]) {
        plates.push({ tx, ty, ...PUZZLE3.plates[c] });
      }
      if (PUZZLE3.gifts[c]) {
        gifts.push({ tx, ty, ...PUZZLE3.gifts[c] });
      }
      if (c === '@') spawn = { tx, ty };
    }
  }
  return { cols, rows, walls, sills, plates, gifts, spawn };
}

/** Cats present in the Decision Room during the birthday instance. */
export const BIRTHDAY_CATS = [
  { id: 'yangyang', name: 'Yangyang', coat: 'yangyang' },
  { id: 'chenchen', name: 'Chenchen', coat: 'chenchen' },
];
