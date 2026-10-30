import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
// Prefer an unpooled Neon connection for schema changes. Local development
// continues to use DATABASE_URL when no separate migration URL is configured.
const result = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
  stdio: "inherit", env: { ...process.env, ...(process.env.DATABASE_URL_UNPOOLED ? { DATABASE_URL: process.env.DATABASE_URL_UNPOOLED } : {}) }, windowsHide: true,
});
process.exitCode = result.status ?? 1;
