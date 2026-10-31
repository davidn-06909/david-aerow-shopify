import { PrismaClient } from '@prisma/client';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { captureBackup, encryptBackup, decryptBackup, restoreBackup, backupTables } from './pilot-backup';

const mode = process.argv[2], file = resolve(process.argv[3] || '.cache/pilot-encrypted.backup');
const local = relative(resolve('.cache'), file);
if (local.startsWith('..') || resolve('.cache') === file) throw new Error('BACKUP_PATH_MUST_BE_IN_IGNORED_CACHE');
const key = process.env.BACKUP_ENCRYPTION_KEY || '';
let client: PrismaClient | undefined;
try {
  if (mode === 'export') {
    // Exclusive create protects the previous known-good backup.
    client = new PrismaClient();
    const backup = await captureBackup(client);
    await writeFile(file, encryptBackup(backup, key), { flag: 'wx' });
    console.log(JSON.stringify({ encrypted: true, counts: Object.fromEntries(backupTables.map(t => [t, backup.tables[t].length])), sessionTokensCopied: 0 }));
  } else {
    const backup = decryptBackup(await readFile(file), key);
    if (mode === 'inspect') console.log(JSON.stringify({ valid: true, createdAt: backup.createdAt, counts: Object.fromEntries(backupTables.map(t => [t, backup.tables[t].length])) }));
    else if (mode === 'restore' && process.argv.includes('--apply')) {
      const target = new URL(process.env.PILOT_RESTORE_DATABASE_URL || '');
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || !/^restore_[a-f0-9]{16}$/.test(target.searchParams.get('schema') || '')) throw new Error('RESTORE_REQUIRES_ISOLATED_LOCAL_SCHEMA');
      client = new PrismaClient({ datasources: { db: { url: target.href } } });
      console.log(JSON.stringify(await restoreBackup(client, backup)));
    } else throw new Error('USE_EXPORT_INSPECT_OR_RESTORE_APPLY');
  }
} catch (error) { console.error(JSON.stringify({ success: false, code: (error as { code?: string }).code || 'BACKUP_OPERATION_FAILED' })); process.exitCode = 1; }
finally { await client?.$disconnect(); }
