/**
 * Tilemap helpers + Decision Room / Hallway builders.
 */

import { TILE, VIEW_W, VIEW_H, WORLD_SCALE } from '../config.js';
import { makeLamp, makeBlueTorch } from './Assets.js';
import { paintSurface, paintWallShadow, paintRug, paintDoor, paintDecor, paintTeller, paintEndWall, paintSouthWall, drawDeathsDoorLanterns, drawSouthDoorLanterns, wallFace } from './hiTextures.js';

/**
 * Decision Room — north wall is doorway to a (new) Hallway of Time plus the Bank
 * teller; other tellers on E / S / W walls. After the first room, west-wall center also has a
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
      label: 'Family',
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
    },
    // North wall, left of the Hallway door — Bank: Savings ↔ Cash and retirement withdrawals.
    // Only Cash pays bills, so this is where the player raises Cash by hand.
    {
      id: 'teller-bank',
      x: 4 * TILE,
      y: -2,
      w: 32,
      h: 22,
      label: 'Bank: Move Money',
      kind: 'teller',
      action: 'bank',
      wall: true,
      wallSide: 'north',
    }
  );

  // One corner piece inside the square, clear of the north door and tellers.
  interactables.push(
    { id: 'decor-pillar', kind: 'decor', decor: 'pillar', x: 1 * TILE, y: 1 * TILE, w: 18, h: 18 },
    { id: 'decor-plant', kind: 'decor', decor: 'plant', x: (cols - 2) * TILE - 2, y: 1 * TILE, w: 18, h: 18 },
    { id: 'decor-sconce', kind: 'decor', decor: 'sconce', x: 1 * TILE, y: (rows - 2) * TILE - 2, w: 18, h: 18 },
    { id: 'decor-armchair', kind: 'decor', decor: 'armchair', x: (cols - 2) * TILE - 2, y: (rows - 2) * TILE - 2, w: 18, h: 18 }
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

  // South end: a solid stone wall across the corridor, as thick as the end
  // wall (2 tiles). It is painted as a band sloping down toward the screen
  // edge, with the south-return door set into the slope.
  for (let x = walkLeft; x <= walkRight; x++) {
    map[rows - 1][x] = 'wallPurple';
    if (rows > 1) map[rows - 2][x] = 'wallPurple';
  }
  // North end: a solid end wall across the corridor, as thick as the side
  // walls. The End of the Line door is set flush into its south face.
  for (let x = walkLeft; x <= walkRight; x++) {
    map[0][x] = 'wallPurple';
    if (rows > 1) map[1][x] = 'wallPurple';
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

  // End of the Line — centered in the end wall, bottom flush with the wall
  // face (y = 2 tiles), so its solid rect sits on the same plane as the wall.
  const corridorMidX = ((walkLeft + walkRight + 1) / 2) * TILE;
  const endDoor = {
    id: 'end-door',
    x: corridorMidX - TILE,
    y: TILE,
    w: 2 * TILE,
    h: TILE + 8,
    label: 'End of the Line',
    kind: 'end-door',
    facing: 'h',
    // Death's Door (internal name; player-facing label unchanged).
    doorStyle: 'deaths-door',
  };
  interactables.push(endDoor);

  // South spawn marker (not interactable — findFacing skips kind:'spawn')
  interactables.push({
    id: 'south-entry',
    x: midX - TILE,
    y: (rows - 3) * TILE,
    w: 2 * TILE,
    h: TILE,
    kind: 'spawn',
  });

  // South-wall door → return to the Decision Room just left (leave baseline year)
  // Slab is drawn in the south wall's sloped face, rotated 180° with its
  // threshold at the floor edge (spriteOy). Its interact rect reaches 8 px
  // out of the wall onto the floor, mirroring the end door, so the player
  // can still face and use it from the corridor.
  const leaveYear = firstDoorYear - 1;
  const leaveAge = firstDoorAge - 1;
  const southDoor = {
    id: 'south-return-door',
    x: midX - TILE,
    y: (rows - 2) * TILE - 8,
    w: 2 * TILE,
    h: TILE + 8,
    label: `Decision Room ${leaveYear}`,
    kind: 'south-door',
    facing: 'h',
    spriteOy: 9,
    // Same construction as the end door, warm ivory/beige with gold trim,
    // rotated 180° and foreshortened for the sloped south wall.
    doorStyle: 'beige-gold-sloped',
    year: leaveYear,
    age: leaveAge,
  };
  interactables.push(southDoor);

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
    /** Painted end wall over rows 0–1, side walls included, door recess cut in. */
    endWall: {
      x: (walkLeft - wallThick) * TILE,
      y: 0,
      w: (walkW + wallThick * 2) * TILE,
      h: 2 * TILE,
      door: doorSpriteRect(endDoor),
    },
    /** Painted south wall over the last 2 rows: a bevelled band sloping toward the screen edge, mitered into the side walls, door recess cut in. */
    southWall: {
      x: (walkLeft - wallThick) * TILE,
      y: (rows - 2) * TILE,
      w: (walkW + wallThick * 2) * TILE,
      h: 2 * TILE,
      door: doorSpriteRect(southDoor),
    },
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

// Cache terrain in small world-space chunks rather than a canvas the length of
// the hallway. 24 RGBA chunks at the game's 4× scale use at most 24 MiB of
// backing pixels, shared across every visited room and hallway.
const STATIC_CHUNK_SIZE = 128;
const MAX_STATIC_CHUNKS = 24;
const staticWorlds = new WeakMap();
const staticChunks = new Map();
const timelineDoors = new WeakMap();

function releaseStaticChunk(entry) {
  staticChunks.delete(entry);
  entry.state.chunks.delete(entry.key);
  // Explicitly release backing storage, including OffscreenCanvas storage.
  entry.canvas.width = 0;
  entry.canvas.height = 0;
}

/** Call after editing an existing world's map in place. Built worlds are static. */
export function invalidateWorldRenderCache(world) {
  const state = staticWorlds.get(world);
  if (state) for (const entry of Array.from(state.chunks.values())) releaseStaticChunk(entry);
  staticWorlds.delete(world);
  timelineDoors.delete(world);
}

function staticWorldState(world) {
  // Replacing terrain, dimensions or overlay geometry invalidates automatically.
  // renderRevision also gives editors an inexpensive in-place invalidation key.
  const shape = `${world.cols}:${world.rows}:${world.theme}:${world.renderRevision ?? 0}:` +
    `${world.rug?.x}:${world.rug?.y}:${world.rug?.w}:${world.rug?.h}:` +
    `${world.endWall?.x}:${world.endWall?.y}:${world.endWall?.w}:${world.endWall?.h}:` +
    `${world.endWall?.door?.x}:${world.endWall?.door?.y}:${world.endWall?.door?.w}:${world.endWall?.door?.h}:` +
    `${world.southWall?.x}:${world.southWall?.y}:${world.southWall?.w}:${world.southWall?.h}:` +
    `${world.southWall?.door?.x}:${world.southWall?.door?.y}:${world.southWall?.door?.w}:${world.southWall?.door?.h}`;
  let state = staticWorlds.get(world);
  if (!state || state.map !== world.map || state.shape !== shape) {
    invalidateWorldRenderCache(world);
    state = { map: world.map, shape, chunks: new Map() };
    staticWorlds.set(world, state);
  }
  return state;
}

function makeStaticCanvas() {
  const side = STATIC_CHUNK_SIZE * WORLD_SCALE;
  try {
    let canvas;
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(side, side);
    else if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
    }
    const ctx = canvas?.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  } catch {
    // Browsers without a usable auxiliary canvas retain the direct renderer.
    return null;
  }
}

function drawStaticTerrain(ctx, world, camX, camY, viewW, viewH) {
  const startCol = Math.max(0, Math.floor(camX / TILE) - 1);
  const startRow = Math.max(0, Math.floor(camY / TILE) - 1);
  const endCol = Math.min(world.cols, Math.ceil((camX + viewW) / TILE) + 1);
  const endRow = Math.min(world.rows, Math.ceil((camY + viewH) / TILE) + 1);

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

  // Hallway end wall: one continuous painted face (cap on top, darker toward
  // the floor) over the wall tiles, so the End of the Line door is set in a wall.
  if (world.theme === 'hallway' && world.endWall) {
    const ew = world.endWall;
    const tex = paintEndWall(ew.w, ew.h, ew.door.x - ew.x, ew.door.y - ew.y, ew.door.w, ew.door.h);
    blitHi(ctx, tex, ew.x - camX, ew.y - camY, ew.w, ew.h);
  }
  // Hallway south wall: a bevelled band sloping toward the bottom of the
  // screen, mitered into the side walls, with the door set into the slope.
  if (world.theme === 'hallway' && world.southWall) {
    const sw = world.southWall;
    const sideT = (world.walkLeft * TILE) - sw.x;
    const tex = paintSouthWall(sw.w, sw.h, sw.door.x - sw.x, sw.door.y - sw.y, sw.door.w, sw.door.h, sideT);
    blitHi(ctx, tex, sw.x - camX, sw.y - camY, sw.w, sw.h);
  }

  if (world.theme === 'room' && world.rug) {
    const rug = paintRug(world.rug.w, world.rug.h);
    blitHi(ctx, rug, world.rug.x - camX - 2, world.rug.y - camY - 1, rug.lw, rug.lh);
  }
}

function drawCachedTerrain(ctx, world, camX, camY) {
  const state = staticWorldState(world);
  const x0 = Math.floor(camX / STATIC_CHUNK_SIZE);
  const y0 = Math.floor(camY / STATIC_CHUNK_SIZE);
  const x1 = Math.ceil((camX + VIEW_W) / STATIC_CHUNK_SIZE);
  const y1 = Math.ceil((camY + VIEW_H) / STATIC_CHUNK_SIZE);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const key = `${x}:${y}`;
      let entry = state.chunks.get(key);
      if (!entry) {
        const surface = makeStaticCanvas();
        if (!surface) {
          // Clip to this chunk if an auxiliary canvas becomes unavailable
          // after earlier chunks were drawn; do not paint their shadows twice.
          ctx.save();
          ctx.beginPath();
          ctx.rect(x * STATIC_CHUNK_SIZE - camX, y * STATIC_CHUNK_SIZE - camY,
            STATIC_CHUNK_SIZE, STATIC_CHUNK_SIZE);
          ctx.clip();
          drawStaticTerrain(ctx, world, camX, camY, VIEW_W, VIEW_H);
          ctx.restore();
          continue;
        }
        const sc = surface.ctx;
        sc.setTransform(WORLD_SCALE, 0, 0, WORLD_SCALE, 0, 0);
        sc.imageSmoothingEnabled = true;
        sc.imageSmoothingQuality = 'high';
        // Include the adjacent tile when painting shadows that cross a chunk
        // boundary; the canvas itself clips both layers to the same edge.
        drawStaticTerrain(sc, world, x * STATIC_CHUNK_SIZE, y * STATIC_CHUNK_SIZE,
          STATIC_CHUNK_SIZE, STATIC_CHUNK_SIZE);
        entry = { key, state, canvas: surface.canvas };
        state.chunks.set(key, entry);
      }
      staticChunks.delete(entry);
      staticChunks.set(entry, true);
      while (staticChunks.size > MAX_STATIC_CHUNKS) {
        releaseStaticChunk(staticChunks.keys().next().value);
      }
      blitHi(ctx, entry.canvas, x * STATIC_CHUNK_SIZE - camX,
        y * STATIC_CHUNK_SIZE - camY, STATIC_CHUNK_SIZE, STATIC_CHUNK_SIZE);
    }
  }
}

export function drawWorld(ctx, world, camX, camY, animTime = 0) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // The painted void tile is a uniform color, so one fill covers the margins.
  if (world.theme === 'hallway' || world.theme === 'room') {
    ctx.fillStyle = '#141c2c';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  drawCachedTerrain(ctx, world, camX, camY);

  if (world.theme === 'hallway' && world.endWall) {
    const ew = world.endWall;
    if (ew.y + ew.h - camY >= -32 && ew.y - camY <= VIEW_H + 32) {
      drawDeathsDoorLanterns(ctx, ew.door, ew.y + ew.h, camX, camY, animTime);
    }
  }

  // Green lanterns on the south wall, flanking the beige/gold south door.
  if (world.theme === 'hallway' && world.southWall) {
    const sw = world.southWall;
    if (sw.y + sw.h - camY >= -32 && sw.y - camY <= VIEW_H + 32) {
      drawSouthDoorLanterns(ctx, sw.door, camX, camY, animTime);
    }
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
      const doorSpr = paintDoor(facing, obj.doorStyle);
      ctx.drawImage(
        doorSpr,
        sx + (obj.spriteOx || 0) + (doorSpr.ox || 0),
        sy + (obj.spriteOy || 0) + (doorSpr.oy || 0),
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
  // Doors / decor switch smoothing on for their painted art. Do not leak it
  // to whatever the scene draws next (the player sprite is pixel art).
  ctx.imageSmoothingEnabled = false;
}

/**
 * White year spine in the left void margin. A long tick is January;
 * exactly 11 short ticks sit between one year and the next.
 */
function drawYearTimeline(ctx, world, camX, camY) {
  let ordered = timelineDoors.get(world);
  if (!ordered || ordered.source !== world.doors || ordered.length !== world.doors?.length ||
      ordered.revision !== world.renderRevision) {
    ordered = {
      source: world.doors,
      length: world.doors?.length,
      revision: world.renderRevision,
      doors: (world.doors || []).slice().sort((a, b) => a.y - b.y),
    };
    timelineDoors.set(world, ordered);
  }
  const doors = ordered.doors;
  if (!doors.length) return;
  const axisX = (world.walkLeft - 3) * TILE - camX;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.font = '5px "Press Start 2P", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  const worldYOf = (d) => d.y + d.h / 2;
  const yOf = (d) => worldYOf(d) - camY;
  if (yOf(doors[0]) > VIEW_H || yOf(doors[doors.length - 1]) < 0) {
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(axisX, Math.max(0, yOf(doors[0])));
  ctx.lineTo(axisX, Math.min(VIEW_H, yOf(doors[doors.length - 1])));
  ctx.stroke();
  // Find the first visible year in logarithmic time, retaining the preceding
  // interval so its monthly marks can appear above the next year's label.
  let lo = 0;
  let hi = doors.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (worldYOf(doors[mid]) < camY) lo = mid + 1;
    else hi = mid;
  }
  for (let i = Math.max(0, lo - 1); i < doors.length; i++) {
    const y = yOf(doors[i]);
    if (y > VIEW_H) break;
    if (y >= 0) {
      ctx.fillRect(axisX - 8, y - 1, 8, 2);
      ctx.fillText(String(doors[i].year), axisX - 10, y);
    }
    if (i + 1 >= doors.length) continue;
    const y2 = yOf(doors[i + 1]);
    for (let m = 1; m <= 11; m++) {
      const my = y + ((y2 - y) * m) / 12;
      if (my >= 0 && my <= VIEW_H) ctx.fillRect(axisX - 3, Math.round(my), 3, 1);
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
