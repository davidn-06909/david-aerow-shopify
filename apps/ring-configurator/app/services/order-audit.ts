import type { CartLineInput } from "../../shared/contract";
export interface OrderLine { variant_id: string | number; product_id?: string | number; quantity: number; currentQuantity?: number; properties?: { name: string; value: unknown }[]; unitPrice?: string; discountedTotal?: string }
export function properties(line: OrderLine): Record<string, string> { return Object.fromEntries((line.properties || []).map(p => [p.name, String(p.value ?? "")])); }
export function auditOrderGroup(expected: CartLineInput[], actual: OrderLine[]): string[] {
  const discrepancies: string[] = [];
  if (actual.length !== expected.length) discrepancies.push("component_count");
  for (const item of expected) {
    const role = item.properties._aevow_role;
    const matches = actual.filter(line => properties(line)._aevow_role === role);
    if (matches.length !== 1) { discrepancies.push(`component_count:${role}`); continue; }
    const line = matches[0]; const props = properties(line);
    if (String(line.variant_id) !== item.id) discrepancies.push(`variant:${role}`);
    if (line.quantity !== 1) discrepancies.push(`quantity:${role}`);
    if (line.currentQuantity !== undefined && line.currentQuantity !== 1) discrepancies.push(`refunded_or_removed_quantity:${role}`);
    for (const [key, value] of Object.entries(item.properties)) if (props[key] !== value) discrepancies.push(`property:${role}:${key}`);
    for (const key of Object.keys(props)) if (!(key in item.properties)) discrepancies.push(`unexpected_property:${role}:${key}`);
  }
  return discrepancies;
}
