/**
 * Tilemap helpers + Decision Room / Hallway builders.
 */

import { TILE, VIEW_W, VIEW_H, PALETTE } from '../config.js';
import { makeLamp, makeBlueTorch } from './Assets.js';
import { paintSurface, paintWallShadow, paintRug, paintDoor, paintDecor, paintTeller, wallFace } from './hiTextures.js';

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
      else row.push('square');
    }
    map.push(row);
  }
  // North door opening
  map[0][9] = 'floor';
  map[0][10] = 'floor';

  // West tellers: shift apart when the center return door is present
  const westHomeY = hasWestReturn ? 2 * TILE : 3 * TILE;
  const westStockY = hasWestReturn ? 10 * TILE : 8 * TILE;

  // Teller windows on east / south / west (2 + 3 + 2). North = forward hallway door.
  const interactables = [
    {
      id: 'door-hallway',
      x: 9 * TILE,
      y: 0 * TILE,
      w: 2 * TILE,
      h: TILE,
      label: 'Hallway of Time',
      kind: 'door',
      facing: 'h',
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
      facing: 'v',
      spriteOx: -2,
      priorYear: priorYear ?? null,
    });
  }

  interactables.push(
    // South wall (3) — kid, portfolio, purchase
    {
      id: 'teller-kid',
      x: 3 * TILE,
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
      id: 'teller-portfolio',
      x: 9 * TILE,
      y: (rows - 1) * TILE - 4,
      w: 32,
      h: 22,
      label: 'Portfolio',
      kind: 'teller',
      action: 'portfolio',
      wall: true,
      wallSide: 'south',
    },
    {
      id: 'teller-buy',
      x: 14 * TILE,
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

  // One corner piece inside the square, clear of the north door and tellers.
  interactables.push(
    { id: 'decor-pillar', kind: 'decor', decor: 'pillar', x: 1 * TILE, y: 1 * TILE, w: 18, h: 18 },
    { id: 'decor-plant', kind: 'decor', decor: 'plant', x: (cols - 2) * TILE - 2, y: 1 * TILE, w: 18, h: 18 },
    { id: 'decor-sconce', kind: 'decor', decor: 'sconce', x: 1 * TILE, y: (rows - 2) * TILE - 2, w: 18, h: 18 },
    { id: 'decor-bracket', kind: 'decor', decor: 'bracket', x: (cols - 2) * TILE - 2, y: (rows - 2) * TILE - 2, w: 18, h: 18 }
  );

  return {
    cols,
    rows,
    map,
    interactables,
    rug: { x: 5 * TILE, y: 4 * TILE, w: 10 * TILE, h: 6 * TILE },
    spawn: { x: 10 * TILE - 6, y: 9 * TILE },
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
  const walkW = 6;
  const wallThick = 2;
  // Corridor stays narrow; void and walls fill the wide 16:9 view.
  const cols = VIEW_W / TILE;
  const voidPad = Math.floor((cols - walkW - wallThick * 2) / 2);
  const walkLeft = voidPad + wallThick; // first walkable col
  const walkRight = walkLeft + walkW - 1;

  const segment = 5; // a little more air between year doors
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
      x: (walkRight + 1) * TILE - 4,
      y: yTile * TILE,
      w: 14,
      h: 22,
      spriteOx: 4,
      spriteOy: -2,
      facing: 'v',
      label: `Year ${year} (age ${age})`,
      kind: 'year-door',
      year,
      age,
      yearIndex: i + 1,
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
        x: (walkRight + 1) * TILE,
        y: (yTile + 2) * TILE,
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
    facing: 'h',
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
    facing: 'h',
    spriteOy: 8,
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

const HI_TYPES = new Set(['square', 'floor', 'stone', 'wall', 'wallPurple', 'void']);

function blitHi(ctx, img, x, y, w, h) {
  ctx.drawImage(img, x, y, w, h);
}

export function drawWorld(ctx, world, camX, camY, animTime = 0) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Hallway corridor and the squarer Decision Room both sit in the wide
  // frame. Void fills the non-playable margins.
  if (world.theme === 'hallway' || world.theme === 'room') {
    const voidTile = paintSurface('void', 0, 's');
    const ox = ((camX % TILE) + TILE) % TILE;
    const oy = ((camY % TILE) + TILE) % TILE;
    for (let y = -TILE; y < VIEW_H + TILE; y += TILE) {
      for (let x = -TILE; x < VIEW_W + TILE; x += TILE) {
        blitHi(ctx, voidTile, x - ox, y - oy, TILE, TILE);
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
      if (!HI_TYPES.has(t)) continue;
      const variant = Math.abs((x * 13 + y * 7) % 4);
      const face = t === 'wall' || t === 'wallPurple' ? wallFace(world.map, x, y) : 's';
      const img = paintSurface(t === 'floor' ? 'square' : t, variant, face);
      blitHi(ctx, img, x * TILE - camX, y * TILE - camY, TILE, TILE);
    }
  }

  // Wall face throws a soft shadow onto the floor beside it.
  for (let y = startRow; y < endRow; y++) {
    for (let x = startCol; x < endCol; x++) {
      const t = world.map[y] && world.map[y][x];
      if (t !== 'wall' && t !== 'wallPurple') continue;
      const face = wallFace(world.map, x, y);
      const sh = paintWallShadow(face);
      const dx = x * TILE - camX;
      const dy = y * TILE - camY;
      if (face === 's') blitHi(ctx, sh, dx, dy + TILE - 2, TILE, 10);
      else if (face === 'n') blitHi(ctx, sh, dx, dy - 8, TILE, 10);
      else if (face === 'e') blitHi(ctx, sh, dx + TILE - 2, dy, 10, TILE);
      else blitHi(ctx, sh, dx - 8, dy, 10, TILE);
    }
  }

  if (world.theme === 'room' && world.rug) {
    const rug = paintRug(world.rug.w, world.rug.h);
    blitHi(ctx, rug, world.rug.x - camX - 2, world.rug.y - camY - 1, rug.lw, rug.lh);
  }

  if (world.theme === 'hallway') drawYearTimeline(ctx, world, camX, camY);

  ctx.restore();

  const lampFrame = Math.floor(animTime / 8) % 4;
  const lampSpr = makeLamp(lampFrame);

  for (const obj of world.interactables) {
    const sx = obj.x - camX;
    const sy = obj.y - camY;
    if (sx < -40 || sy < -40 || sx > VIEW_W + 40 || sy > VIEW_H + 40) continue;

    if (obj.kind === 'teller') {
      const spr = paintTeller(obj.action || 'home', obj.wallSide || 'south');
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(spr, sx + (spr.ox || 0), sy + (spr.oy || 0), spr.lw, spr.lh);
      ctx.restore();
      // No wall text — full name shows in the prompt only. Hit box is unchanged.
    } else if (obj.kind === 'year-door' || obj.kind === 'door' || obj.kind === 'end-door' || obj.kind === 'south-door' || obj.kind === 'west-door') {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const facing = obj.facing || (obj.wallSide === 'west' || obj.wallSide === 'east' || obj.kind === 'year-door' ? 'v' : 'h');
      const doorSpr = paintDoor(facing);
      ctx.drawImage(
        doorSpr,
        sx + (obj.spriteOx || 0),
        sy + (obj.spriteOy || 0),
        doorSpr.lw,
        doorSpr.lh
      );
    } else if (obj.kind === 'decor') {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const decor = paintDecor(obj.decor);
      ctx.drawImage(decor, sx, sy, decor.lw, decor.lh);
    } else if (obj.kind === 'lamp') {
      ctx.imageSmoothingEnabled = false;
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
      // Years are drawn in the side margin by drawYearTimeline.
    }
  }
}

/**
 * White year spine in the left void margin. A long tick is January;
 * exactly 11 short ticks sit between one year and the next.
 */
function drawYearTimeline(ctx, world, camX, camY) {
  const doors = (world.doors || []).slice().sort((a, b) => a.y - b.y);
  if (!doors.length) return;
  const axisX = (world.walkLeft - 3) * TILE - camX;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.font = '5px "Press Start 2P", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  const yOf = (d) => d.y + d.h / 2 - camY;
  ctx.beginPath();
  ctx.moveTo(axisX, yOf(doors[0]));
  ctx.lineTo(axisX, yOf(doors[doors.length - 1]));
  ctx.stroke();
  for (let i = 0; i < doors.length; i++) {
    const y = yOf(doors[i]);
    ctx.fillRect(axisX - 8, y - 1, 8, 2);
    ctx.fillText(String(doors[i].year), axisX - 10, y);
    if (i + 1 >= doors.length) continue;
    const y2 = yOf(doors[i + 1]);
    for (let m = 1; m <= 11; m++) {
      const my = y + ((y2 - y) * m) / 12;
      ctx.fillRect(axisX - 3, Math.round(my), 3, 1);
    }
  }
  ctx.restore();
}

const DOOR_KINDS = new Set(['door', 'year-door', 'west-door', 'south-door', 'end-door']);

/**
 * Painted door slab in world pixels. Same size and origin as paintDoor plus
 * spriteOx/spriteOy. This is the solid, not the interact rect (those sit
 * a few pixels into the room so facing range still reaches the door).
 * Keep w/h in sync with paintDoor ('h' 32×16, 'v' 16×26).
 */
export function doorSpriteRect(obj) {
  const facing =
    obj.facing ||
    (obj.wallSide === 'west' || obj.wallSide === 'east' || obj.kind === 'year-door' ? 'v' : 'h');
  const w = facing === 'h' ? 32 : 16;
  const h = facing === 'h' ? 16 : 26;
  return {
    x: obj.x + (obj.spriteOx || 0),
    y: obj.y + (obj.spriteOy || 0),
    w,
    h,
  };
}

function overlapsRect(x, y, w, h, r) {
  return x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
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
  // Door art that sits on an opened wall tile (north room door, south door,
  // end door) must stop the body on the same face as a wall tile. Year doors
  // and the west return door are painted on tiles that are already walls;
  // their rects match that wall face and do not eat extra floor.
  for (const obj of world.interactables || []) {
    if (!DOOR_KINDS.has(obj.kind)) continue;
    if (overlapsRect(x, y, w, h, doorSpriteRect(obj))) return true;
  }
  return false;
}

export function findFacingInteractable(player, world, range = 20) {
  const c = player.center();
  let best = null;
  let bestDist = range;
  for (const obj of world.interactables) {
    if (obj.kind === 'marker' || obj.kind === 'lamp' || obj.kind === 'spawn' || obj.kind === 'decor') continue;
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
