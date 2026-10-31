/**
 * Selective, one-time pilot transfer to Netlify site
 * 958dda5f-dbf8-41f9-bfb5-b404cc6c199c. No Session records are read or copied.
 * Both databases must already have this app's migrations applied. This script
 * never migrates, deletes, updates, or rewrites URLs/signatures in either DB.
 *
 * Supply DATABASE_URL (source) and PILOT_EXPORT_DATABASE_URL (target) through
 * the process environment. Do not put connection strings on the command line.
 * Optional PILOT_EXPORT_SITE_ID must equal the site ID above when supplied.
 *
 * Read-only inspection (default):
 *   node --import tsx scripts/transfer-pilot-records.ts
 * Explicitly approved transfer, from PowerShell:
 *   $env:PILOT_DATABASE_EXPORT_APPROVED = 'true'
 *   node --import tsx scripts/transfer-pilot-records.ts --apply
 *   Remove-Item Env:PILOT_DATABASE_EXPORT_APPROVED
 *
 * Run only while the target app is stopped: ALL FIVE target tables, including
 * Session, must be empty. Target table locks and a second empty check protect
 * the write transaction. Any verification failure before commit rolls back.
 * Preserve the source signing secret separately in the destination app runtime;
 * it is deliberately outside this data-only transfer. Do not upload .cache:
 * masked diagnostic logs there are local troubleshooting files.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";

const SITE_ID = "958dda5f-dbf8-41f9-bfb5-b404cc6c199c";
const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 20_000,
  timeout: 120_000,
};
const quoteSelect = {
  id: true, shop: true, snapshot: true, signature: true, requestId: true,
  requestHash: true, expiresAt: true, createdAt: true,
} satisfies Prisma.QuoteSelect;
const designSelect = {
  id: true, shop: true, quoteId: true, snapshot: true, previewUrl: true,
  previewData: true, previewMime: true, createdAt: true,
} satisfies Prisma.DesignSelect;
const webhookSelect = {
  id: true, shop: true, topic: true, payload: true, status: true,
  attempts: true, lastError: true, processedAt: true, createdAt: true,
} satisfies Prisma.WebhookReceiptSelect;
const orderSelect = {
  id: true, shop: true, orderId: true, designId: true, configurationId: true,
  status: true, discrepancies: true, createdAt: true,
} satisfies Prisma.OrderDesignSelect;

type TransferCounts = { Quote: number; Design: number; WebhookReceipt: number; OrderDesign: number };
type TargetCounts = TransferCounts & { Session: number };
type Snapshot = {
  counts: TransferCounts;
  quotes: Prisma.QuoteGetPayload<{ select: typeof quoteSelect }>[];
  designs: Prisma.DesignGetPayload<{ select: typeof designSelect }>[];
  webhooks: Prisma.WebhookReceiptGetPayload<{ select: typeof webhookSelect }>[];
  orders: Prisma.OrderDesignGetPayload<{ select: typeof orderSelect }>[];
};

class TransferError extends Error {}

function connectionUrl(name: "DATABASE_URL" | "PILOT_EXPORT_DATABASE_URL") {
  const value = process.env[name];
  if (!value) throw new TransferError(`Missing ${name}; no transfer attempted.`);
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new TransferError(`${name} must be a PostgreSQL connection URL.`); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname === "/") {
    throw new TransferError(`${name} must identify a PostgreSQL database.`);
  }
  return { value, identity: `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}${parsed.pathname}` };
}

async function transferCounts(tx: Prisma.TransactionClient): Promise<TransferCounts> {
  const [Quote, Design, WebhookReceipt, OrderDesign] = await Promise.all([
    tx.quote.count(), tx.design.count(), tx.webhookReceipt.count(), tx.orderDesign.count(),
  ]);
  return { Quote, Design, WebhookReceipt, OrderDesign };
}

// Only the TARGET session table is counted, never selected or copied.
async function targetCounts(tx: Prisma.TransactionClient): Promise<TargetCounts> {
  return { ...await transferCounts(tx), Session: await tx.session.count() };
}

function requireEmpty(counts: TargetCounts) {
  if (Object.values(counts).some((count) => count !== 0)) {
    throw new TransferError("Target contains existing records; transfer refused without modifying them.");
  }
}

async function records(tx: Prisma.TransactionClient): Promise<Snapshot> {
  const counts = await transferCounts(tx);
  const [quotes, designs, webhooks, orders] = await Promise.all([
    tx.quote.findMany({ select: quoteSelect, orderBy: { id: "asc" } }),
    tx.design.findMany({ select: designSelect, orderBy: { id: "asc" } }),
    tx.webhookReceipt.findMany({ select: webhookSelect, orderBy: { id: "asc" } }),
    tx.orderDesign.findMany({ select: orderSelect, orderBy: { id: "asc" } }),
  ]);
  if (quotes.length !== counts.Quote || designs.length !== counts.Design ||
      webhooks.length !== counts.WebhookReceipt || orders.length !== counts.OrderDesign) {
    throw new TransferError("Database snapshot counts are inconsistent; transfer refused.");
  }
  return { counts, quotes, designs, webhooks, orders };
}

function digest(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

// Stable JSON key ordering allows exact scalar-field verification after JSONB
// round trips. Image bytes are separately hashed with their original lengths.
function canonical(value: unknown): unknown {
  if (value instanceof Date) return { date: value.toISOString() };
  if (value instanceof Uint8Array) return { bytes: value.byteLength, sha256: digest(value) };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function fingerprints(snapshot: Snapshot) {
  return {
    records: digest(JSON.stringify(canonical(snapshot))),
    previews: digest(JSON.stringify(snapshot.designs.map((design) => ({
      id: design.id,
      bytes: design.previewData === null ? null : design.previewData.byteLength,
      sha256: design.previewData === null ? null : digest(design.previewData),
    })))),
  };
}

function verify(source: Snapshot, target: Snapshot) {
  const original = fingerprints(source);
  const copied = fingerprints(target);
  if (original.records !== copied.records || original.previews !== copied.previews) {
    throw new TransferError("Transferred counts, record fields, or preview image hashes differ; verification failed.");
  }
}

const inputJson = (value: Prisma.JsonValue): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull =>
  value === null ? Prisma.JsonNull : value;

async function chunks<T>(rows: T[], insert: (batch: T[]) => Promise<Prisma.BatchPayload>) {
  for (let offset = 0; offset < rows.length; offset += 250) {
    const batch = rows.slice(offset, offset + 250);
    const result = await insert(batch);
    if (result.count !== batch.length) throw new TransferError("Insert count mismatch; target transaction rolled back.");
  }
}

async function copyRecords(tx: Prisma.TransactionClient, snapshot: Snapshot) {
  // Parents precede children. Explicit IDs and dates preserve all relationships;
  // skipDuplicates is deliberately absent so conflicts abort the transaction.
  const quotes: Prisma.QuoteCreateManyInput[] = snapshot.quotes.map((row) => ({
    ...row, snapshot: inputJson(row.snapshot),
  }));
  const designs: Prisma.DesignCreateManyInput[] = snapshot.designs.map((row) => ({
    ...row, snapshot: inputJson(row.snapshot),
  }));
  const webhooks: Prisma.WebhookReceiptCreateManyInput[] = snapshot.webhooks.map((row) => ({
    ...row, payload: inputJson(row.payload),
  }));
  const orders: Prisma.OrderDesignCreateManyInput[] = snapshot.orders.map((row) => ({
    ...row, discrepancies: inputJson(row.discrepancies),
  }));
  await chunks(quotes, (data) => tx.quote.createMany({ data }));
  await chunks(designs, (data) => tx.design.createMany({ data }));
  await chunks(webhooks, (data) => tx.webhookReceipt.createMany({ data }));
  await chunks(orders, (data) => tx.orderDesign.createMany({ data }));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply") || args.filter((arg) => arg === "--apply").length > 1) {
    throw new TransferError("Only the optional --apply flag is supported.");
  }
  const apply = args.includes("--apply");
  if (apply && process.env.PILOT_DATABASE_EXPORT_APPROVED !== "true") {
    throw new TransferError("Apply requires explicit approval: PILOT_DATABASE_EXPORT_APPROVED=true.");
  }
  if (process.env.PILOT_EXPORT_SITE_ID && process.env.PILOT_EXPORT_SITE_ID !== SITE_ID) {
    throw new TransferError("Destination site guard does not match the approved Netlify site.");
  }
  const sourceUrl = connectionUrl("DATABASE_URL");
  const targetUrl = connectionUrl("PILOT_EXPORT_DATABASE_URL");
  if (sourceUrl.identity === targetUrl.identity) {
    throw new TransferError("Source and target must be separate databases; transfer refused.");
  }
  // Do not import the app singleton or its Shopify session-storage services.
  // Empty logging arrays prevent Prisma from emitting credential-bearing errors.
  const source = new PrismaClient({ datasources: { db: { url: sourceUrl.value } }, log: [] });
  const target = new PrismaClient({ datasources: { db: { url: targetUrl.value } }, log: [] });
  try {
    const snapshot = await source.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return records(tx);
    }, transactionOptions);
    const before = await target.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const counts = await targetCounts(tx);
      requireEmpty(counts);
      return counts;
    }, transactionOptions);
    if (!apply) {
      console.log(JSON.stringify({
        counts: { source: snapshot.counts, targetBefore: before },
        hashesMatch: { records: null, previewImages: null },
        noSessionExport: true,
      }));
      return;
    }
    const backupDirectory = fileURLToPath(new URL("../.cache/pilot-record-transfer/", import.meta.url));
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    await writeFile(`${backupDirectory}/backup-${Date.now()}-${randomUUID()}.json`, JSON.stringify({
      format: "aevow-pilot-selective-v1", siteId: SITE_ID, records: snapshot,
    }, (_key, value) => value instanceof Uint8Array ? { type: "Uint8Array", base64: Buffer.from(value).toString("base64") } : value), { mode: 0o600, flag: "wx" });
    await target.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '20s'`;
      await tx.$executeRaw`LOCK TABLE "Session", "Quote", "Design", "WebhookReceipt", "OrderDesign" IN ACCESS EXCLUSIVE MODE`;
      requireEmpty(await targetCounts(tx));
      await copyRecords(tx, snapshot);
      verify(snapshot, await records(tx));
      if (await tx.session.count() !== 0) throw new TransferError("Target sessions changed; transaction rolled back.");
    }, transactionOptions);
    const after = await target.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const copied = await records(tx);
      verify(snapshot, copied);
      return targetCounts(tx);
    }, transactionOptions);
    console.log(JSON.stringify({
      counts: { source: snapshot.counts, targetBefore: before, targetAfter: after },
      hashesMatch: { records: true, previewImages: true },
      noSessionExport: true,
    }));
  } finally {
    await Promise.allSettled([source.$disconnect(), target.$disconnect()]);
  }
}

async function reportFailure(error: unknown) {
  // Raw Prisma errors can include connection URLs. Never send them to stdout or
  // stderr. Keep a URL-masked stack in the already-ignored local cache only.
  let detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ""}` : String(error);
  for (const key of ["DATABASE_URL", "PILOT_EXPORT_DATABASE_URL"]) {
    const value = process.env[key];
    if (value) detail = detail.split(value).join(`[${key} redacted]`);
  }
  detail = detail.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[PostgreSQL URL redacted]");
  try {
    const directory = fileURLToPath(new URL("../.cache/pilot-record-transfer/", import.meta.url));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(`${directory}/error-${Date.now()}-${randomUUID()}.log`, detail, { mode: 0o600, flag: "wx" });
  } catch { /* Logging failure must not expose the original error. */ }
  console.error(JSON.stringify({
    error: error instanceof TransferError ? error.message : "Transfer failed; inspect the ignored local .cache/pilot-record-transfer diagnostics.",
    noSessionExport: true,
  }));
  process.exitCode = 1;
}

await main().catch(reportFailure);
