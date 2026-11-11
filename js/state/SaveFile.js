import { autoSave, flushSaves, loadSave } from './SaveSystem.js';
import {
  exportPlan, exportProfiles, importSaveFile, pickSaveFile, profilesFileName, saveFileName, saveTextToDisk,
} from './PlanExport.js';
import { exportProfileEntries, importProfiles } from './ProfileSystem.js';
import { decryptSave } from './SaveLock.js';

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
 * Merge an already-parsed save into this browser (profiles + imported checkpoint).
 * @param {{game:object|null, profiles:object[], warnings?:string[]}} imported
 */
export async function applyImportedSave(imported) {
  const profiles = imported.profiles.length ? importProfiles(imported.profiles) : null;
  const entry = imported.game ? autoSave(imported.game, 'import') : null;
  const status = await flushSaves();
  // Play the stored copy when it is available, else the validated import.
  const game = imported.game ? (entry && loadSave(entry.id)) || imported.game : null;
  return { game, entry, profiles, warnings: imported.warnings || [], status };
}

const LOCKED_PROMPT = 'This save is locked. Enter passphrase.';
const WRONG_PASSPHRASE = 'That passphrase did not work. Try again, or choose Back to cancel.';

/**
 * Prompt for a passphrase until the file unlocks, or the player cancels.
 * @returns {Promise<object|null>} parsed save from importSaveFile, or null on cancel
 */
export async function promptToUnlockSave(dialog, text) {
  while (true) {
    const value = await dialog.prompt(LOCKED_PROMPT, { title: 'Load from File', type: 'text' });
    if (value == null) return null;
    try {
      const plain = await decryptSave(text, value);
      return importSaveFile(plain);
    } catch (error) {
      if (error && error.code === 'BAD_PASSPHRASE') {
        await dialog.show(WRONG_PASSPHRASE, { title: 'Load from File' });
        continue;
      }
      throw error;
    }
  }
}

/**
 * Choose a save file and import it: profiles merge into browser storage (never
 * overwriting) and the game is stored as an "Imported" checkpoint, the same
 * path Manage Saves → Import uses. Resolves null if the picker is cancelled.
 *
 * If the file is locked and `dialog` is passed, a passphrase prompt is shown
 * here. Without a dialog, a locked file is returned as `{ locked: true, text }`
 * so the caller can prompt after closing another menu.
 * @returns {Promise<null|{game:object|null, entry:object|null, profiles:object|null,
 *   warnings:string[], status:object}|{locked:true, text:string}>}
 */
export async function loadFromFile(dialog) {
  const imported = await pickSaveFile();
  if (!imported) return null;
  if (imported.locked) {
    if (!dialog) return imported;
    const unlocked = await promptToUnlockSave(dialog, imported.text);
    if (!unlocked) return null;
    return applyImportedSave(unlocked);
  }
  return applyImportedSave(imported);
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
