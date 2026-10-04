/**
 * Full screen control for desktop and mobile.
 *
 * Uses the Fullscreen API (with vendor prefixes) on documentElement so the
 * browser can hide its own chrome. iOS Safari still does not implement
 * requestFullscreen on arbitrary elements; webkitEnterFullscreen only exists
 * on <video> and would replace the page with a video player, so it is not
 * used to fake a canvas. When no Fullscreen API call succeeds, the button
 * toggles a viewport-fill layout (100dvh / 100vw, page chrome hidden) instead.
 * That fallback is not operating-system fullscreen.
 */

const FS_CHANGE = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];

export function isOsFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

function requestOsFullscreen(el) {
  const fn =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.webkitRequestFullScreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen;
  if (typeof fn !== 'function') return Promise.resolve(false);
  try {
    const ret = fn.call(el, { navigationUI: 'hide' });
    if (ret && typeof ret.then === 'function') {
      return ret.then(() => true).catch(() => retryBare(el, fn));
    }
    return Promise.resolve(true);
  } catch (_) {
    return retryBare(el, fn);
  }
}

function retryBare(el, fn) {
  try {
    const ret = fn.call(el);
    if (ret && typeof ret.then === 'function') {
      return ret.then(() => true).catch(() => false);
    }
    return Promise.resolve(true);
  } catch (_) {
    return Promise.resolve(false);
  }
}

/**
 * iOS video hook. Only call it when the element actually has the method
 * (a video). Divs and the canvas do not, and we do not wrap the game in a video.
 */
function tryWebkitEnterFullscreen(el) {
  const fn = el && el.webkitEnterFullscreen;
  if (typeof fn !== 'function') return false;
  try {
    fn.call(el);
    return true;
  } catch (_) {
    return false;
  }
}

function exitOsFullscreen() {
  const fn =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.webkitCancelFullScreen ||
    document.mozCancelFullScreen ||
    document.msExitFullscreen;
  if (typeof fn !== 'function') return Promise.resolve();
  try {
    const ret = fn.call(document);
    if (ret && typeof ret.then === 'function') return ret.catch(() => {});
  } catch (_) {
    /* already exiting */
  }
  return Promise.resolve();
}

/**
 * @param {{ button: HTMLButtonElement, onChange?: () => void, allowKey?: () => boolean }} opts
 */
export function installFullscreen({ button, onChange, allowKey }) {
  let cssFill = false;

  const apply = () => {
    const on = isOsFullscreen() || cssFill;
    document.body.classList.toggle('is-max-fill', on);
    button.textContent = on ? 'Exit full screen' : 'Full screen';
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    onChange?.();
  };

  const toggle = async () => {
    if (isOsFullscreen()) {
      cssFill = false;
      await exitOsFullscreen();
      apply();
      return;
    }
    if (cssFill) {
      cssFill = false;
      apply();
      return;
    }
    const root = document.documentElement;
    const ok = await requestOsFullscreen(root);
    if (ok || isOsFullscreen()) {
      cssFill = false;
    } else {
      // documentElement has no webkitEnterFullscreen. A <video> would, and
      // that call would show the video player instead of this game.
      tryWebkitEnterFullscreen(root);
      if (!isOsFullscreen()) cssFill = true;
    }
    apply();
  };

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  for (const name of FS_CHANGE) {
    document.addEventListener(name, () => {
      if (!isOsFullscreen()) {
        // Native exit (Escape, browser gesture). Drop the CSS fill only if
        // we were not using it as the fallback — OS exit should not clear
        // a fallback that was never entered. If OS fullscreen ends, cssFill
        // is already false unless both were on. Keep cssFill as the user left it.
      }
      apply();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (allowKey && !allowKey()) return;
    e.preventDefault();
    toggle();
  });

  apply();
}
