/** Compatibility entry points. Monthly event timing lives in Engine.projectOneYear. */
import { raiseCash, liquidTotal } from './Engine.js';
import { money, nonnegative } from './Books.js';
export function applyAutoEvents() { return []; }
/** Existing callers get a paid/unfunded result; no direct stock-cache edits or invented credit. */
export function drainLiquid(state,amount) {
  const required=money(nonnegative(amount));
  raiseCash(state,required,{retirement:false});
  const paid=money(Math.min(nonnegative(state.cash),required));state.cash=money(state.cash-paid);
  return {required,paid,unfunded:money(required-paid)};
}
export { liquidTotal };
