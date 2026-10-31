import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const root = process.cwd(), entries = [];
const secrets = ['SHOPIFY_API_SECRET', 'CONFIGURATION_SIGNING_SECRET', 'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'NETLIFY_AUTH_TOKEN', 'BACKUP_ENCRYPTION_KEY', 'R2_SECRET_ACCESS_KEY'].map(k => process.env[k]).filter(v => v && v.length >= 12);
function inspect(path, bytes) {
  const normalized = path.replaceAll('\\', '/');
  if (normalized.split('/').some(p => ['..', '.cache', '.shopify', '.git'].includes(p) || /^\.env(?:\.|$)/.test(p)) || /(?:^|\/)pilot\.local\.json$|\.(?:dump|backup)$|query_engine-windows/i.test(normalized)) throw new Error(`PRIVATE_ARTIFACT_PATH:${normalized}`);
  if (secrets.some(secret => bytes.includes(Buffer.from(secret)))) throw new Error(`CREDENTIAL_LITERAL:${normalized}`);
  if (/(?:shpat_|shpca_|shpss_)[a-f0-9]{30,}/.test(bytes.toString('utf8'))) throw new Error(`CREDENTIAL_PATTERN:${normalized}`);
  entries.push({ path: normalized, bytes: bytes.length });
}
async function walk(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error('SYMLINK_IN_ARTIFACT');
  if (stat.isDirectory()) { for (const entry of await readdir(path)) await walk(resolve(path, entry)); }
  else inspect(relative(root, path), await readFile(path));
}
function zipEntries(bytes, archive) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) if (bytes.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  if (end < 0) throw new Error('INVALID_ZIP');
  const count = bytes.readUInt16LE(end + 10); let offset = bytes.readUInt32LE(end + 16), inflated = 0;
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('INVALID_ZIP_DIRECTORY');
    const method = bytes.readUInt16LE(offset + 10), size = bytes.readUInt32LE(offset + 20), nameLength = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32), local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString();
    offset += 46 + nameLength + extra + comment;
    if (name.endsWith('/')) continue;
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new Error('INVALID_ZIP_ENTRY');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28), data = bytes.subarray(start, start + size);
    const plain = method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: 64 * 1048576 }) : null;
    if (!plain || (inflated += plain.length) > 300 * 1048576) throw new Error('ZIP_BUDGET_EXCEEDED');
    inspect(`${archive}/${name}`, plain);
  }
}
try {
  const targets = process.argv.slice(2);
  if (targets.length) for (const target of targets) {
    const path = resolve(target); if (relative(root, path).startsWith('..')) throw new Error('ARTIFACT_OUTSIDE_APP');
    if (path.endsWith('.zip')) zipEntries(await readFile(path), basename(path)); else await walk(path);
  }
  else for (const target of ['build/client', 'build/server', '.netlify/v1/functions']) await walk(resolve(target));
  console.log(JSON.stringify({ auditPassed: true, entries: entries.length, bytes: entries.reduce((n, e) => n + e.bytes, 0), glbs: entries.filter(e => e.path.endsWith('.glb')).length, privateFiles: 0, credentialMatches: 0 }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
