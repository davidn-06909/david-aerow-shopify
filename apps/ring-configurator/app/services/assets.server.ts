import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assembly } from '../../shared/assets';
import { modelAssetPath } from './model-asset-path.server';

async function approvedAssetBytes(filename: string): Promise<Buffer> {
  try { return await readFile(modelAssetPath(filename)); }
  catch {
    // Netlify publishes public/models as static files even when its function
    // bundle does not expose included files at the process working directory.
    const appUrl = process.env.SHOPIFY_APP_URL;
    if (!appUrl) throw new Error('ASSET_BASE_URL_MISSING');
    const url = new URL(`/models/${filename}`, appUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('ASSET_ORIGIN_INVALID');
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok || Number(response.headers.get('content-length') || 0) > 2_000_000) throw new Error('ASSET_UNAVAILABLE');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2_000_000) throw new Error('ASSET_TOO_LARGE');
    return bytes;
  }
}

/** Validate exact immutable files at publication, never arbitrary merchant URLs. */
export async function verifyAssets(version: string): Promise<string[]> {
  if (!assembly(version)) return ['Select an approved model version.'];
  try {
    const report = JSON.parse((await approvedAssetBytes('asset-report.json')).toString('utf8'));
    for (const shape of ['round', 'oval']) {
      const filename = `${version}-${shape}.glb`;
      const row = report.files.find((v: { filename: string }) => v.filename === filename);
      const bytes = await approvedAssetBytes(filename);
      if (!row || row.errors || row.sha256 !== createHash('sha256').update(bytes).digest('hex') || row.bytes !== bytes.length) return [`${filename} is missing a valid build report or has changed.`];
    }
    return [];
  } catch { return ['Approved model files or their validation report are unavailable. Rebuild and deploy assets before publishing.']; }
}
