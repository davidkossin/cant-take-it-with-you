/**
 * Title menu → "Create User Profile with AI": a DOM panel over the start menu with a short
 * description, a read-only selectable prompt box and Copy / Close buttons. The start menu
 * stays up underneath and is untouched when the panel closes.
 *
 * While open, every key is kept away from the game (the menu behind it must not react);
 * Esc / B / X close the panel, Tab moves between its controls, Enter / Space press the
 * focused button.
 */

import { AI_PROFILE_INTRO, AI_PROFILE_PROMPT } from '../data/aiProfilePrompt.js';

let openPanel = null;

/** Copy `text` using the async clipboard when available, else select + execCommand. */
export async function copyText(text, fallbackEl) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* permission denied or insecure context: use the fallback */ }
  try {
    const el = fallbackEl || document.createElement('textarea');
    if (!fallbackEl) {
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
    }
    el.focus();
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    if (!fallbackEl) el.remove();
    return !!ok;
  } catch (_) {
    return false;
  }
}

/** Show the panel. Resolves when it closes. Only one can be open. */
export function openAiProfilePanel() {
  if (openPanel) return openPanel.done;
  const root = document.createElement('div');
  root.className = 'ai-profile';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Create User Profile with AI');
  root.innerHTML =
    '<div class="ai-profile-panel">' +
    '<h2 class="ai-profile-title">Create User Profile with AI</h2>' +
    '<p class="ai-profile-intro"></p>' +
    '<textarea class="ai-profile-text" readonly spellcheck="false" aria-label="Prompt to copy"></textarea>' +
    '<div class="ai-profile-btns">' +
    '<button type="button" class="ai-profile-copy">Copy</button>' +
    '<button type="button" class="ai-profile-close">Close</button>' +
    '</div></div>';
  root.querySelector('.ai-profile-intro').textContent = AI_PROFILE_INTRO;
  const box = root.querySelector('.ai-profile-text');
  const copyBtn = root.querySelector('.ai-profile-copy');
  const closeBtn = root.querySelector('.ai-profile-close');
  box.value = AI_PROFILE_PROMPT;

  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  let copiedTimer = null;

  const close = () => {
    if (!openPanel) return;
    clearTimeout(copiedTimer);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', swallow, true);
    root.remove();
    openPanel = null;
    resolveDone();
  };
  // Keep keys away from the game; let the browser handle Tab / Enter / Space / scrolling.
  const swallow = (e) => { e.stopImmediatePropagation(); };
  const onKey = (e) => {
    e.stopImmediatePropagation();
    if (e.key === 'Escape' || e.key === 'b' || e.key === 'B' || e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      close();
    }
  };

  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(AI_PROFILE_PROMPT, box);
    copyBtn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    if (!ok) { box.focus(); box.select(); }
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1800);
  });
  closeBtn.addEventListener('click', close);
  // Taps and clicks here are not game input.
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'wheel']) {
    root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', swallow, true);
  document.body.appendChild(root);
  copyBtn.focus({ preventScroll: true });
  openPanel = { done, close };
  return done;
}

export function closeAiProfilePanel() {
  openPanel?.close();
}
