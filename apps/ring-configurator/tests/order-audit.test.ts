import { expect, test } from "vitest";
import type { CartLineInput } from "../shared/contract";
import { auditOrderGroup, type OrderLine } from "../app/services/order-audit";
const expected: CartLineInput[] = [{ id: "123", quantity: 1, properties: { _aevow_role: "setting", Engraving: "Always" } }, { id: "456", quantity: 1, properties: { _aevow_role: "diamond" } }];
const actual = (): OrderLine[] => expected.map(item => ({ variant_id: item.id, quantity: 1, properties: Object.entries(item.properties).map(([name, value]) => ({ name, value })) }));
test("a complete order retains its components and exact inscription", () => { expect(auditOrderGroup(expected, actual())).toEqual([]); });
test("missing component, modified variant, quantities and engraving are flagged", () => {
  expect(auditOrderGroup(expected, actual().slice(0, 1))).toContain("component_count:diamond");
  const changed = actual(); changed[0].quantity = 2; changed[1].variant_id = "999"; changed[0].properties![1].value = "Different";
  expect(auditOrderGroup(expected, changed)).toEqual(expect.arrayContaining(["quantity:setting", "variant:diamond", "property:setting:Engraving"]));
});
test("manufacturing fields added outside the signed snapshot require review", () => {
  const changed = actual(); changed[1].properties!.push({ name: "Engraving", value: "Unquoted inscription" });
  expect(auditOrderGroup(expected, changed)).toContain("unexpected_property:diamond:Engraving");
});
