import { normalizePortfolio } from '../finance/Schema.js';
/**
 * localStorage player profiles (reusable setup answers).
 * Separate from game saves under SAVE_KEY.
 */

import { PROFILE_KEY } from '../config.js';

const MAX_PROFILES = 20;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function readAll() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(list));
}

/**
 * Display label: "Name (age N, year Y)".
 * @param {{ playerName?: string, age?: number, year?: number, label?: string }} p
 */
export function profileIdentification(p) {
  if (p.label) return p.label;
  return `${p.playerName || 'Traveler'} (age ${p.age ?? '?'}, year ${p.year ?? '?'})`;
}

/**
 * Persist a scrubbed setup as a reusable profile.
 * @param {object} setup
 */
export function saveProfile(setup) {
  const plain = clone(setup);
  // Drop any leftover temp fields just in case
  for (const k of Object.keys(plain)) {
    if (k.startsWith('_')) delete plain[k];
  }
  const entry = {
    id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playerName: plain.playerName || 'Traveler',
    age: plain.age,
    year: plain.year,
    label: profileIdentification(plain),
    createdAt: new Date().toISOString(),
    setup: plain,
  };
  const list = readAll();
  list.unshift(entry);
  writeAll(list.slice(0, MAX_PROFILES));
  return entry;
}

export function listProfiles() {
  return readAll().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * @param {string} id
 * @returns {object|null} cloned setup object
 */
export function loadProfile(id) {
  const found = readAll().find((p) => p.id === id);
  if (!found || !found.setup) return null;
  return normalizePortfolio(found.setup);
}

export function deleteProfile(id) {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function hasProfiles() {
  return readAll().length > 0;
}
