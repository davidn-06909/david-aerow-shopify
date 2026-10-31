import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Find the approved files beside the source tree or inside a serverless bundle. */
export function modelAssetPath(filename: string): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth <= 4; depth++) {
    const directory = resolve(moduleDir, ...Array(depth).fill('..'), 'public/models');
    if (existsSync(resolve(directory, 'asset-report.json'))) return resolve(directory, filename);
  }
  return resolve(moduleDir, 'public/models', filename);
}
