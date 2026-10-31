import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { Matrix4, Mesh, MeshPhysicalMaterial } from 'three';
import { createRingAssembly, MODEL_VERSION, ILLUSTRATIVE_STONE_PROFILES, REFERENCE_RING_SIZE, type GemShape } from '../shared/geometry';

const destination = fileURLToPath(new URL('../public/models/', import.meta.url));
await mkdir(destination, { recursive: true });
const manifest: Record<string, unknown> = {
  version: 'ring-assets-v3',
  physicalFitVerified: false,
  description: 'Reference-proportioned visual pilot. Geometry and stone profiles are illustrative, not manufacturing CAD.',
  units: 'illustrative-mm',
  referenceSize: REFERENCE_RING_SIZE,
  stoneProfiles: ILLUSTRATIVE_STONE_PROFILES,
  shapes: {},
};

for (const family of ['hidden-halo', 'solitaire'] as const) for (const shape of ['Round', 'Oval'] as GemShape[]) {
  const version = family === 'solitaire' ? 'solitaire-visual-v1' : 'lumen-visual-v3';
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene(`${family} visual pilot`);
  const ring = createRingAssembly(shape, REFERENCE_RING_SIZE, family);
  ring.updateMatrixWorld(true);
  const materials = new Map<string, ReturnType<Document['createMaterial']>>();
  ring.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const source = object.material as MeshPhysicalMaterial;
    let material = materials.get(source.name);
    if (!material) {
      material = document.createMaterial(source.name)
        .setBaseColorFactor([source.color.r, source.color.g, source.color.b, 1])
        .setMetallicFactor(source.metalness)
        .setRoughnessFactor(source.roughness)
        .setExtras({ role: source.name === 'aevow-metal' ? 'metal' : 'gemstone' });
      materials.set(source.name, material);
    }
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const primitive = document.createPrimitive()
      .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(new Float32Array(position.array)).setBuffer(buffer))
      .setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(new Float32Array(normal.array)).setBuffer(buffer))
      .setMaterial(material);
    if (geometry.index) primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(geometry.index.array)).setBuffer(buffer));
    const mesh = document.createMesh(object.name).addPrimitive(primitive);
    const node = document.createNode(object.name).setMesh(mesh).setMatrix(object.matrixWorld.toArray() as ReturnType<Matrix4['toArray']> as [number,number,number,number,number,number,number,number,number,number,number,number,number,number,number,number]);
    scene.addChild(node);
  });
  scene.addChild(document.createNode('HeadAnchor').setTranslation([0, 8.55, 0]).setExtras({ role: 'head-anchor' }));
  scene.addChild(document.createNode('EngravingRegion').setTranslation([0, -8, 0]).setExtras({ role: 'engraving-region' }));
  document.getRoot().setExtras({ version, family, units: 'illustrative-mm', physicalFitVerified: false, referenceSize: REFERENCE_RING_SIZE });
  const filename = `${version}-${shape.toLowerCase()}.glb`;
  const bytes = await new NodeIO().writeBinary(document);
  const path = `${destination}${filename}`;
  const previous = await readFile(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (previous && !previous.equals(Buffer.from(bytes))) throw new Error(`Immutable asset ${filename} changed. Introduce a new version before exporting.`);
  await writeFile(path, bytes);
  (manifest.shapes as Record<string, unknown>)[`${family}/${shape}`] = { file: filename, bytes: bytes.byteLength };
  ring.traverse((object) => {
    if (object instanceof Mesh) object.geometry.dispose();
  });
  console.log(`Generated ${filename} (${Math.round(bytes.byteLength / 1024)} KiB)`);
}
await writeFile(`${destination}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
