/** Shopify order facts contain decimal major-unit amounts, not minor-unit integers. */
export function formatOrderMoney(currency: string, amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const value = Number(amount);
  return Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value) : '—';
}
