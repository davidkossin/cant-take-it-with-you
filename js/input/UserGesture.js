/**
 * File pickers (input.click(), showSaveFilePicker) need transient user
 * activation. A touch pointerdown is not an activation-triggering event
 * (only its pointerup / touchend is), and the on-screen A button and canvas
 * taps act on pointerdown. While a touch is held, run the picker from the
 * release instead, the same rule MobileTextInput uses for the keyboard.
 * Keyboard Enter and mouse clicks already carry activation and run at once.
 */
let touchDown = false;
let installed = false;
const waiting = new Set();

function release(event) {
  // Browsers with touch events also send touchend; use it (iOS gesture path).
  if (event.type === 'pointerup' && event.pointerType === 'touch' && 'ontouchend' in window) return;
  touchDown = false;
  const callbacks = [...waiting];
  waiting.clear();
  for (const callback of callbacks) callback.run();
}
function cancel() {
  touchDown = false;
  const callbacks = [...waiting];
  waiting.clear();
  for (const callback of callbacks) callback.cancel();
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const capture = { capture: true, passive: true };
  window.addEventListener('pointerdown', (e) => { if (e.pointerType && e.pointerType !== 'mouse') touchDown = true; }, capture);
  window.addEventListener('touchstart', () => { touchDown = true; }, capture);
  window.addEventListener('pointerup', release, capture);
  window.addEventListener('touchend', release, capture);
  window.addEventListener('touchcancel', cancel, capture);
  window.addEventListener('pointercancel', (e) => { if (!('ontouchend' in window)) cancel(e); }, capture);
}
install();

/**
 * Run `fn` inside a user gesture. Resolves with its result, or with
 * `undefined` if the touch is cancelled or never released.
 */
export function withUserGesture(fn, { timeoutMs = 4000 } = {}) {
  install();
  // Call synchronously so the activation of the current key/click is used.
  if (!touchDown) { try { return Promise.resolve(fn()); } catch (error) { return Promise.reject(error); } }
  return new Promise((resolve, reject) => {
    const entry = {
      run: () => { clearTimeout(timer); try { resolve(fn()); } catch (error) { reject(error); } },
      cancel: () => { clearTimeout(timer); resolve(undefined); },
    };
    const timer = setTimeout(() => { waiting.delete(entry); touchDown = false; resolve(undefined); }, timeoutMs);
    waiting.add(entry);
  });
}
