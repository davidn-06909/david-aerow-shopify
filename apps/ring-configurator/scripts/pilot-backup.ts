import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';

export const backupTables = ['quote', 'design', 'catalogRelease', 'catalogState', 'webhookReceipt', 'orderDesign', 'configuredOrder', 'orderAuditRun', 'merchantOrderAction', 'operationAction', 'jobCheckpoint', 'managedComponent', 'requestBucket'] as const;
type Table = typeof backupTables[number];
export interface PilotBackup { version: 1; createdAt: string; tables: Record<Table, Record<string, unknown>[]>; hashes: Record<Table, string> }
const dates: Partial<Record<Table, string[]>> = { quote: ['expiresAt', 'createdAt'], design: ['createdAt'], catalogRelease: ['createdAt'], catalogState: ['updatedAt'], webhookReceipt: ['createdAt', 'nextAttemptAt', 'leaseUntil', 'processedAt'], orderDesign: ['createdAt'], configuredOrder: ['sourceUpdatedAt', 'synchronizedAt'], orderAuditRun: ['createdAt'], merchantOrderAction: ['createdAt'], operationAction: ['createdAt'], jobCheckpoint: ['leaseUntil', 'lastSuccessAt', 'updatedAt'], requestBucket: ['window', 'expiresAt'] };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function encodedRows(rows: Record<string, unknown>[]) {
  return rows.map(row => {
    const r = { ...row };
    for (const [key, value] of Object.entries(r)) {
      if (value instanceof Date) r[key] = value.toISOString();
      else if (value instanceof Uint8Array) r[key] = { base64: Buffer.from(value).toString('base64') };
      else if (typeof value === 'bigint') throw new Error('UNSUPPORTED_BACKUP_COLUMN');
    }
    return r;
  }).sort((a, b) => canonical(a).localeCompare(canonical(b)));
}
const hash = (rows: unknown) => createHash('sha256').update(canonical(rows)).digest('hex');
export async function captureBackup(client: PrismaClient): Promise<PilotBackup> {
  const tables = {} as PilotBackup['tables'], hashes = {} as PilotBackup['hashes'];
  await client.$transaction(async tx => {
    for (const table of backupTables) {
      const rows = await (tx[table] as any).findMany({ take: 10001 });
      if (rows.length > 10000) throw new Error('BACKUP_ROW_LIMIT');
      tables[table] = encodedRows(rows); hashes[table] = hash(tables[table]);
    }
  }, { isolationLevel: 'RepeatableRead', timeout: 60_000 });
  return { version: 1, createdAt: new Date().toISOString(), tables, hashes };
}
export function encryptBackup(backup: PilotBackup, key: string) {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('BACKUP_KEY_REQUIRED');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const header = Buffer.from('AEVOWBK1'); cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(backup)), cipher.final()]);
  return Buffer.concat([header, iv, cipher.getAuthTag(), ciphertext]);
}
export function decryptBackup(bytes: Uint8Array, key: string): PilotBackup {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('BACKUP_KEY_REQUIRED');
  const buffer = Buffer.from(bytes);
  if (buffer.length < 37 || buffer.length > 600 * 1048576 || buffer.subarray(0, 8).toString() !== 'AEVOWBK1') throw new Error('INVALID_BACKUP');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), buffer.subarray(8, 20));
  decipher.setAAD(buffer.subarray(0, 8)); decipher.setAuthTag(buffer.subarray(20, 36));
  const result = JSON.parse(Buffer.concat([decipher.update(buffer.subarray(36)), decipher.final()]).toString()) as PilotBackup;
  if (result.version !== 1 || backupTables.some(t => !Array.isArray(result.tables?.[t]) || result.tables[t].length > 10000 || hash(result.tables[t]) !== result.hashes?.[t])) throw new Error('BACKUP_HASH_MISMATCH');
  return result;
}
export async function restoreBackup(client: PrismaClient, backup: PilotBackup) {
  // Restore only into an isolated empty schema, after migrations. Session tokens
  // are excluded; reauthorization is required in a recovered installation.
  await client.$transaction(async tx => {
    if (await tx.session.count()) throw new Error('RESTORE_TARGET_NOT_EMPTY');
    for (const table of backupTables) if (await (tx[table] as any).count()) throw new Error('RESTORE_TARGET_NOT_EMPTY');
    for (const table of backupTables) {
      const rows = backup.tables[table].map(value => {
        const row = { ...value };
        for (const key of dates[table] || []) if (typeof row[key] === 'string') row[key] = new Date(row[key] as string);
        if (table === 'design' && row.previewData) row.previewData = Buffer.from((row.previewData as { base64: string }).base64, 'base64');
        if (table === 'jobCheckpoint' && row.checkpoint === null) row.checkpoint = Prisma.DbNull;
        return row;
      });
      if (rows.length) await (tx[table] as any).createMany({ data: rows });
    }
  }, { timeout: 60_000 });
  const actual = await captureBackup(client);
  for (const table of backupTables) if (actual.hashes[table] !== backup.hashes[table]) throw new Error(`RESTORE_VERIFICATION_FAILED:${table}`);
  return { verified: true, counts: Object.fromEntries(backupTables.map(t => [t, backup.tables[t].length])), sessionTokensCopied: 0 };
}
