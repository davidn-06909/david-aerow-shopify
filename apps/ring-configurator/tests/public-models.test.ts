import { expect, test } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import { loader } from "../app/routes/model-assets.$filename";
const args = (filename: string) => ({ request: new Request(`https://app.example/model-assets/${filename}`), params: { filename }, context: {} }) as unknown as LoaderFunctionArgs;
test.each(["lumen-visual-v1-round.glb", "lumen-visual-v1-oval.glb", "lumen-visual-v2-round.glb", "lumen-visual-v2-oval.glb"])("cross-origin viewer receives current and historical public GLB: %s", async filename => {
  const response = await loader(args(filename));
  expect(response.status).toBe(200); expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Content-Type")).toBe("model/gltf-binary");
  expect(response.headers.get("Cache-Control")).toContain("immutable");
  expect(new Uint8Array(await response.arrayBuffer()).slice(0, 4)).toEqual(new Uint8Array([103, 108, 84, 70]));
});
test("arbitrary private files and traversal paths never cross the public asset boundary", async () => {
  expect((await loader(args("../../.env"))).status).toBe(404);
  expect((await loader(args("pilot.local.json"))).status).toBe(404);
});
