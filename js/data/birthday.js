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
 * Puzzle 3: push three gift crates onto the pressure plates that match
 * the wall pattern (plates that should be occupied).
 * Plate grid is 3 wide; true = needs a gift on it.
 * Pattern (row-major, top row first): center of each row → plates 1, 4, 7
 * Using a simpler 3-plate row: left, center-right targets.
 */
export const PUZZLE3 = {
  id: 3,
  title: 'Birthday Gifts',
  /** Which of the 3 plates (L, C, R) must have a gift. */
  platesNeeded: [true, false, true],
  hint: 'The poster shows gifts on the LEFT and RIGHT plates — not the middle.',
  success: 'A sealed note appears.',
};

/** Cats present in the Decision Room during the birthday instance. */
export const BIRTHDAY_CATS = [
  { id: 'yangyang', name: 'Yangyang', coat: 'yangyang' },
  { id: 'chenchen', name: 'Chenchen', coat: 'chenchen' },
];
