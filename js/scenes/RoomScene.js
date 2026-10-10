import { editPlanningInputs } from './PlanningInputs.js';
import { editSpouseIdentity, editFamilyIncome, editRetirementAges, editRetirementAccounts, personName } from './FamilyInputs.js';
import { ensureHoldings, syncBook, post } from '../finance/Books.js';
import { childCostLabel } from '../data/stateChildCosts.js';
import { randomChildName } from '../data/childNames.js';
import {
  FRAME_W,
  WORLD_SCALE,
  VIEW_W,
  VIEW_H,
  HUD_H,
  HOME_TYPES,
  HELOC_DEFAULT_RATE,
  HELOC_RATE_MIN,
  HELOC_RATE_MAX,
  SECURITIES_LOAN_DEFAULT_RATE,
  SECURITIES_LOAN_RATE_MIN,
  SECURITIES_LOAN_RATE_MAX,
  HELOC_CLTV,
  SB_LTV,
} from '../config.js';
import { Player } from '../render/Player.js';
import { SpouseNpc, hasSpouseNpc } from '../render/SpouseNpc.js';
import { Hud, drawActionPrompt } from '../render/Hud.js';
import {
  buildDecisionRoom,
  drawWorld,
  isSolid,
  findFacingInteractable,
} from '../render/World.js';
import {
  buyHome,
  sellHome,
  buyStock,
  sellStock,
  setEmployment,
  addKid,
  largePurchase,
  computeWorth,
  helocCapacity,
  securitiesLoanCapacity,
  takeHeloc,
  takeSecuritiesLoan,
  annualLoanPayment,
  transferSavings,
  withdrawRetirement,
  retirementAccess,
  previewRetirementWithdrawal,
  setRetirementWithdrawalPlan,
  setSavingsTransferPlan,
  setStockSalePlan,
} from '../finance/Engine.js';
import { getDifficulty } from '../finance/Difficulty.js';
import { commitRoomDecisions, currentNode, westReturnHallway, jumpToHallwayNode } from '../state/GameState.js';
import { autoSave } from '../state/SaveSystem.js';
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from '../render/Dialog.js';
import { setMoneyContext, toDisplayMoney } from '../finance/DollarBasis.js';
import { lookupStockWithLoading } from '../finance/stockQuotes.js';
import { monthlyPayment } from '../finance/Loans.js';
import { defaultPropertyTaxRate } from '../data/state-from-zip.js';
import { ownerAge, ownerKey } from '../finance/Household.js';
import { log as debugLog } from '../debug/Logger.js';

/** Numeric financial results are stored in nominal dollars, then rendered in the room's units. */
export function transactionReason(transaction, portfolio) {
  if (!transaction) return '';
  const money = amount => formatMoneyDisplay(amount, portfolio);
  switch (transaction.reasonCode) {
    case 'insufficient-cash':
      return `Not enough Cash.\nNeeds ${money(transaction.required)}; Cash is ${money(transaction.available)}.`;
    case 'insufficient-account-balance':
      return `Only ${money(transaction.available)} is in ${transaction.source === 'savings' ? 'Savings' : 'Cash'}.`;
    case 'insufficient-retirement-balance':
      return `Only ${money(transaction.available)} can be withdrawn from this account now.`;
    case 'insufficient-retirement-net':
      return `This account can provide at most ${money(transaction.maximumNetCash)} after estimated tax.`;
    default:
      return transaction.reason || '';
  }
}

export class RoomScene {
  constructor() {
    this.world = null;
    this.player = null;
    /** @type {SpouseNpc|null} wandering spouse (visual only, not saved) */
    this.spouse = null;
    this.hud = new Hud();
    this.prompt = null;
    this.locked = false;
    this.animTime = 0;
    /** @type {object|null} prior Hallway of Time timeline node, if any */
    this.priorHallway = null;
  }

  enter(game, spawnNearDoor = false, arrival = null) {
    // West door for rooms entered through a Hallway year door (the first door
    // included); a south-door return restores the original room as it was.
    this.priorHallway = westReturnHallway(game);
    this.world = buildDecisionRoom({
      hasWestReturn: !!this.priorHallway,
      priorHallwayYear: this.priorHallway?.year,
    });
    const sp = this.world.spawn;
    this.player = new Player(sp.x, spawnNearDoor ? 2 * 16 : sp.y, { speed: 1.5 });
    // Through an east Hallway door: step in just east of the west doorway,
    // facing east, as if the player had just walked through it.
    const westDoor = arrival === 'west-door'
      ? this.world.interactables?.find((o) => o.kind === 'west-door') : null;
    if (westDoor) {
      this.player.x = westDoor.x + westDoor.w + 6;
      this.player.y = westDoor.y + Math.round(westDoor.h / 2) - Math.round(this.player.h / 2);
      this.player.facing = 'right';
    }
    // Back through a timeline's south door: step in just below the north
    // (Hallway of Time) door, facing south, as if coming down through it.
    const northDoor = arrival === 'north-door'
      ? this.world.interactables?.find((o) => o.id === 'door-hallway') : null;
    if (northDoor) {
      this.player.x = northDoor.x + Math.round(northDoor.w / 2) - Math.round(this.player.w / 2);
      this.player.y = northDoor.y + northDoor.h + 6;
      this.player.facing = 'down';
    }
    this.player.bindInput();
    this.prompt = null;
    this.locked = false;
    this.animTime = 0;
    // enterYearRoom / createGame already record the Decision Room begin node —
    // only append another if we somehow entered without one (avoids duplicate begins).
    const cur = currentNode(game);
    const p = game.portfolio;
    const alreadyBegin =
      cur &&
      cur.type === 'room' &&
      cur.kind === 'begin' &&
      cur.year === p.year &&
      cur.age === p.age;
    if (!alreadyBegin) {
      commitRoomDecisions(game, 'begin');
    }
    // Re-resolve after any begin commit. Rebuild only if the door changed.
    const resolved = westReturnHallway(game);
    if ((resolved?.id || null) !== (this.priorHallway?.id || null)) {
      this.priorHallway = resolved;
      this.world = buildDecisionRoom({
        hasWestReturn: !!resolved,
        priorHallwayYear: resolved?.year,
      });
    } else {
      this.priorHallway = resolved;
    }
    this.spouse = null;
    this.syncSpouse(game.portfolio);
    autoSave(game, 'begin');
  }

  /**
   * Show the spouse NPC while the household has a spouse (marriage can
   * happen mid-room at the Family teller). A rebuilt room gets a fresh NPC.
   */
  syncSpouse(p) {
    if (!hasSpouseNpc(p)) {
      this.spouse = null;
      return;
    }
    if (this.spouse && this.spouse.world === this.world) return;
    const pl = this.player;
    this.spouse = new SpouseNpc(this.world, {
      walkSpeed: pl ? pl.speed : 1.5,
      avoid: pl ? { x: pl.x - 2, y: pl.y - 12, w: 16, h: 24 } : null,
      onDecision: (d) => debugLog('spouse_npc', d),
    });
  }

  leave() {
    this.player?.unbindInput();
  }

  setInputBlocked(blocked) {
    if (!this.player) return;
    if (blocked) {
      if (this.player.inputEnabled) this.player.clearKeys();
      this.player.inputEnabled = false;
    } else {
      this.player.clearKeys();
      this.player.inputEnabled = true;
    }
  }

  update(game, dialog) {
    this.animTime += 1;
    const blocked = !!(dialog?.active || this.locked);
    if (blocked) {
      this.setInputBlocked(true);
      return null;
    }
    if (!this.player.inputEnabled) {
      this.player.clearKeys();
      this.player.inputEnabled = true;
    }
    this.player.update((x, y, w, h) => isSolid(this.world, x, y, w, h));
    // The spouse wanders on the same fixed tick; no collision with the player.
    this.syncSpouse(game.portfolio);
    this.spouse?.update();
    this.prompt = findFacingInteractable(this.player, this.world);
    return null;
  }

  async tryInteract(game, dialog) {
    if (dialog.active || this.locked) return null;
    this.player?.clearKeys();
    this.setInputBlocked(true);
    const obj = findFacingInteractable(this.player, this.world);
    if (!obj) return null;

    if (obj.kind === 'door') {
      const ok = await dialog.confirm(
        `Are you ready to leave ${game.portfolio.year}?`,
        { title: 'Hallway of Time', yes: 'Enter hallway', no: 'Stay' }
      );
      if (ok) {
        commitRoomDecisions(game, 'end');
        autoSave(game, 'end');
        this.leave();
        return { goto: 'hallway' };
      }
      this.setInputBlocked(false);
      return null;
    }

    if (obj.kind === 'west-door') {
      // Return to the Hallway of Time instance this Decision Room was entered from
      const prior = this.priorHallway || westReturnHallway(game) || null;
      if (!prior) {
        await dialog.show('There is no prior Hallway of Time to return to.', {
          title: 'Hallway of Time',
        });
        this.setInputBlocked(false);
        return null;
      }
      const ok = await dialog.confirm(
        `Return to the Hallway of Time after ${prior.year}?\n` +
          `Restores finances from that hallway (this room's changes are left on the branch).`,
        { title: 'Hallway of Time', yes: 'Return', no: 'Stay' }
      );
      if (!ok) {
        this.setInputBlocked(false);
        return null;
      }
      debugLog('west_door_return', {
        hallwayId: prior.id,
        year: prior.year,
        age: prior.age,
        fromYear: game.portfolio?.year,
        fromAge: game.portfolio?.age,
      });
      const jumped = jumpToHallwayNode(game, prior.id);
      if (!jumped) {
        await dialog.show('Could not restore that hallway.', { title: 'Hallway of Time' });
        this.setInputBlocked(false);
        return null;
      }
      autoSave(game, 'end');
      this.leave();
      return { goto: 'hallway' };
    }

    if (obj.kind === 'teller') {
      await this.handleTeller(game, dialog, obj.action);
      game.lastWorth = computeWorth(game.portfolio);
      this.player?.clearKeys();
      this.setInputBlocked(false);
      return null;
    }
    this.setInputBlocked(false);
    return null;
  }

  async handleTeller(game, dialog, action) {
    const p = game.portfolio;
    // Every action captures the current room's units, including direct teller
    // entry after a timeline jump before the next render refreshes the context.
    setMoneyContext(p);
    const diff = getDifficulty(p.difficulty || 'standard');

    if (action === 'home') {
      await this.handleManageProperty(game, dialog, diff);
    } else if (action === 'stock') {
      await this.handleStockBroker(game, dialog, diff);
    } else if (action === 'job') {
      await this.handleCareer(game, dialog);
    } else if (action === 'kid') {
      await this.handleFamilyPlanning(game, dialog);
    } else if (action === 'purchase') {
      await this.handleLargePurchase(game, dialog);
    } else if (action === 'borrow') {
      await this.handleBorrow(game, dialog);
    } else if (action === 'portfolio') {
      await this.handlePortfolioEditor(game, dialog, diff);
    } else if (action === 'bank') {
      await this.handleBank(game, dialog);
    }
  }

  /** Family Planning — roster of spouse/kids, then Add/Remove a Spouse, Have a Kid, Child Care. */
  async handleFamilyPlanning(game, dialog) {
    const title = 'Family Planning';
    while (true) {
      const p = game.portfolio;
      const lines = [];
      if (p.married) lines.push(`**${personName(p, 'spouse')}** age ${p.spouseAge ?? '?'}`);
      for (const k of p.kids || []) lines.push(`**${k.name}** age ${k.age}`);
      if (!lines.length) lines.push('No spouse or kids yet.');
      const choice = await dialog.menu(
        lines.join('\n'),
        [
          { label: p.married ? 'Remove a Spouse' : 'Add a Spouse', value: p.married ? 'divorce' : 'spouse' },
          { label: 'Have a Kid', value: 'kid' },
          { label: 'Child Care', value: 'care' },
          { label: 'Done', value: null },
        ],
        { title }
      );
      if (!choice) return;
      if (choice === 'spouse') await this.handleAddSpouse(game, dialog);
      else if (choice === 'divorce') await this.handleDivorce(game, dialog);
      else if (choice === 'kid') await this.handleHaveKid(game, dialog);
      else if (choice === 'care') await this.handleChildCare(game, dialog);
    }
  }

  /** Add a Spouse — mirrors Setup's own marriage questions (identity/appearance, income, retirement age, accounts). */
  async handleAddSpouse(game, dialog) {
    const title = 'Add a Spouse';
    const draft = { ...game.portfolio, married: true, filingStatus: 'married' };
    let step = 0;
    while (true) {
      if (step === 0) {
        if (!(await editSpouseIdentity(draft, dialog, { title }))) return;
        step = 1;
      } else if (step === 1) {
        if (!(await editFamilyIncome(draft, dialog, { title }))) { step = 0; continue; }
        step = 2;
      } else if (step === 2) {
        if (!(await editRetirementAges(draft, dialog, { title }))) { step = 1; continue; }
        step = 3;
      } else if (step === 3) {
        if (!(await editRetirementAccounts(draft, dialog, { owner: 'spouse', title }))) { step = 2; continue; }
        draft.lastTransaction = { accepted: true, description: `${personName(draft, 'spouse')} joins the household. Cash and Savings are joint accounts.` };
        draft.milestones = [...(game.portfolio.milestones || []), { year: game.portfolio.year, age: game.portfolio.age, kind: 'marriage', message: draft.lastTransaction.description }];
        game.portfolio = draft;
        await dialog.show(draft.lastTransaction.description, { title });
        return;
      }
    }
  }

  /** Have a Kid — mirrors Setup's child name question; always starts at age 0. */
  async handleHaveKid(game, dialog) {
    const title = 'Have a Kid';
    const p = game.portfolio;
    if ((p.kids || []).length >= 4) {
      await dialog.show('Four kids is the max for this ledger.', { title });
      return;
    }
    const name = await dialog.prompt('Name of the new child', { title, defaultValue: randomChildName() });
    if (name == null) return;
    game.portfolio = addKid(p, { name: name || 'Child', age: 0 });
    await dialog.show(`${name || 'Child'} joins the timeline at age 0. Annual child costs use ${childCostLabel(p.zip)} until age 18.`, { title });
  }

  /** Remove a Spouse / divorce — fund-split % (linked fields) over joint Cash/Savings/investments, then property. */
  async handleDivorce(game, dialog) {
    const title = 'Family Planning';
    const p0 = game.portfolio;
    const spouse = personName(p0, 'spouse');
    const intro = await dialog.confirm(
      `End the marriage?\n${spouse} leaves with their own retirement accounts. Your joint Cash, Savings and investments are split by a percentage you choose next.`,
      { title, yes: 'End it', no: 'Cancel' }
    );
    if (!intro) return;

    const homes = p0.homes || [];
    const sellable = homes.length > 0 && homes.every(h => h.basisKnown !== false);
    let step = homes.length ? 0 : 1, propertyChoice = homes.length ? null : 'keep', keepPct = 50;
    let draft = null, total = 0;
    while (true) {
      if (step === 0) {
        const result = await dialog.menu('What happens to your property?', [
          { label: 'Keep all property (and its debt)', value: 'keep' },
          ...(sellable ? [{ label: 'Sell all property and split proceeds', value: 'sell' }] : []),
          { label: 'Back', value: null },
        ], { title });
        if (result == null) return;
        propertyChoice = result;
        step = 1;
      } else if (step === 1) {
        draft = { ...p0 };
        if (propertyChoice === 'sell') {
          let failed = false;
          for (let i = draft.homes.length - 1; i >= 0; i--) {
            const sold = sellHome(draft, i, { exclusionEligible: false });
            if (sold.lastTransaction?.accepted === false) {
              await dialog.show(transactionReason(sold.lastTransaction, draft), { title });
              failed = true;
              break;
            }
            draft = sold;
          }
          if (failed) { if (!homes.length) return; step = 0; continue; }
        }
        total = Math.max(0, (draft.cash || 0) + (draft.savings || 0) + (draft.stocksTotal || 0));
        const result = await dialog.form(
          `Splitting ${formatMoneyDisplay(total, draft)} of joint Cash, Savings and investments`,
          [
            { key: 'pct', label: 'You keep (%)', type: 'percent', defaultValue: String(keepPct) },
            { key: 'amount', label: 'You keep ($)', type: 'money', defaultValue: String(Math.round(total * keepPct / 100)) },
          ],
          {
            title, portfolio: draft,
            onFieldChange: (fields, idx) => {
              const totalDisplay = toDisplayMoney(total, draft);
              if (idx === 0) {
                const pct = Math.max(0, Math.min(100, parseFloat(fields[0].value) || 0));
                fields[1].value = formatMoneyInput(String(Math.round(totalDisplay * pct / 100)));
              } else {
                const amt = Math.max(0, Math.min(totalDisplay, parseMoneyInput(fields[1].value)));
                fields[0].value = totalDisplay > 0 ? ((amt / totalDisplay) * 100).toFixed(1) : '0';
              }
            },
          }
        );
        if (!result) { if (!homes.length) return; step = 0; continue; }
        keepPct = Math.max(0, Math.min(100, Number(result.pct) || 0));
        step = 2;
      } else if (step === 2) {
        const fraction = keepPct / 100;
        const keepCash = Math.round((draft.cash || 0) * fraction);
        const keepSavings = Math.round((draft.savings || 0) * fraction);
        const keepStocks = Math.round((draft.stocksTotal || 0) * fraction);
        const confirmed = await dialog.confirm(
          `${spouse} leaves the household with ${(100 - keepPct).toFixed(1)}% of joint Cash/Savings/investments and their own retirement accounts.\n` +
          `You keep: Cash ${formatMoneyDisplay(keepCash, draft)} · Savings ${formatMoneyDisplay(keepSavings, draft)} · Investments ${formatMoneyDisplay(keepStocks, draft)}`,
          { title, yes: 'Finalize divorce', no: 'Cancel', distinctCancel: true }
        );
        if (confirmed == null) { step = 1; continue; }
        if (!confirmed) return;
        const final = { ...draft };
        final.cash = keepCash;
        final.savings = keepSavings;
        if (fraction < 1) {
          ensureHoldings(final);
          final.stocksHoldings = final.stocksHoldings.map(h => ({
            ...h, value: Math.round(h.value * fraction), costBasis: Math.round((h.costBasis || 0) * fraction), shares: h.shares * fraction,
          }));
          syncBook(final);
        }
        for (const key of Object.keys(final)) if (key.startsWith('spouse')) delete final[key];
        final.married = false;
        final.filingStatus = 'single';
        final.lastTransaction = { accepted: true, description:
          `${spouse} leaves the household. You keep ${keepPct.toFixed(1)}% of joint Cash, Savings and investments` +
          (propertyChoice === 'sell' ? ', and all property was sold and split.' : ', and you keep all property.') };
        final.milestones = [...(p0.milestones || []), { year: p0.year, age: p0.age, kind: 'divorce', message: final.lastTransaction.description }];
        game.portfolio = final;
        await dialog.show(final.lastTransaction.description, { title });
        return;
      }
    }
  }

  /** Child Care — unchanged: hire a nanny or place in daycare for a fixed number of years. */
  async handleChildCare(game, dialog) {
    const title = 'Child Care';
    const p = game.portfolio;
    const type = await dialog.menu('Child Care', [
      { label: 'Hire a Nanny', value: 'nanny' }, { label: 'Place in daycare', value: 'daycare' }, { label: 'Back', value: null },
    ], { title });
    if (!type) return;
    const form = await dialog.form(type === 'nanny' ? 'Hire a Nanny' : 'Place in daycare', [
      { key: 'annualCost', label: 'Annual household child care cost', type: 'money', prefix: '$', defaultValue: '18000' },
      { key: 'years', label: 'Number of years, starting now', type: 'number', defaultValue: '3' },
    ], { title, portfolio: p, subtitle: 'Added to ordinary child costs; grows with inflation.' });
    if (!form) return;
    const annualCost = Math.max(0, Number(form.annualCost) || 0);
    const years = Math.max(1, Math.min(100, Math.round(Number(form.years) || 1)));
    const existing = p.childcarePlans || [];
    const plan = { id: `${type}-${p.year}-${existing.length + 1}`, type, annualCost, startYear: p.year,
      endYearExclusive: p.year + years, entryPriceIndex: p.priceIndex || 1 };
    game.portfolio = { ...p, childcarePlans: [...existing, plan], lastTransaction: {
      accepted: true, description: `${type === 'nanny' ? 'Nanny' : 'Daycare'}: ${formatMoneyDisplay(annualCost, p)}/year from ${p.year} through ${p.year + years - 1}.`,
    } };
    await dialog.show(game.portfolio.lastTransaction.description, { title });
  }

  /** Career — choose player/spouse, then Leave / Start a Job / Retire. Back returns to the previous question. */
  async handleCareer(game, dialog) {
    const title = 'Career';
    let step = 0, owner = 'primary';
    while (true) {
      const p = game.portfolio;
      if (step === 0) {
        if (!p.married) { owner = 'primary'; step = 1; continue; }
        const result = await dialog.menu(
          '**Start, end, and modify current jobs and salaries.**\n' +
            `${personName(p)} ${formatMoneyDisplay(p.salary || 0, p)}/yr · ` +
            `${personName(p, 'spouse')} ${formatMoneyDisplay(p.spouseSalary || 0, p)}/yr`,
          [
            { label: personName(p), value: 'primary' },
            { label: personName(p, 'spouse'), value: 'spouse' },
            { label: 'Back', value: null },
          ], { title }
        );
        if (!result) return;
        owner = result;
        step = 1;
      } else if (step === 1) {
        const result = await dialog.menu(
          `${personName(p, owner)} career window`,
          [
            { label: 'Leave job (salary → $0)', value: 'leave' },
            { label: 'Start a Job', value: 'start' },
            { label: 'Retire', value: 'retire' },
            { label: 'Never mind', value: null },
          ], { title }
        );
        if (!result) { if (!p.married) return; step = 0; continue; }
        if (result === 'leave') {
          game.portfolio = setEmployment(game.portfolio, 'leave', { owner });
          await dialog.show(`${personName(p, owner)}'s salary is now $0.`, { title });
          return;
        }
        if (result === 'start') { await this.handleStartJob(game, dialog, owner); return; }
        await this.handleRetire(game, dialog, owner);
        return;
      }
    }
  }

  /** Start a Job — salary, then an optional retirement-contributions setup, then a future retirement age if already past the current one. */
  async handleStartJob(game, dialog, owner) {
    const title = 'Start a Job';
    const salaryKey = owner === 'spouse' ? 'spouseSalary' : 'salary';
    let step = 0, salary = game.portfolio[salaryKey] || 50000, setupRetirement = null, retirementAge = null;
    while (true) {
      const p = game.portfolio;
      if (step === 0) {
        const result = await dialog.prompt(`${personName(p, owner)} new annual gross salary`, {
          title, defaultValue: String(salary), type: 'money',
        });
        if (result == null) return;
        salary = Math.max(0, result);
        step = 1;
      } else if (step === 1) {
        const result = await dialog.confirm('Set up retirement contributions for this job?', {
          title, yes: 'Yes', no: 'No', distinctCancel: true,
        });
        if (result == null) { step = 0; continue; }
        setupRetirement = result;
        step = 2;
      } else if (step === 2) {
        if (setupRetirement) {
          const draft = { ...game.portfolio };
          if (!(await editRetirementAccounts(draft, dialog, { owner }))) { step = 1; continue; }
          game.portfolio = draft;
        }
        retirementAge = game.portfolio[ownerKey('retirementAge', owner)] ?? 65;
        const age = ownerAge(game.portfolio, owner);
        step = (age != null && age >= retirementAge) ? 3 : 10;
      } else if (step === 3) {
        const age = ownerAge(game.portfolio, owner);
        const result = await dialog.prompt(`${personName(game.portfolio, owner)} planned retirement age for this job`, {
          title, type: 'number', defaultValue: String(retirementAge ?? Math.ceil(age + 1)),
          subtitle: 'Choose a future age so the model includes this new salary.',
        });
        if (result == null) return; // no single prior "question" to return to here; cancel the whole job start
        if (!(Number(result) > age && Number(result) <= 110)) {
          await dialog.show('Choose a retirement age later than your current age (up to 110).', { title });
          continue;
        }
        retirementAge = Number(result);
        step = 10;
      } else if (step === 10) {
        game.portfolio = setEmployment(game.portfolio, 'start', { owner });
        game.portfolio[ownerKey('retirementAge', owner)] = retirementAge ?? game.portfolio[ownerKey('retirementAge', owner)] ?? 65;
        game.portfolio[salaryKey] = salary;
        game.portfolio[owner === 'spouse' ? 'spouseEmployed' : 'employed'] = salary > 0;
        const peakKey = owner === 'spouse' ? 'spousePeakSalary' : 'peakSalary';
        game.portfolio[peakKey] = Math.max(game.portfolio[peakKey] || 0, salary);
        await dialog.show('Employment updated.', { title });
        return;
      }
    }
  }

  /**
   * Retire — sets salary to $0 and offers the two ways to fund retirement spending: a standing
   * retirement-fund withdrawal, or a standing annual stock sale. Both are the player's own
   * instruction (cash-only funding); neither is set up automatically.
   */
  async handleRetire(game, dialog, owner) {
    const title = 'Career';
    const p0 = game.portfolio;
    const ok = await dialog.confirm(`Retire ${personName(p0, owner)}? Salary will be set to $0.`, { title, yes: 'Retire', no: 'Cancel' });
    if (!ok) return;
    game.portfolio = setEmployment(game.portfolio, 'retire', { owner });
    const report = async (heading, description = null) => {
      const t = game.portfolio.lastTransaction || {};
      await dialog.show(t.accepted === false ? transactionReason(t, game.portfolio) : description || t.description || 'Done.', { title: heading });
    };
    while (true) {
      const p = game.portfolio;
      const choice = await dialog.menu(
        `${personName(p, owner)} is retired.\nFund retirement by pulling from retirement funds, or by selling stock periodically. Either is your own standing instruction -- nothing is sold or withdrawn on its own.`,
        [
          { label: 'Pull from retirement funds', value: 'withdraw' },
          { label: 'Sell stock annually', value: 'stock' },
          { label: 'Done', value: null },
        ], { title }
      );
      if (!choice) return;
      if (choice === 'withdraw') await this.handleStandingWithdrawal(game, dialog, report);
      else await this.handleStockSalePlanSetup(game, dialog, report);
    }
  }

  /** Set (or cancel) a standing annual stock sale, sold proportionally across liquid holdings. */
  async handleStockSalePlanSetup(game, dialog, report) {
    const title = 'Standing stock sale';
    const p = game.portfolio, money = n => formatMoneyDisplay(n, p);
    const current = p.stockSalePlan;
    const amount = await dialog.prompt('Sell how much stock each year? ($0 stops it)', {
      title, portfolio: p, defaultValue: String(Math.round(current?.amount || 0)), type: 'money', prefix: '$',
    });
    if (amount == null) return;
    game.portfolio = setStockSalePlan(p, { amount, holdingId: current?.holdingId || null });
    if (game.portfolio.lastTransaction?.accepted === false) { await report(title); return; }
    await report(title, amount > 0 ? `Standing stock sale set: ${money(amount)}/year, sold into Cash.` : 'Standing stock sale cancelled.');
  }

  /** Make a Large Purchase — a step index so Back always returns to the previous question. */
  async handleLargePurchase(game, dialog) {
    const title = 'Make a Large Purchase';
    let step = 0, itemName = 'New car', price = 5000, financed = false, down = 0, ratePct = 6.9, term = 5;
    while (true) {
      const label = String(itemName).trim() || 'Large Purchase';
      if (step === 0) {
        const result = await dialog.prompt('What is your Purchase?', { title, defaultValue: itemName });
        if (result == null) return;
        itemName = result;
        step = 1;
      } else if (step === 1) {
        const result = await dialog.prompt('Purchase amount?', { title: label, defaultValue: String(price), type: 'money' });
        if (result == null) { step = 0; continue; }
        price = Math.max(0, result);
        step = 2;
      } else if (step === 2) {
        const result = await dialog.confirm('Is this purchase being financed?', {
          title: label, yes: 'Yes — finance it', no: 'No — pay in full', distinctCancel: true,
        });
        if (result == null) { step = 1; continue; }
        financed = result;
        step = financed ? 3 : 10;
      } else if (step === 3) {
        const result = await dialog.prompt('Down payment?', {
          title: label, defaultValue: String(down || Math.round(price * 0.2)), type: 'money',
        });
        if (result == null) { step = 2; continue; }
        down = Math.max(0, result);
        step = 4;
      } else if (step === 4) {
        const result = await dialog.prompt('Interest rate (%)?', { title: label, defaultValue: String(ratePct), type: 'percent' });
        if (result == null) { step = 3; continue; }
        ratePct = result;
        step = 5;
      } else if (step === 5) {
        const result = await dialog.prompt('Loan term (years)?', { title: label, defaultValue: String(term), type: 'number' });
        if (result == null) { step = 4; continue; }
        term = result;
        step = 10;
      } else if (step === 10) {
        if (!financed) {
          game.portfolio = largePurchase(game.portfolio, price, { label });
          await dialog.show(
            transactionReason(game.portfolio.lastTransaction, game.portfolio) || `Purchased ${label} — paid in full from Cash.`,
            { title }
          );
          return;
        }
        const downCap = Math.max(0, Math.min(price, down || 0));
        const principal = price - downCap;
        game.portfolio = largePurchase(game.portfolio, price, {
          financed: true, downPayment: downCap, rate: (ratePct || 0) / 100, term: term ?? 5, label,
        });
        await dialog.show(
          transactionReason(game.portfolio.lastTransaction, game.portfolio) || `Purchased ${label}.\n` +
            `Down ${formatMoneyDisplay(downCap)}; financed ${formatMoneyDisplay(principal)} ` +
            `at ${ratePct}% for ${Math.max(1, Math.round(term ?? 5))} yr.`,
          { title }
        );
        return;
      }
    }
  }

  /**
   * Bank teller — the player's own ways to raise Cash (only Cash pays bills; nothing is
   * moved automatically): Savings ↔ Cash, one-time 401(k)/Roth withdrawals, and standing
   * yearly instructions (withdrawal or Savings↔Cash transfer) the engine carries out monthly.
   */
  async handleBank(game, dialog) {
    const title = 'Bank';
    const money = n => formatMoneyDisplay(n, game.portfolio);
    const report = async (heading, description = null) => {
      const t = game.portfolio.lastTransaction || {};
      await dialog.show(t.accepted === false ? transactionReason(t, game.portfolio) : description || t.description || 'Done.', { title: heading });
    };
    while (true) {
      const p = game.portfolio;
      const standing = [];
      if (p.retirementWithdrawalPlan) standing.push(`${personName(p)} withdrawal ${money(p.retirementWithdrawalPlan.amount)}/yr (${p.retirementWithdrawalPlan.account === 'roth' ? 'Roth' : '401(k)'})`);
      if (p.spouseRetirementWithdrawalPlan) standing.push(`${personName(p, 'spouse')} withdrawal ${money(p.spouseRetirementWithdrawalPlan.amount)}/yr (${p.spouseRetirementWithdrawalPlan.account === 'roth' ? 'Roth' : '401(k)'})`);
      if (p.savingsTransferPlan) standing.push(`Transfer ${money(p.savingsTransferPlan.amount)}/yr (${p.savingsTransferPlan.direction === 'toSavings' ? 'Cash→Savings' : 'Savings→Cash'})`);
      const choice = await dialog.menu(
        `**"Cash" is used for paying all expenses.** Always be sure to have enough Cash on hand.\n` +
          `**Cash** ${money(p.cash || 0)} · **Savings** ${money(p.savings || 0)}\n` +
          `**${personName(p)} 401(k)** ${money(p.k401Balance || 0)} · **Roth** ${money(p.rothBalance || 0)}` +
          (p.married ? `\n**${personName(p, 'spouse')} 401(k)** ${money(p.spouseK401Balance || 0)} · **Roth** ${money(p.spouseRothBalance || 0)}` : '') +
          (standing.length ? `\n_Standing:_ ${standing.join('; ')}` : ''),
        [
          { label: 'Transfer Cash to Savings', value: 'toSavings' },
          { label: 'Transfer Savings to Cash', value: 'toCash' },
          { label: 'Withdraw from Retirement Fund', value: 'withdraw' },
          { label: 'Set an annual withdraw/transfer', value: 'plan' },
          { label: 'Done', value: null },
        ],
        { title }
      );
      if (!choice) return;
      if (choice === 'toCash' || choice === 'toSavings') {
        const toCash = choice === 'toCash';
        const available = toCash ? p.savings || 0 : p.cash || 0;
        if (!(available > 0)) {
          await dialog.show(`There is no money in ${toCash ? 'Savings' : 'Cash'} to move.`, { title });
          continue;
        }
        const amount = await dialog.prompt(
          toCash ? 'Move how much from Savings to Cash?' : 'Move how much from Cash to Savings?',
          { title, defaultValue: String(Math.round(available)), type: 'money', prefix: '$' }
        );
        if (amount == null) continue;
        game.portfolio = transferSavings(p, amount, choice);
        await report(title, `Moved ${money(amount)} from ${toCash ? 'Savings to Cash' : 'Cash to Savings'}.`);
      } else if (choice === 'withdraw') {
        await this.handleRetirementWithdrawal(game, dialog, report);
      } else if (choice === 'plan') {
        await this.handleStandingWithdrawal(game, dialog, report);
      }
    }
  }

  retirementAccountOptions(p) {
    const options = [];
    for (const owner of p.married ? ['primary', 'spouse'] : ['primary']) {
      const prefix = owner === 'spouse' ? 'spouse:' : '';
      const balance = owner === 'spouse' ? p.spouseK401Balance : p.k401Balance;
      const rothBalance = owner === 'spouse' ? p.spouseRothBalance : p.rothBalance;
      const rothAccess = retirementAccess(p, 'roth', { owner }).available;
      options.push({ label: `${personName(p, owner)} 401(k) — ${formatMoneyDisplay(balance || 0, p)}`, value: prefix + 'traditional' });
      options.push({ label: `${personName(p, owner)} Roth — ${formatMoneyDisplay(rothAccess, p)} available of ${formatMoneyDisplay(rothBalance || 0, p)}`, value: prefix + 'roth' });
    }
    return options;
  }

  /** Withdraw from Retirement Fund — a step index so Back returns to the previous question. */
  async handleRetirementWithdrawal(game, dialog, report) {
    const title = 'Withdraw from Retirement Fund';
    let step = 0, owner = 'primary', account = 'traditional', early = false, basis = 'gross', amount = 10000;
    while (true) {
      const p = game.portfolio, money = n => formatMoneyDisplay(n, p);
      if (step === 0) {
        const selection = await dialog.menu('Withdraw from which person’s account?', [
          ...this.retirementAccountOptions(p), { label: 'Cancel', value: null },
        ], { title });
        if (!selection) return;
        owner = selection.startsWith('spouse:') ? 'spouse' : 'primary';
        account = selection.replace('spouse:', '');
        early = false;
        const access = retirementAccess(p, account, { owner });
        if (access.ageUnknown) {
          await dialog.show('Enter the account owner’s actual age in Family before withdrawing.', { title });
          continue;
        }
        if (account === 'traditional' && access.gated) { step = 1; continue; }
        if (!(access.available > 0)) {
          await dialog.show(account === 'roth'
            ? 'No Roth money is available. Before age 59½ and the five-year qualification, only verified contributions can come out.'
            : 'The 401(k) is empty.', { title });
          continue;
        }
        step = 2;
      } else if (step === 1) {
        const result = await dialog.confirm(`${personName(p, owner)} is under 59½. A 401(k) withdrawal adds a 10% early-withdrawal penalty on top of income tax. Withdraw anyway?`,
          { title, yes: 'Accept penalty', no: 'Cancel' });
        if (!result) { step = 0; continue; } // declined, or Escape -- pick a different account
        early = true;
        if (!(retirementAccess(p, account, { early, owner }).available > 0)) {
          await dialog.show('The 401(k) is empty.', { title });
          step = 0; continue;
        }
        step = 2;
      } else if (step === 2) {
        const result = await dialog.menu('Choose the withdrawal amount. Estimated additional tax is prepaid from the withdrawal and credited at year-end.', [
          { label: 'Withdraw a gross amount', value: 'gross' },
          { label: 'Provide a net Cash amount', value: 'net' },
          { label: 'Back', value: null },
        ], { title });
        if (!result) { step = (account === 'traditional' && retirementAccess(p, account, { owner }).gated) ? 1 : 0; continue; }
        basis = result;
        step = 3;
      } else if (step === 3) {
        const available = retirementAccess(p, account, { early, owner }).available;
        const result = await dialog.prompt(basis === 'net' ? 'How much spendable Cash do you need?' : `Gross withdrawal? (up to ${money(available)})`, {
          title, portfolio: p, defaultValue: String(Math.round(Math.min(available, amount))), type: 'money', prefix: '$',
        });
        if (result == null) { step = 2; continue; }
        amount = result;
        step = 4;
      } else if (step === 4) {
        const opts = { account, owner, early, withholdTax: true, ...(basis === 'net' ? { netTarget: amount } : { amount }) };
        const preview = previewRetirementWithdrawal(p, opts);
        if (!preview.accepted) {
          await dialog.show(transactionReason(preview, p), { title });
          step = 3; continue;
        }
        const confirmed = await dialog.confirm(`Gross withdrawal: ${money(preview.gross)}
Estimated additional tax: ${money(preview.tax.total)}
Cash received: ${money(preview.netCash)}`, {
          title, yes: 'Withdraw', no: 'Cancel', distinctCancel: true,
        });
        if (confirmed == null) { step = 3; continue; }
        if (!confirmed) return;
        game.portfolio = withdrawRetirement(p, opts);
        const withdrawal = game.portfolio.lastWithdrawal;
        await report(title, withdrawal
          ? `Withdrew ${money(withdrawal.gross)} from ${personName(p, owner)} ${account === 'roth' ? 'Roth' : '401(k)'}.\nCash received: ${money(withdrawal.netCash)}.\nEstimated tax prepaid: ${money(withdrawal.withheld)}; credited at year-end.`
          : null);
        return;
      }
    }
  }

  /** Set an annual withdraw/transfer — retirement withdrawal plans or a standing Savings<->Cash transfer. */
  async handleStandingWithdrawal(game, dialog, report) {
    const title = 'Set an annual withdraw/transfer';
    let step = 0, owner = 'primary', account = 'traditional', early = false, amount = 0, direction = 'toCash';
    while (true) {
      const p = game.portfolio, money = n => formatMoneyDisplay(n, p);
      if (step === 0) {
        const selection = await dialog.menu(
          'A yearly amount you choose, paid automatically each month. It grows with inflation; retirement withdrawals settle additional tax at year-end.',
          [
            ...this.retirementAccountOptions(p),
            { label: 'Standing Savings → Cash transfer', value: 'savings:toCash' },
            { label: 'Standing Cash → Savings transfer', value: 'savings:toSavings' },
            ...(p.retirementWithdrawalPlan ? [{ label: `Stop ${personName(p)} withdrawal (${money(p.retirementWithdrawalPlan.amount)}/yr)`, value: 'stop' }] : []),
            ...(p.spouseRetirementWithdrawalPlan ? [{ label: `Stop ${personName(p, 'spouse')} withdrawal (${money(p.spouseRetirementWithdrawalPlan.amount)}/yr)`, value: 'spouse:stop' }] : []),
            ...(p.savingsTransferPlan ? [{ label: `Stop standing transfer (${money(p.savingsTransferPlan.amount)}/yr)`, value: 'savings:stop' }] : []),
            { label: 'Back', value: null },
          ], { title });
        if (!selection) return;
        if (selection === 'stop') { game.portfolio = setRetirementWithdrawalPlan(p, { amount: 0, owner: 'primary' }); await report(title); return; }
        if (selection === 'spouse:stop') { game.portfolio = setRetirementWithdrawalPlan(p, { amount: 0, owner: 'spouse' }); await report(title); return; }
        if (selection === 'savings:stop') { game.portfolio = setSavingsTransferPlan(p, { amount: 0 }); await report(title); return; }
        if (selection === 'savings:toCash' || selection === 'savings:toSavings') {
          direction = selection.replace('savings:', '');
          amount = p.savingsTransferPlan?.amount || 0;
          step = 10; continue;
        }
        owner = selection.startsWith('spouse:') ? 'spouse' : 'primary';
        account = selection.replace('spouse:', '');
        const current = owner === 'spouse' ? p.spouseRetirementWithdrawalPlan : p.retirementWithdrawalPlan;
        amount = current?.amount || p.annualSpending || 0;
        const access = retirementAccess(p, account, { owner });
        if (access.ageUnknown) {
          await dialog.show('Enter the account owner’s actual age in Family before scheduling withdrawals.', { title });
          continue;
        }
        early = false;
        step = (account === 'traditional' && access.gated) ? 1 : 2;
      } else if (step === 1) {
        const answer = await dialog.menu(`${personName(p, owner)} is under 59½. Start with a 10% early-withdrawal penalty, or wait?`, [
          { label: 'Start now (penalty)', value: 'early' },
          { label: 'Wait for age 59½', value: 'wait' },
          { label: 'Back', value: null },
        ], { title });
        if (!answer) { step = 0; continue; }
        early = answer === 'early';
        step = 2;
      } else if (step === 2) {
        const result = await dialog.prompt('Gross withdrawal each year? ($0 stops it)', {
          title, portfolio: p, defaultValue: String(Math.round(amount)), type: 'money', prefix: '$',
        });
        if (result == null) { step = (account === 'traditional' && retirementAccess(p, account, { owner }).gated) ? 1 : 0; continue; }
        const access = retirementAccess(p, account, { owner });
        game.portfolio = setRetirementWithdrawalPlan(p, { amount: result, account, early, owner });
        const waits = account === 'traditional' && !early && access.gated && result > 0;
        await report(title, result > 0
          ? `${personName(p, owner)} standing gross withdrawal: ${money(result)}/year from the ${account === 'roth' ? 'Roth' : '401(k)'}.` +
            (waits ? ' Starts at the account owner’s age 59½.' : '')
          : 'Standing withdrawal cancelled.');
        return;
      } else if (step === 10) {
        const result = await dialog.prompt(`Standing ${direction === 'toCash' ? 'Savings → Cash' : 'Cash → Savings'} transfer each year? ($0 stops it)`, {
          title, portfolio: p, defaultValue: String(Math.round(amount)), type: 'money', prefix: '$',
        });
        if (result == null) { step = 0; continue; }
        game.portfolio = setSavingsTransferPlan(p, { amount: result, direction });
        await report(title, result > 0
          ? `Standing transfer: ${money(result)}/year from ${direction === 'toCash' ? 'Savings to Cash' : 'Cash to Savings'}.`
          : 'Standing transfer cancelled.');
        return;
      }
    }
  }

  /** Borrow / Loan — asset-backed only. Picks a kind, then re-shows this menu if that sub-flow backs out of its first question. */
  async handleBorrow(game, dialog) {
    const title = 'Borrow / Loan';
    while (true) {
      const kind = await dialog.menu(
        '**Asset-backed borrowing.** No unsecured loans.',
        [
          { label: 'HELOC (home equity)', value: 'heloc' },
          { label: 'Loan against shares', value: 'securities' },
          { label: 'Never mind', value: null },
        ],
        { title }
      );
      if (!kind) return;
      const done = kind === 'heloc' ? await this.handleHeloc(game, dialog) : await this.handleSecuritiesLoan(game, dialog);
      if (done) return;
    }
  }

  /** @returns {boolean} true once the player is done with Borrow entirely; false to re-show the HELOC/shares choice. */
  async handleHeloc(game, dialog) {
    if (!(game.portfolio.homes || []).length) {
      await dialog.show(
        `No homes to borrow against.\nA HELOC needs home equity (${Math.round(HELOC_CLTV * 100)}% CLTV rule).`,
        { title: 'HELOC' }
      );
      return false;
    }
    let step = 0, homeIndex = null, amount = 25000, ratePct = +(HELOC_DEFAULT_RATE * 100).toFixed(2), years = 15;
    while (true) {
      const p = game.portfolio, homes = p.homes || [];
      if (step === 0) {
        const result = await dialog.menu(
          'Which home for the HELOC?',
          [
            ...homes.map((h, i) => ({
              label: `${h.label || h.type} — avail ${formatMoneyDisplay(helocCapacity(p, i))}`,
              value: i,
              subtext: `Value ${formatMoneyDisplay(h.value)} · mtg ${formatMoneyDisplay(h.mortgageOwed || 0)}`,
            })),
            { label: 'Cancel', value: null },
          ],
          { title: 'HELOC' }
        );
        if (result == null) return false;
        const cap = helocCapacity(p, result);
        if (cap <= 0) {
          await dialog.show(
            `No HELOC capacity on this home.\nNeed equity under ${Math.round(HELOC_CLTV * 100)}% CLTV after mortgage and existing HELOCs.`,
            { title: 'HELOC' }
          );
          continue;
        }
        homeIndex = result;
        amount = Math.min(cap, amount);
        step = 1;
      } else if (step === 1) {
        const cap = helocCapacity(p, homeIndex);
        const result = await dialog.prompt(`HELOC amount? Max ${formatMoneyDisplay(cap)}`, {
          title: 'HELOC', defaultValue: String(Math.min(cap, amount)), type: 'money',
        });
        if (result == null) { step = 0; continue; }
        amount = Math.max(0, Math.min(cap, Math.round(result)));
        if (amount <= 0) { await dialog.show('Amount must be greater than zero.', { title: 'HELOC' }); continue; }
        step = 2;
      } else if (step === 2) {
        const defPct = String(+(HELOC_DEFAULT_RATE * 100).toFixed(2));
        const result = await dialog.prompt(
          `Interest rate APR (%)?\nTypical HELOC ~${defPct}% (prime + margin).\nAllowed ${HELOC_RATE_MIN * 100}–${HELOC_RATE_MAX * 100}%.`,
          { title: 'HELOC', defaultValue: String(ratePct), type: 'percent' }
        );
        if (result == null) { step = 1; continue; }
        ratePct = result;
        step = 3;
      } else if (step === 3) {
        const result = await dialog.prompt('Term (years)? (10–30)', { title: 'HELOC', defaultValue: String(years), type: 'number' });
        if (result == null) { step = 2; continue; }
        years = Math.max(10, Math.min(30, Math.round(result || 15)));
        step = 4;
      } else if (step === 4) {
        const rate = Math.max(HELOC_RATE_MIN, Math.min(HELOC_RATE_MAX, (ratePct || 0) / 100));
        const annual = annualLoanPayment({ principal: amount, rate, remainingTerm: years });
        const aprShow = String(+(rate * 100).toFixed(2));
        const ok = await dialog.confirm(
          `HELOC summary:\n` +
            `Principal ${formatMoneyDisplay(amount)} → Cash\n` +
            `APR ${aprShow}% · ${years} yr amortizing\n` +
            `Est. annual P&I ~${formatMoneyDisplay(Math.round(annual))}\n` +
            `Confirm?`,
          { title: 'HELOC', yes: 'Take HELOC', no: 'Cancel', distinctCancel: true }
        );
        if (ok == null) { step = 3; continue; }
        if (!ok) return true;
        game.portfolio = takeHeloc(game.portfolio, { homeIndex, amount, rate, term: years });
        await dialog.show(`HELOC funded ${formatMoneyDisplay(amount)} to Cash at ${aprShow}% APR.`, { title: 'HELOC' });
        return true;
      }
    }
  }

  /** @returns {boolean} true once the player is done with Borrow entirely; false to re-show the HELOC/shares choice. */
  async handleSecuritiesLoan(game, dialog) {
    if (securitiesLoanCapacity(game.portfolio) <= 0) {
      await dialog.show(
        `No capacity for a loan against shares.\n` +
          `Need taxable brokerage; advance rate ${Math.round(SB_LTV * 100)}% minus existing share-backed loans.\n` +
          `(401(k) cannot be pledged.)`,
        { title: 'Loan against shares' }
      );
      return false;
    }
    let step = 0, amount = Math.min(securitiesLoanCapacity(game.portfolio), 10000),
      ratePct = +(SECURITIES_LOAN_DEFAULT_RATE * 100).toFixed(2), years = 10;
    while (true) {
      const p = game.portfolio, cap = securitiesLoanCapacity(p);
      if (step === 0) {
        const result = await dialog.prompt(
          `Loan amount? Max ${formatMoneyDisplay(cap)}\n(${Math.round(SB_LTV * 100)}% of stocks minus existing)`,
          { title: 'Loan against shares', defaultValue: String(Math.min(cap, amount)), type: 'money' }
        );
        if (result == null) return false;
        amount = Math.max(0, Math.min(cap, Math.round(result)));
        if (amount <= 0) { await dialog.show('Amount must be greater than zero.', { title: 'Loan against shares' }); continue; }
        step = 1;
      } else if (step === 1) {
        const defPct = String(+(SECURITIES_LOAN_DEFAULT_RATE * 100).toFixed(2));
        const result = await dialog.prompt(
          `Interest rate APR (%)?\nTypical pledged-asset line ~${defPct}% (usually below HELOC).\nAllowed ${SECURITIES_LOAN_RATE_MIN * 100}–${SECURITIES_LOAN_RATE_MAX * 100}%.`,
          { title: 'Loan against shares', defaultValue: String(ratePct), type: 'percent' }
        );
        if (result == null) { step = 0; continue; }
        ratePct = result;
        step = 2;
      } else if (step === 2) {
        const result = await dialog.prompt('Term (years)? (5–20)', { title: 'Loan against shares', defaultValue: String(years), type: 'number' });
        if (result == null) { step = 1; continue; }
        years = Math.max(5, Math.min(20, Math.round(result || 10)));
        step = 3;
      } else if (step === 3) {
        const rate = Math.max(SECURITIES_LOAN_RATE_MIN, Math.min(SECURITIES_LOAN_RATE_MAX, (ratePct || 0) / 100));
        const annual = annualLoanPayment({ principal: amount, rate, remainingTerm: years });
        const aprShow = String(+(rate * 100).toFixed(2));
        const ok = await dialog.confirm(
          `Loan against shares:\n` +
            `Principal ${formatMoneyDisplay(amount)} → Cash\n` +
            `APR ${aprShow}% · ${years} yr amortizing\n` +
            `Est. annual P&I ~${formatMoneyDisplay(Math.round(annual))}\n` +
            `If stocks fall below maintenance LTV, a margin call may sell shares.\n` +
            `Confirm?`,
          { title: 'Loan against shares', yes: 'Take loan', no: 'Cancel', distinctCancel: true }
        );
        if (ok == null) { step = 2; continue; }
        if (!ok) return true;
        game.portfolio = takeSecuritiesLoan(game.portfolio, { amount, rate, term: years });
        await dialog.show(`Loan against shares funded ${formatMoneyDisplay(amount)} to Cash at ${aprShow}% APR.`, { title: 'Loan against shares' });
        return true;
      }
    }
  }


  /**
   * Portfolio teller — edit income, spending, contributions and setup inputs. Balances
   * (Cash, Savings, stocks, 401(k), Roth) are locked during play: they change only through
   * Decision Room actions (Bank, Stock Broker, Manage Property, Borrow / Loan, purchases).
   */
  async handlePortfolioEditor(game, dialog, diff) {
    const p = game.portfolio;
    while (true) {
      const choice = await dialog.menu(
        'Edit income, spending and setup.\nBalances change only through Decision Room actions.',
        [
          { label: 'Savings interest rate', value: 'savings' },
          { label: 'Salary', value: 'salary' },
          { label: '401(k) / Roth contributions', value: 'retire' },
          { label: 'Retirement age', value: 'retireAge' },
          { label: 'ZIP / tax profile', value: 'tax' },
          { label: 'Difficulty rates', value: 'rates' },
          { label: 'Annual spending', value: 'spend' },
          { label: 'Planning inputs / benefits', value: 'planning' },
          { label: 'Done', value: null },
        ],
        { title: 'Portfolio' }
      );
      if (!choice) return;
      if (choice === 'planning') { await editPlanningInputs(p, dialog, { lockBalances: true }); }
      else if (choice === 'savings') {
        const pct = ((p.savingsRate || 0) * 100).toFixed(2).replace(/\.?0+$/, '');
        const v = await dialog.prompt(`Savings interest rate (balance ${formatMoneyDisplay(p.savings || 0)})`, {
          title: 'Portfolio',
          defaultValue: pct,
          type: 'percent',
        });
        if (v != null) p.savingsRate = Math.max(0, (v || 0) / 100);
      } else if (choice === 'salary') {
        await editFamilyIncome(p, dialog, { title: 'Portfolio' });
      } else if (choice === 'retire') {
        const form = await dialog.form('Contributions (balances are locked during play)', [
          { key: 'kRate', label: `${personName(p)} 401(k) contrib % of salary`, type: 'percent', defaultValue: String(((p.k401ContribRate || 0) * 100).toFixed(2)) },
          { key: 'rothC', label: `${personName(p)} Roth annual contribution`, type: 'money', prefix: '$', defaultValue: String(p.rothAnnualContribution || 0) },
          ...(p.married ? [
            { key: 'spouseKRate', label: `${personName(p, 'spouse')} 401(k) contrib %`, type: 'percent', defaultValue: String((p.spouseK401ContribRate || 0) * 100) },
            { key: 'spouseRothC', label: `${personName(p, 'spouse')} Roth annual contribution`, type: 'money', prefix: '$', defaultValue: String(p.spouseRothAnnualContribution || 0) },
          ] : []),
        ], { title: 'Portfolio', portfolio: p });
        if (form) {
          p.k401ContribRate = Math.max(0, Math.min(1, (form.kRate || 0) / 100));
          p.has401k = (p.k401Balance || 0) > 0 || p.k401ContribRate > 0;
          p.rothAnnualContribution = Math.max(0, form.rothC || 0);
          p.hasRoth = (p.rothBalance || 0) > 0 || p.rothAnnualContribution > 0;
          if (p.married) {
            p.spouseK401ContribRate = Math.max(0, Math.min(1, (form.spouseKRate || 0) / 100));
            p.spouseRothAnnualContribution = Math.max(0, form.spouseRothC || 0);
            p.spouseHas401k = (p.spouseK401Balance || 0) > 0 || p.spouseK401ContribRate > 0;
            p.spouseHasRoth = (p.spouseRothBalance || 0) > 0 || p.spouseRothAnnualContribution > 0;
          }
        }
      } else if (choice === 'retireAge') {
        await editRetirementAges(p, dialog, { title: 'Portfolio' });
      } else if (choice === 'tax') {
        const form = await dialog.form('Tax profile', [
          { key: 'zip', label: 'ZIP (blank = national avg)', type: 'text', defaultValue: p.zip || '' },
        ], { title: 'Portfolio' });
        if (form) {
          p.zip = String(form.zip || '').replace(/\D/g, '').slice(0, 5);
        }
        await dialog.show(`Filing status: ${p.married ? 'Married Filing Jointly' : 'Single'}.\nUse the Family window to add a spouse and their financial details.`, { title: 'Portfolio' });
      } else if (choice === 'rates') {
        const o = p.rateOverrides || {};
        const form = await dialog.form(
          'Model rates (override difficulty defaults)',
          [
            { key: 'inf', label: 'Inflation %', type: 'percent', defaultValue: String(((o.inflation ?? diff.inflation) * 100).toFixed(2)) },
            { key: 'eq', label: 'Equity growth %', type: 'percent', defaultValue: String(((o.equityReturn ?? diff.equityReturn) * 100).toFixed(2)) },
            { key: 'vol', label: 'Equity volatility %', type: 'percent', defaultValue: String(((o.equityVolatility ?? diff.equityVolatility) * 100).toFixed(2)) },
            { key: 'mort', label: 'Mortgage rate %', type: 'percent', defaultValue: String(((o.mortgageRate ?? diff.mortgageRate) * 100).toFixed(2)) },
          ],
          { title: 'Portfolio' }
        );
        if (form) {
          p.rateOverrides = {
            ...(p.rateOverrides || {}),
            inflation: (form.inf || 0) / 100,
            equityReturn: (form.eq || 0) / 100,
            equityVolatility: (form.vol || 0) / 100,
            mortgageRate: (form.mort || 0) / 100,
          };
        }
      } else if (choice === 'spend') {
        const v = await dialog.prompt('Annual living costs (exclude housing, taxes, children, contributions)', {
          title: 'Portfolio',
          defaultValue: String(p.annualSpending || 0),
          type: 'money',
          prefix: '$',
        });
        if (v != null) {
          p.annualSpending = Math.max(0, v);
          p.spendingBreakdown = { other: p.annualSpending };
        }
      }
    }
  }

  /** Manage Property — list homes/rent, then Buy, Sell, Start/End a Lease, Find a Tenant. */
  async handleManageProperty(game, dialog, diff) {
    const title = 'Manage Property';
    while (true) {
      const p = game.portfolio, money = n => formatMoneyDisplay(n, p), homes = p.homes || [];
      const homeLines = homes.map(h => `**${h.label || h.type}** ${money(h.value)}` +
        (h.type === 'investment' ? ` · Revenue ${money((h.monthlyRevenue || 0) * 12)}/yr` : ''));
      if (p.housing === 'rent') homeLines.push(`**Renting** ${money((p.monthlyRent || 0) * 12)}/yr`);
      if (!homeLines.length) homeLines.push('No property owned.');
      const choice = await dialog.menu(
        `**Make Real Estate Decisions**\n${homeLines.join('\n')}`,
        [
          { label: 'Buy a home', value: 'buy' },
          { label: 'Sell a home', value: 'sell' },
          { label: p.housing === 'rent' ? 'End a Lease' : 'Start a Lease', value: 'lease' },
          { label: 'Find a Tenant', value: 'tenant' },
          { label: 'Done', value: null },
        ],
        { title }
      );
      if (!choice) return;
      if (choice === 'buy') await this.handleBuyHome(game, dialog, diff);
      else if (choice === 'sell') await this.handleSellHome(game, dialog);
      else if (choice === 'lease') await this.handleLease(game, dialog);
      else if (choice === 'tenant') await this.handleFindTenant(game, dialog);
    }
  }

  /** Buy a Home — mirrors Setup's own home questions (incl. naming it), plus a down payment since this is a fresh purchase. */
  async handleBuyHome(game, dialog, diff) {
    const title = 'Buy a Home';
    if ((game.portfolio.homes || []).length >= 5) {
      await dialog.show('You already hold 5 properties.', { title });
      return;
    }
    let step = 0, type = 'primary', name = '', value = 400000, down = 80000,
      ratePct = +((diff.mortgageRate || .065) * 100).toFixed(2), term = 30,
      propTax = Math.round(400000 * defaultPropertyTaxRate(game.portfolio.zip)), revenue = 0;
    while (true) {
      const p = game.portfolio;
      if (step === 0) {
        const result = await dialog.menu('Property type?', [
          { label: 'Primary', value: 'primary' },
          { label: 'Secondary', value: 'secondary' },
          { label: 'Investment', value: 'investment' },
          { label: 'Back', value: null },
        ], { title });
        if (!result) return;
        if (result === 'primary' && (p.homes || []).some(h => h.type === 'primary')) {
          await dialog.show('You already own a primary home. Sell it first, or buy this as a Secondary or Investment property.', { title });
          continue;
        }
        type = result; name = name || HOME_TYPES[type]?.label || 'Home';
        step = 1;
      } else if (step === 1) {
        const result = await dialog.form(`${HOME_TYPES[type]?.label || 'Home'} details`, [
          { key: 'name', label: 'Name this property', type: 'text', defaultValue: name },
          { key: 'value', label: 'Purchase price', type: 'money', defaultValue: String(value) },
        ], { title });
        if (!result) { step = 0; continue; }
        name = String(result.name || '').trim().slice(0, 28) || HOME_TYPES[type]?.label || 'Home';
        value = Math.max(0, result.value || 0);
        propTax = Math.round(value * defaultPropertyTaxRate(p.zip));
        step = 2;
      } else if (step === 2) {
        const result = await dialog.prompt('Down payment?', {
          title, defaultValue: String(Math.min(value, down || Math.round(value * .2))), type: 'money',
        });
        if (result == null) { step = 1; continue; }
        down = Math.max(0, Math.min(value, result));
        step = 3;
      } else if (step === 3) {
        const fields = [
          { key: 'rate', label: 'Mortgage rate %', type: 'percent', defaultValue: String(ratePct) },
          { key: 'term', label: 'Term (years)', type: 'number', defaultValue: String(term) },
          { key: 'propTax', label: 'Annual property tax', type: 'money', defaultValue: String(propTax),
            subtitle: p.zip ? `Default from ZIP ${p.zip}` : 'Default from national average' },
        ];
        if (type === 'investment') fields.push({ key: 'revenue', label: 'Monthly rental revenue', type: 'money', defaultValue: String(revenue) });
        const result = await dialog.form('Financing', fields, { title });
        if (!result) { step = 2; continue; }
        ratePct = result.rate; term = Math.max(1, Math.round(result.term ?? 30));
        propTax = Math.max(0, result.propTax || 0); revenue = Math.max(0, result.revenue || 0);
        step = 4;
      } else if (step === 4) {
        const rate = Math.max(0, (ratePct || 0) / 100), closing = Math.round(value * .02);
        const monthly = monthlyPayment(value - down, rate, term * 12);
        const confirmed = await dialog.confirm(
          `Buy ${name} for ${formatMoneyDisplay(value, p)}?\n` +
          `Down payment: ${formatMoneyDisplay(down, p)} · Closing costs (2%): ${formatMoneyDisplay(closing, p)}\n` +
          `Mortgage: ${formatMoneyDisplay(value - down, p)} @ ${ratePct}% for ${term} yr (~${formatMoneyDisplay(Math.round(monthly), p)}/mo)`,
          { title, yes: 'Buy', no: 'Cancel', distinctCancel: true }
        );
        if (confirmed == null) { step = 3; continue; }
        if (!confirmed) return;
        game.portfolio = buyHome(p, {
          type, value, downPayment: down, rate, term, label: name,
          propertyTaxRate: value > 0 ? propTax / value : defaultPropertyTaxRate(p.zip),
          annualPropertyTax: propTax, monthlyRevenue: type === 'investment' ? revenue : 0,
        });
        if (type === 'primary' && game.portfolio.lastTransaction?.accepted !== false) game.portfolio.housing = 'own';
        await dialog.show(transactionReason(game.portfolio.lastTransaction, game.portfolio) || `${name} purchased; 2% closing costs included.`, { title });
        return;
      }
    }
  }

  /** Sell a Home — one comprehensive summary (price, costs, liens, gain, net cash) instead of disconnected yes/no questions. */
  async handleSellHome(game, dialog) {
    const title = 'Sell a Home';
    if (!(game.portfolio.homes || []).length) {
      await dialog.show('No homes to sell.', { title });
      return;
    }
    let step = 0, index = null, exclusion = false;
    while (true) {
      const p = game.portfolio, home = index != null ? p.homes[index] : null;
      if (step === 0) {
        const result = await dialog.menu('Sell which home?', [
          ...p.homes.map((h, i) => ({
            label: `${h.label || h.type} — ${formatMoneyDisplay(h.value, p)}`, value: i,
            subtext: h.mortgageOwed > 0 ? `Mortgage ${formatMoneyDisplay(h.mortgageOwed, p)}` : undefined,
          })),
          { label: 'Cancel', value: null },
        ], { title });
        if (result == null) return;
        if (p.homes[result].basisKnown === false) {
          await dialog.show('Enter this property’s verified purchase cost (basis) in Portfolio → Property basis / costs before selling it.', { title });
          return;
        }
        index = result;
        step = p.homes[index].type === 'primary' ? 1 : 2;
      } else if (step === 1) {
        const result = await dialog.confirm(
          'Have you owned and lived in this home as your primary residence for at least 2 of the last 5 years?\n' +
          'This qualifies the sale for a tax-free gain exclusion (up to $250,000 single / $500,000 married).',
          { title, yes: 'Yes', no: 'No / not sure', distinctCancel: true }
        );
        if (result == null) { step = 0; continue; }
        exclusion = result;
        step = 2;
      } else if (step === 2) {
        const result = sellHome(p, index, { exclusionEligible: exclusion === true });
        if (result.lastTransaction?.accepted === false) {
          await dialog.show(transactionReason(result.lastTransaction, p), { title });
          return;
        }
        const tx = result.transactions[result.transactions.length - 1];
        const confirmed = await dialog.confirm(
          `Sell ${home.label || home.type} for ${formatMoneyDisplay(home.value, p)}?\n` +
          `Selling costs (6%): ${formatMoneyDisplay(tx.sellingCosts, p)}\n` +
          (tx.liens > 0 ? `Mortgage/lien payoff: ${formatMoneyDisplay(tx.liens, p)}\n` : '') +
          `Taxable gain: ${formatMoneyDisplay(tx.gain, p)}\n` +
          `Net cash: ${formatMoneyDisplay(tx.netCash, p)}`,
          { title, yes: 'Sell', no: 'Cancel', distinctCancel: true }
        );
        if (confirmed == null) { step = home.type === 'primary' ? 1 : 0; continue; }
        if (!confirmed) return;
        game.portfolio = result;
        await dialog.show('Sold after liens and 6% selling costs. Taxable gain enters this year’s tax record.', { title });
        return;
      }
    }
  }

  /** Start/End a Lease — the player's own housing status (own vs. rent), kept consistent with whether a primary home exists. */
  async handleLease(game, dialog) {
    const title = 'Manage Property';
    const p = game.portfolio;
    const hasPrimary = (p.homes || []).some(h => h.type === 'primary');
    if (p.housing === 'rent') {
      if (!hasPrimary) {
        await dialog.show('You have no primary home to move into. Buy one first with "Buy a home".', { title });
        return;
      }
      const confirmed = await dialog.confirm('End your lease and move into your primary home?\nRent payments stop.', { title, yes: 'End lease', no: 'Cancel' });
      if (!confirmed) return;
      p.housing = 'own';
      await dialog.show('Lease ended; rent payments stop.', { title });
    } else {
      if (hasPrimary) {
        await dialog.show('You own a primary home. Sell it first with "Sell a home" before starting a lease.', { title });
        return;
      }
      const result = await dialog.prompt('Monthly rent?', { title, defaultValue: String(p.monthlyRent || 1500), type: 'money' });
      if (result == null) return;
      p.monthlyRent = Math.max(0, result);
      p.housing = 'rent';
      await dialog.show(`Lease started at ${formatMoneyDisplay(p.monthlyRent, p)}/mo.`, { title });
    }
  }

  /** Find a Tenant — set or replace an investment property's rental revenue and expected vacancy. */
  async handleFindTenant(game, dialog) {
    const title = 'Manage Property';
    const p = game.portfolio, rentable = (p.homes || []).filter(h => h.type === 'investment');
    if (!rentable.length) {
      await dialog.show('No investment properties to rent out. Buy one first with "Buy a home".', { title });
      return;
    }
    const index = await dialog.menu('Find a tenant for which property?', [
      ...rentable.map(h => ({
        label: `${h.label || h.type} — ${h.monthlyRevenue ? formatMoneyDisplay(h.monthlyRevenue, p) + '/mo currently' : 'vacant'}`,
        value: p.homes.indexOf(h),
      })),
      { label: 'Cancel', value: null },
    ], { title });
    if (index == null) return;
    const home = p.homes[index];
    let step = 0, rent = home.monthlyRevenue || Math.round(home.value * .005), vacancyPct = (home.vacancyRate ?? .05) * 100;
    while (true) {
      if (step === 0) {
        const result = await dialog.prompt(`Monthly rent for ${home.label || home.type}?`, { title, defaultValue: String(rent), type: 'money' });
        if (result == null) return;
        rent = Math.max(0, result);
        step = 1;
      } else if (step === 1) {
        const result = await dialog.prompt('Expected vacancy rate %?', {
          title, defaultValue: String(+vacancyPct.toFixed(1)), type: 'percent',
          subtitle: 'Share of the year this unit sits empty between tenants.',
        });
        if (result == null) { step = 0; continue; }
        vacancyPct = Math.max(0, Math.min(100, result));
        home.monthlyRevenue = rent;
        home.vacancyRate = vacancyPct / 100;
        await dialog.show(`Tenant found: ${formatMoneyDisplay(rent, p)}/mo (${vacancyPct.toFixed(1)}% vacancy).`, { title });
        return;
      }
    }
  }

  /** Stock Broker — portfolio summary (+/- since game start), Buy, Sell, and the standing stock-sale plan. */
  async handleStockBroker(game, dialog, diff) {
    const title = 'Stock Broker';
    while (true) {
      const p = game.portfolio, now = p.stocksTotal || 0, start = p.initialStocksTotal;
      const change = start > 0 ? ` (${now >= start ? '+' : ''}${(((now - start) / start) * 100).toFixed(1)}% since start)` : '';
      const choice = await dialog.menu(
        `**Stock Portfolio:** ${formatMoneyDisplay(now, p)}${change}`,
        [
          { label: 'Buy stock', value: 'buy' },
          { label: 'Sell stock', value: 'sell' },
          { label: 'Set a standing stock sale', value: 'plan' },
          { label: 'Done', value: null },
        ],
        { title }
      );
      if (!choice) return;
      if (choice === 'buy') await this.handleBuyStock(game, dialog);
      else if (choice === 'sell') await this.handleSellStock(game, dialog, diff);
      else if (choice === 'plan') {
        const report = async (heading, description = null) => {
          const t = game.portfolio.lastTransaction || {};
          await dialog.show(t.accepted === false ? transactionReason(t, game.portfolio) : description || t.description || 'Done.', { title: heading });
        };
        await this.handleStockSalePlanSetup(game, dialog, report);
      }
    }
  }

  /** Buy Stock — broad market shares, or a specific ticker (mirrors Setup's ticker/lookup/growth-vol questions). */
  async handleBuyStock(game, dialog) {
    const title = 'Buy Stock';
    const mode = await dialog.menu('Buy broad market shares, or a specific stock?', [
      { label: 'Broad market shares', value: 'market' },
      { label: 'Specific stock (ticker)', value: 'ticker' },
      { label: 'Back', value: null },
    ], { title });
    if (!mode) return;
    if (mode === 'ticker') { await this.handleBuySpecificStock(game, dialog); return; }
    const amt = await dialog.prompt('Buy how much?', { title, defaultValue: '1000', type: 'money' });
    if (amt == null) return;
    game.portfolio = buyStock(game.portfolio, Math.max(0, amt));
    await dialog.show(transactionReason(game.portfolio.lastTransaction, game.portfolio) || 'Broad-market shares purchased; basis updated.', { title });
  }

  /** Buy a specific ticker — same questions as Custom Setup's specific-stock flow. */
  async handleBuySpecificStock(game, dialog) {
    const title = 'Buy Stock';
    const diff = getDifficulty(game.portfolio.difficulty || 'standard');
    const defGrowth = ((diff.equityReturn) * 100).toFixed(2).replace(/\.?0+$/, '');
    const defVol = ((diff.equityVolatility) * 100).toFixed(2).replace(/\.?0+$/, '');
    let step = 0, ticker = '', online = true, price = 0, onlineNote = '', historyNote = '',
      dollars = 1000, growthPct = defGrowth, volPct = defVol;
    const lookupOnline = async (tk) => {
      let loading = false;
      const result = await lookupStockWithLoading(tk, {
        wantHistory: true,
        onLoading: () => { loading = true; dialog.showLoading('Loading…'); },
        onLoadingDone: () => { if (loading) dialog.hideLoading(); },
      });
      if (loading) dialog.hideLoading();
      return result;
    };
    while (true) {
      if (step === 0) {
        const result = await dialog.prompt('Stock ticker', { title, defaultValue: ticker });
        if (result == null) return;
        ticker = String(result || '').trim().toUpperCase();
        if (!ticker) { await dialog.show('Enter a ticker symbol.', { title }); continue; }
        step = 1;
      } else if (step === 1) {
        const result = await dialog.confirm('Look up this ticker online?', { title, yes: 'Yes', no: 'No, enter manually', distinctCancel: true });
        if (result == null) { step = 0; continue; }
        online = result;
        step = 2;
      } else if (step === 2) {
        price = 0; onlineNote = ''; historyNote = '';
        if (online) {
          const look = await lookupOnline(ticker);
          if (look.ok && look.price > 0) {
            price = look.price;
            onlineNote = `Online (${look.source})`;
            if (Number.isFinite(look.growth) && Number.isFinite(look.volatility) && look.historyYears >= 2) {
              historyNote = `Estimated from ${look.historyYears} yrs of price history — not a guarantee of future returns; edit freely.`;
            }
          } else {
            await dialog.show(look.error || 'Lookup failed. Enter price manually.', { title });
            online = false;
          }
        }
        if (!online || !(price > 0)) {
          const result = await dialog.prompt('Current stock price', {
            title, defaultValue: price > 0 ? String(price) : '', type: 'money',
            subtitle: onlineNote || 'Enter per-share price',
          });
          if (result == null) { step = 1; continue; }
          price = Math.max(0, result);
        } else {
          await dialog.show(`${ticker} @ ${formatMoneyDisplay(price)}${onlineNote ? '\n' + onlineNote : ''}`, { title });
        }
        if (!(price > 0)) { await dialog.show('Price must be greater than zero.', { title }); step = 1; continue; }
        step = 3;
      } else if (step === 3) {
        const result = await dialog.prompt('Amount to invest', { title, defaultValue: String(dollars), type: 'money', prefix: '$' });
        if (result == null) { step = 2; continue; }
        if (!(result > 0)) { await dialog.show('Enter a positive purchase amount.', { title }); continue; }
        dollars = Math.max(0, result);
        step = 4;
      } else if (step === 4) {
        const result = await dialog.form('Expected return model', [
          { key: 'growth', label: 'Growth % per year', type: 'percent', defaultValue: String(growthPct) },
          {
            key: 'vol', label: 'Volatility %', type: 'percent', defaultValue: String(volPct),
            subtitle: historyNote || 'The amount the gains fluctuate year after year.',
          },
        ], { title });
        if (!result) { step = 3; continue; }
        growthPct = result.growth; volPct = result.vol;
        step = 5;
      } else if (step === 5) {
        const confirmed = await dialog.confirm(
          `Buy ${formatMoneyDisplay(dollars)} of ${ticker} @ ${formatMoneyDisplay(price)}?\nGrowth ${growthPct}% · Volatility ${volPct}%`,
          { title, yes: 'Buy', no: 'Cancel', distinctCancel: true }
        );
        if (confirmed == null) { step = 4; continue; }
        if (!confirmed) return;
        game.portfolio = buyStock(game.portfolio, dollars, {
          ticker, price, assetClass: 'equity', growth: (growthPct || 0) / 100, volatility: (volPct || 0) / 100,
        });
        await dialog.show(transactionReason(game.portfolio.lastTransaction, game.portfolio) || `Bought ${formatMoneyDisplay(dollars)} of ${ticker}.`, { title });
        return;
      }
    }
  }

  /**
   * Sell Stock — selects a holding when specific stocks exist (shows the game's current
   * projected price per share, overridable), with linked $/% fields on one page.
   */
  async handleSellStock(game, dialog, diff) {
    const title = 'Sell Stock';
    if (!((game.portfolio.stocksTotal || 0) > 0)) {
      await dialog.show('No stock to sell.', { title });
      return;
    }
    let step = 0, holdingId = null, holding = null, price = 0, dollars = 0;
    while (true) {
      const p = game.portfolio;
      if (step === 0) {
        const sellable = (p.stocksHoldings || []).filter(h => !h.illiquid && h.value > 0);
        if (sellable.length > 1 || (sellable.length === 1 && sellable[0].ticker !== 'MARKET')) {
          const result = await dialog.menu('Sell which holding?', [
            ...sellable.map(h => ({
              label: `${h.ticker} — ${formatMoneyDisplay(h.value, p)}`, value: h.id,
              subtext: `${(h.shares || 0).toFixed(2)} sh @ ${formatMoneyDisplay(h.price || 0, p)}`,
            })),
            { label: 'Entire portfolio (proportional)', value: '__all__' },
            { label: 'Cancel', value: null },
          ], { title });
          if (!result) return;
          holdingId = result === '__all__' ? null : result;
        } else holdingId = null;
        holding = holdingId ? p.stocksHoldings.find(h => h.id === holdingId) : null;
        price = holding ? (holding.price || 0) : 0;
        step = holding ? 1 : 2;
      } else if (step === 1) {
        const result = await dialog.prompt(`${holding.ticker} current price (per share)`, {
          title, defaultValue: String(price), type: 'money',
          subtitle: 'The game’s current projected price; override to use a different one.',
        });
        if (result == null) { step = 0; continue; }
        price = Math.max(.01, result);
        step = 2;
      } else if (step === 2) {
        const available = holding ? holding.value : (p.stocksTotal || 0);
        dollars = Math.min(available, dollars || Math.round(available * .1));
        const result = await dialog.form(
          holding
            ? `Selling ${holding.ticker} — held ${formatMoneyDisplay(available, p)} (${(holding.shares || 0).toFixed(2)} sh @ ${formatMoneyDisplay(price, p)})`
            : `Held: ${formatMoneyDisplay(available, p)}`,
          [
            { key: 'dollars', label: 'Sell $ amount', type: 'money', defaultValue: String(dollars) },
            { key: 'percent', label: 'Sell % of holding', type: 'percent', defaultValue: String(available > 0 ? (dollars / available * 100).toFixed(1) : '0') },
          ],
          {
            title, portfolio: p,
            onFieldChange: (fields, i) => {
              const availDisplay = toDisplayMoney(available, p);
              if (i === 0) {
                const d = Math.max(0, Math.min(availDisplay, parseMoneyInput(fields[0].value)));
                fields[1].value = availDisplay > 0 ? ((d / availDisplay) * 100).toFixed(1) : '0';
              } else {
                const pct = Math.max(0, Math.min(100, parseFloat(fields[1].value) || 0));
                fields[0].value = formatMoneyInput(String(Math.round(availDisplay * pct / 100)));
              }
            },
          }
        );
        if (!result) { step = holding ? 1 : 0; continue; }
        dollars = Math.max(0, Math.min(available, Number(result.dollars) || 0));
        if (!(dollars > 0)) { await dialog.show('Enter a positive amount to sell.', { title }); continue; }
        step = 3;
      } else if (step === 3) {
        // dollars/percent were chosen against the tracked price, so that fraction of the
        // holding's shares/basis is what liquidates; priceOverrideRatio only rescales the
        // cash (and gain) the sale credits, via sellStock -- never the fraction removed.
        const priceOverrideRatio = holding && price !== (holding.price || 0) && holding.price > 0
          ? price / holding.price : undefined;
        const result = sellStock(game.portfolio, { proceeds: dollars, holdingId, priceOverrideRatio }, diff);
        if (result.state.lastTransaction?.accepted === false) {
          await dialog.show(transactionReason(result.state.lastTransaction, p), { title });
          step = 2; continue;
        }
        const confirmed = await dialog.confirm(
          'Sell ' + formatMoneyDisplay(result.proceeds) + '?\nBasis removed: ' + formatMoneyDisplay(result.basis) +
          '\nRealized gain/loss: ' + formatMoneyDisplay(result.gains) +
          '\nEstimated tax: ' + formatMoneyDisplay(result.tax.total) + '\nNet cash: ' + formatMoneyDisplay(result.netCash),
          { title: 'Holdings sale', yes: 'Sell', no: 'Cancel', distinctCancel: true });
        if (confirmed == null) { step = 2; continue; }
        if (!confirmed) return;
        game.portfolio = result.state;
        await dialog.show('Sale posted; estimated tax is credited at year-end.', { title });
        return;
      }
    }
  }

  render(ctx, game) {
    // Room is narrower than the 16:9 playfield. Center it; negative cam
    // insets the walls. Out-of-map tiles are solid, so the side void is not walkable.
    const rawCamX = this.world.width <= VIEW_W
      ? (this.world.width - VIEW_W) / 2
      : Math.max(0, Math.min(this.world.width - VIEW_W, this.player.x + 6 - VIEW_W / 2));
    const rawCamY = this.world.height <= VIEW_H
      ? (this.world.height - VIEW_H) / 2
      : Math.max(0, Math.min(this.world.height - VIEW_H, this.player.y - VIEW_H / 2));
    const camX = Math.round(rawCamX * WORLD_SCALE) / WORLD_SCALE;
    const camY = Math.round(rawCamY * WORLD_SCALE) / WORLD_SCALE;

    // Integer-scale the pixel world under the HUD. UI stays in frame pixels.
    ctx.save();
    ctx.setTransform(WORLD_SCALE, 0, 0, WORLD_SCALE, 0, HUD_H);
    ctx.imageSmoothingEnabled = false;
    drawWorld(ctx, this.world, camX, camY, this.animTime);
    ctx.save();
    ctx.translate(-camX, -camY);
    // Spouse first, so the player is always drawn over them.
    if (this.spouse && hasSpouseNpc(game.portfolio)) this.spouse.draw(ctx, game.portfolio);
    this.player.draw(
      ctx,
      game.portfolio.hairColor,
      game.portfolio.hairLength,
      game.portfolio.age,
      game.portfolio.shirtColor
    );
    ctx.restore();
    ctx.restore();

    this.hud.draw(ctx, game.portfolio);

    if (this.prompt && !this.locked) {
      drawActionPrompt(ctx, this.prompt.label);
    }
  }
}
