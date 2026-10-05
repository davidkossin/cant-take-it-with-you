import { migrateGame } from '../finance/Schema.js';
/**
 * localStorage save / load.
 * Slots labeled "Begin of <year>" / "End of <year>".
 */

import { SAVE_KEY } from '../config.js';
import { cloneState } from '../finance/Engine.js';

function readAll() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(list));
}

/**
 * @param {object} game
 * @param {'begin'|'end'} kind
 */
export function autoSave(game, kind = 'begin') {
  const year = game.portfolio.year;
  const label = kind === 'end' ? `End of ${year}` : `Begin of ${year}`;
  const entry = {
    id: `${kind}-${year}-${Date.now()}`,
    label,
    kind,
    year,
    age: game.portfolio.age,
    playerName: game.portfolio.playerName,
    savedAt: new Date().toISOString(),
    game: cloneState(game),
  };

  const list = readAll().filter(
    (s) => !(s.kind === kind && s.year === year && s.playerName === entry.playerName)
  );
  list.unshift(entry);
  // keep last 40
  writeAll(list.slice(0, 40));
  return entry;
}

export function listSaves() {
  return readAll().sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
}

export function loadSave(id) {
  const found = readAll().find((s) => s.id === id);
  if (!found) return null;
  return migrateGame(found.game);
}

export function deleteSave(id) {
  writeAll(readAll().filter((s) => s.id !== id));
}

export function hasSaves() {
  return readAll().length > 0;
}
