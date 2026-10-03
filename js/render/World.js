/**
 * Tilemap helpers + Decision Room / Hallway builders.
 */

import { TILE, VIEW_W, VIEW_H, PALETTE } from '../config.js';
import { makeTile, makeDoor, makeLamp, makeBlueTorch, makeTellerWindow, makeTellerIcon } from './Assets.js';

/**
 * Decision Room — north wall is doorway to a (new) Hallway of Time; tellers on
 * E / S / W walls (2 each). After the first room, west-wall center also has a
 * return door to the prior Hallway of Time timeline node.
 *
 * @param {{ hasWestReturn?: boolean }} [opts]
 */
export function buildDecisionRoom(opts = {}) {
  const hasWestReturn = !!opts.hasWestReturn;
  // Original room: 20×14 tiles (320×224), the old playfield proportions.
  // Side margins are void outside this map; the player cannot walk there.
  const cols = 20;
  const rows = 14;
  const map = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      if (y === 0 || y === rows - 1 || x === 0 || x === cols - 1) row.push('wall');
      else if (y >= 5 && y <= 9 && x >= 4 && x <= 15) row.push('carpet');
      else row.push('floor');
    }
    map.push(row);
  }
  // North door opening
  map[0][9] = 'floor';
  map[0][10] = 'floor';

  // West tellers: shift apart when the center return door is present
  const westHomeY = hasWestReturn ? 2 * TILE : 3 * TILE;
  const westStockY = hasWestReturn ? 10 * TILE : 8 * TILE;

  // Teller windows on east / south / west (2 + 2 + 2). North = forward hallway door.
  const interactables = [
    {
      id: 'door-hallway',
      x: 9 * TILE,
      y: 0 * TILE,
      w: 2 * TILE,
      h: TILE,
      label: 'Hallway of Time',
      kind: 'door',
    },
    // West wall (2 tellers; optional center return door inserted below)
    {
      id: 'teller-home',
      x: 0 * TILE + 2,
      y: westHomeY,
      w: 20,
      h: 32,
      label: 'Buy/Sell Home',
      kind: 'teller',
      action: 'home',
      wall: true,
      sideways: true,
      wallSide: 'west',
    },
    {
      id: 'teller-stock',
      x: 0 * TILE + 2,
      y: westStockY,
      w: 20,
      h: 32,
      label: 'Buy/Sell Stock',
      kind: 'teller',
      action: 'stock',
      wall: true,
      sideways: true,
      wallSide: 'west',
    },
  ];

  if (hasWestReturn) {
    // West-wall center → prior Hallway of Time instance (timeline node)
    const doorH = 28;
    const priorYear = opts.priorHallwayYear;
    const label =
      priorYear != null ? `Hallway after ${priorYear}` : 'Previous Hallway';
    interactables.push({
      id: 'west-return-door',
      x: 0 * TILE + 2,
      y: Math.floor(rows / 2) * TILE - Math.floor(doorH / 2),
      w: 14,
      h: doorH,
      label,
      kind: 'west-door',
      wall: true,
      sideways: true,
      wallSide: 'west',
      priorYear: priorYear ?? null,
    });
  }

  interactables.push(
    // South wall (2)
    {
      id: 'teller-kid',
      x: 4 * TILE,
      y: (rows - 1) * TILE - 4,
      w: 32,
      h: 22,
      label: 'Have A Kid',
      kind: 'teller',
      action: 'kid',
      wall: true,
      wallSide: 'south',
    },
    {
      id: 'teller-buy',
      x: 13 * TILE,
      y: (rows - 1) * TILE - 4,
      w: 32,
      h: 22,
      label: 'Make Large Purchase',
      kind: 'teller',
      action: 'purchase',
      wall: true,
      wallSide: 'south',
    },
    // East wall (2) — Job + Borrow
    {
      id: 'teller-job',
      x: (cols - 1) * TILE - 4,
      y: 3 * TILE,
      w: 20,
      h: 32,
      label: 'Job / Retire',
      kind: 'teller',
      action: 'job',
      wall: true,
      sideways: true,
      wallSide: 'east',
    },
    {
      id: 'teller-borrow',
      x: (cols - 1) * TILE - 4,
      y: 8 * TILE,
      w: 20,
      h: 32,
      label: 'Borrow',
      kind: 'teller',
      action: 'borrow',
      wall: true,
      sideways: true,
      wallSide: 'east',
    }
  );

  return {
    cols,
    rows,
    map,
    interactables,
    spawn: { x: 10 * TILE - 6, y: 8 * TILE },
    width: cols * TILE,
    height: rows * TILE,
    theme: 'room',
    hasWestReturn,
  };
}

/**
 * Hallway of Time — narrow corridor, thick walls, dark purple stippled void.
 * Doors start at leaveYear+1 / leaveAge+1 (caller passes firstDoorYear/Age).
 *
 * @param {number} doorCount - ages firstDoorAge .. 99
 * @param {number} firstDoorYear
 * @param {number} firstDoorAge
 */
export function buildHallway(doorCount, firstDoorYear, firstDoorAge) {
  // Narrow walkable: 4 tiles wide, thick 2-tile walls, void outside
  const walkW = 4;
  const wallThick = 2;
  // Corridor stays narrow; void and walls fill the wide 16:9 view.
  const cols = VIEW_W / TILE;
  const voidPad = Math.floor((cols - walkW - wallThick * 2) / 2);
  const walkLeft = voidPad + wallThick; // first walkable col
  const walkRight = walkLeft + walkW - 1;

  const segment = 3; // tighter spacing — faster feel along corridor
  const foyer = 5;
  const endPad = 7;
  const rows = foyer + doorCount * segment + endPad;
  const map = [];

  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      if (x < voidPad || x >= cols - voidPad) {
        row.push('void');
      } else if (x < walkLeft || x > walkRight) {
        row.push('wallPurple');
      } else if (y === 0 || y === rows - 1) {
        // end caps — wall with openings handled below
        row.push('wallPurple');
      } else {
        row.push('stone');
      }
    }
    map.push(row);
  }

  // South entrance opening
  for (let x = walkLeft; x <= walkRight; x++) {
    map[rows - 1][x] = 'stone';
    if (rows > 1) map[rows - 2][x] = 'stone';
  }
  // North end opening toward End of the Line
  for (let x = walkLeft; x <= walkRight; x++) {
    map[0][x] = 'stone';
    if (rows > 1) map[1][x] = 'stone';
  }

  const interactables = [];
  const doors = [];
  const midX = ((walkLeft + walkRight) / 2) * TILE;

  for (let i = 0; i < doorCount; i++) {
    const year = firstDoorYear + i;
    const age = firstDoorAge + i;
    const yTile = rows - 1 - foyer - i * segment - 1;

    // Door on right inner wall edge
    const door = {
      id: `year-door-${year}`,
      x: (walkRight + 1) * TILE - 2,
      y: yTile * TILE,
      w: 14,
      h: 22,
      label: `Year ${year} (age ${age})`,
      kind: 'year-door',
      year,
      age,
      yearIndex: i + 1, // years projected from leave baseline
    };
    doors.push(door);
    interactables.push(door);

    // Left year marker
    interactables.push({
      id: `marker-${year}`,
      x: walkLeft * TILE + 1,
      y: yTile * TILE + 4,
      w: 12,
      h: 10,
      label: String(year),
      kind: 'marker',
      year,
      age,
    });

    // Red lanterns along timeline wall (left / year-marker side) — every year
    interactables.push({
      id: `lamp-l-${year}`,
      x: (walkLeft - 1) * TILE,
      y: yTile * TILE + 4,
      w: 16,
      h: 16,
      kind: 'lamp',
      style: 'red',
      year,
    });

    // Door wall (right): blue-flame torches only every 5 years from hallway start
    if (i % 5 === 0) {
      interactables.push({
        id: `torch-r-${year}`,
        x: (walkRight + 1) * TILE - 2,
        y: yTile * TILE + 20,
        w: 16,
        h: 16,
        kind: 'lamp',
        style: 'blue',
        year,
      });
    }
  }

  // End of the Line
  interactables.push({
    id: 'end-door',
    x: midX - TILE,
    y: TILE,
    w: 2 * TILE,
    h: TILE + 8,
    label: 'End of the Line',
    kind: 'end-door',
  });

  // South spawn marker (not interactable — findFacing skips kind:'spawn')
  interactables.push({
    id: 'south-entry',
    x: midX - TILE,
    y: (rows - 2) * TILE,
    w: 2 * TILE,
    h: TILE,
    kind: 'spawn',
  });

  // South-wall door → return to the Decision Room just left (leave baseline year)
  const leaveYear = firstDoorYear - 1;
  const leaveAge = firstDoorAge - 1;
  interactables.push({
    id: 'south-return-door',
    x: midX - TILE,
    y: (rows - 1) * TILE - 8,
    w: 2 * TILE,
    h: TILE + 8,
    label: `Decision Room ${leaveYear}`,
    kind: 'south-door',
    year: leaveYear,
    age: leaveAge,
  });

  return {
    cols,
    rows,
    map,
    interactables,
    doors,
    doorCount,
    segment,
    foyer,
    endPad,
    firstDoorYear,
    firstDoorAge,
    walkLeft,
    walkRight,
    spawn: { x: midX - 6, y: (rows - 3) * TILE },
    width: cols * TILE,
    height: rows * TILE,
    theme: 'hallway',
    /** progress 0 at south (leave) → 1 at north (age 100) */
    progressAtY(y) {
      const south = (rows - foyer) * TILE;
      const north = endPad * TILE;
      const t = (south - y) / Math.max(1, south - north);
      return Math.max(0, Math.min(1, t));
    },
  };
}

export function drawWorld(ctx, world, camX, camY, animTime = 0) {
  const tiles = {
    floor: makeTile('floor'),
    wall: makeTile('wall'),
    wallPurple: makeTile('wallPurple'),
    void: makeTile('void'),
    wood: makeTile('wood'),
    grass: makeTile('grass'),
    stone: makeTile('stone'),
    carpet: makeTile('carpet'),
  };

  // Hallway corridor and the squarer Decision Room both sit in the wide
  // frame. Void fills the non-playable margins (same tile as the hallway).
  if (world.theme === 'hallway' || world.theme === 'room') {
    const voidTile = tiles.void;
    const ox = ((camX % TILE) + TILE) % TILE;
    const oy = ((camY % TILE) + TILE) % TILE;
    for (let y = -TILE; y < VIEW_H + TILE; y += TILE) {
      for (let x = -TILE; x < VIEW_W + TILE; x += TILE) {
        ctx.drawImage(voidTile, x - ox, y - oy);
      }
    }
  }

  const startCol = Math.max(0, Math.floor(camX / TILE) - 1);
  const startRow = Math.max(0, Math.floor(camY / TILE) - 1);
  const endCol = Math.min(world.cols, Math.ceil((camX + VIEW_W) / TILE) + 1);
  const endRow = Math.min(world.rows, Math.ceil((camY + VIEW_H) / TILE) + 1);

  for (let y = startRow; y < endRow; y++) {
    for (let x = startCol; x < endCol; x++) {
      const t = world.map[y][x];
      const img = tiles[t] || tiles.floor;
      ctx.drawImage(img, x * TILE - camX, y * TILE - camY);
    }
  }

  const doorSpr = makeDoor(true);
  const lampFrame = Math.floor(animTime / 8) % 4;
  const lampSpr = makeLamp(lampFrame);
  const tellerSpr = makeTellerWindow();

  for (const obj of world.interactables) {
    const sx = obj.x - camX;
    const sy = obj.y - camY;
    if (sx < -40 || sy < -40 || sx > VIEW_W + 40 || sy > VIEW_H + 40) continue;

    if (obj.kind === 'teller') {
      const icon = makeTellerIcon(obj.action || 'home');
      if (obj.sideways) {
        // Tall window on side wall; icon upright (not rotated with frame)
        ctx.save();
        ctx.translate(sx + 10, sy + 16);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(tellerSpr, -16, -12);
        ctx.restore();
        // Icon centered on the tall pane, facing into the room
        const ix = obj.wallSide === 'west' ? sx + 3 : sx + 1;
        const iy = sy + 9;
        ctx.drawImage(icon, ix, iy);
      } else {
        ctx.drawImage(tellerSpr, sx, sy);
        // Icon centered on the glass pane (window is 32×24)
        ctx.drawImage(icon, sx + 9, sy + 4);
      }
      // No wall text — full name shows in [E] prompt only
    } else if (obj.kind === 'year-door' || obj.kind === 'door' || obj.kind === 'end-door' || obj.kind === 'south-door' || obj.kind === 'west-door') {
      ctx.drawImage(doorSpr, sx, sy - 4);
    } else if (obj.kind === 'lamp') {
      const isBlue = obj.style === 'blue';
      const spr = isBlue ? makeBlueTorch(lampFrame) : lampSpr;
      ctx.drawImage(spr, sx, sy);
      // flickering glow — orange for red lanterns, cyan for blue torches
      const pulse = 0.1 + 0.06 * Math.sin(animTime / 5 + (obj.x || 0));
      ctx.fillStyle = isBlue
        ? `rgba(80,180,255,${pulse})`
        : `rgba(255,180,40,${pulse})`;
      ctx.beginPath();
      ctx.arc(sx + 8, sy + 6, 14 + (lampFrame % 2), 0, Math.PI * 2);
      ctx.fill();
    } else if (obj.kind === 'marker') {
      ctx.fillStyle = PALETTE.goldDark;
      ctx.fillRect(sx, sy, 14, 10);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '5px "Press Start 2P", monospace';
      ctx.fillText(String(obj.year).slice(2), sx + 1, sy + 2);
    }
  }
}

export function isSolid(world, x, y, w, h) {
  const points = [
    [x, y],
    [x + w - 1, y],
    [x, y + h - 1],
    [x + w - 1, y + h - 1],
  ];
  for (const [px, py] of points) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (ty < 0 || tx < 0 || ty >= world.rows || tx >= world.cols) return true;
    const t = world.map[ty][tx];
    if (t === 'wall' || t === 'wallPurple' || t === 'void') return true;
  }
  return false;
}

export function findFacingInteractable(player, world, range = 20) {
  const c = player.center();
  let best = null;
  let bestDist = range;
  for (const obj of world.interactables) {
    if (obj.kind === 'marker' || obj.kind === 'lamp' || obj.kind === 'spawn') continue;
    const ox = obj.x + obj.w / 2;
    const oy = obj.y + obj.h / 2;
    const d = Math.hypot(c.x - ox, c.y - oy);
    // Prefer objects in facing direction slightly
    let bonus = 0;
    if (player.facing === 'up' && oy < c.y) bonus = -4;
    if (player.facing === 'down' && oy > c.y) bonus = -4;
    if (player.facing === 'left' && ox < c.x) bonus = -4;
    if (player.facing === 'right' && ox > c.x) bonus = -4;
    const score = d + bonus;
    if (score < bestDist) {
      bestDist = score;
      best = obj;
    }
  }
  return best;
}
