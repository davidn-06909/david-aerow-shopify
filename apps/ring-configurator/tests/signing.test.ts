import { beforeEach, expect, test } from "vitest";
import { signReference, verifyReference } from "../app/services/signing.server";
beforeEach(() => { process.env.CONFIGURATION_SIGNING_SECRET = "test-only-key-which-is-at-least-32-characters"; });
test("a quote reference is shop-bound, expires and rejects tampering", () => {
  const claims = { q: "quote", d: "design", g: "cart-group", s: "dev.myshopify.com", e: 2000 };
  const ref = signReference(claims);
  expect(verifyReference(ref, claims.s, 1000)).toEqual(claims);
  expect(verifyReference(ref, "other.myshopify.com", 1000)).toBeNull();
  expect(verifyReference(ref, claims.s, 2000)).toBeNull();
  expect(verifyReference(`${ref}x`, claims.s, 1000)).toBeNull();
  expect(verifyReference(ref.replace(ref.split(".")[0], Buffer.from(JSON.stringify({ ...claims, g: "attacker" })).toString("base64url")), claims.s, 1000)).toBeNull();
});
