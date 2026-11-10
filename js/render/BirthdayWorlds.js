/**
 * Room builders for the birthday Hallway replacement: hub with 3 doors,
 * and three puzzle rooms. Uses the Decision Room theme so drawWorld works.
 */
import { TILE } from '../config.js';

function blankRoom(cols = 20, rows = 14) {
  const map = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      row.push(y === 0 || y === rows - 1 || x === 0 || x === cols - 1 ? 'wall' : 'square');
    }
    map.push(row);
  }
  return {
    cols, rows, map,
    interactables: [],
    rug: null,
    spawn: { x: 10 * TILE - 6, y: 10 * TILE },
    width: cols * TILE,
    height: rows * TILE,
    theme: 'room',
    birthday: true,
  };
}

function openNorth(map, x = 9) {
  map[0][x] = 'floor';
  map[0][x + 1] = 'floor';
}

function openSouth(map, rows, x = 9) {
  map[rows - 1][x] = 'floor';
  map[rows - 1][x + 1] = 'floor';
}

/** Hub: three north doors (1 unlocked, 2 & 3 coded) and a south exit back. */
export function buildBirthdayHub({ unlocked2 = false, unlocked3 = false } = {}) {
  const world = blankRoom();
  openSouth(world.map, world.rows, 9);
  // Three door openings on the north wall
  for (const x of [3, 9, 15]) openNorth(world.map, x);

  const door = (id, x, label, locked) => ({
    id,
    x: x * TILE,
    y: 0,
    w: 2 * TILE,
    h: TILE,
    label,
    kind: 'door',
    facing: 'h',
    birthdayDoor: id,
    locked: !!locked,
    doorStyle: locked ? 'wood' : 'wood',
  });

  world.interactables.push(
    door('door-1', 3, unlockedLabel(1, true), false),
    door('door-2', 9, unlockedLabel(2, unlocked2), !unlocked2),
    door('door-3', 15, unlockedLabel(3, unlocked3), !unlocked3),
    {
      id: 'door-back',
      x: 9 * TILE,
      y: (world.rows - 1) * TILE - 4,
      w: 2 * TILE,
      h: 20,
      label: 'Back to Decision Room',
      kind: 'south-door',
      facing: 'h',
      doorStyle: 'beige',
    },
    { id: 'plaque-hub', kind: 'plaque', label: 'Read plaque',
      x: 8 * TILE, y: 3 * TILE, w: 4 * TILE, h: 20,
      text: 'Three doors. One is open.\nThe others wait for a code.' },
  );
  world.spawn = { x: 10 * TILE - 6, y: 9 * TILE };
  world.hub = true;
  return world;
}

function unlockedLabel(n, open) {
  if (n === 1) return 'Door 1 (open)';
  return open ? `Door ${n} (unlocked)` : `Door ${n} (needs code)`;
}

/** Puzzle 1: four numbered floor pads + hint plaque + reset + reveal sign. */
export function buildPuzzle1Room() {
  const world = blankRoom();
  openSouth(world.map, world.rows, 9);
  const pad = (id, num, tx, ty) => ({
    id, kind: 'pad', padId: id, label: `Pad ${num}`,
    x: tx * TILE, y: ty * TILE, w: TILE, h: TILE, num,
  });
  world.interactables.push(
    pad('one', 1, 5, 6),
    pad('two', 2, 8, 6),
    pad('three', 3, 11, 6),
    pad('four', 4, 14, 6),
    { id: 'hint-1', kind: 'plaque', label: 'Read hint',
      x: 6 * TILE, y: 2 * TILE, w: 8 * TILE, h: 20,
      text: 'Party order:\nTWO, FOUR, ONE, THREE' },
    { id: 'reset-1', kind: 'reset', label: 'Reset puzzle',
      x: 1 * TILE + 4, y: 10 * TILE, w: 28, h: 20 },
    { id: 'reveal-1', kind: 'reveal', label: 'Look at note',
      x: 16 * TILE, y: 3 * TILE, w: 28, h: 24, puzzle: 1 },
    {
      id: 'door-back',
      x: 9 * TILE, y: (world.rows - 1) * TILE - 4, w: 2 * TILE, h: 20,
      label: 'Back to doors', kind: 'south-door', facing: 'h', doorStyle: 'beige',
    },
  );
  world.spawn = { x: 10 * TILE - 6, y: 11 * TILE };
  world.puzzle = 1;
  return world;
}

/** Puzzle 2: three bowls + clues + reset + reveal. */
export function buildPuzzle2Room() {
  const world = blankRoom();
  openSouth(world.map, world.rows, 9);
  const bowl = (id, i, tx) => ({
    id, kind: 'bowl', bowlIndex: i, label: `Bowl ${i + 1}`,
    x: tx * TILE, y: 6 * TILE, w: 28, h: 24,
  });
  world.interactables.push(
    bowl('bowl-0', 0, 5),
    bowl('bowl-1', 1, 9),
    bowl('bowl-2', 2, 13),
    { id: 'clue-a', kind: 'plaque', label: 'Read clue',
      x: 2 * TILE, y: 2 * TILE, w: 5 * TILE, h: 20,
      text: "Chenchen's bowl\nis not in the middle." },
    { id: 'clue-b', kind: 'plaque', label: 'Read clue',
      x: 8 * TILE, y: 2 * TILE, w: 5 * TILE, h: 20,
      text: 'Treats sit between\nthe two food bowls.' },
    { id: 'clue-c', kind: 'plaque', label: 'Read clue',
      x: 14 * TILE, y: 2 * TILE, w: 4 * TILE, h: 20,
      text: "Yangyang's food is\nleft of Chenchen's." },
    { id: 'reset-2', kind: 'reset', label: 'Reset puzzle',
      x: 1 * TILE + 4, y: 10 * TILE, w: 28, h: 20 },
    { id: 'reveal-2', kind: 'reveal', label: 'Look at note',
      x: 16 * TILE, y: 3 * TILE, w: 28, h: 24, puzzle: 2 },
    {
      id: 'door-back',
      x: 9 * TILE, y: (world.rows - 1) * TILE - 4, w: 2 * TILE, h: 20,
      label: 'Back to doors', kind: 'south-door', facing: 'h', doorStyle: 'beige',
    },
  );
  world.spawn = { x: 10 * TILE - 6, y: 11 * TILE };
  world.puzzle = 2;
  return world;
}

/** Puzzle 3: three plates + three pushable gifts + hint + reset + final note. */
export function buildPuzzle3Room() {
  const world = blankRoom();
  openSouth(world.map, world.rows, 9);
  const plate = (id, i, tx) => ({
    id, kind: 'plate', plateIndex: i, label: `Plate ${['L', 'C', 'R'][i]}`,
    x: tx * TILE, y: 5 * TILE, w: TILE + 4, h: TILE + 4,
  });
  world.interactables.push(
    plate('plate-0', 0, 5),
    plate('plate-1', 1, 9),
    plate('plate-2', 2, 13),
    { id: 'hint-3', kind: 'plaque', label: 'Read poster',
      x: 5 * TILE, y: 2 * TILE, w: 10 * TILE, h: 20,
      text: 'Poster: gifts on the\nLEFT and RIGHT plates.\nNot the middle.' },
    { id: 'reset-3', kind: 'reset', label: 'Reset puzzle',
      x: 1 * TILE + 4, y: 10 * TILE, w: 28, h: 20 },
    { id: 'reveal-3', kind: 'reveal', label: 'Read sealed note',
      x: 16 * TILE, y: 3 * TILE, w: 28, h: 24, puzzle: 3 },
    {
      id: 'door-back',
      x: 9 * TILE, y: (world.rows - 1) * TILE - 4, w: 2 * TILE, h: 20,
      label: 'Back to doors', kind: 'south-door', facing: 'h', doorStyle: 'beige',
    },
  );
  // Pushable gifts start south of the plates
  world.gifts = [
    { id: 'gift-0', x: 5 * TILE, y: 9 * TILE, w: 14, h: 14 },
    { id: 'gift-1', x: 9 * TILE, y: 9 * TILE, w: 14, h: 14 },
    { id: 'gift-2', x: 13 * TILE, y: 9 * TILE, w: 14, h: 14 },
  ];
  world.spawn = { x: 10 * TILE - 6, y: 11 * TILE };
  world.puzzle = 3;
  return world;
}
