import { PALETTE, FRAME_W, FRAME_H, TILE, WORLD_SCALE } from '../config.js';
import { autoSave, deleteSave, flushSaves, getSaveStatus, hasSaves, listSaves, loadSave, loadStoredRecord } from '../state/SaveSystem.js';
import { exportPlan, pickSaveFile, saveFileName, saveTextToDisk } from '../state/PlanExport.js';
import {
  loadFromFile,
  loadedFileMessage,
  profileMergeMessage,
  savedFileMessage,
  saveProfilesToFile,
} from '../state/SaveFile.js';
import {
  deleteProfile,
  exportProfileEntries,
  hasProfiles,
  importProfiles,
  listProfiles,
  loadProfile,
  profileIdentification,
  saveProfile,
} from '../state/ProfileSystem.js';
import { createStandardPortfolioSetup, createGameFromSetup } from '../state/GameState.js';
import {
  CHANGELOG_MENU_PAGE,
  loadChangelog,
  paginateChangelogText,
} from '../state/Changelog.js';
import { SetupScene } from './SetupScene.js';
import { makeTile } from '../render/Assets.js';

const MAX_VISIBLE_SAVES = 10;
const MAX_VISIBLE_PROFILES = 10;

function saveIdentification(save) {
  return `${save.label} — ${save.playerName} (age ${save.age})`;
}

export class TitleScene {
  constructor(game) {
    this.game = game;
    this.blink = 0;
    this.setupScene = new SetupScene();
  }

  async enter() {
    // idle until menu choice via dialog from main
  }

  async runMenu(dialog) {
    while (true) {
      // Rebuild the title menu after save/profile management so dependent
      // entries disappear immediately when the final entry is deleted.
      const opts = [{ label: 'New Game', value: 'new' }];
      if (hasProfiles()) {
        opts.push({ label: 'Use Profile', value: 'useProfile' });
      }
      opts.push({ label: 'Create a Profile', value: 'createProfile' });
      if (hasSaves()) {
        opts.push({ label: 'Load Game', value: 'load' });
      }
      opts.push({ label: 'Load from File', value: 'loadFile' });
      opts.push({ label: 'Manage Saves / Import Plan', value: 'manage' });
      if (hasProfiles()) {
        opts.push({ label: 'Manage Profiles', value: 'manageProfiles' });
      }
      opts.push({ label: 'How to Play', value: 'help' });
      opts.push({ label: 'Changelog', value: 'changelog' });
      const choice = await dialog.menu(
        'A life of choices.\nYou can\'t take it with you.',
        opts,
        { title: "You Can't Take It With You" }
      );

      if (choice === 'new') {
        const start = await this.chooseNewGame(dialog);
        if (!start) continue;
        return start;
      }
      if (choice === 'createProfile') {
        await this.createProfile(dialog);
        continue;
      }
      if (choice === 'useProfile') {
        const start = await this.useProfile(dialog);
        if (!start) continue;
        return start;
      }
      if (choice === 'manageProfiles') {
        await this.manageProfiles(dialog);
        continue;
      }
      if (choice === 'help') {
        await dialog.show(
          'WASD / Arrows move. Hold Space to run. Enter interacts. Esc opens Map/Charts (jump timelines). Walk the Hallway of Time — doors start the year after you leave. Wall windows change your portfolio. Auto-saves use this browser’s storage. Pause → Settings → Save to File keeps a copy of your game and character profiles on your device; Load from File restores it.',
          { title: 'How to Play' }
        );
        continue;
      }
      if (choice === 'changelog') {
        await this.showChangelog(dialog);
        continue;
      }
      if (choice === 'loadFile') {
        const start = await this.loadGameFromFile(dialog);
        if (!start) continue;
        return start;
      }
      if (choice === 'manage') {
        await this.manageSaves(dialog);
        continue;
      }
      if (choice === 'load') {
        const saves = listSaves();
        if (!saves.length) {
          await dialog.show('No saves found.', { title: 'Load Game' });
          continue;
        }
        const pick = await this.chooseEntry(dialog, saves, 'Load Game', saveIdentification, MAX_VISIBLE_SAVES);
        if (!pick) continue;
        const loaded = loadSave(pick);
        if (!loaded) {
          await dialog.show('Save missing.', { title: 'Load Game' });
          continue;
        }
        return { action: 'load', game: loaded };
      }
    }
  }

  /**
   * New Game submenu: Standard portfolio (skip setup) vs Custom setup.
   * @returns {Promise<{action:'new', mode:'standard'|'custom', game?:object}|null>}
   */
  async chooseNewGame(dialog) {
    const mode = await dialog.menu(
      'How do you want to begin?',
      [
        { label: 'Standard portfolio', value: 'standard', subtext: 'Typical US household — skip setup' },
        { label: 'Custom setup', value: 'custom', subtext: 'Full questionnaire' },
        { label: 'Cancel', value: null },
      ],
      { title: 'New Game' }
    );
    if (!mode) return null;

    if (mode === 'custom') {
      return { action: 'new', mode: 'custom' };
    }

    // Standard path: brief confirm, then ready-to-play Decision Room state
    const confirmed = await dialog.menu(
      'Starman — age 30, married, no kids.\n' +
        'Salary $80k · spend $48k/yr.\n' +
        'Home $380k ($270k @ 6.5%, 27yr).\n' +
        'Cash $155k · savings $35k ·\nstocks $85k · 401(k) $62k.\n' +
        'ZIP 85001 · Standard difficulty.\n' +
        'Glass wall ~15 years if unchanged.',
      [
        { label: 'Begin', value: true },
        { label: 'Back', value: false },
      ],
      { title: 'Standard portfolio' }
    );
    if (!confirmed) return null;

    const game = createGameFromSetup(createStandardPortfolioSetup());
    await dialog.show(
      `Welcome, ${game.portfolio.playerName}. Year ${game.portfolio.year}, age ${game.portfolio.age}. Your Decision Room awaits.`,
      { title: 'Begin' }
    );
    return { action: 'new', mode: 'standard', game };
  }

  /**
   * Run the setup questionnaire and persist answers as a reusable profile.
   * Returns to the title menu (does not start a game).
   */
  async createProfile(dialog) {
    this._setupActive = true;
    try {
      const setupAnswers = await this.setupScene.run(dialog, { mode: 'profile' });
      if (!setupAnswers) return;
      const entry = saveProfile(setupAnswers);
      if (!entry) {
        await dialog.show(getSaveStatus().message, { title: 'Profile could not be saved' });
        return;
      }
      const saved = await flushSaves();
      await dialog.show(
        `${saved.state === 'saved' ? 'Profile saved.' : 'Profile available in this session.'}\n${profileIdentification(entry)}${saved.state === 'error' ? '\n' + saved.message : ''}`,
        { title: 'Create a Profile' }
      );
    } finally {
      this._setupActive = false;
    }
  }

  /**
   * Title Load from File: import a save file (profiles merge into this
   * browser, the game is stored as a checkpoint) and start that game.
   * @returns {Promise<{action:'load', game:object}|null>}
   */
  async loadGameFromFile(dialog) {
    let loaded;
    try {
      loaded = await loadFromFile();
    } catch (error) {
      await dialog.show(error.message || 'This save file could not be loaded.', { title: 'Load from File' });
      return null;
    }
    if (!loaded) return null;
    await dialog.show(loadedFileMessage(loaded), { title: 'Load from File' });
    return loaded.game ? { action: 'load', game: loaded.game } : null;
  }

  /**
   * Pick a saved profile and start a new game from it.
   * @returns {Promise<{action:'new', mode:'profile', game:object}|null>}
   */
  async useProfile(dialog) {
    const profiles = listProfiles();
    if (!profiles.length) {
      await dialog.show('No profiles found.', { title: 'Use Profile' });
      return null;
    }
    const pick = await this.chooseEntry(dialog, profiles, 'Use Profile', profileIdentification, MAX_VISIBLE_PROFILES);
    if (!pick) return null;
    const setup = loadProfile(pick);
    if (!setup) {
      await dialog.show('Profile missing.', { title: 'Use Profile' });
      return null;
    }
    const game = createGameFromSetup(setup);
    await dialog.show(
      `Welcome, ${game.portfolio.playerName}. Year ${game.portfolio.year}, age ${game.portfolio.age}. Your Decision Room awaits.`,
      { title: 'Begin' }
    );
    return { action: 'new', mode: 'profile', game };
  }


  /**
   * Title Changelog: fetch CHANGELOG.md, pick a version, page through notes.
   */
  async showChangelog(dialog) {
    let entries;
    try {
      entries = await loadChangelog();
    } catch (err) {
      await dialog.show(
        'Could not load the changelog. Check your connection and try again.',
        { title: 'Changelog' }
      );
      return;
    }

    let offset = 0;
    while (true) {
      const slice = entries.slice(offset, offset + CHANGELOG_MENU_PAGE);
      const opts = slice.map((e) => ({ label: e.label, value: e.id }));
      if (offset > 0) {
        opts.push({ label: '← Newer', value: '__newer' });
      }
      if (offset + CHANGELOG_MENU_PAGE < entries.length) {
        opts.push({ label: 'Older →', value: '__older' });
      }
      opts.push({ label: 'Back', value: null });

      const pick = await dialog.menu(
        'Release notes (newest first):',
        opts,
        { title: 'Changelog' }
      );
      if (pick == null) return;
      if (pick === '__newer') {
        offset = Math.max(0, offset - CHANGELOG_MENU_PAGE);
        continue;
      }
      if (pick === '__older') {
        offset = Math.min(
          Math.max(0, entries.length - CHANGELOG_MENU_PAGE),
          offset + CHANGELOG_MENU_PAGE
        );
        continue;
      }

      const entry = entries.find((e) => e.id === pick);
      if (!entry) continue;
      await this.showChangelogEntry(dialog, entry);
    }
  }

  /**
   * Page through one version section with Next / Previous / Back.
   */
  async showChangelogEntry(dialog, entry) {
    const pages = paginateChangelogText(entry.body);
    let page = 0;
    while (true) {
      const opts = [];
      if (page < pages.length - 1) opts.push({ label: 'Next', value: 'next' });
      if (page > 0) opts.push({ label: 'Previous', value: 'prev' });
      opts.push({ label: 'Back', value: 'back' });

      const title =
        pages.length > 1
          ? `${entry.title} (${page + 1}/${pages.length})`
          : entry.title;
      const nav = await dialog.menu(pages[page], opts, { title });
      if (nav === 'next') {
        page = Math.min(pages.length - 1, page + 1);
        continue;
      }
      if (nav === 'prev') {
        page = Math.max(0, page - 1);
        continue;
      }
      return;
    }
  }

  async manageProfiles(dialog) {
    while (true) {
      const profiles = listProfiles();
      if (!profiles.length) {
        await dialog.show('No profiles found.', { title: 'Manage Profiles' });
        return;
      }

      const pick = await this.chooseEntry(dialog, profiles, 'Manage Profiles', profileIdentification, MAX_VISIBLE_PROFILES);
      if (!pick) return;

      const profile = profiles.find((p) => p.id === pick);
      if (!profile) continue;

      const confirmed = await dialog.menu(
        `Delete ${profileIdentification(profile)}?`,
        [
          { label: 'Delete Profile', value: true },
          { label: 'Cancel', value: false },
        ],
        // Cancellation is the safe default for this destructive action.
        { title: 'Manage Profiles', selected: 1 }
      );
      if (!confirmed) continue;

      deleteProfile(profile.id);
      const saved = await flushSaves();
      await dialog.show(saved.state === 'saved' ? 'Profile deleted.' : saved.message, { title: 'Manage Profiles' });
      if (!hasProfiles()) {
        await dialog.show('No profiles found.', { title: 'Manage Profiles' });
        return;
      }
    }
  }

  async manageSaves(dialog) {
    let offset = 0;
    while (true) {
      const saves = listSaves();
      offset = Math.min(offset, Math.max(0, Math.floor((saves.length - 1) / MAX_VISIBLE_SAVES) * MAX_VISIBLE_SAVES));
      const options = saves.slice(offset, offset + MAX_VISIBLE_SAVES).map(save => ({ label: saveIdentification(save), value: save.id }));
      if (offset) options.push({ label: 'Previous saves', value: '__previous' });
      if (offset + MAX_VISIBLE_SAVES < saves.length) options.push({ label: 'More saves', value: '__next' });
      options.push(
        { label: 'Save Profiles to File', value: '__saveProfiles' },
        { label: 'Import plan JSON', value: '__import' },
        { label: 'Back', value: null },
      );
      const status = getSaveStatus();
      const pick = await dialog.menu(
        `${saves.length ? 'Choose a checkpoint to save to a file or delete.' : 'No saves yet. Import a save file.'}\n${status.message}`,
        options,
        { title: 'Manage Saves' }
      );
      if (!pick) return;
      if (pick === '__previous') { offset = Math.max(0, offset - MAX_VISIBLE_SAVES); continue; }
      if (pick === '__next') { offset += MAX_VISIBLE_SAVES; continue; }
      if (pick === '__saveProfiles') {
        try {
          const result = await saveProfilesToFile();
          if (result.status === 'saved') await dialog.show(`${savedFileMessage(result)}\n${result.detail}`, { title: 'Save Profiles to File' });
        } catch (error) { await dialog.show(error.message || 'The file could not be saved.', { title: 'Save Profiles to File' }); }
        continue;
      }
      if (pick === '__import') {
        try {
          // Accepts plan files (with or without profiles) and profiles-only files.
          const imported = await pickSaveFile();
          if (!imported) continue;
          const merged = imported.profiles.length ? profileMergeMessage(importProfiles(imported.profiles)) : '';
          const entry = imported.game ? autoSave(imported.game, 'import') : null;
          const saved = await flushSaves();
          const head = imported.game ? (entry ? 'Plan imported. Choose Load Game to continue.' : 'Import could not be saved.') : 'Character profiles imported.';
          await dialog.show(`${head}${merged ? '\n' + merged : ''}\n${saved.state === 'saved' ? 'Saved on this browser.' : saved.message}${imported.warnings.length ? '\n' + imported.warnings.join('\n') : ''}`, { title: 'Import Plan' });
          offset = 0;
        } catch (error) { await dialog.show(error.message || 'This plan file could not be imported.', { title: 'Import Plan' }); }
        continue;
      }
      const save = saves.find((s) => s.id === pick);
      if (!save) continue;
      const action = await dialog.menu(saveIdentification(save), [
        { label: 'Save checkpoint to File', value: 'export' },
        { label: 'Delete checkpoint', value: 'delete' },
        { label: 'Back', value: null },
      ], { title: 'Manage Saves' });
      if (action === 'export') {
        try {
          const game = loadStoredRecord('save', save.id);
          if (!game) throw new Error('This checkpoint could not be read.');
          // Same save-file format as Pause → Settings → Save to File.
          const text = JSON.stringify(exportPlan(game, { profiles: exportProfileEntries() }), null, 2);
          const result = await saveTextToDisk(text, saveFileName(game));
          if (result.status === 'saved') await dialog.show(`${savedFileMessage(result)}\nIt holds this checkpoint (inputs, all saved timelines, assumptions and settings) and your character profiles.`, { title: 'Save to File' });
        } catch (error) { await dialog.show(error.message || 'The file could not be saved.', { title: 'Save to File' }); }
        continue;
      }
      if (action !== 'delete') continue;
      const confirmed = await dialog.menu(
        `Delete ${saveIdentification(save)}?`,
        [
          { label: 'Delete Save', value: true },
          { label: 'Cancel', value: false },
        ],
        // Cancellation is the safe default for this destructive action.
        { title: 'Manage Saves', selected: 1 }
      );
      if (!confirmed) continue;
      deleteSave(save.id);
      const saved = await flushSaves();
      await dialog.show(saved.state === 'saved' ? 'Checkpoint deleted.' : saved.message, { title: 'Manage Saves' });
    }
  }

  async chooseEntry(dialog, entries, title, identify, pageSize) {
    let offset = 0;
    while (true) {
      const options = entries.slice(offset, offset + pageSize).map(entry => ({ label: identify(entry), value: entry.id }));
      if (offset) options.push({ label: 'Previous', value: '__previous' });
      if (offset + pageSize < entries.length) options.push({ label: 'More', value: '__next' });
      options.push({ label: 'Cancel', value: null });
      const pick = await dialog.menu('Choose an entry:', options, { title });
      if (pick === '__previous') { offset = Math.max(0, offset - pageSize); continue; }
      if (pick === '__next') { offset += pageSize; continue; }
      return pick;
    }
  }

  update() {
    this.blink += 1;
  }

  draw(ctx) {
    if (this._setupActive) {
      this.setupScene.draw(ctx);
      return;
    }
    // dithered title backdrop (full canvas incl. HUD band)
    const floor = makeTile('floor');
    const step = TILE * WORLD_SCALE;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < FRAME_H; y += step) {
      for (let x = 0; x < FRAME_W; x += step) {
        ctx.drawImage(floor, x, y, step, step);
      }
    }
    ctx.fillStyle = 'rgba(10,8,16,0.55)';
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '64px "Press Start 2P", monospace';
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText("YOU CAN'T TAKE", FRAME_W / 2, 340);
    ctx.fillText('IT WITH YOU', FRAME_W / 2, 430);

    ctx.font = '22px "Press Start 2P", monospace';
    ctx.fillStyle = PALETTE.uiText;
    ctx.fillText('An existential interactive', FRAME_W / 2, 560);
    ctx.fillText('financial planner', FRAME_W / 2, 600);

    if (Math.floor(this.blink / 30) % 2 === 0) {
      ctx.fillStyle = PALETTE.accent;
      ctx.font = '28px "Press Start 2P", monospace';
      ctx.fillText('Press Enter', FRAME_W / 2, 720);
    }
    ctx.textAlign = 'left';
  }
}
