import test from 'node:test';
import assert from 'node:assert/strict';
import { household } from './fixtures.js';
import { RoomScene } from '../js/scenes/RoomScene.js';

/**
 * Scripts dialog.prompt/confirm/menu/form answers in call order; dialog.show just logs and
 * continues. Used to drive a teller flow exactly as a player would, including a Back answer
 * (null) at any step, to verify Back re-asks the previous question rather than exiting.
 */
class ScriptedDialog {
  constructor(script) { this.script = script; this.calls = []; this.i = 0; }
  _next(kind, text, opts) {
    this.calls.push({ kind, text, title: opts?.title });
    if (this.i >= this.script.length) throw new Error(`Script ran out at ${kind} #${this.calls.length}: "${text}"`);
    return this.script[this.i++];
  }
  prompt(text, opts) { return Promise.resolve(this._next('prompt', text, opts)); }
  confirm(text, opts) { return Promise.resolve(this._next('confirm', text, opts)); }
  menu(text, opts) { return Promise.resolve(this._next('menu', text, opts)); }
  form(text, fields, opts) { return Promise.resolve(this._next('form', text, opts)); }
  show(text, opts) { this.calls.push({ kind: 'show', text, title: opts?.title }); return Promise.resolve(true); }
}

test('Make a Large Purchase: Back at the amount step re-asks the name, not exits the flow', async () => {
  const game = { portfolio: household({ cash: 100000 }) };
  const dialog = new ScriptedDialog([
    'Boat',   // step 0: name
    null,     // step 1: amount -> Back
    'Boat',   // step 0 again: name (re-asked)
    20000,    // step 1 again: amount
    false,    // step 2: financed? No -- pay in full
  ]);
  await new RoomScene().handleLargePurchase(game, dialog);
  const prompts = dialog.calls.filter(c => c.kind === 'prompt').map(c => c.text);
  assert.deepEqual(prompts, ['What is your Purchase?', 'Purchase amount?', 'What is your Purchase?', 'Purchase amount?']);
  assert.equal(game.portfolio.cash, 80000);
  assert.equal(game.portfolio.lastTransaction.accepted, true);
});

test('Make a Large Purchase: financed path asks down/rate/term and Back steps back one question at a time', async () => {
  const game = { portfolio: household({ cash: 100000 }) };
  const dialog = new ScriptedDialog([
    'Boat', 20000,
    true,    // financed? Yes
    null,    // down payment -> Back to the financed? question
    true,    // financed? Yes again
    4000,    // down payment
    6.9,     // rate
    5,       // term
  ]);
  await new RoomScene().handleLargePurchase(game, dialog);
  const confirms = dialog.calls.filter(c => c.kind === 'confirm').length;
  assert.equal(confirms, 2); // asked twice: the Back on the down-payment step returned to it
  assert.equal(game.portfolio.cash, 96000); // only the down payment left Cash
  assert.equal(game.portfolio.otherLoans.length, 1);
  assert.equal(game.portfolio.otherLoans[0].principal, 16000);
});

test('Make a Large Purchase: Back on the very first question exits without side effects', async () => {
  const game = { portfolio: household({ cash: 100000 }) };
  const dialog = new ScriptedDialog([null]);
  await new RoomScene().handleLargePurchase(game, dialog);
  assert.equal(game.portfolio.cash, 100000);
  assert.equal(game.portfolio.lastTransaction, undefined);
});
