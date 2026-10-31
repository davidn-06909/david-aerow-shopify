import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { assembly } from '../../shared/assets';

/** Validate exact immutable files at publication, never arbitrary merchant URLs. */
export async function verifyAssets(version: string): Promise<string[]> {
  if (!assembly(version)) return ['Select an approved model version.'];
  try {
    const report = JSON.parse(await readFile(resolve('public/models/asset-report.json'), 'utf8'));
    for (const shape of ['round', 'oval']) {
      const filename = `${version}-${shape}.glb`;
      const row = report.files.find((v: { filename: string }) => v.filename === filename);
      const bytes = await readFile(resolve('public/models', filename));
      if (!row || row.errors || row.sha256 !== createHash('sha256').update(bytes).digest('hex') || row.bytes !== bytes.length) return [`${filename} is missing a valid build report or has changed.`];
    }
    return [];
  } catch { return ['Approved model files or their validation report are unavailable. Rebuild and deploy assets before publishing.']; }
}
