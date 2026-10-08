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
