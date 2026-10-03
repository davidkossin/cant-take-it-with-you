/**
 * Contextual LTTP-styled setup questionnaires with Back on every step.
 */

import { CURRENT_YEAR, HOME_TYPES, FRAME_W, FRAME_H, TILE, WORLD_SCALE, PALETTE } from '../config.js';
import { createDefaultSetup, createGameFromSetup } from '../state/GameState.js';
import { saveProfile } from '../state/ProfileSystem.js';
import { listDifficulties } from '../finance/Difficulty.js';
import { makeTile } from '../render/Assets.js';

const BACK = '__back__';

export class SetupScene {
  constructor() {
    this.step = 0;
  }

  draw(ctx) {
    const floor = makeTile('wood');
    const step = TILE * WORLD_SCALE;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < FRAME_H; y += step) {
      for (let x = 0; x < FRAME_W; x += step) ctx.drawImage(floor, x, y, step, step);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    ctx.font = '28px "Press Start 2P", monospace';
    ctx.fillStyle = PALETTE.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Character Setup', FRAME_W / 2, 36);
    ctx.textAlign = 'left';
  }

  /**
   * Scrub temporary questionnaire fields from a setup object.
   * @param {object} s
   */
  scrubTemps(s) {
    delete s._homeCount;
    delete s._homeIdx;
    delete s._homeType;
    delete s._homeValue;
    delete s._homeOwed;
    delete s._homeRate;
    delete s._kidCount;
    delete s._kidIdx;
    delete s._kidName;
    return s;
  }

  /**
   * Run full setup via dialog.
   * @param {object} dialog
   * @param {{ mode?: 'game'|'profile' }} [options]
   *   mode 'game' (default): welcome + createGameFromSetup
   *   mode 'profile': return scrubbed setup (or null if cancelled at start)
   * Every step supports Back to edit prior answers.
   */
  async run(dialog, options = {}) {
    const mode = options.mode === 'profile' ? 'profile' : 'game';
    const allowCancelAtStart = mode === 'profile';
    const s = createDefaultSetup();
    let step = 0;

    const withBack = (opts) => [...opts, { label: '← Back', value: BACK }];

    while (true) {
      let result;

      if (step === 0) {
        result = await dialog.prompt('What is your name?', {
          title: 'Identity',
          defaultValue: s.playerName,
        });
        if (result == null) {
          if (allowCancelAtStart) {
            const exit = await dialog.confirm(
              'Do you want to return to the main menu? Current profile will not be saved',
              { title: 'Create a Profile' }
            );
            if (exit) return null;
          }
          /* game mode: first step cancel stays */
          continue;
        }
        s.playerName = result || s.playerName;
        step++;
      } else if (step === 1) {
        result = await dialog.prompt('Starting calendar year?', {
          title: 'When',
          defaultValue: String(s.year),
          type: 'number',
        });
        if (result == null) {
          step--;
          continue;
        }
        s.year = Math.round(result);
        step++;
      } else if (step === 2) {
        result = await dialog.prompt('Your age?', {
          title: 'When',
          defaultValue: String(s.age),
          type: 'number',
        });
        if (result == null) {
          step--;
          continue;
        }
        s.age = Math.max(18, Math.min(99, Math.round(result)));
        step++;
      } else if (step === 3) {
        result = await dialog.menu(
          'Hair color?',
          withBack([
            { label: 'Dark', value: 'dark' },
            { label: 'Blonde', value: 'blonde' },
            { label: 'Red', value: 'red' },
          ]),
          { title: 'Appearance' }
        );
        if (result === BACK) {
          step--;
          continue;
        }
        s.hairColor = result;
        step++;
      } else if (step === 4) {
        result = await dialog.menu(
          'Hair length?',
          withBack([
            { label: 'Short', value: 'short' },
            { label: 'Long', value: 'long' },
          ]),
          { title: 'Appearance' }
        );
        if (result === BACK) {
          step--;
          continue;
        }
        s.hairLength = result;
        step++;
      } else if (step === 5) {
        result = await dialog.prompt('Starting Cash ($)?', {
          title: 'Finances',
          defaultValue: String(s.cash),
          type: 'money',
        });
        if (result == null) {
          step--;
          continue;
        }
        s.cash = Math.max(0, result);
        step++;
      } else if (step === 6) {
        result = await dialog.prompt('Annual household gross salary ($)?', {
          title: 'Finances',
          defaultValue: String(s.salary),
          type: 'money',
        });
        if (result == null) {
          step--;
          continue;
        }
        s.salary = Math.max(0, result);
        s.employed = s.salary > 0;
        step++;
      } else if (step === 7) {
        result = await dialog.prompt('Savings balance ($)?', {
          title: 'Finances',
          defaultValue: String(s.savings),
          type: 'money',
        });
        if (result == null) {
          step--;
          continue;
        }
        s.savings = Math.max(0, result);
        step++;
      } else if (step === 8) {
        const pctDefault = ((s.savingsRate || 0.02) * 100).toFixed(2).replace(/\.?0+$/, '');
        result = await dialog.prompt('Savings interest rate (%)?', {
          title: 'Finances',
          defaultValue: pctDefault,
          type: 'percent',
        });
        if (result == null) {
          step--;
          continue;
        }
        // Store as decimal: 3.2 → 0.032
        s.savingsRate = Math.max(0, Math.min(0.2, result / 100));
        step++;
      } else if (step === 9) {
        result = await dialog.prompt('401(k) balance ($)?', {
          title: 'Retirement',
          defaultValue: String(s.k401Balance ?? 0),
          type: 'money',
        });
        if (result == null) {
          step--;
          continue;
        }
        s.k401Balance = Math.max(0, result);
        step++;
      } else if (step === 10) {
        const pctDefault = ((s.k401ContribRate || 0.06) * 100).toFixed(2).replace(/\.?0+$/, '');
        result = await dialog.prompt('401(k) contribution (% of salary)?', {
          title: 'Retirement',
          defaultValue: pctDefault,
          type: 'percent',
        });
        if (result == null) {
          step--;
          continue;
        }
        // 0–100% of salary; annual $ cap applied in engine (K401_EMPLOYEE_LIMIT)
        s.k401ContribRate = Math.max(0, Math.min(1, result / 100));
        step++;
      } else if (step === 11) {
        // Classic “100% of first 3%”: matchRate + matchOnFirst (nested like home term)
        const matchPctDef = ((s.k401MatchRate ?? 1) * 100).toFixed(0);
        result = await dialog.prompt(
          'Employer match (% of your deferrals, 0–100)?\n(e.g. 100 = dollar-for-dollar)',
          {
            title: 'Retirement',
            defaultValue: matchPctDef,
            type: 'percent',
          }
        );
        if (result == null) {
          step--;
          continue;
        }
        s.k401MatchRate = Math.max(0, Math.min(1, result / 100));
        const onFirstDef = ((s.k401MatchOnFirst ?? 0.03) * 100).toFixed(2).replace(/\.?0+$/, '');
        const onFirst = await dialog.prompt(
          'Match applies on first (% of salary)?\n(e.g. 3 with 100% match = classic “100% of first 3%”)',
          {
            title: 'Retirement',
            defaultValue: onFirstDef,
            type: 'percent',
          }
        );
        if (onFirst == null) {
          step = 11;
          continue;
        }
        s.k401MatchOnFirst = Math.max(0, Math.min(1, onFirst / 100));
        step++;
      } else if (step === 12) {
        result = await dialog.prompt('Stock portfolio total ($)?', {
          title: 'Investments',
          defaultValue: String(s.stocksTotal),
          type: 'money',
        });
        if (result == null) {
          step--;
          continue;
        }
        s.stocksTotal = Math.max(0, result);
        s.stocksCostBasis = s.stocksTotal; // assume basis = market at setup
        step++;
      } else if (step === 13) {
        result = await dialog.menu(
          'How many homes (0–5)?',
          withBack([
            { label: '0', value: 0 },
            { label: '1', value: 1 },
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 },
            { label: '5', value: 5 },
          ]),
          { title: 'Homes' }
        );
        if (result === BACK) {
          step--;
          continue;
        }
        s._homeCount = result || 0;
        s.homes = [];
        s._homeIdx = 0;
        step = s._homeCount > 0 ? 14 : 18;
      } else if (step === 14) {
        // Home type
        const i = s._homeIdx;
        result = await dialog.menu(
          `Home ${i + 1} type?`,
          withBack([
            { label: 'Primary', value: 'primary' },
            { label: 'Secondary', value: 'secondary' },
            { label: 'Investment', value: 'investment' },
          ]),
          { title: 'Homes' }
        );
        if (result === BACK) {
          if (i === 0) {
            step = 13;
          } else {
            s._homeIdx--;
            s.homes.pop();
            step = 14;
          }
          continue;
        }
        s._homeType = result;
        step = 15;
      } else if (step === 15) {
        const i = s._homeIdx;
        result = await dialog.prompt(`Home ${i + 1} market value ($)?`, {
          title: 'Homes',
          defaultValue: '350000',
          type: 'money',
        });
        if (result == null) {
          step = 14;
          continue;
        }
        s._homeValue = Math.max(0, result);
        step = 16;
      } else if (step === 16) {
        const i = s._homeIdx;
        result = await dialog.prompt(`Home ${i + 1} mortgage owed ($)?`, {
          title: 'Homes',
          defaultValue: '280000',
          type: 'money',
        });
        if (result == null) {
          step = 15;
          continue;
        }
        s._homeOwed = Math.max(0, result);
        step = 17;
      } else if (step === 17) {
        const i = s._homeIdx;
        result = await dialog.prompt(`Home ${i + 1} mortgage rate (%)?`, {
          title: 'Homes',
          defaultValue: '6.5',
          type: 'percent',
        });
        if (result == null) {
          step = 16;
          continue;
        }
        s._homeRate = Math.max(0, result / 100);
        const term = await dialog.prompt(`Home ${i + 1} remaining term (years)?`, {
          title: 'Homes',
          defaultValue: '28',
          type: 'number',
        });
        if (term == null) {
          step = 17;
          continue;
        }
        s.homes.push({
          type: s._homeType,
          label: HOME_TYPES[s._homeType]?.label || 'Home',
          value: s._homeValue,
          mortgageOwed: s._homeOwed,
          rate: s._homeRate,
          remainingTerm: Math.max(0, Math.round(term || 30)),
          propertyTaxRate: HOME_TYPES[s._homeType]?.taxRate ?? 0.012,
        });
        s._homeIdx++;
        if (s._homeIdx < s._homeCount) step = 14;
        else step = 18;
      } else if (step === 18) {
        result = await dialog.menu(
          'Married? (household = one entity for now)',
          withBack([
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ]),
          { title: 'Family' }
        );
        if (result === BACK) {
          if (s._homeCount > 0) {
            s._homeIdx = s._homeCount - 1;
            s.homes.pop();
            step = 14;
          } else step = 13;
          continue;
        }
        s.married = !!result;
        step++;
      } else if (step === 19) {
        result = await dialog.menu(
          'How many kids (0–4)?',
          withBack([
            { label: '0', value: 0 },
            { label: '1', value: 1 },
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 },
          ]),
          { title: 'Family' }
        );
        if (result === BACK) {
          step--;
          continue;
        }
        s._kidCount = result || 0;
        s.kids = [];
        s._kidIdx = 0;
        step = s._kidCount > 0 ? 20 : 22;
      } else if (step === 20) {
        const i = s._kidIdx;
        result = await dialog.prompt(`Name of child ${i + 1}?`, {
          title: 'Family',
          defaultValue: `Child ${i + 1}`,
        });
        if (result == null) {
          if (i === 0) step = 19;
          else {
            s._kidIdx--;
            s.kids.pop();
            step = 20;
          }
          continue;
        }
        s._kidName = result || `Child ${i + 1}`;
        step = 21;
      } else if (step === 21) {
        const i = s._kidIdx;
        result = await dialog.prompt(`Age of ${s._kidName}?`, {
          title: 'Family',
          defaultValue: String(5 + i * 3),
          type: 'number',
        });
        if (result == null) {
          step = 20;
          continue;
        }
        s.kids.push({
          name: s._kidName,
          age: Math.max(0, Math.round(result || 0)),
        });
        s._kidIdx++;
        if (s._kidIdx < s._kidCount) step = 20;
        else step = 22;
      } else if (step === 22) {
        result = await dialog.prompt('Annual household spending ($)?', {
          title: 'Spending',
          defaultValue: String(s.annualSpending),
          type: 'money',
        });
        if (result == null) {
          if (s._kidCount > 0) {
            s._kidIdx = s._kidCount - 1;
            s.kids.pop();
            step = 20;
          } else step = 19;
          continue;
        }
        s.annualSpending = Math.max(0, result);
        s.spendingBreakdown = { other: s.annualSpending };
        step++;
      } else if (step === 23) {
        result = await dialog.prompt('Primary ZIP (for tax estimate)?', {
          title: 'Taxes',
          defaultValue: s.zip,
        });
        if (result == null) {
          step--;
          continue;
        }
        s.zip = String(result).replace(/\D/g, '').slice(0, 5) || '85001';
        step++;
      } else if (step === 24) {
        const diffs = listDifficulties();
        const stdIdx = Math.max(
          0,
          diffs.findIndex((d) => d.id === 'standard')
        );
        result = await dialog.menu(
          'Difficulty?',
          withBack(
            diffs.map((d) => ({
              label: d.label,
              value: d.id,
              subtext: d.subtext || '',
            }))
          ),
          { title: 'Challenge', selected: stdIdx }
        );
        if (result === BACK) {
          step--;
          continue;
        }
        s.difficulty = result || 'standard';
        step++;
      } else if (step === 25) {
        this.scrubTemps(s);
        if (mode === 'profile') {
          return s;
        }
        const saveAsProfile = await dialog.confirm(
          'Save this as a profile for later?',
          { title: 'Custom Setup' }
        );
        if (saveAsProfile) saveProfile(s);
        await dialog.show(
          `Welcome, ${s.playerName}. Year ${s.year}, age ${s.age}. Your Decision Room awaits.`,
          { title: 'Begin' }
        );
        return createGameFromSetup(s);
      }
    }
  }
}
