/** Development-only native PostgreSQL helper. No system service is installed. */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { preparePostgresRuntime } from "./postgres-runtime";
await preparePostgresRuntime();
const dependency = "embedded-postgres";
const { default: EmbeddedPostgres } = await import(dependency);
const root = resolve(".cache/development-postgres"); const data = resolve(root, "data");
if (!data.startsWith(resolve(".cache") + "/") && !data.startsWith(resolve(".cache") + "\\")) throw new Error("Unexpected database workspace.");
await mkdir(root, { recursive: true });
const credentialsPath = resolve(root, "credentials.json");
let credentials: { port: number; user: string; password: string };
try { credentials = JSON.parse(await readFile(credentialsPath, "utf8")); }
catch { credentials = { port: 54335, user: "postgres", password: randomBytes(24).toString("hex") }; await writeFile(credentialsPath, JSON.stringify(credentials), { mode: 0o600 }); }
const databaseUrl = `postgresql://${credentials.user}:${credentials.password}@127.0.0.1:${credentials.port}/postgres?schema=public`;
let env = ""; try { env = await readFile(".env", "utf8"); } catch {}
const configured = env.match(/^DATABASE_URL=(.*)$/m)?.[1].trim().replace(/^['"]|['"]$/g, "");
const exampleEnv = await readFile(".env.example", "utf8");
const exampleDatabase = exampleEnv.match(/^DATABASE_URL=(.*)$/m)?.[1].trim();
if (configured && configured !== databaseUrl && configured !== exampleDatabase) throw new Error("An existing DATABASE_URL is configured. It was preserved. Use that database rather than starting the local helper.");
const pg = new EmbeddedPostgres({ databaseDir: data, ...credentials, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"], onLog: () => {}, onError: () => {} });
const binaryPackage = "@embedded-postgres/windows-x64";
if (process.platform !== "win32") throw new Error("This persistent helper currently targets this Windows workspace. Use a regular local PostgreSQL service on other platforms.");
const { pg_ctl: pgCtl } = await import(binaryPackage);
if (process.argv.includes("--stop")) {
  execFileSync(pgCtl, ["-D", data, "stop", "-m", "fast", "-w"], { stdio: "ignore", windowsHide: true });
  console.log("Stopped this app's local PostgreSQL cluster.");
} else {
  try { await access(resolve(data, "PG_VERSION")); } catch { await pg.initialise(); }
  let running = false; try { execFileSync(pgCtl, ["-D", data, "status"], { stdio: "ignore", windowsHide: true }); running = true; } catch {}
  if (!running) execFileSync(pgCtl, ["-D", data, "-l", resolve(root, "postgres.log"), "-o", `-h 127.0.0.1 -p ${credentials.port}`, "start", "-w"], { stdio: "ignore", windowsHide: true });
  const set = (key: string, value: string) => { const pattern = new RegExp(`^${key}=.*$`, "m"); env = pattern.test(env) ? env.replace(pattern, `${key}=${value}`) : `${env.trimEnd()}\n${key}=${value}\n`; };
  set("DATABASE_URL", databaseUrl);
  if (!env.match(/^CONFIGURATION_SIGNING_SECRET=.{32,}$/m)) set("CONFIGURATION_SIGNING_SECRET", randomBytes(32).toString("hex"));
  if (!env.match(/^PILOT_ALLOWED_SHOP=.+$/m)) set("PILOT_ALLOWED_SHOP", "aerow-qdbfzxwi.myshopify.com");
  if (!env.match(/^ENABLE_PURCHASES=.+$/m)) set("ENABLE_PURCHASES", "false");
  await writeFile(".env", env, { mode: 0o600 });
  console.log("Local PostgreSQL is running on localhost:54335. Database and signing settings saved to ignored .env; existing Shopify credentials preserved.");
}
