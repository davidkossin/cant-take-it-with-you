import { PALETTE, FRAME_W, FRAME_H, TILE, WORLD_SCALE } from '../config.js';
import { deleteSave, hasSaves, listSaves, loadSave } from '../state/SaveSystem.js';
import {
  deleteProfile,
  hasProfiles,
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
        opts.push({ label: 'Manage Saves', value: 'manage' });
      }
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
          'WASD / Arrows move. Enter / Z / E talk. Esc opens Map/Charts (jump timelines). Walk the Hallway of Time — doors start the year after you leave. Wall windows change your portfolio. Auto-saves in localStorage.',
          { title: 'How to Play' }
        );
        continue;
      }
      if (choice === 'changelog') {
        await this.showChangelog(dialog);
        continue;
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
        const pick = await dialog.menu(
          'Choose a save:',
          [
            ...saves.slice(0, MAX_VISIBLE_SAVES).map((s) => ({
              label: saveIdentification(s),
              value: s.id,
            })),
            { label: 'Cancel', value: null },
          ],
          { title: 'Load Game' }
        );
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
        'Cash $15k · savings $35k ·\nstocks $85k · 401(k) $62k.\n' +
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
      await dialog.show(
        `Profile created.\n${profileIdentification(entry)}`,
        { title: 'Create a Profile' }
      );
    } finally {
      this._setupActive = false;
    }
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
    const pick = await dialog.menu(
      'Choose a profile:',
      [
        ...profiles.slice(0, MAX_VISIBLE_PROFILES).map((p) => ({
          label: profileIdentification(p),
          value: p.id,
        })),
        { label: 'Cancel', value: null },
      ],
      { title: 'Use Profile' }
    );
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

      const pick = await dialog.menu(
        'Choose a profile to delete:',
        [
          ...profiles.slice(0, MAX_VISIBLE_PROFILES).map((p) => ({
            label: profileIdentification(p),
            value: p.id,
          })),
          { label: 'Back', value: null },
        ],
        { title: 'Manage Profiles' }
      );
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
      await dialog.show('Profile deleted.', { title: 'Manage Profiles' });
      if (!hasProfiles()) {
        await dialog.show('No profiles found.', { title: 'Manage Profiles' });
        return;
      }
    }
  }

  async manageSaves(dialog) {
    while (true) {
      // Read the list on every pass so the menu reflects deletions immediately.
      const saves = listSaves();
      if (!saves.length) {
        await dialog.show('No saves found.', { title: 'Manage Saves' });
        return;
      }

      const pick = await dialog.menu(
        'Choose a save to delete:',
        [
          ...saves.slice(0, MAX_VISIBLE_SAVES).map((s) => ({
            label: saveIdentification(s),
            value: s.id,
          })),
          { label: 'Back', value: null },
        ],
        { title: 'Manage Saves' }
      );
      if (!pick) return;

      // Resolve the selected entry from the current list before confirming;
      // this keeps the confirmation text tied to the id being deleted.
      const save = saves.find((s) => s.id === pick);
      if (!save) continue;

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
      await dialog.show('Save deleted.', { title: 'Manage Saves' });
      if (!hasSaves()) {
        await dialog.show('No saves found.', { title: 'Manage Saves' });
        return;
      }
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
