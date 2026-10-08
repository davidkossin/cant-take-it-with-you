import { normalizePortfolio } from '../finance/Schema.js';
import { listStoredRecords, loadStoredRecord, storeRecord, deleteStoredRecord } from './SaveSystem.js';

/** Reusable setup answers share durable browser storage with game saves. */
export function profileIdentification(profile) {
  if (profile.label) return profile.label;
  return `${profile.playerName || 'Traveler'} (age ${profile.age ?? '?'}, year ${profile.year ?? '?'})`;
}
export function saveProfile(setup) {
  const plain = JSON.parse(JSON.stringify(setup));
  for (const key of Object.keys(plain)) if (key.startsWith('_')) delete plain[key];
  const entry = {
    id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playerName: plain.playerName || 'Traveler', age: plain.age, year: plain.year,
    label: profileIdentification(plain), createdAt: new Date().toISOString(),
  };
  return storeRecord('profile', entry, plain);
}
export function listProfiles() {
  return listStoredRecords('profile').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
export function loadProfile(id) {
  const setup = loadStoredRecord('profile', id);
  return setup ? normalizePortfolio(setup) : null;
}
export function deleteProfile(id) { deleteStoredRecord('profile', id); }
export function hasProfiles() { return listStoredRecords('profile').length > 0; }

/** Stable text for comparing setup answers regardless of key order. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
function plainSetup(setup) {
  const plain = JSON.parse(JSON.stringify(setup));
  for (const key of Object.keys(plain)) if (key.startsWith('_')) delete plain[key];
  return plain;
}

/** Every stored profile with its verbatim setup answers, for a save file. */
export function exportProfileEntries() {
  const entries = [];
  for (const meta of listProfiles()) {
    const setup = loadStoredRecord('profile', meta.id);
    if (!setup) continue;
    entries.push({ id: meta.id, label: meta.label ?? null, playerName: meta.playerName ?? null, age: meta.age ?? null,
      year: meta.year ?? null, createdAt: meta.createdAt ?? null, setup: plainSetup(setup) });
  }
  return entries;
}

/**
 * Merge validated profiles (PlanExport.validateProfiles) into browser storage.
 * Same id and same answers: skipped. Same answers already stored under another
 * id: skipped. Same id with different answers: both kept; the imported one gets
 * a new id and, if its name would read the same, an "(imported)" suffix.
 * Nothing is ever overwritten.
 * @returns {{added:number, renamed:number, skipped:number, failed:number}}
 */
export function importProfiles(list) {
  const result = { added: 0, renamed: 0, skipped: 0, failed: 0 };
  const existing = new Map();
  const contents = new Set();
  const labels = new Set();
  for (const meta of listProfiles()) {
    const setup = loadStoredRecord('profile', meta.id);
    const text = setup ? canonical(plainSetup(setup)) : null;
    existing.set(meta.id, text);
    if (text) contents.add(text);
    labels.add(profileIdentification(meta));
  }
  for (const entry of list || []) {
    const setup = plainSetup(entry.setup);
    const text = canonical(setup);
    if (contents.has(text)) { result.skipped++; continue; }
    let id = entry.id || null;
    let label = entry.label || profileIdentification(setup);
    const conflict = !id || existing.has(id);
    if (conflict) {
      do id = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; while (existing.has(id));
      if (labels.has(label)) {
        const base = `${label} (imported)`;
        label = base;
        for (let n = 2; labels.has(label); n++) label = `${base} ${n}`;
      }
    }
    const stored = storeRecord('profile', {
      id, playerName: entry.playerName || setup.playerName || 'Traveler', age: entry.age ?? setup.age,
      year: entry.year ?? setup.year, label, createdAt: entry.createdAt || new Date().toISOString(),
    }, setup);
    if (!stored) { result.failed++; continue; }
    existing.set(id, text); contents.add(text); labels.add(label);
    result.added++;
    if (conflict && entry.id) result.renamed++;
  }
  return result;
}
