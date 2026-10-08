/**
 * You Can't Take It With You — bootstrap & scene loop.
 */

import { FRAME_W, FRAME_H, KEYS, GAME_VERSION } from './config.js';
import { installHdText } from './render/hdText.js';
import { Dialog } from './render/Dialog.js';
import { TitleScene } from './scenes/TitleScene.js';
import { SetupScene } from './scenes/SetupScene.js';
import { RoomScene } from './scenes/RoomScene.js';
import { HallwayScene } from './scenes/HallwayScene.js';
import { EndingScene } from './scenes/EndingScene.js';
import { PauseMenu } from './scenes/PauseMenu.js';
import { VirtualPad } from './input/VirtualPad.js';
import { installFullscreen, isOsFullscreen } from './input/Fullscreen.js';
import { MobileTextInput } from './input/MobileTextInput.js';
import { FrameClock } from './input/FrameClock.js';
import { initializeSaves, getSaveStatus } from './state/SaveSystem.js';
import { setMoneyContext } from './finance/DollarBasis.js';
import {
  initDebugFromEnvironment,
  drawOverlay as drawDebugOverlay,
  log as debugLog,
} from './debug/Logger.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
installHdText(ctx);

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
  for (const el of document.querySelectorAll('.vp-stick, .vp-actions')) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) top = Math.min(top, r.top);
  }
  const overlap = Math.max(0, Math.round(winH - top));
  if (overlap <= 0) return 0;
  const topbar = document.querySelector('.topbar');
  const topbarH = topbar ? topbar.getBoundingClientRect().height : 48;
  // CSS pixels, not the 1920×1080 buffer. Reserve the pad unless the
  // window is already too short to show a playable frame.
  const minPlay = topbarH + 160;
  if (winH - overlap < minPlay) return 0;
  return overlap;
}

function fitCanvas() {
  const { w: viewW, h: viewH } = availableViewport();
  // Landscape (including a wide desktop window): drop extra chrome so the
  // 16:9 frame can grow. Portrait keeps the roomier padding and the hint.
  document.body.classList.toggle('is-landscape', viewW > viewH);

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

  // CSS box is the largest 16:9 rect that fits the window. The backing
  // store stays exactly 1920×1080 so HUD, text, charts, and menus rasterize
  // at that frame. The pixel world is integer-scaled inside it.
  const aspect = FRAME_W / FRAME_H;
  let cssW = availW;
  let cssH = Math.floor(availW / aspect);
  if (cssH > availH) {
    cssH = availH;
    cssW = Math.floor(availH * aspect);
  }
  cssW = Math.max(32, cssW);
  cssH = Math.max(18, cssH);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  if (canvas.width !== FRAME_W) canvas.width = FRAME_W;
  if (canvas.height !== FRAME_H) canvas.height = FRAME_H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
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
installFullscreen({
  button: document.getElementById('fs-btn'),
  onChange: () => fitCanvas(),
  allowKey: () => !pause.open && !(dialog.active && (dialog.mode === 'prompt' || dialog.mode === 'form')),
});
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
const frameClock = new FrameClock();

function syncMoneyContext(forInput = false) {
  if (!game) return;
  const portfolio = !forInput && mode === 'hallway' && !pause.open && !dialog.active
    ? hallway.visual?.state || game.portfolio : game.portfolio;
  setMoneyContext({ ...portfolio, inflationAdjusted: (game.settings?.inflationAdjusted ?? game.portfolio.inflationAdjusted) !== false,
    dollarBaseYear: game.portfolio.dollarBaseYear ?? game.timeline.startYear });
}

function suspendInput() {
  room.player?.clearKeys();
  hallway.player?.clearKeys();
  virtualPad.clearHeldInput();
  frameClock.reset();
}
window.addEventListener('blur', suspendInput);
document.addEventListener('visibilitychange', suspendInput);

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
  setMoneyContext(null);
  booting = true;
  pause.hide();
  await waitForConfirm();
  const result = await title.runMenu(dialog);
  if (result.action === 'load') {
    game = result.game;
    // migrate old saves lightly
    if (!game.worthHistory) game.worthHistory = [];
    if (!game.timeline.snapshots) game.timeline.snapshots = {};
    mode = game.scene === 'ending' ? 'ending' : game.scene === 'hallway' ? 'hallway' : 'room';
    if (mode === 'room') room.enter(game, false);
    else if (mode === 'hallway') hallway.enter(game);
    else ending.enter(game);
  } else if (result.action === 'new' && result.game) {
    // Standard portfolio or Use Profile — game already built
    game = result.game;
    mode = 'room';
    room.enter(game, false);
  } else {
    // Custom setup (one-off; not auto-saved as a profile)
    mode = 'setup';
    game = await setup.run(dialog);
    if (!game) {
      // Cancelled at name step — back to main menu
      startTitle();
      return;
    }
    mode = 'room';
    room.enter(game, false);
  }
  booting = false;
}

function directionHeld() {
  const p = mode === 'room' ? room.player : mode === 'hallway' ? hallway.player : null;
  if (!p) return false;
  return (
    p.pressed(KEYS.up) ||
    p.pressed(KEYS.down) ||
    p.pressed(KEYS.left) ||
    p.pressed(KEYS.right)
  );
}


/** Map CSS-pixel click → logical 1920×1080 canvas coords. */
function canvasLogicalXY(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const lx = ((clientX - rect.left) / rect.width) * FRAME_W;
  const ly = ((clientY - rect.top) / rect.height) * FRAME_H;
  return { x: lx, y: ly };
}

/** Act on a PauseMenu result from a key or a click ('close' | 'quit' | {jump}). */
function applyPauseResult(result) {
  if (result === 'close') {
    if (mode === 'room') room.setInputBlocked(false);
    else if (mode === 'hallway') hallway.setInputBlocked(false);
  }
  if (result === 'quit') {
    room.leave();
    hallway.leave();
    startTitle();
    return;
  }
  if (result && typeof result === 'object' && result.jump) {
    // Restored hallway branch — re-enter hallway scene
    room.leave();
    hallway.leave();
    mode = 'hallway';
    hallway.enter(game);
    game.scene = 'hallway';
  }
}

// Pointer input is bound to the canvas only. The on-screen pad is separate DOM
// above the canvas, so pad taps never reach these handlers (no double fire).
canvas.addEventListener('pointerdown', (e) => {
  if (e.button != null && e.button !== 0) return;
  if (e.target !== canvas) return;
  const pt = canvasLogicalXY(e.clientX, e.clientY);
  if (!pt) return;
  syncMoneyContext(true);
  if (dialog.active) {
    if (dialog.handlePointer(pt.x, pt.y)) {
      e.preventDefault();
    }
    return;
  }
  if (pause.open && game) {
    const { handled, result } = pause.handlePointerDown(pt.x, pt.y, game);
    if (handled) {
      e.preventDefault();
      canvas.style.cursor = '';
      applyPauseResult(result);
    }
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return; // touch has no hover; taps go through pointerdown
  const pt = canvasLogicalXY(e.clientX, e.clientY);
  let over = false;
  if (pt && dialog.active && dialog.mode === 'palette') {
    // The appearance page previews the hovered swatch, in setup and in tellers.
    over = dialog.hoverPointer(pt.x, pt.y);
  } else if (pt && pause.open && game) {
    over = dialog.active ? dialog.hoverPointer(pt.x, pt.y) : pause.handlePointerMove(pt.x, pt.y, game);
  }
  canvas.style.cursor = over ? 'pointer' : '';
});

canvas.addEventListener('pointerleave', () => {
  pause.hoverKey = null;
  canvas.style.cursor = '';
});

window.addEventListener('keydown', async (e) => {
  syncMoneyContext(true);
  if (dialog.active) {
    dialog.handleKeyDown(e);
    return;
  }

  if (pause.open) {
    applyPauseResult(pause.handleKey(e, game));
    if (!pause.open) canvas.style.cursor = '';
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

  // Esc / Menu opens pause map/charts during play
  if (KEYS.cancel.includes(e.key) && (mode === 'room' || mode === 'hallway') && game) {
    // A trusted Escape exits OS fullscreen; do not also open pause on that keypress.
    // Synthetic Escape from the on-screen Menu button must still open pause in
    // OS fullscreen and in the iOS viewport-fill fallback (is-max-fill).
    if (isOsFullscreen() && e.isTrusted && e.key === 'Escape') return;
    e.preventDefault();
    if (mode === 'room') room.setInputBlocked(true);
    else hallway.setInputBlocked(true);
    pause.show(game, dialog);
    return;
  }

  if (KEYS.confirm.includes(e.key)) {
    // Space is also run. A tap (first keydown, not already moving) still
    // confirms. Repeats and Space held with a direction do not open tellers.
    if (e.key === ' ' && (e.repeat || directionHeld())) {
      e.preventDefault();
      return;
    }
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

function syncVirtualPad() {
  // Choice lists (title, setup, tellers, confirms, prompts, changelog) use arrows.
  // A single OK text box does not, so the walk joystick stays up.
  const choiceDialog =
    dialog.active &&
    (dialog.mode === 'menu' ||
      dialog.mode === 'confirm' ||
      dialog.mode === 'prompt' ||
      dialog.mode === 'form' ||
      dialog.mode === 'multi' ||
      dialog.mode === 'palette' ||
      (dialog.options && dialog.options.length > 1));
  const endingMenu = mode === 'ending' && ending.phase === 2;
  const discrete = !!(pause.open || choiceDialog || endingMenu);
  const walking =
    !discrete &&
    !dialog.active &&
    !pause.open &&
    !interacting &&
    (mode === 'room' || (mode === 'hallway' && hallway.ready));
  virtualPad.setLayout({ discrete, showRun: walking });
}

function updateScene() {
  if (mode === 'title') title.update();
  else if (mode === 'room' && game && !pause.open) room.update(game, dialog);
  else if (mode === 'hallway' && game && !pause.open) hallway.update(game, dialog);
  else if (mode === 'ending') ending.update();
}

function loop(now) {
  const frame = frameClock.advance(now);
  for (let i = 0; i < frame.steps; i++) updateScene();
  // Do not repaint duplicate frames on 120/144/240 Hz screens.
  if (!frame.render) { requestAnimationFrame(loop); return; }
  syncVirtualPad();
  syncMoneyContext();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0810';
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);
  ctx.imageSmoothingEnabled = false;

  if (mode === 'title') {
    title.draw(ctx);
  } else if (mode === 'setup') {
    setup.draw(ctx);
  } else if (mode === 'room' && game) {
    room.render(ctx, game);
  } else if (mode === 'hallway' && game) {
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
    ending.render(ctx);
  }

  if (pause.open && game) pause.draw(ctx, game);
  dialog.draw(ctx);

  const saveStatus = getSaveStatus();
  if (saveStatus.state === 'error') {
    ctx.save();
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#381a20';
    ctx.fillRect(12, FRAME_H - 44, 1180, 32);
    ctx.fillStyle = '#ffd0b0';
    ctx.fillText('Save unavailable — export a backup in Settings / Manage Saves', 24, FRAME_H - 36);
    ctx.restore();
  }

  // Build version — bottom-right, always visible for cache checks
  ctx.save();
  ctx.font = '14px "Press Start 2P", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(240, 232, 200, 0.45)';
  ctx.fillText('v' + GAME_VERSION, FRAME_W - 16, FRAME_H - 12);
  ctx.restore();

  // Always call — draws toast on toggle OFF as well as the DEBUG ON panel
  drawDebugOverlay(ctx, FRAME_W, FRAME_H);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
initializeSaves().then(() => startTitle()).catch((err) => {
  console.error(err);
  debugLog('error', { where: 'boot', message: String(err && err.message || err) });
  ctx.fillStyle = '#c04040';
  ctx.font = '8px monospace';
  ctx.fillText('Boot error — see console', 20, 40);
});
