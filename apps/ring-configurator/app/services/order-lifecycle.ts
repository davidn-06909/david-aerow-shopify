import copy from '../locales/en.json';
import type { OrderLine } from './order-audit';

export interface OrderFacts {
  id: string;
  name: string;
  updatedAt: string;
  paymentState: string;
  cancelled: boolean;
  test: boolean;
  currency: string;
  total: string;
  refunded: string;
  lines: OrderLine[];
}
export interface GroupEvidence { configurationId: string; designId?: string; settingId?: string; discrepancies: string[] }
export interface AuditEvidence { version: 'order-audit-v2'; groups: GroupEvidence[]; warnings: string[] }
export const ORDER_TOPICS = new Set(['ORDERS_CREATE', 'ORDERS_UPDATED', 'ORDERS_PAID', 'ORDERS_CANCELLED', 'REFUNDS_CREATE']);
export function orderId(value: unknown): string {
  const id = String(value ?? '').replace(/^gid:\/\/shopify\/Order\//, '');
  if (!/^[1-9]\d{0,19}$/.test(id)) throw new Error('INVALID_ORDER_ID');
  return id;
}
export function retryDelay(failures: number, jitter = Math.random()) {
  return Math.min(3_600_000, 30_000 * 2 ** Math.min(7, Math.max(0, failures - 1))) + Math.floor(Math.max(0, Math.min(1, jitter)) * 5000);
}
export function safeFailure(error: unknown) {
  const code = (error as { code?: unknown; status?: number })?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]{1,50}$/.test(code)) return code;
  if ((error as { status?: number })?.status === 403) return 'SHOPIFY_ACCESS_DENIED';
  return 'ORDER_SYNC_FAILED';
}
export function reviewGate(facts: Pick<OrderFacts, 'paymentState' | 'cancelled' | 'refunded'>, verification: string) {
  if (facts.cancelled) return 'Cancelled';
  if (facts.refunded && Number(facts.refunded) > 0) return copy.refundRecordedReviewRequired;
  if (facts.paymentState !== 'PAID') return copy.paymentRequiresAttention;
  if (verification !== 'verified') return copy.configurationRequiresReview;
  return copy.componentsVerifiedPhysicalFittingUnverified;
}
