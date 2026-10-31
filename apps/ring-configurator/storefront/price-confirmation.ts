import type { Quote } from '../shared/contract';
export type QuotePrices = Quote['prices'];
export function pricesChanged(expected: QuotePrices, actual: QuotePrices) {
  return (['setting', 'diamond', 'engraving', 'total'] as const).some(key => expected[key].amount !== actual[key].amount || expected[key].currency !== actual[key].currency);
}
