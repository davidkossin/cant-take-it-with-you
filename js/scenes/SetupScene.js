import { editPlanningInputs, editInflationSettings, inflationToggleLabel, setMoneyContext } from './PlanningInputs.js';
import { editSpouseIdentity, editFamilyIncome, editRetirementAges, editRetirementAccounts, householdSalary, personName } from './FamilyInputs.js';
/**
 * Contextual LTTP-styled setup questionnaires with Back on every step.
 * Name → Year → Age → Appearance (hair + shirt color) → Hair length → Difficulty → Family → Settings → ZIP → Finances →
 * Retirement → Investments → Homes → Expenses → Portfolio overview.
 */

import { CURRENT_YEAR, HOME_TYPES, FRAME_W, FRAME_H, TILE, WORLD_SCALE, PALETTE,
  HAIR_PALETTE, SHIRT_PALETTE, normalizeHairColor, normalizeShirtColor } from '../config.js';
import { createDefaultSetup, createGameFromSetup } from '../state/GameState.js';
import { saveProfile } from '../state/ProfileSystem.js';
import { listDifficulties, getDifficulty } from '../finance/Difficulty.js';
import { makeTile } from '../render/Assets.js';
import { stateFromZip, defaultPropertyTaxRate } from '../data/state-from-zip.js';
import { estimateAnnualTax } from '../finance/Tax.js';
import { annualMortgagePayment, syncStocksTotal } from '../finance/Engine.js';
import { lookupStockWithLoading } from '../finance/stockQuotes.js';
import { randomChildName, childOrdinal } from '../data/childNames.js';
import { formatMoneyDisplay } from '../render/Dialog.js';

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

  scrubTemps(s) {
    for (const k of Object.keys(s)) {
      if (k.startsWith('_')) delete s[k];
    }
    return s;
  }

  applyDifficultyDefaults(s) {
    const d = getDifficulty(s.difficulty || 'standard');
    if (s._diffDefaultsApplied !== s.difficulty) {
      s.savingsRate = d.savingsRate;
      s.rateOverrides = s.rateOverrides || {};
      // Seed rate overrides with difficulty defaults so player can override later
      s.rateOverrides.inflation = d.inflation;
      s.rateOverrides.equityReturn = d.equityReturn;
      s.rateOverrides.equityVolatility = d.equityVolatility;
      s.rateOverrides.mortgageRate = d.mortgageRate;
      s._diffDefaultsApplied = s.difficulty;
    }
  }

  async run(dialog, options = {}) {
    const mode = options.mode === 'profile' ? 'profile' : 'game';
    const allowCancelAtStart = true; // Back on name → confirm return to menu
    const s = createDefaultSetup();
    s.householdVersion = 1;
    s.salaryOwnershipConfirmed = true;
    s.salaryOwnership = 'individual';
    let step = 0;

    const withBack = (opts) => [...opts, { label: '← Back', value: BACK }];

    const lookupOnline = async (ticker) => {
      let loading = false;
      const result = await lookupStockWithLoading(ticker, {
        wantHistory: true,
        onLoading: () => {
          loading = true;
          dialog.showLoading('Loading…');
        },
        onLoadingDone: () => {
          if (loading) dialog.hideLoading();
        },
      });
      if (loading) dialog.hideLoading();
      return result;
    };

    while (true) {
      let result;
      setMoneyContext(s);

      // ── 0 Name ──────────────────────────────────────────────
      if (step === 0) {
        result = await dialog.prompt('What is your name?', {
          title: '',
          defaultValue: s.playerName,
        });
        if (result == null) {
          const exit = await dialog.confirm(
            'Are you sure? Profile will not be saved',
            { title: '', yes: 'Yes', no: 'No' }
          );
          if (exit) return null;
          continue;
        }
        s.playerName = result || s.playerName;
        step++;
      }

      // ── 1 Starting year ─────────────────────────────────────
      else if (step === 1) {
        result = await dialog.prompt('Starting year?', {
          title: '',
          defaultValue: String(s.year),
          type: 'number',
        });
        if (result == null) {
          step--;
          continue;
        }
        s.year = Math.round(result);
        s.dollarBaseYear = s.year;
        step++;
      }

      // ── 2 Age ───────────────────────────────────────────────
      else if (step === 2) {
        result = await dialog.prompt('Age?', {
          title: '',
          defaultValue: String(s.age),
          type: 'number',
        });
        if (result == null) {
          step--;
          continue;
        }
        s.age = Math.max(18, Math.min(99, Math.round(result)));
        step = 2.1;
      }

      // ── 2.1 Hair + shirt color (player sprite), one page ───
      else if (step === 2.1) {
        result = await dialog.palette('Choose your look.', [
          { key: 'hairColor', label: 'Hair color', kind: 'hair', colors: HAIR_PALETTE,
            selected: normalizeHairColor(s.hairColor) },
          { key: 'shirtColor', label: 'Shirt color', kind: 'shirt', colors: SHIRT_PALETTE,
            selected: normalizeShirtColor(s.shirtColor) },
        ], {
          title: 'Appearance',
          hairLength: s.hairLength === 'long' ? 'long' : 'short',
          backLabel: '← Back',
          backValue: BACK,
        });
        if (result === BACK || result == null) {
          step = 2;
          continue;
        }
        s.hairColor = normalizeHairColor(result.hairColor);
        s.shirtColor = normalizeShirtColor(result.shirtColor);
        step = 2.2;
      }

      // ── 2.2 Hair length (player sprite) ─────────────────────
      else if (step === 2.2) {
        result = await dialog.menu('Hair length?', withBack([
          { label: 'Short', value: 'short' },
          { label: 'Long', value: 'long' },
        ]), { title: 'Appearance', selected: s.hairLength === 'long' ? 1 : 0 });
        if (result === BACK || result == null) {
          step = 2.1;
          continue;
        }
        s.hairLength = result;
        step = 3;
      }

      // ── 3 Difficulty ────────────────────────────────────────
      else if (step === 3) {
        const diffs = listDifficulties();
        const stdIdx = Math.max(
          0,
          diffs.findIndex((d) => d.id === 'standard')
        );
        result = await dialog.menu(
          'Sets the model’s rates for inflation, interest, etc.',
          withBack(
            diffs.map((d) => ({
              label: d.label,
              value: d.id,
              subtext: d.subtext || '',
            }))
          ),
          { title: 'Difficulty', selected: stdIdx }
        );
        if (result === BACK) {
          step = 2.2;
          continue;
        }
        s.difficulty = result || 'standard';
        this.applyDifficultyDefaults(s);
        step = 26;
      }

      else if (step === 3.5) {
        result = await dialog.menu('Choose how money amounts are displayed and entered.', [
          { label: inflationToggleLabel(s), value: 'inflation' },
          { label: 'Continue', value: 'continue' },
          { label: '← Back', value: BACK },
        ], { title: 'Settings' });
        if (result === 'inflation') { await editInflationSettings(s, dialog); continue; }
        if (result === BACK) { step = 27; continue; }
        step = 4;
      }

      // ── 4 ZIP ───────────────────────────────────────────────
      else if (step === 4) {
        result = await dialog.prompt('Zip Code', {
          title: 'Zip Code',
          subtitle: 'Used to estimate taxes (leave blank to use national averages)',
          defaultValue: s.zip || '',
        });
        if (result == null) {
          step = 3.5;
          continue;
        }
        const digits = String(result).replace(/\D/g, '').slice(0, 5);
        s.zip = digits; // may be ''
        step++;
      }

      // ── 5 Starting Cash (checking) ──────────────────────────
      else if (step === 5) {
        result = await dialog.prompt(`Starting ${s.married ? 'joint ' : ''}Cash in checking account`, {
          title: 'Finances',
          defaultValue: String(s.cash),
          type: 'money',
          prefix: '$',
        });
        if (result == null) {
          step--;
          continue;
        }
        s.cash = Math.max(0, result);
        step++;
      }

      // ── 6 Savings + interest (same page) ────────────────────
      else if (step === 6) {
        const pctDefault = ((s.savingsRate || 0) * 100).toFixed(2).replace(/\.?0+$/, '') || '0';
        result = await dialog.form(
          s.married ? 'Joint Savings' : 'Savings',
          [
            {
              key: 'savings',
              label: s.married ? 'Joint Savings' : 'Savings',
              type: 'money',
              prefix: '$',
              defaultValue: String(s.savings),
            },
            {
              key: 'rate',
              label: 'Savings interest rate',
              type: 'percent',
              defaultValue: pctDefault,
            },
          ],
          { title: 'Finances' }
        );
        if (result == null) {
          step--;
          continue;
        }
        s.savings = Math.max(0, result.savings || 0);
        s.savingsRate = Math.max(0, Math.min(0.5, (result.rate || 0) / 100));
        step++;
      }

      // ── 7 Salary ────────────────────────────────────────────
      else if (step === 7) {
        if (!(await editFamilyIncome(s, dialog))) {
          step--;
          continue;
        }
        step++;
      }

      // ── 8 Retirement age ────────────────────────────────────
      else if (step === 8) {
        if (!(await editRetirementAges(s, dialog))) {
          step--;
          continue;
        }
        step++;
      }

      // Retirement accounts belong to each person, including separate balances and limits.
      else if (step === 9) {
        const draft = { ...s };
        if (!(await editRetirementAccounts(draft, dialog))) { step = 8; continue; }
        if (s.married && !(await editRetirementAccounts(draft, dialog, { owner: 'spouse' }))) { continue; }
        Object.assign(s, draft);
        step = 14;
      }

      // ── 14 Investments mode ─────────────────────────────────
      else if (step === 14) {
        result = await dialog.menu(
          'How do you want to enter household investments?',
          withBack([
            { label: 'Set Total Investments', value: 'total' },
            { label: 'Set Specific Stocks (advanced)', value: 'specific' },
          ]),
          { title: 'Investments' }
        );
        if (result === BACK) {
          step = 9;
          continue;
        }
        s.stocksMode = result;
        s.stocksHoldings = s.stocksHoldings || [];
        if (result === 'total') step = 15;
        else {
          s._stockIdx = 0;
          step = 16;
        }
      }

      // ── 15 Total portfolio ──────────────────────────────────
      else if (step === 15) {
        result = await dialog.prompt('Household Portfolio Total', {
          title: 'Investments',
          defaultValue: String(s.stocksTotal || 0),
          type: 'money',
          prefix: '$',
        });
        if (result == null) {
          step = 14;
          continue;
        }
        s.stocksTotal = Math.max(0, result);
        const basis = await dialog.prompt('Verified total investment cost basis (tax records)', {title:'Investments',type:'money',prefix:'$',defaultValue:String(s.stocksCostBasis ?? 0)});
        if (basis == null) { step = 15; continue; }
        s.stocksCostBasis = Math.max(0, basis); s.basisKnown = true;
        const acquired = await dialog.prompt('Acquired date YYYY-MM-DD (blank = unknown / provisional long-term)', {title:'Investments',defaultValue:s.acquiredDate || ''});
        if (acquired == null) { step = 15; continue; }
        s.acquiredDate = /^\d{4}-\d{2}-\d{2}$/.test(String(acquired)) ? acquired : null;
        s.stocksHoldings = [];
        step = 20;
      }

      // ── 16 Specific stock: online? ──────────────────────────
      else if (step === 16) {
        result = await dialog.menu(
          "Use Today's Real Values?",
          withBack([
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ]),
          { title: 'Investments' }
        );
        if (result === BACK) {
          if ((s._stockIdx || 0) === 0) step = 14;
          else {
            s.stocksHoldings.pop();
            s._stockIdx = Math.max(0, (s._stockIdx || 1) - 1);
            step = 19; // add another?
          }
          continue;
        }
        s._online = !!result;
        step = 17;
      }

      // ── 17 Ticker + price + shares + purchase + growth/vol ─
      else if (step === 17) {
        const d = getDifficulty(s.difficulty);
        const defGrowth = ((s.rateOverrides?.equityReturn ?? d.equityReturn) * 100)
          .toFixed(2)
          .replace(/\.?0+$/, '');
        const defVol = ((s.rateOverrides?.equityVolatility ?? d.equityVolatility) * 100)
          .toFixed(2)
          .replace(/\.?0+$/, '');

        const tickerRes = await dialog.prompt('Stock Ticker', {
          title: 'Investments',
          defaultValue: '',
        });
        if (tickerRes == null) {
          step = 16;
          continue;
        }
        const ticker = String(tickerRes || '')
          .trim()
          .toUpperCase();
        if (!ticker) {
          await dialog.show('Enter a ticker symbol.', { title: 'Investments' });
          continue;
        }

        let price = 0;
        let growthPct = parseFloat(defGrowth) || 0;
        let volPct = parseFloat(defVol) || 0;
        let onlineNote = '';

        if (s._online) {
          const look = await lookupOnline(ticker);
          if (look.ok && look.price > 0) {
            price = look.price;
            // Quotes set today's valuation. Past returns never overwrite planning assumptions.
            onlineNote = `Online (${look.source})`;
          } else {
            await dialog.show(
              look.error || 'Lookup failed. Enter price manually — growth/vol use difficulty averages.',
              { title: 'Investments' }
            );
            s._online = false;
          }
        }

        if (!s._online || !(price > 0)) {
          const priceRes = await dialog.prompt('Current stock price', {
            title: 'Investments',
            defaultValue: price > 0 ? String(price) : '',
            type: 'money',
            prefix: '$',
            subtitle: onlineNote || 'Enter per-share price',
          });
          if (priceRes == null) {
            step = 16;
            continue;
          }
          price = Math.max(0, priceRes);
        } else {
          await dialog.show(
            `${ticker} @ ${formatMoneyDisplay(price)}${onlineNote ? '\n' + onlineNote : ''}`,
            { title: 'Investments' }
          );
        }

        if (!(price > 0)) {
          await dialog.show('Price must be greater than zero.', { title: 'Investments' });
          step = 16;
          continue;
        }

        // Linked $ amount and # shares
        let dollars = 0;
        let shares = 0;
        const link = await dialog.form(
          'Shares owned (fill $ or # — the other calculates)',
          [
            {
              key: 'dollars',
              label: '$ amount',
              type: 'money',
              prefix: '$',
              defaultValue: '0',
            },
            {
              key: 'shares',
              label: '# of shares',
              type: 'number',
              defaultValue: '0',
            },
          ],
          { title: 'Investments' }
        );
        if (link == null) {
          step = 16;
          continue;
        }
        dollars = Math.max(0, link.dollars || 0);
        shares = Math.max(0, link.shares || 0);
        if (dollars > 0 && !(shares > 0)) shares = dollars / price;
        else if (shares > 0 && !(dollars > 0)) dollars = shares * price;
        else if (dollars > 0 && shares > 0) {
          // Prefer dollars as source of truth for value
          shares = dollars / price;
        }

        const purchase = await dialog.prompt('Purchase price', {
          title: 'Investments',
          subtitle: 'Verified per-share tax basis; enter 0 only if basis is truly zero.',
          defaultValue: String(price),
          type: 'money',
          prefix: '$',
        });
        if (purchase == null) {
          step = 16;
          continue;
        }
        const purchasePrice = purchase === '' || purchase == null ? price : Math.max(0, purchase);
        // blank → 0% gain means cost basis = current value
        const costBasis = Math.round(shares * (purchase === '' || purchase == null ? price : purchasePrice));

        const gv = await dialog.form(
          'Expected return model',
          [
            {
              key: 'growth',
              label: 'Growth % per year',
              type: 'percent',
              defaultValue: String(growthPct),
            },
            {
              key: 'vol',
              label: 'Volatility %',
              type: 'percent',
              defaultValue: String(volPct),
              subtitle: 'The amount the gains fluctuate year after year.',
            },
          ],
          { title: 'Investments' }
        );
        if (gv == null) {
          step = 16;
          continue;
        }

        const acquired = await dialog.prompt('Acquired date YYYY-MM-DD (blank = unknown)', {title:'Investments',defaultValue:''});
        if (acquired == null) { step = 16; continue; }
        const holding = {
          acquiredDate: /^\d{4}-\d{2}-\d{2}$/.test(String(acquired)) ? acquired : null,
          basisKnown: true,
          ticker,
          price,
          shares,
          value: Math.round(dollars || shares * price),
          purchasePrice: purchase === '' || purchase == null ? null : purchasePrice,
          costBasis,
          growth: (gv.growth || 0) / 100,
          volatility: (gv.vol || 0) / 100,
          online: !!s._online,
        };
        s._pendingHolding = holding;
        step = 18;
      }

      // ── 18 Confirm add stock ────────────────────────────────
      else if (step === 18) {
        if (s._pendingHolding) {
          s.stocksHoldings = s.stocksHoldings || [];
          s.stocksHoldings.push(s._pendingHolding);
          delete s._pendingHolding;
          s._stockIdx = s.stocksHoldings.length;
          syncStocksTotal(s);
        }
        step = 19;
      }

      // ── 19 Add another? ─────────────────────────────────────
      else if (step === 19) {
        result = await dialog.menu(
          'Add Additional Stock?',
          withBack([
            { label: 'Add Additional Stock', value: 'add' },
            { label: 'Done', value: 'done' },
          ]),
          { title: 'Investments' }
        );
        if (result === BACK) {
          if (s.stocksHoldings?.length) {
            s.stocksHoldings.pop();
            syncStocksTotal(s);
            s._stockIdx = s.stocksHoldings.length;
          }
          step = 16;
          continue;
        }
        if (result === 'add') {
          step = 16;
        } else {
          syncStocksTotal(s);
          step = 20;
        }
      }

      // ── 20 Homes: Own or Rent ───────────────────────────────
      else if (step === 20) {
        result = await dialog.menu(
          'Own or Rent?',
          withBack([
            { label: 'Own', value: 'own' },
            { label: 'Rent', value: 'rent' },
          ]),
          { title: 'Homes' }
        );
        if (result === BACK) {
          if (s.stocksMode === 'specific') step = 19;
          else step = 15;
          continue;
        }
        s.housing = result;
        if (result === 'rent') {
          s.homes = [];
          step = 21;
        } else {
          s.monthlyRent = 0;
          s._homeCount = 0;
          s._homeIdx = 0;
          s.homes = [];
          step = 22;
        }
      }

      // ── 21 Monthly rent ─────────────────────────────────────
      else if (step === 21) {
        result = await dialog.prompt('Household monthly rent', {
          title: 'Homes',
          defaultValue: String(s.monthlyRent || 1500),
          type: 'money',
          prefix: '$',
        });
        if (result == null) {
          step = 20;
          continue;
        }
        s.monthlyRent = Math.max(0, result);
        step = 30;
      }

      // ── 22 How many homes ───────────────────────────────────
      else if (step === 22) {
        result = await dialog.menu(
          'How many homes (1–5)?',
          withBack([
            { label: '1', value: 1 },
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 },
            { label: '5', value: 5 },
          ]),
          { title: 'Homes' }
        );
        if (result === BACK) {
          step = 20;
          continue;
        }
        s._homeCount = result || 1;
        s.homes = [];
        s._homeIdx = 0;
        step = 23;
      }

      // ── 23 Home type ────────────────────────────────────────
      else if (step === 23) {
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
          if (i === 0) step = 22;
          else {
            s._homeIdx--;
            s.homes.pop();
            step = 23;
          }
          continue;
        }
        s._homeType = result;
        step = 24;
      }

      // ── 24 All home follow-ups on one page ──────────────────
      else if (step === 24) {
        const i = s._homeIdx;
        const propRate = defaultPropertyTaxRate(s.zip);
        const d = getDifficulty(s.difficulty);
        const mortDefault = ((s.rateOverrides?.mortgageRate ?? d.mortgageRate) * 100)
          .toFixed(2)
          .replace(/\.?0+$/, '');
        const fields = [
          {
            key: 'value',
            label: 'Household property market value',
            type: 'money',
            prefix: '$',
            defaultValue: '350000',
          },
          {
            key: 'owed',
            label: 'Household mortgage owed',
            type: 'money',
            prefix: '$',
            defaultValue: '280000',
          },
          {
            key: 'rate',
            label: 'Mortgage rate',
            type: 'percent',
            defaultValue: mortDefault || '6.5',
          },
          {
            key: 'term',
            label: 'Remaining term (years)',
            type: 'number',
            defaultValue: '28',
          },
          {
            key: 'propTax',
            label: 'Annual Property Tax',
            type: 'money',
            prefix: '$',
            defaultValue: String(Math.round(350000 * propRate)),
            subtitle: s.zip
              ? `Default from ZIP ${s.zip}`
              : 'Default from national average',
          },
        ];
        if (s._homeType === 'investment') {
          fields.push({
            key: 'revenue',
            label: 'Monthly revenue',
            type: 'money',
            prefix: '$',
            defaultValue: '0',
          });
        }
        result = await dialog.form(`Home ${i + 1} details`, fields, { title: 'Homes' });
        if (result == null) {
          step = 23;
          continue;
        }
        const value = Math.max(0, result.value || 0);
        const propTax = Math.max(0, result.propTax || 0);
        const rate = Math.max(0, (result.rate || 0) / 100);
        s.homes.push({
          basisKnown: false,
          type: s._homeType,
          label: HOME_TYPES[s._homeType]?.label || 'Home',
          value,
          mortgageOwed: Math.max(0, result.owed || 0),
          rate,
          remainingTerm: Math.max(0, Math.round(result.term ?? 30)),
          propertyTaxRate: value > 0 ? propTax / value : propRate,
          annualPropertyTax: propTax,
          monthlyRevenue: Math.max(0, result.revenue || 0),
        });
        s._homeIdx++;
        if (s._homeIdx < s._homeCount) step = 23;
        else step = 30;
      }

      // ── 26 Marital status ───────────────────────────────────
      else if (step === 26) {
        result = await dialog.menu(
          'Marital Status',
          withBack([
            { label: 'Single', value: 'single' },
            { label: 'Married Filing Jointly', value: 'married' },
          ]),
          { title: 'Family' }
        );
        if (result === BACK) { step = 3; continue; }
        const married = result === 'married';
        const draft = { ...s, married, filingStatus: married ? 'married' : 'single' };
        if (married && !(await editSpouseIdentity(draft, dialog))) continue;
        Object.assign(s, draft);
        step = 27;
      }

      // ── 27 Kids count ───────────────────────────────────────
      else if (step === 27) {
        result = await dialog.menu(
          'How many children (0–4)?',
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
          step = 26;
          continue;
        }
        s._kidCount = result || 0;
        s.kids = [];
        s._kidIdx = 0;
        step = s._kidCount > 0 ? 28 : 3.5;
      }

      // ── 28 Child name ───────────────────────────────────────
      else if (step === 28) {
        const i = s._kidIdx;
        const defName = randomChildName();
        result = await dialog.prompt(`Name of ${childOrdinal(i)}`, {
          title: 'Family',
          defaultValue: defName,
        });
        if (result == null) {
          if (i === 0) step = 27;
          else {
            s._kidIdx--;
            s.kids.pop();
            step = 28;
          }
          continue;
        }
        s._kidName = result || defName;
        step = 29;
      }

      // ── 29 Child age ────────────────────────────────────────
      else if (step === 29) {
        const i = s._kidIdx;
        result = await dialog.prompt(`Age of ${childOrdinal(i)}`, {
          title: 'Family',
          defaultValue: String(5 + i * 3),
          type: 'number',
        });
        if (result == null) {
          step = 28;
          continue;
        }
        s.kids.push({
          name: s._kidName,
          age: Math.max(0, Math.round(result || 0)),
        });
        s._kidIdx++;
        if (s._kidIdx < s._kidCount) step = 28;
        else step = 3.5;
      }

      // Annual consumption is separate from taxes, housing, children and saving.
      else if (step === 30) {
        const tax = estimateAnnualTax({ ...s, employed: s.salary > 0 });
        result = await dialog.prompt('Annual household living costs (exclude rent, loans, taxes, children and contributions)', {
          title: 'Living costs', type: 'money', prefix: '$', defaultValue: String(s.annualSpending ?? 35000),
        });
        if (result == null) {
          if (s.housing === 'rent') step = 21;
          else if ((s.homes || []).length) { s._homeIdx = s.homes.length - 1; s.homes.pop(); step = 23; }
          else step = 20;
          continue;
        }
        s.annualSpending = Math.max(0, result); s.spendingBreakdown = { other: s.annualSpending };
        await dialog.show('Estimated income + payroll tax: ' + formatMoneyDisplay(tax.total) + '/yr.\nHousing, property costs, children and college are added separately.', { title: 'Budget' });
        step = 31;
      }

      // ── 31 Portfolio overview ───────────────────────────────
      else if (step === 31) {
        this.scrubTemps(s);
        const overview = buildOverview(s);
        result = await dialog.menu(overview, [
          { label: 'Enter The World', value: 'go' },
          { label: 'Planning inputs / benefits', value: 'planning' },
          { label: '← Back', value: BACK },
        ], { title: 'Portfolio' });
        if (result === 'planning') { await editPlanningInputs(s, dialog); continue; }
        if (result === BACK) {
          step = 30;
          continue;
        }
        if (mode === 'profile') {
          return s;
        }
        const saveAsProfile = await dialog.confirm('Save this as a profile for later?', {
          title: 'Custom Setup',
        });
        if (saveAsProfile) saveProfile(s);
        return createGameFromSetup(s);
      }
    }
  }
}

function buildOverview(s) {
  const d = getDifficulty(s.difficulty);
  const lines = [];
  lines.push(`${s.playerName} · Age ${s.age} · Year ${s.year}`);
  lines.push(`Difficulty: ${d.label}`);
  lines.push(
    s.zip
      ? `ZIP ${s.zip} → ${stateFromZip(s.zip).abbr}`
      : 'ZIP blank → national tax averages'
  );
  lines.push('');
  lines.push('Finances:');
  lines.push(`  Cash (checking): ${formatMoneyDisplay(s.cash)}`);
  lines.push(
    `  Savings: ${formatMoneyDisplay(s.savings)} @ ${((s.savingsRate || 0) * 100).toFixed(2)}%`
  );
  lines.push(`  ${personName(s)} salary: ${formatMoneyDisplay(s.salary)}`);
  if (s.married) lines.push(`  ${personName(s, 'spouse')} salary: ${formatMoneyDisplay(s.spouseSalary)}`);
  lines.push(`  Household salary: ${formatMoneyDisplay(householdSalary(s))}`);
  lines.push('');
  lines.push('Retirement:');
  lines.push(`  Retirement age: ${s.retirementAge || 65}`);
  if (s.has401k) {
    lines.push(
      `  401(k): ${formatMoneyDisplay(s.k401Balance)} · contrib ${((s.k401ContribRate || 0) * 100).toFixed(1)}% · match ${((s.k401MatchRate || 0) * 100).toFixed(0)}% of first ${((s.k401MatchOnFirst || 0) * 100).toFixed(1)}%`
    );
  } else lines.push('  401(k): none');
  if (s.hasRoth) {
    lines.push(
      `  Roth IRA: ${formatMoneyDisplay(s.rothBalance)} · contrib ${formatMoneyDisplay(s.rothAnnualContribution)}/yr`
    );
  } else lines.push('  Roth IRA: none');
  if (s.married) {
    lines.push(`  ${personName(s, 'spouse')} retirement age: ${s.spouseRetirementAge || 65}`);
    lines.push(`  ${personName(s, 'spouse')} 401(k): ${s.spouseHas401k ? formatMoneyDisplay(s.spouseK401Balance) : 'none'}`);
    lines.push(`  ${personName(s, 'spouse')} Roth IRA: ${s.spouseHasRoth ? formatMoneyDisplay(s.spouseRothBalance) : 'none'}`);
  }
  lines.push('');
  lines.push('Investments:');
  if (s.stocksMode === 'specific' && (s.stocksHoldings || []).length) {
    for (const h of s.stocksHoldings) {
      lines.push(
        `  ${h.ticker}: ${formatMoneyDisplay(h.value)} (${(h.shares || 0).toFixed(2)} sh @ ${formatMoneyDisplay(h.price)}) g ${((h.growth || 0) * 100).toFixed(1)}% vol ${((h.volatility || 0) * 100).toFixed(1)}%`
      );
    }
  } else {
    lines.push(`  Stock portfolio total: ${formatMoneyDisplay(s.stocksTotal)}`);
  }
  lines.push('');
  lines.push('Homes:');
  if (s.housing === 'rent') {
    lines.push(`  Renting @ ${formatMoneyDisplay(s.monthlyRent)}/mo`);
  } else if (!(s.homes || []).length) {
    lines.push('  None');
  } else {
    for (const h of s.homes) {
      lines.push(
        `  ${h.label}: ${formatMoneyDisplay(h.value)} · mortgage ${formatMoneyDisplay(h.mortgageOwed)} @ ${((h.rate || 0) * 100).toFixed(2)}%`
      );
      if (h.monthlyRevenue) lines.push(`    Revenue ${formatMoneyDisplay(h.monthlyRevenue)}/mo`);
    }
  }
  lines.push('');
  lines.push('Family:');
  lines.push(`  ${s.filingStatus === 'married' ? 'Married Filing Jointly' : 'Single'}`);
  if (s.married) lines.push(`  ${personName(s, 'spouse')}, age ${s.spouseAge ?? 'unknown'}`);
  if ((s.kids || []).length) {
    for (const k of s.kids) lines.push(`  ${k.name}, age ${k.age}`);
  } else lines.push('  Children: none');
  lines.push('');
  lines.push('Expenses (annual):');
  const b = s.spendingBreakdown || {};
  lines.push(
    `  Housing ${formatMoneyDisplay((b.mortgage || 0) + (b.rent || 0))} · Prop tax ${formatMoneyDisplay(b.propertyTax)} · Income tax ${formatMoneyDisplay(b.incomeTax)} · Other ${formatMoneyDisplay(b.other)}`
  );
  lines.push(`  Living only ${formatMoneyDisplay(s.annualSpending)}`);
  return lines.join('\n');
}
