import { autoSave, flushSaves, loadSave } from './SaveSystem.js';
import {
  exportPlan, exportProfiles, pickSaveFile, profilesFileName, saveFileName, saveTextToDisk,
} from './PlanExport.js';
import { exportProfileEntries, importProfiles } from './ProfileSystem.js';

/**
 * Save to File / Load from File: one portable JSON file holding the current
 * game (the complete plan export) plus every character profile, so nothing
 * depends on this browser's storage surviving.
 */

/** "Saved to …" when the player chose the location, "Downloaded …" otherwise. */
export function savedFileMessage(result) {
  return result.method === 'picker' ? `Saved to ${result.filename}` : `Downloaded ${result.filename}`;
}

function profileCount(n) { return `${n} character profile${n === 1 ? '' : 's'}`; }

/** Build the text first (synchronously), so the picker opens inside the gesture. */
export async function saveGameToFile(game, options = {}) {
  const profiles = exportProfileEntries();
  const text = JSON.stringify(exportPlan(game, { ...options, profiles }), null, 2);
  const result = await saveTextToDisk(text, saveFileName(game));
  return { ...result, profiles: profiles.length, detail: `This game and ${profileCount(profiles.length)}.` };
}

export async function saveProfilesToFile() {
  const profiles = exportProfileEntries();
  if (!profiles.length) throw new Error('There are no character profiles to save yet. Choose Create a Profile first.');
  const text = JSON.stringify(exportProfiles(profiles), null, 2);
  const result = await saveTextToDisk(text, profilesFileName());
  return { ...result, profiles: profiles.length, detail: `${profileCount(profiles.length)}.` };
}

/** e.g. "2 character profiles added. 1 already saved here." */
export function profileMergeMessage(merge) {
  if (!merge) return '';
  const parts = [];
  parts.push(`${profileCount(merge.added)} added${merge.renamed ? ` (${merge.renamed} kept as a separate copy beside an existing profile)` : ''}.`);
  if (merge.skipped) parts.push(`${merge.skipped} already saved here.`);
  if (merge.failed) parts.push(`${merge.failed} could not be stored.`);
  return parts.join(' ');
}

/**
 * Choose a save file and import it: profiles merge into browser storage (never
 * overwriting) and the game is stored as an "Imported" checkpoint, the same
 * path Manage Saves → Import uses. Resolves null if the picker is cancelled.
 * @returns {Promise<null|{game:object|null, entry:object|null, profiles:object|null,
 *   warnings:string[], status:object}>}
 */
export async function loadFromFile() {
  const imported = await pickSaveFile();
  if (!imported) return null;
  const profiles = imported.profiles.length ? importProfiles(imported.profiles) : null;
  const entry = imported.game ? autoSave(imported.game, 'import') : null;
  const status = await flushSaves();
  // Play the stored copy when it is available, else the validated import.
  const game = imported.game ? (entry && loadSave(entry.id)) || imported.game : null;
  return { game, entry, profiles, warnings: imported.warnings || [], status };
}

/** Player-facing summary of a Load from File. */
export function loadedFileMessage(loaded) {
  const lines = [];
  if (loaded.game) {
    const p = loaded.game.portfolio;
    lines.push(`Loaded ${p.playerName || 'Traveler'} — year ${p.year}, age ${p.age}.`);
  } else lines.push('This file has no game, only character profiles.');
  if (loaded.profiles) lines.push(profileMergeMessage(loaded.profiles));
  if (loaded.game && !loaded.entry) lines.push('The game is not stored on this browser yet; use Save to File to keep it.');
  else if (loaded.status?.state === 'error') lines.push(loaded.status.message);
  return lines.concat(loaded.warnings || []).join('\n');
}
