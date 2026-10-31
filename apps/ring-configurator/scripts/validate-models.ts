import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { Box3, Matrix4, Vector3 } from 'three';
import { ASSEMBLIES } from '../shared/assets';
// Khronos publishes its validator as a JS/WASM development tool.
// @ts-expect-error The official package has no TypeScript declarations.
import { validateBytes } from 'gltf-validator';

const files = [];
for (const asset of ASSEMBLIES) for (const shape of ['round', 'oval']) {
  const filename = `${asset.version}-${shape}.glb`;
  const bytes = await readFile(`public/models/${filename}`);
  const result = await validateBytes(new Uint8Array(bytes), { uri: filename, maxIssues: 100 });
  if (result.issues.numErrors) throw new Error(`${filename}: ${result.issues.numErrors} glTF validation errors.`);
  const document = await new NodeIO().readBinary(bytes);
  const nodes = document.getRoot().listNodes();
  for (const name of ['Band', 'CenterStone', 'BasketBridge', 'Prong-1']) if (!nodes.some(n => n.getName() === name)) throw new Error(`${filename}: missing ${name}.`);
  const anchored = asset.version === 'lumen-visual-v3' || asset.family === 'solitaire';
  if (anchored) for (const name of ['HeadAnchor', 'EngravingRegion']) if (!nodes.some(n => n.getName() === name)) throw new Error(`${filename}: missing ${name}.`);
  if (asset.family === 'solitaire' && nodes.some(n => n.getName().startsWith('HaloDiamond'))) throw new Error('Solitaire must not include hidden halo stones.');
  const bounds = new Box3();
  for (const n of nodes) for (const p of n.getMesh()?.listPrimitives() || []) {
    const positions = p.getAttribute('POSITION'); if (!positions) continue;
    const values = positions.getArray()!;
    const transform = new Matrix4().fromArray(n.getWorldMatrix());
    for (let i = 0; i < values.length; i += 3) bounds.expandByPoint(new Vector3(Number(values[i]), Number(values[i + 1]), Number(values[i + 2])).applyMatrix4(transform));
  }
  const size = bounds.getSize(new Vector3());
  if (![size.x, size.y, size.z].every(v => Number.isFinite(v) && v > 1 && v < 100)) throw new Error(`${filename}: invalid illustrative bounds.`);
  if (bytes.length > 2_000_000) throw new Error(`${filename}: exceeds per-shape 2 MB budget.`);
  files.push({ filename, version: asset.version, family: asset.family, shape, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, units: 'illustrative-mm', physicalFitVerified: false, errors: result.issues.numErrors, warnings: result.issues.numWarnings });
}
await writeFile('public/models/asset-report.json', JSON.stringify({ schemaVersion: 1, validator: 'Khronos glTF Validator', files }, null, 2) + '\n');
console.log(`Validated ${files.length} current/historical GLBs; zero errors. Asset checksums and bounds recorded.`);
