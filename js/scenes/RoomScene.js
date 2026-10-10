import { editPlanningInputs } from './PlanningInputs.js';
import { editSpouseIdentity, editFamilyIncome, editRetirementAges, editRetirementAccounts, personName } from './FamilyInputs.js';
import { ensureHoldings, syncBook, post } from '../finance/Books.js';
import { childCostLabel } from '../data/stateChildCosts.js';
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
} from '../finance/Engine.js';
import { getDifficulty } from '../finance/Difficulty.js';
import { commitRoomDecisions, currentNode, westReturnHallway, jumpToHallwayNode } from '../state/GameState.js';
import { autoSave } from '../state/SaveSystem.js';
import { formatMoneyDisplay } from '../render/Dialog.js';
import { setMoneyContext } from '../finance/DollarBasis.js';
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
      const mode = await dialog.menu(
        'Real estate window',
        [
          { label: 'Buy a home', value: 'buy' },
          { label: 'Sell a home', value: 'sell' },
          { label: 'Never mind', value: null },
        ],
        { title: 'Buy/Sell Home' }
      );
      if (mode === 'buy') {
        if ((p.homes || []).length >= 5) {
          await dialog.show('You already hold 5 properties.', { title: 'Buy/Sell Home' });
          return;
        }
        const type = await dialog.menu(
          'Property type?',
          [
            { label: 'Primary', value: 'primary' },
            { label: 'Secondary', value: 'secondary' },
            { label: 'Investment', value: 'investment' },
          ],
          { title: 'Buy Home' }
        );
        if (type == null) return;
        const value = await dialog.prompt('Purchase price ($)?', {
          title: 'Buy Home',
          defaultValue: '400000',
          type: 'money',
        });
        if (value == null) return;
        const down = await dialog.prompt('Down payment ($)?', {
          title: 'Buy Home',
          defaultValue: String(Math.round(value * 0.2)),
          type: 'money',
        });
        if (down == null) return;
        const ratePct = await dialog.prompt('Mortgage rate (%)?', {
          title: 'Buy Home',
          defaultValue: '6.5',
          type: 'percent',
        });
        if (ratePct == null) return;
        const term = await dialog.prompt('Term (years)?', {
          title: 'Buy Home',
          defaultValue: '30',
          type: 'number',
        });
        if (term == null) return;
        game.portfolio = buyHome(p, {
          type,
          value,
          downPayment: down || 0,
          rate: (ratePct || 0) / 100,
          term: term ?? 30,
          label: HOME_TYPES[type]?.label,
        });
        await dialog.show(transactionReason(game.portfolio.lastTransaction, game.portfolio) || 'Home purchased; 2% closing costs included.', { title: 'Buy Home' });
      } else if (mode === 'sell') {
        if (!p.homes?.length) {
          await dialog.show('No homes to sell.', { title: 'Sell Home' });
          return;
        }
        const idx = await dialog.menu(
          'Sell which home?',
          [
            ...p.homes.map((h, i) => ({
              label: `${h.label || h.type} — ${formatMoneyDisplay(h.value)}`,
              value: i,
            })),
            { label: 'Cancel', value: null },
          ],
          { title: 'Sell Home' }
        );
        if (idx == null) return;
        const helocLien = (p.otherLoans || [])
          .filter((l) => l.type === 'heloc' && l.homeIndex === idx)
          .reduce((s, l) => s + (l.principal || 0), 0);
        if (helocLien > 0) {
          const okSell = await dialog.confirm(
            `This home has a HELOC lien of ${formatMoneyDisplay(helocLien)}.\nSale proceeds will pay it off first. Continue?`,
            { title: 'Sell Home', yes: 'Sell', no: 'Cancel' }
          );
          if (!okSell) return;
        }
        const exclusion = p.homes[idx].type === 'primary' ? await dialog.confirm('Eligible for the primary-home gain exclusion? Confirm ownership/use tests from tax records.', {title:'Home sale tax'}) : false;
        game.portfolio = sellHome(game.portfolio, idx, { exclusionEligible: exclusion === true });
        await dialog.show(
          transactionReason(game.portfolio.lastTransaction, game.portfolio) || 'Sold after liens and 6% selling costs. Taxable gain enters this year’s tax record.',
          { title: 'Sell Home' }
        );
      }
    } else if (action === 'stock') {
      const mode = await dialog.menu(
        `Portfolio: ${formatMoneyDisplay(p.stocksTotal || 0)}`,
        [
          { label: 'Buy stock', value: 'buy' },
          { label: 'Sell stock', value: 'sell' },
          { label: 'Never mind', value: null },
        ],
        { title: 'Buy/Sell Stock' }
      );
      if (mode === 'buy') {
        const amt = await dialog.prompt('Buy how much ($)?', {
          title: 'Buy Stock',
          defaultValue: '1000',
          type: 'money',
        });
        if (amt == null) return;
        game.portfolio = buyStock(game.portfolio, Math.max(0, amt));
        await dialog.show(transactionReason(game.portfolio.lastTransaction, game.portfolio) || 'Broad-market shares purchased; basis updated.', { title: 'Buy Stock' });
      } else if (mode === 'sell') {
        await this.handleSellStock(game, dialog, diff);
      }
    } else if (action === 'job') {
      const owner = p.married ? await dialog.menu('Whose employment?', [
        { label: personName(p), value: 'primary' },
        { label: personName(p, 'spouse'), value: 'spouse' },
        { label: 'Back', value: null },
      ], { title: 'Job / Retire' }) : 'primary';
      if (!owner) return;
      const salaryKey = owner === 'spouse' ? 'spouseSalary' : 'salary';
      const mode = await dialog.menu(
        `${personName(p, owner)} career window`,
        [
          { label: 'Leave job (salary → $0)', value: 'leave' },
          { label: 'Start / resume job', value: 'start' },
          { label: 'Retire', value: 'retire' },
          { label: 'Never mind', value: null },
        ],
        { title: 'Job / Retire' }
      );
      if (!mode) return;
      if (mode === 'start') {
        const sal = await dialog.prompt(`${personName(p, owner)} new annual gross salary`, {
          title: 'Start Job',
          defaultValue: String(p[salaryKey] || 50000),
          type: 'money',
        });
        if (sal == null) return;
        let retirementAge = p[ownerKey('retirementAge', owner)] ?? 65;
        const age = ownerAge(p, owner);
        if (age != null && age >= retirementAge) {
          while (true) {
            const answer = await dialog.prompt(`${personName(p, owner)} planned retirement age for this job`, {
              title: 'Start Job', type: 'number', defaultValue: String(Math.ceil(age + 1)),
              subtitle: 'Choose a future age so the model includes this new salary.',
            });
            if (answer == null) return;
            if (Number(answer) > age && Number(answer) <= 110) {
              retirementAge = Number(answer);
              break;
            }
            await dialog.show('Choose a retirement age later than your current age (up to 110).', { title: 'Start Job' });
          }
        }
        game.portfolio = setEmployment(game.portfolio, 'start', { owner });
        game.portfolio[ownerKey('retirementAge', owner)] = retirementAge;
        game.portfolio[salaryKey] = Math.max(0, sal);
        game.portfolio[owner === 'spouse' ? 'spouseEmployed' : 'employed'] = sal > 0;
        const peakKey = owner === 'spouse' ? 'spousePeakSalary' : 'peakSalary';
        game.portfolio[peakKey] = Math.max(game.portfolio[peakKey] || 0, sal);
      } else {
        game.portfolio = setEmployment(game.portfolio, mode, { owner });
      }
      await dialog.show('Employment updated.', { title: 'Job / Retire' });
    } else if (action === 'kid') {
      await this.handleFamily(game, dialog);
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

  async handleFamily(game, dialog) {
    const p = game.portfolio;
    const choice = await dialog.menu('Family decisions', [
      { label: 'Have a kid', value: 'kid' },
      { label: p.married ? 'Spouse details' : 'Get married', value: 'marry' },
      { label: 'Child Care', value: 'care' },
      { label: 'Back', value: null },
    ], { title: 'Family' });
    if (choice === 'kid') {
      if ((p.kids || []).length >= 4) {
        await dialog.show('Four kids is the max for this ledger.', { title: 'Have a kid' });
        return;
      }
      const name = await dialog.prompt("Child's name?", { title: 'Have a kid', defaultValue: `Child ${(p.kids || []).length + 1}` });
      if (name == null) return;
      game.portfolio = addKid(p, { name: name || 'Child', age: 0 });
      await dialog.show(`${name || 'Child'} joins the timeline at age 0. Annual child costs use ${childCostLabel(p.zip)} until age 18.`, { title: 'Family' });
    } else if (choice === 'marry') {
      const draft = { ...p, married: true, filingStatus: 'married' };
      if (!(await editSpouseIdentity(draft, dialog))) return;
      if (!p.married) {
        if (!(await editFamilyIncome(draft, dialog, { title: 'Family' }))) return;
        if (!(await editRetirementAges(draft, dialog, { title: 'Family' }))) return;
        if (!(await editRetirementAccounts(draft, dialog, { owner: 'spouse', title: 'Family' }))) return;
      }
      draft.lastTransaction = { accepted: true, description: `${personName(draft, 'spouse')} ${p.married ? 'details updated' : 'joins the household'}. Cash and Savings are joint accounts.` };
      draft.milestones = [...(p.milestones || []), { year: p.year, age: p.age, kind: p.married ? 'spouseDetails' : 'marriage', message: draft.lastTransaction.description }];
      game.portfolio = draft;
      await dialog.show(draft.lastTransaction.description, { title: 'Family' });
    } else if (choice === 'care') {
      const type = await dialog.menu('Child Care', [
        { label: 'Hire a Nanny', value: 'nanny' }, { label: 'Place in daycare', value: 'daycare' }, { label: 'Back', value: null },
      ], { title: 'Family' });
      if (!type) return;
      const form = await dialog.form(type === 'nanny' ? 'Hire a Nanny' : 'Place in daycare', [
        { key: 'annualCost', label: 'Annual household child care cost', type: 'money', prefix: '$', defaultValue: '18000' },
        { key: 'years', label: 'Number of years, starting now', type: 'number', defaultValue: '3' },
      ], { title: 'Child Care', portfolio: p, subtitle: 'Added to ordinary child costs; grows with inflation.' });
      if (!form) return;
      const annualCost = Math.max(0, Number(form.annualCost) || 0);
      const years = Math.max(1, Math.min(100, Math.round(Number(form.years) || 1)));
      const existing = p.childcarePlans || [];
      const plan = { id: `${type}-${p.year}-${existing.length + 1}`, type, annualCost, startYear: p.year,
        endYearExclusive: p.year + years, entryPriceIndex: p.priceIndex || 1 };
      game.portfolio = { ...p, childcarePlans: [...existing, plan], lastTransaction: {
        accepted: true, description: `${type === 'nanny' ? 'Nanny' : 'Daycare'}: ${formatMoneyDisplay(annualCost, p)}/year from ${p.year} through ${p.year + years - 1}.`,
      } };
      await dialog.show(game.portfolio.lastTransaction.description, { title: 'Child Care' });
    }
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
   * moved automatically): Savings ↔ Cash, one-time 401(k)/Roth withdrawals, and a standing
   * yearly withdrawal the engine pays into Cash each month.
   */
  async handleBank(game, dialog) {
    const title = 'Bank: Move Money';
    const money = n => formatMoneyDisplay(n, game.portfolio);
    const report = async (heading, description = null) => {
      const t = game.portfolio.lastTransaction || {};
      await dialog.show(t.accepted === false ? transactionReason(t, game.portfolio) : description || t.description || 'Done.', { title: heading });
    };
    while (true) {
      const p = game.portfolio;
      const plan = p.retirementWithdrawalPlan;
      const choice = await dialog.menu(
        `Only Cash pays bills.\nCash ${money(p.cash || 0)} · Savings ${money(p.savings || 0)}\n` +
          `${personName(p)} 401(k) ${money(p.k401Balance || 0)} · Roth ${money(p.rothBalance || 0)}` +
          (p.married ? `\n${personName(p, 'spouse')} 401(k) ${money(p.spouseK401Balance || 0)} · Roth ${money(p.spouseRothBalance || 0)}` : ''),
        [
          { label: 'Move Savings to Cash', value: 'toCash' },
          { label: 'Move Cash to Savings', value: 'toSavings' },
          { label: 'Withdraw from 401(k) / Roth', value: 'withdraw' },
          {
            label: plan
              ? `Standing withdrawal: ${money(plan.amount)}/yr (${plan.account === 'roth' ? 'Roth' : '401(k)'})`
              : p.spouseRetirementWithdrawalPlan ? 'Edit standing yearly withdrawals' : 'Set a standing yearly withdrawal',
            value: 'plan',
          },
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

  async handleRetirementWithdrawal(game, dialog, report) {
    const title = 'Withdraw to Cash';
    const p = game.portfolio;
    const money = n => formatMoneyDisplay(n, p);
    const selection = await dialog.menu('Withdraw from which person’s account?', [
      ...this.retirementAccountOptions(p), { label: 'Cancel', value: null },
    ], { title });
    if (!selection) return;
    const owner = selection.startsWith('spouse:') ? 'spouse' : 'primary';
    const account = selection.replace('spouse:', '');
    let early = false;
    const access = retirementAccess(p, account, { owner });
    if (access.ageUnknown) {
      await dialog.show('Enter the account owner’s actual age in Family before withdrawing.', { title });
      return;
    }
    if (account === 'traditional' && access.gated) {
      early = await dialog.confirm(`${personName(p, owner)} is under 59½. A 401(k) withdrawal adds a 10% early-withdrawal penalty on top of income tax. Withdraw anyway?`,
        { title, yes: 'Accept penalty', no: 'Cancel' });
      if (early !== true) return;
    }
    const available = retirementAccess(p, account, { early, owner }).available;
    if (!(available > 0)) {
      await dialog.show(account === 'roth'
        ? 'No Roth money is available. Before age 59½ and the five-year qualification, only verified contributions can come out.'
        : 'The 401(k) is empty.', { title });
      return;
    }
    const basis = await dialog.menu('Choose the withdrawal amount. Estimated additional tax is prepaid from the withdrawal and credited at year-end.', [
      { label: 'Withdraw a gross amount', value: 'gross' },
      { label: 'Provide a net Cash amount', value: 'net' },
      { label: 'Back', value: null },
    ], { title });
    if (!basis) return;
    const amount = await dialog.prompt(basis === 'net' ? 'How much spendable Cash do you need?' : `Gross withdrawal? (up to ${money(available)})`, {
      title, portfolio: p, defaultValue: String(Math.round(Math.min(available, 10000))), type: 'money', prefix: '$',
    });
    if (amount == null) return;
    const opts = { account, owner, early, withholdTax: true, ...(basis === 'net' ? { netTarget: amount } : { amount }) };
    const preview = previewRetirementWithdrawal(p, opts);
    if (!preview.accepted) {
      await dialog.show(transactionReason(preview, p), { title });
      return;
    }
    const confirmed = await dialog.confirm(`Gross withdrawal: ${money(preview.gross)}
Estimated additional tax: ${money(preview.tax.total)}
Cash received: ${money(preview.netCash)}`, {
      title, yes: 'Withdraw', no: 'Cancel',
    });
    if (!confirmed) return;
    game.portfolio = withdrawRetirement(p, opts);
    const withdrawal = game.portfolio.lastWithdrawal;
    await report(title, withdrawal
      ? `Withdrew ${money(withdrawal.gross)} from ${personName(p, owner)} ${account === 'roth' ? 'Roth' : '401(k)'}.\nCash received: ${money(withdrawal.netCash)}.\nEstimated tax prepaid: ${money(withdrawal.withheld)}; credited at year-end.`
      : null);
  }

  async handleStandingWithdrawal(game, dialog, report) {
    const title = 'Standing withdrawal';
    const p = game.portfolio;
    const money = n => formatMoneyDisplay(n, p);
    const selection = await dialog.menu('A yearly gross withdrawal you choose, paid into Cash monthly. It grows with inflation; additional taxes settle at year-end.', [
      ...this.retirementAccountOptions(p),
      ...(p.retirementWithdrawalPlan ? [{ label: `Stop ${personName(p)} withdrawal (${money(p.retirementWithdrawalPlan.amount)}/yr)`, value: 'stop' }] : []),
      ...(p.spouseRetirementWithdrawalPlan ? [{ label: `Stop ${personName(p, 'spouse')} withdrawal (${money(p.spouseRetirementWithdrawalPlan.amount)}/yr)`, value: 'spouse:stop' }] : []),
      { label: 'Back', value: null },
    ], { title });
    if (!selection) return;
    const owner = selection.startsWith('spouse:') ? 'spouse' : 'primary';
    const account = selection.replace('spouse:', '');
    const current = owner === 'spouse' ? p.spouseRetirementWithdrawalPlan : p.retirementWithdrawalPlan;
    if (account === 'stop') {
      game.portfolio = setRetirementWithdrawalPlan(p, { amount: 0, owner });
      await report(title);
      return;
    }
    const access = retirementAccess(p, account, { owner });
    if (access.ageUnknown) {
      await dialog.show('Enter the account owner’s actual age in Family before scheduling withdrawals.', { title });
      return;
    }
    let early = false;
    if (account === 'traditional' && access.gated) {
      const answer = await dialog.menu(`${personName(p, owner)} is under 59½. Start with a 10% early-withdrawal penalty, or wait?`, [
        { label: 'Start now (penalty)', value: 'early' },
        { label: 'Wait for age 59½', value: 'wait' },
        { label: 'Cancel', value: null },
      ], { title });
      if (!answer) return;
      early = answer === 'early';
    }
    const amount = await dialog.prompt('Gross withdrawal each year? ($0 stops it)', {
      title, portfolio: p, defaultValue: String(Math.round(current?.amount || p.annualSpending || 0)), type: 'money', prefix: '$',
    });
    if (amount == null) return;
    game.portfolio = setRetirementWithdrawalPlan(p, { amount, account, early, owner });
    const waits = account === 'traditional' && !early && access.gated && amount > 0;
    await report(title, amount > 0
      ? `${personName(p, owner)} standing gross withdrawal: ${money(amount)}/year from the ${account === 'roth' ? 'Roth' : '401(k)'}.` +
        (waits ? ' Starts at the account owner’s age 59½.' : '')
      : 'Standing withdrawal cancelled.');
  }

  async handleBorrow(game, dialog) {
    const kind = await dialog.menu(
      'Asset-backed borrowing only.\nNo unsecured loans.',
      [
        { label: 'HELOC (home equity)', value: 'heloc' },
        { label: 'Loan against shares', value: 'securities' },
        { label: 'Never mind', value: null },
      ],
      { title: 'Borrow' }
    );
    if (!kind) return;
    if (kind === 'heloc') await this.handleHeloc(game, dialog);
    else await this.handleSecuritiesLoan(game, dialog);
  }

  async handleHeloc(game, dialog) {
    const p = game.portfolio;
    const homes = p.homes || [];
    if (!homes.length) {
      await dialog.show(
        `No homes to borrow against.\nA HELOC needs home equity (${Math.round(HELOC_CLTV * 100)}% CLTV rule).`,
        { title: 'HELOC' }
      );
      return;
    }

    const homeIndex = await dialog.menu(
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
    if (homeIndex == null) return;

    const cap = helocCapacity(p, homeIndex);
    if (cap <= 0) {
      await dialog.show(
        `No HELOC capacity on this home.\nNeed equity under ${Math.round(HELOC_CLTV * 100)}% CLTV after mortgage and existing HELOCs.`,
        { title: 'HELOC' }
      );
      return;
    }

    const amount = await dialog.prompt(`HELOC amount ($)? Max ${formatMoneyDisplay(cap)}`, {
      title: 'HELOC',
      defaultValue: String(Math.min(cap, 25000)),
      type: 'money',
    });
    if (amount == null) return;
    const principal = Math.max(0, Math.min(cap, Math.round(amount)));
    if (principal <= 0) {
      await dialog.show('Amount must be greater than zero.', { title: 'HELOC' });
      return;
    }

    const defPct = String(+(HELOC_DEFAULT_RATE * 100).toFixed(2));
    const ratePct = await dialog.prompt(
      `Interest rate APR (%)?\nTypical HELOC ~${defPct}% (prime + margin).\nAllowed ${HELOC_RATE_MIN * 100}–${HELOC_RATE_MAX * 100}%.`,
      { title: 'HELOC', defaultValue: defPct, type: 'percent' }
    );
    if (ratePct == null) return;
    const rate = Math.max(HELOC_RATE_MIN, Math.min(HELOC_RATE_MAX, (ratePct || 0) / 100));

    const term = await dialog.prompt('Term (years)? (10–30)', {
      title: 'HELOC',
      defaultValue: '15',
      type: 'number',
    });
    if (term == null) return;
    const years = Math.max(10, Math.min(30, Math.round(term || 15)));

    const annual = annualLoanPayment({ principal, rate, remainingTerm: years });
    const aprShow = String(+(rate * 100).toFixed(2));
    const ok = await dialog.confirm(
      `HELOC summary:\n` +
        `Principal ${formatMoneyDisplay(principal)} → Cash\n` +
        `APR ${aprShow}% · ${years} yr amortizing\n` +
        `Est. annual P&I ~${formatMoneyDisplay(Math.round(annual))}\n` +
        `Confirm?`,
      { title: 'HELOC', yes: 'Take HELOC', no: 'Cancel' }
    );
    if (!ok) return;

    game.portfolio = takeHeloc(game.portfolio, { homeIndex, amount: principal, rate, term: years });
    await dialog.show(
      `HELOC funded ${formatMoneyDisplay(principal)} to Cash at ${aprShow}% APR.`,
      { title: 'HELOC' }
    );
  }

  async handleSecuritiesLoan(game, dialog) {
    const p = game.portfolio;
    const cap = securitiesLoanCapacity(p);
    if (cap <= 0) {
      await dialog.show(
        `No capacity for a loan against shares.\n` +
          `Need taxable brokerage; advance rate ${Math.round(SB_LTV * 100)}% minus existing share-backed loans.\n` +
          `(401(k) cannot be pledged.)`,
        { title: 'Loan against shares' }
      );
      return;
    }

    const amount = await dialog.prompt(
      `Loan amount ($)? Max ${formatMoneyDisplay(cap)}\n(${Math.round(SB_LTV * 100)}% of stocks minus existing)`,
      {
        title: 'Loan against shares',
        defaultValue: String(Math.min(cap, 10000)),
        type: 'money',
      }
    );
    if (amount == null) return;
    const principal = Math.max(0, Math.min(cap, Math.round(amount)));
    if (principal <= 0) {
      await dialog.show('Amount must be greater than zero.', { title: 'Loan against shares' });
      return;
    }

    const defPct = String(+(SECURITIES_LOAN_DEFAULT_RATE * 100).toFixed(2));
    const ratePct = await dialog.prompt(
      `Interest rate APR (%)?\nTypical pledged-asset line ~${defPct}% (usually below HELOC).\nAllowed ${SECURITIES_LOAN_RATE_MIN * 100}–${SECURITIES_LOAN_RATE_MAX * 100}%.`,
      { title: 'Loan against shares', defaultValue: defPct, type: 'percent' }
    );
    if (ratePct == null) return;
    const rate = Math.max(
      SECURITIES_LOAN_RATE_MIN,
      Math.min(SECURITIES_LOAN_RATE_MAX, (ratePct || 0) / 100)
    );

    const term = await dialog.prompt('Term (years)? (5–20)', {
      title: 'Loan against shares',
      defaultValue: '10',
      type: 'number',
    });
    if (term == null) return;
    const years = Math.max(5, Math.min(20, Math.round(term || 10)));

    const annual = annualLoanPayment({ principal, rate, remainingTerm: years });
    const aprShow = String(+(rate * 100).toFixed(2));
    const ok = await dialog.confirm(
      `Loan against shares:\n` +
        `Principal ${formatMoneyDisplay(principal)} → Cash\n` +
        `APR ${aprShow}% · ${years} yr amortizing\n` +
        `Est. annual P&I ~${formatMoneyDisplay(Math.round(annual))}\n` +
        `If stocks fall below maintenance LTV, a margin call may sell shares.\n` +
        `Confirm?`,
      { title: 'Loan against shares', yes: 'Take loan', no: 'Cancel' }
    );
    if (!ok) return;

    game.portfolio = takeSecuritiesLoan(game.portfolio, { amount: principal, rate, term: years });
    await dialog.show(
      `Loan against shares funded ${formatMoneyDisplay(principal)} to Cash at ${aprShow}% APR.`,
      { title: 'Loan against shares' }
    );
  }

  
  /**
   * Portfolio teller — edit income, spending, contributions and setup inputs. Balances
   * (Cash, Savings, stocks, 401(k), Roth) are locked during play: they change only through
   * Decision Room actions (Bank, Buy/Sell Stock, Buy/Sell Home, Borrow, purchases).
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
          { label: 'Housing / rent', value: 'housing' },
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
      } else if (choice === 'housing') {
        const mode = await dialog.menu('Housing', [
          { label: 'Own', value: 'own' },
          { label: 'Rent', value: 'rent' },
          { label: 'Cancel', value: null },
        ], { title: 'Portfolio' });
        if (!mode) continue;
        p.housing = mode;
        if (mode === 'rent') {
          const r = await dialog.prompt('Monthly rent', {
            title: 'Portfolio',
            defaultValue: String(p.monthlyRent || 0),
            type: 'money',
            prefix: '$',
          });
          if (r != null) p.monthlyRent = Math.max(0, r);
        }
      }
    }
  }

  async handleSellStock(game, dialog, diff) {
    const p = game.portfolio;
    const held = p.stocksTotal || 0;
    if (held <= 0) {
      await dialog.show('No stock to sell.', { title: 'Sell Stock' });
      return;
    }
    const mode = await dialog.menu(
      `Held: ${formatMoneyDisplay(held)}`,
      [
        { label: 'Sell $ amount', value: 'amount' },
        { label: 'Sell % of portfolio', value: 'percent' },
        { label: 'Cancel', value: null },
      ],
      { title: 'Sell Stock' }
    );
    if (!mode) return;

    let proceeds = 0;
    if (mode === 'amount') {
      const amt = await dialog.prompt('Sale amount ($)?', {
        title: 'Sell Stock',
        defaultValue: String(Math.min(held, 1000)),
        type: 'money',
      });
      if (amt == null) return;
      proceeds = Math.min(held, Math.max(0, amt));
    } else {
      const pct = await dialog.prompt('% of portfolio to sell?', {
        title: 'Sell Stock',
        defaultValue: '10',
        type: 'percent',
      });
      if (pct == null) return;
      proceeds = Math.round(held * (Math.max(0, Math.min(100, pct)) / 100));
    }

    const result = sellStock(game.portfolio, { proceeds }, diff);
    if (result.state.lastTransaction?.accepted === false) {
      await dialog.show(transactionReason(result.state.lastTransaction, p), { title: 'Sell Stock' }); return;
    }
    const okay = await dialog.confirm(
      'Sell ' + formatMoneyDisplay(result.proceeds) + '?\nBasis removed: ' + formatMoneyDisplay(result.basis) +
      '\nRealized gain/loss: ' + formatMoneyDisplay(result.gains) +
      '\nEstimated tax: ' + formatMoneyDisplay(result.tax.total) + '\nNet cash: ' + formatMoneyDisplay(result.netCash),
      { title: 'Holdings sale', yes: 'Sell', no: 'Cancel' });
    if (okay) { game.portfolio = result.state; await dialog.show('Sale posted; estimated tax is credited at year-end.', { title: 'Sell Stock' }); }
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
