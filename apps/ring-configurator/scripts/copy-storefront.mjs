import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const source = resolve('public/pilot-assets');
const target = resolve('extensions/ring-builder/assets');
await mkdir(target, { recursive: true });
// Remove only this builder's generated bundle files, retaining unrelated extension assets.
for (const name of await readdir(target)) if (/^(?:ring-configurator(?:\..+)?|viewer-[\w-]+|entry-[\w-]+)\.(?:js|css|map)$/.test(name)) await rm(resolve(target, name));
await cp(source, target, { recursive: true, filter: path => !path.endsWith('.map') });
console.log('Copied the storefront and lazy 3D bundle into the theme app extension.');
