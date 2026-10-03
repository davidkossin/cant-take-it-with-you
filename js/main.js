/**
 * You Can't Take It With You — bootstrap & scene loop.
 */

import { VIEW_W, CANVAS_H, KEYS, GAME_VERSION } from './config.js';
import { chooseCanvasScale, canvasCssSize } from './layout/canvasFit.js';
import { installHdText } from './render/hdText.js';
import { Dialog } from './render/Dialog.js';
import { TitleScene } from './scenes/TitleScene.js';
import { SetupScene } from './scenes/SetupScene.js';
import { RoomScene } from './scenes/RoomScene.js';
import { HallwayScene } from './scenes/HallwayScene.js';
import { EndingScene } from './scenes/EndingScene.js';
import { PauseMenu } from './scenes/PauseMenu.js';
import { VirtualPad } from './input/VirtualPad.js';
import { MobileTextInput } from './input/MobileTextInput.js';
import {
  initDebugFromEnvironment,
  drawOverlay as drawDebugOverlay,
  log as debugLog,
} from './debug/Logger.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
installHdText(ctx);

function applyLogicalTransform() {
  const sx = canvas.width / VIEW_W;
  const sy = canvas.height / CANVAS_H;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

function availableViewport() {
  const vv = window.visualViewport;
  if (vv) return { w: vv.width, h: vv.height };
  return { w: window.innerWidth, h: window.innerHeight };
}

/**
 * Bottom inset of the on-screen pad, or 0 when reserving it would shrink
 * the logical playfield below 1× (short landscape phones keep the overlay).
 */
function touchPadReserve() {
  if (!document.body.classList.contains('has-virtual-pad')) return 0;
  const { h: winH } = availableViewport();
  let top = winH;
  for (const el of document.querySelectorAll('.vp-dpad, .vp-actions')) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) top = Math.min(top, r.top);
  }
  const overlap = Math.max(0, Math.round(winH - top));
  if (overlap <= 0) return 0;
  const topbar = document.querySelector('.topbar');
  const topbarH = topbar ? topbar.getBoundingClientRect().height : 48;
  const minPlay = CANVAS_H + topbarH + 48;
  if (winH - overlap < minPlay) return 0;
  return overlap;
}

function fitCanvas() {
  const reserve = touchPadReserve();
  document.documentElement.style.setProperty('--pad-reserve', `${reserve}px`);

  const { w: winW, h: winH } = availableViewport();
  const hint = document.querySelector('.hint');
  const frame = document.querySelector('.frame');
  const bodyStyle = getComputedStyle(document.body);
  const padTop = parseFloat(bodyStyle.paddingTop) || 0;
  const padBottom = parseFloat(bodyStyle.paddingBottom) || 0;
  const padLeft = parseFloat(bodyStyle.paddingLeft) || 0;
  const padRight = parseFloat(bodyStyle.paddingRight) || 0;

  const frameStyle = frame ? getComputedStyle(frame) : null;
  const borderY = frameStyle ? parseFloat(frameStyle.borderTopWidth) || 0 : 0;
  const borderX = frameStyle ? parseFloat(frameStyle.borderLeftWidth) || 0 : 0;

  const hintStyle = hint ? getComputedStyle(hint) : null;
  const hintVisible = !!(
    hint &&
    hintStyle &&
    hintStyle.display !== 'none' &&
    hintStyle.visibility !== 'hidden'
  );
  const hintH = hintVisible
    ? hint.getBoundingClientRect().height +
      (parseFloat(hintStyle.marginTop) || 0) +
      (parseFloat(hintStyle.marginBottom) || 0)
    : 0;

  const availW = Math.max(32, Math.floor(winW - padLeft - padRight - borderX * 2));
  const availH = Math.max(32, Math.floor(winH - padTop - padBottom - hintH - borderY * 2));

  const dpr = window.devicePixelRatio || 1;
  const scale = chooseCanvasScale(availW, availH, VIEW_W, CANVAS_H, dpr);
  const { cssW, cssH } = canvasCssSize(scale, VIEW_W, CANVAS_H, availW, availH);

  // CSS box is the window fit. Backing store is that box × devicePixelRatio
  // so text and chart strokes rasterize sharp. Scenes still use logical
  // 320×280 coordinates (see applyLogicalTransform). DOM overlays map
  // pointers through the CSS box, not the backing-store size.
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const bufW = Math.max(1, Math.round(cssW * dpr));
  const bufH = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== bufW) canvas.width = bufW;
  if (canvas.height !== bufH) canvas.height = bufH;
  applyLogicalTransform();
}

function scheduleFit() {
  fitCanvas();
  requestAnimationFrame(fitCanvas);
}

fitCanvas();
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', scheduleFit);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitCanvas);
  window.visualViewport.addEventListener('scroll', fitCanvas);
}
if (window.screen?.orientation) {
  window.screen.orientation.addEventListener('change', scheduleFit);
}

const virtualPadEl = document.getElementById('virtual-pad');
const virtualPad = new VirtualPad(virtualPadEl);
virtualPad.mount();
// Re-fit after pad / hint visibility changes layout
requestAnimationFrame(fitCanvas);
if (document.fonts?.ready) {
  document.fonts.ready.then(() => fitCanvas());
}

initDebugFromEnvironment();

const dialog = new Dialog();
const mobileText = new MobileTextInput(canvas, dialog);
mobileText.mount();
const title = new TitleScene({});
const setup = new SetupScene();
const room = new RoomScene();
const hallway = new HallwayScene();
const ending = new EndingScene();
const pause = new PauseMenu();

/** @type {'title'|'setup'|'room'|'hallway'|'ending'} */
let mode = 'title';
/** @type {object|null} */
let game = null;
let booting = true;
let interacting = false;

function waitForConfirm() {
  return new Promise((resolve) => {
    const handler = (e) => {
      if (KEYS.confirm.includes(e.key)) {
        window.removeEventListener('keydown', handler);
        e.preventDefault();
        resolve();
      }
    };
    window.addEventListener('keydown', handler);
  });
}

async function startTitle() {
  mode = 'title';
  game = null;
  booting = true;
  pause.hide();
  await waitForConfirm();
  const result = await title.runMenu(dialog);
  if (result.action === 'load') {
    game = result.game;
    // migrate old saves lightly
    if (!game.worthHistory) game.worthHistory = [];
    if (!game.timeline.snapshots) game.timeline.snapshots = {};
    mode = game.scene === 'hallway' ? 'hallway' : 'room';
    if (mode === 'room') room.enter(game, false);
    else hallway.enter(game);
  } else if (result.action === 'new' && result.game) {
    // Standard portfolio or Use Profile — game already built
    game = result.game;
    mode = 'room';
    room.enter(game, false);
  } else {
    // Custom setup (one-off; not auto-saved as a profile)
    mode = 'setup';
    game = await setup.run(dialog);
    mode = 'room';
    room.enter(game, false);
  }
  booting = false;
}

window.addEventListener('keydown', async (e) => {
  if (dialog.active) {
    dialog.handleKeyDown(e);
    return;
  }

  if (pause.open) {
    const result = pause.handleKey(e, game);
    if (result === 'close') {
      if (mode === 'room') room.setInputBlocked(false);
      else if (mode === 'hallway') hallway.setInputBlocked(false);
    }
    if (result && typeof result === 'object' && result.jump) {
      // Restored hallway branch — re-enter hallway scene
      room.leave();
      hallway.leave();
      mode = 'hallway';
      hallway.enter(game);
      game.scene = 'hallway';
    }
    return;
  }

  if (mode === 'ending') {
    ending.handleKey(e);
    if (ending.done) {
      room.leave();
      hallway.leave();
      startTitle();
    }
    return;
  }

  if (booting || interacting) return;

  // Esc opens pause map/charts during play
  if (KEYS.cancel.includes(e.key) && (mode === 'room' || mode === 'hallway') && game) {
    e.preventDefault();
    if (mode === 'room') room.setInputBlocked(true);
    else hallway.setInputBlocked(true);
    pause.show(game, dialog);
    return;
  }

  if (KEYS.confirm.includes(e.key)) {
    e.preventDefault();
    interacting = true;
    try {
      let nav = null;
      if (mode === 'room') nav = await room.tryInteract(game, dialog);
      else if (mode === 'hallway') nav = await hallway.tryInteract(game, dialog);
      if (nav?.goto) await transition(nav.goto);
    } finally {
      interacting = false;
    }
  }
});

async function transition(to) {
  debugLog('scene', { to, from: mode });
  if (to === 'hallway') {
    room.leave();
    mode = 'hallway';
    hallway.enter(game);
    game.scene = 'hallway';
  } else if (to === 'room') {
    hallway.leave();
    mode = 'room';
    room.enter(game, true);
    game.scene = 'room';
  } else if (to === 'ending') {
    hallway.leave();
    mode = 'ending';
    ending.enter(game);
    game.scene = 'ending';
  }
}

function loop() {
  applyLogicalTransform();
  ctx.fillStyle = '#0a0810';
  ctx.fillRect(0, 0, VIEW_W, CANVAS_H);
  ctx.imageSmoothingEnabled = false;

  if (mode === 'title') {
    title.update();
    title.draw(ctx);
  } else if (mode === 'setup') {
    setup.draw(ctx);
  } else if (mode === 'room' && game) {
    if (!pause.open) room.update(game, dialog);
    room.render(ctx, game);
  } else if (mode === 'hallway' && game) {
    if (!pause.open) hallway.update(game, dialog);
    hallway.render(ctx, game);
    if (
      !pause.open &&
      !interacting &&
      !dialog.active &&
      !booting &&
      hallway.wantsGlassWallMessage()
    ) {
      interacting = true;
      hallway
        .showGlassWallMessage(dialog)
        .catch((err) => console.error(err))
        .finally(() => {
          interacting = false;
        });
    }
  } else if (mode === 'ending') {
    ending.update();
    ending.render(ctx);
  }

  if (pause.open && game) pause.draw(ctx, game);
  dialog.draw(ctx);

  // Build version — bottom-right, always visible for cache checks
  ctx.save();
  ctx.font = '5px "Press Start 2P", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(240, 232, 200, 0.45)';
  ctx.fillText('v' + GAME_VERSION, VIEW_W - 4, CANVAS_H - 3);
  ctx.restore();

  // Always call — draws toast on toggle OFF as well as the DEBUG ON panel
  drawDebugOverlay(ctx, VIEW_W, CANVAS_H);

  requestAnimationFrame(loop);
}

loop();
startTitle().catch((err) => {
  console.error(err);
  debugLog('error', { where: 'boot', message: String(err && err.message || err) });
  ctx.fillStyle = '#c04040';
  ctx.font = '8px monospace';
  ctx.fillText('Boot error — see console', 20, 40);
});
