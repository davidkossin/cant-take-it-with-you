/**
 * Fetch & parse CHANGELOG.md for the in-game title Changelog viewer.
 * Source of truth is the markdown file next to index.html (GitHub Pages).
 */

import { GAME_VERSION } from '../config.js';

const FETCH_URLS = ['./CHANGELOG.md', 'CHANGELOG.md'];

/** Max wrapped lines per dialog page (keeps LTTP box under the 210px cap). */
export const CHANGELOG_PAGE_LINES = 8;

/** Versions shown per picker page (plus Older / Newer / Back). */
export const CHANGELOG_MENU_PAGE = 8;

/**
 * @returns {Promise<Array<{id:string, version:string, date:string, label:string, title:string, body:string}>>}
 */
export async function loadChangelog() {
  let lastErr = null;
  for (const url of FETCH_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const md = await res.text();
      const entries = parseChangelog(md);
      if (!entries.length) throw new Error('No version sections found');
      return entries;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not load CHANGELOG.md');
}

/**
 * Parse Keep-a-Changelog-style markdown into newest-first sections.
 * @param {string} md
 */
export function parseChangelog(md) {
  const headingRe = /^## \[([^\]]+)\](?:\s*—\s*([^\n]+))?\s*$/gm;
  const matches = [...String(md).matchAll(headingRe)];
  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const version = m[1].trim();
    const date = (m[2] || '').trim();
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : md.length;
    const rawBody = md.slice(start, end).replace(/^---\s*$/gm, '').trim();
    // The "Unreleased" heading is a maintainer-facing convention (CHANGELOG.md keeps unpublished
    // notes there until the version is formally dated); players should just see the live version
    // number they're already running, matching GAME_VERSION shown on the canvas.
    const displayVersion = version.toLowerCase() === 'unreleased' ? GAME_VERSION : version;
    const fullLabel = date ? `${displayVersion} — ${date}` : displayVersion;
    // Keep Start-2P menu labels inside the 280px dialog (≈28 chars).
    const label =
      fullLabel.length > 28 ? fullLabel.slice(0, 27) + '…' : fullLabel;
    sections.push({
      id: version,
      version: displayVersion,
      date,
      label,
      title: displayVersion,
      body: formatChangelogBody(rawBody),
    });
  }
  return sections;
}

function stripInlineMd(s) {
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/** Turn a section body into dialog-friendly plain text. */
export function formatChangelogBody(raw) {
  const out = [];
  for (const line of String(raw).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    if (/^#{1,2}\s/.test(trimmed)) continue;
    if (/^###\s+/.test(trimmed)) {
      out.push(stripInlineMd(trimmed.replace(/^###\s+/, '')) + ':');
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      out.push('• ' + stripInlineMd(trimmed.replace(/^[-*]\s+/, '')));
      continue;
    }
    out.push(stripInlineMd(trimmed));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function wrapText(text, maxChars) {
  const paragraphs = String(text).split('\n');
  const lines = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars) {
        if (cur) lines.push(cur);
        // Hard-break oversized tokens so they still paginate
        if (w.length > maxChars) {
          for (let i = 0; i < w.length; i += maxChars) {
            lines.push(w.slice(i, i + maxChars));
          }
          cur = '';
        } else {
          cur = w;
        }
      } else {
        cur = (cur + ' ' + w).trim();
      }
    }
    if (cur) lines.push(cur);
    if (!words.length) lines.push('');
  }
  return lines.length ? lines : [''];
}

/**
 * Wrap then chunk into pages that fit a dialog box.
 * @returns {string[]}
 */
export function paginateChangelogText(text, maxChars = 36, maxLines = CHANGELOG_PAGE_LINES) {
  const wrapped = wrapText(text || '(No notes.)', maxChars);
  const pages = [];
  for (let i = 0; i < wrapped.length; i += maxLines) {
    pages.push(wrapped.slice(i, i + maxLines).join('\n'));
  }
  return pages.length ? pages : ['(No notes.)'];
}
