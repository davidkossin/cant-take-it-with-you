import { formatMoneyDisplay } from '../finance/DollarBasis.js';

/**
 * Render stored financial events at their original price index. Repeated margin
 * calls in one year share a caption: repayments add, outstanding gaps do not.
 */
export function financialEventMessages(details, portfolio) {
  const groups = new Map();
  const amount = value => Math.max(0, Number(value) || 0);
  for (const detail of details || []) {
    if (detail.kind !== 'unexpected-expense' && detail.kind !== 'margin-call') continue;
    const key = `${detail.kind}:${detail.year}:${detail.priceIndex}`;
    let group = groups.get(key);
    if (!group) {
      group = { ...detail, amount: 0, paid: 0, unpaid: 0, count: 0 };
      groups.set(key, group);
    }
    group.amount += amount(detail.amount);
    group.paid += amount(detail.paid);
    group.unpaid = Math.max(group.unpaid, amount(detail.unpaid));
    group.count++;
  }
  return [...groups.values()].map(detail => {
    const context = { ...portfolio, priceIndex: detail.priceIndex ?? portfolio?.priceIndex,
      year: detail.year ?? portfolio?.year };
    const money = value => formatMoneyDisplay(value, context);
    const year = Number.isFinite(detail.year) ? ` (${detail.year})` : '';
    if (detail.kind === 'unexpected-expense') return `Unexpected expense${year}: ${money(detail.amount)}`;
    return `Margin ${detail.count > 1 ? 'calls' : 'call'}${year}: repaid ${money(detail.paid)}` +
      (detail.unpaid > .01 ? `; Cash shortfall up to ${money(detail.unpaid)}` : '');
  });
}
