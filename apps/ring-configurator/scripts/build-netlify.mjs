import { spawnSync } from "node:child_process";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
const result = spawnSync(process.execPath, [resolve("node_modules/@react-router/dev/bin.js"), "build"], {
  stdio: "inherit", env: { ...process.env, DEPLOY_TARGET: "netlify" }, windowsHide: true,
});
process.exitCode = result.status ?? 1;
if (result.status === 0) {
  // The official v4 adapter logs complete request URLs, including Shopify's
  // embedded id_token. Keep its generated routing configuration, but use the
  // React Router Node request handler without that URL logger.
  const file = resolve(".netlify/v1/functions/react-router-server.mjs");
  const generated = await readFile(file, "utf8");
  const patched = generated
    .replace('import { createRequestHandler } from "@netlify/vite-plugin-react-router/serverless";', 'import { createNodeHandler } from "../../../netlify/request-handler.mjs";')
    .replace("export default createRequestHandler({ build });", "export default createNodeHandler(build);");
  if (patched === generated || patched.includes("createRequestHandler({ build })")) throw new Error("Netlify handler format changed; inspect the Node adapter before deploying.");
  await writeFile(file, patched);
  await copyFile('netlify/functions/ring-operations.mjs', '.netlify/v1/functions/ring-operations.mjs');
}
