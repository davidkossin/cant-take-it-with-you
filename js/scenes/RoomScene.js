import {
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
import { Hud } from '../render/Hud.js';
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
} from '../finance/Engine.js';
import { getDifficulty } from '../finance/Difficulty.js';
import { commitRoomDecisions, currentNode, westReturnHallway, jumpToHallwayNode } from '../state/GameState.js';
import { autoSave } from '../state/SaveSystem.js';
import { formatMoneyDisplay } from '../render/Dialog.js';
import { log as debugLog } from '../debug/Logger.js';

export class RoomScene {
  constructor() {
    this.world = null;
    this.player = null;
    this.hud = new Hud();
    this.prompt = null;
    this.locked = false;
    this.animTime = 0;
    /** @type {object|null} prior Hallway of Time timeline node, if any */
    this.priorHallway = null;
  }

  enter(game, spawnNearDoor = false) {
    // West door only after a year-door split, not a south-door return.
    this.priorHallway = westReturnHallway(game);
    this.world = buildDecisionRoom({
      hasWestReturn: !!this.priorHallway,
      priorHallwayYear: this.priorHallway?.year,
    });
    const sp = this.world.spawn;
    this.player = new Player(sp.x, spawnNearDoor ? 2 * 16 : sp.y, { speed: 1.5 });
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
    autoSave(game, 'begin');
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
        await dialog.show('Keys are yours. Mortgage recorded.', { title: 'Buy Home' });
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
        game.portfolio = sellHome(game.portfolio, idx);
        await dialog.show(
          'Sold. Net proceeds (after mortgage / HELOC liens) moved to Cash.',
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
        await dialog.show('Shares purchased. Cost basis updated.', { title: 'Buy Stock' });
      } else if (mode === 'sell') {
        await this.handleSellStock(game, dialog, diff);
      }
    } else if (action === 'job') {
      const mode = await dialog.menu(
        'Career window',
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
        const sal = await dialog.prompt('New annual household gross salary ($)?', {
          title: 'Start Job',
          defaultValue: String(p.salary || 50000),
          type: 'money',
        });
        if (sal == null) return;
        game.portfolio = setEmployment(game.portfolio, 'start');
        game.portfolio.salary = Math.max(0, sal);
        game.portfolio.peakSalary = Math.max(game.portfolio.peakSalary || 0, sal);
      } else {
        game.portfolio = setEmployment(game.portfolio, mode);
      }
      await dialog.show('Employment updated.', { title: 'Job / Retire' });
    } else if (action === 'kid') {
      if ((p.kids || []).length >= 4) {
        await dialog.show('Four kids is the max for this ledger.', { title: 'Have A Kid' });
        return;
      }
      const name = await dialog.prompt("Child's name?", {
        title: 'Have A Kid',
        defaultValue: `Child ${(p.kids || []).length + 1}`,
      });
      if (name == null) return;
      game.portfolio = addKid(game.portfolio, { name: name || 'Child', age: 0 });
      await dialog.show(
        `${name} joins the timeline at age 0. Annual costs follow the age schedule.`,
        { title: 'Have A Kid' }
      );
    } else if (action === 'purchase') {
      const itemName = await dialog.prompt('What are you buying? (name)', {
        title: 'Make Large Purchase',
        defaultValue: 'New car',
      });
      if (itemName == null) return;
      const label = String(itemName).trim() || 'Large Purchase';

      const amt = await dialog.prompt('Purchase amount ($)?', {
        title: label,
        defaultValue: '5000',
        type: 'money',
      });
      if (amt == null) return;
      const price = Math.max(0, amt);

      const financed = await dialog.confirm('Is this purchase being financed?', {
        title: label,
        yes: 'Yes — finance it',
        no: 'No — pay in full',
      });
      if (financed == null) return;

      if (!financed) {
        game.portfolio = largePurchase(game.portfolio, price, { label });
        await dialog.show(
          `Purchased ${label} — paid in full from liquid assets.`,
          { title: 'Make Large Purchase' }
        );
        return;
      }

      const down = await dialog.prompt('Down payment ($)?', {
        title: label,
        defaultValue: String(Math.round(price * 0.2)),
        type: 'money',
      });
      if (down == null) return;

      const ratePct = await dialog.prompt('Interest rate (%)?', {
        title: label,
        defaultValue: '6.9',
        type: 'percent',
      });
      if (ratePct == null) return;

      const term = await dialog.prompt('Loan term (years)?', {
        title: label,
        defaultValue: '5',
        type: 'number',
      });
      if (term == null) return;

      const downCap = Math.max(0, Math.min(price, down || 0));
      const principal = price - downCap;
      game.portfolio = largePurchase(game.portfolio, price, {
        financed: true,
        downPayment: downCap,
        rate: (ratePct || 0) / 100,
        term: term ?? 5,
        label,
      });
      await dialog.show(
        `Purchased ${label}.\n` +
          `Down ${formatMoneyDisplay(downCap)}; financed ${formatMoneyDisplay(principal)} ` +
          `at ${ratePct}% for ${Math.max(1, Math.round(term ?? 5))} yr.`,
        { title: 'Make Large Purchase' }
      );
    } else if (action === 'borrow') {
      await this.handleBorrow(game, dialog);
    }
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

    const saleLine = `Sale amount: ${formatMoneyDisplay(proceeds)}`;
    const gains = await dialog.prompt(
      `${saleLine}\nRealized gains on this sale ($)?`,
      {
        title: 'Capital Gains',
        defaultValue: '0',
        type: 'money',
      }
    );
    if (gains == null) return;

    // CGT only cares short vs long (≥1yr); map to yearsHeld for estimateCapitalGainsTax
    const holding = await dialog.menu(
      `${saleLine}\nHolding period for capital gains?`,
      [
        { label: 'Short-term (< 1 year)', value: 'short' },
        { label: 'Long-term (≥ 1 year)', value: 'long' },
        { label: 'Cancel', value: null },
      ],
      { title: 'Capital Gains' }
    );
    if (!holding) return;
    const yearsHeld = holding === 'long' ? 1 : 0;

    const result = sellStock(
      game.portfolio,
      { proceeds, gains: Math.max(0, gains), yearsHeld },
      diff
    );
    game.portfolio = result.state;
    debugLog('sell_stock', {
      proceeds,
      gains: Math.max(0, gains),
      holding: holding,
      yearsHeld,
      cgt: result.tax?.total,
      longTerm: !!result.tax?.longTerm,
      netCash: result.netCash,
      cashAfter: result.state?.cash,
    });
    await dialog.show(
      `Sold ${formatMoneyDisplay(result.proceeds)}.\n` +
        `CGT ${result.tax.longTerm ? 'LT' : 'ST'}: ${formatMoneyDisplay(result.tax.total)}\n` +
        `(${result.tax.rateNote})\n` +
        `Net to Cash: ${formatMoneyDisplay(result.netCash)}`,
      { title: 'Sell Stock' }
    );
  }

  render(ctx, game) {
    const camX = Math.max(0, Math.min(this.world.width - VIEW_W, this.player.x + 6 - VIEW_W / 2));
    const camY = Math.max(0, Math.min(this.world.height - VIEW_H, this.player.y - VIEW_H / 2));

    // Playfield below HUD band
    ctx.save();
    ctx.translate(0, HUD_H);
    drawWorld(ctx, this.world, camX, camY, this.animTime);
    ctx.save();
    ctx.translate(-camX, -camY);
    this.player.draw(
      ctx,
      game.portfolio.hairColor,
      game.portfolio.hairLength,
      game.portfolio.age
    );
    ctx.restore();
    ctx.restore();

    this.hud.draw(ctx, game.portfolio);

    if (this.prompt && !this.locked) {
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.fillStyle = '#f0e8c8';
      ctx.textAlign = 'center';
      ctx.fillText(`[E] ${this.prompt.label}`, VIEW_W / 2, HUD_H + VIEW_H - 12);
      ctx.textAlign = 'left';
    }
  }
}
