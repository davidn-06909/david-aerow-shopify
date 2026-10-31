import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

// Use the packager installed by the operator's pinned Netlify CLI. No account
// token is read by this command; packaging is entirely local.
const cliRoot = resolve(process.env.NETLIFY_CLI_ROOT || 'node_modules/netlify-cli');
const require = createRequire(resolve(cliRoot, 'package.json'));
const { zipFunctions } = await import(pathToFileURL(require.resolve('@netlify/zip-it-and-ship-it')).href);
const functions = await zipFunctions(resolve('.netlify/v1/functions'), resolve('.netlify/functions'), {
  basePath: process.cwd(), manifest: resolve('.netlify/functions/manifest.json'),
  config: {
    '*': { nodeBundler: 'esbuild', nodeVersion: '22' },
    'react-router-server': { nodeBundler: 'nft', nodeVersion: '22', externalNodeModules: ['@prisma/client'], includedFiles: ['public/models/**', 'config/reference-catalog.json', 'config/reference-settings.json', 'node_modules/.prisma/client/**', '!**/.env', '!**/.env.*', '!**/.cache/**', '!**/.shopify/**', '!config/pilot.local.json', '!node_modules/.prisma/client/*windows*', '!node_modules/.prisma/client/*.tmp*'] },
  },
  featureFlags: { zisi_pure_esm: true, zisi_functions_api_v2: true },
});
const server = functions.find(f => f.name === 'react-router-server'), worker = functions.find(f => f.name === 'ring-operations');
if (functions.length !== 2 || server?.routes?.[0]?.pattern !== '/*' || worker?.schedule !== '*/5 * * * *') throw new Error('FUNCTION_ROUTING_OR_SCHEDULE_INVALID');
const path = resolve('.netlify/functions/manifest.json');
const manifest = JSON.parse(await readFile(path, 'utf8')); manifest.timestamp = Date.now();
await writeFile(path, JSON.stringify(manifest));
if (process.argv.includes('--repository-cache')) {
  const root = resolve('../../.netlify/functions');
  await mkdir(root, { recursive: true }); await writeFile(resolve(root, 'manifest.json'), JSON.stringify(manifest));
}
console.log(JSON.stringify(functions.map(f => ({ name: f.name, schedule: f.schedule, routes: f.routes?.map(r => r.pattern), runtime: f.runtime }))));
