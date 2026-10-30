import { afterEach, expect, test, vi } from "vitest";
import { decodePreview, savePreview } from "../app/services/storage.server";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kB8kAAAAASUVORK5CYII=";
afterEach(() => { vi.unstubAllEnvs(); });
test("free database storage prepares immutable bytes without R2 credentials or a network upload", async () => {
  vi.stubEnv("PREVIEW_STORAGE", "database"); vi.stubEnv("SHOPIFY_APP_URL", "https://app.example");
  const result = await savePreview("dev.myshopify.com", "design-id", png);
  expect(result.url).toBe("https://app.example/previews/design-id"); expect(result.mime).toBe("image/png");
  expect(result.data).toEqual(new Uint8Array(decodePreview(png).body));
});
test("active content, mismatched image magic and truncated bodies are rejected", () => {
  expect(() => decodePreview("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toThrow();
  expect(() => decodePreview(png.replace("image/png", "image/jpeg"))).toThrow();
  expect(() => decodePreview("data:image/png;base64," + Buffer.from("not a valid image file").toString("base64"))).toThrow();
});
test("oversized images and invalid dimensions cannot fill the preview table", () => {
  expect(() => decodePreview("data:image/png;base64," + Buffer.alloc(512_001).toString("base64"))).toThrow(/smaller/);
  const image = Buffer.from(png.split(",")[1], "base64"); image.writeUInt32BE(9999, 16);
  expect(() => decodePreview("data:image/png;base64," + image.toString("base64"))).toThrow(/dimensions/);
});
