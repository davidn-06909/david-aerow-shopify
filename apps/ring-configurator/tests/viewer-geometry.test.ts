import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  createBandGeometry, createLegacyBandGeometry, createGemGeometry, createRingAssembly, ILLUSTRATIVE_STONE_PROFILES,
  METAL_PRESETS, MODEL_VERSION, normalizeMetal,
} from '../shared/geometry';

describe('reference-proportioned ring geometry', () => {
  it('changes the band circumference while preserving the head anchor and stone geometry', () => {
    const small = createBandGeometry(4);
    const large = createBandGeometry(9);
    expect(large.boundingBox!.max.x).toBeGreaterThan(small.boundingBox!.max.x);
    expect(large.boundingBox!.min.y).toBeLessThan(small.boundingBox!.min.y);
    expect(large.boundingBox!.max.y).toBeCloseTo(small.boundingBox!.max.y, 3);
    const smallRing = createRingAssembly('Round', 4);
    const largeRing = createRingAssembly('Round', 9);
    const smallStone = smallRing.getObjectByName('CenterStone') as Mesh;
    const largeStone = largeRing.getObjectByName('CenterStone') as Mesh;
    expect(Array.from(smallStone.geometry.getAttribute('position').array)).toEqual(Array.from(largeStone.geometry.getAttribute('position').array));
    expect(smallStone.position.toArray()).toEqual(largeStone.position.toArray());
    expect(smallRing.userData.physicalFitVerified).toBe(false);
    small.dispose(); large.dispose();
    for (const ring of [smallRing, largeRing]) ring.traverse((object) => {
      if (object instanceof Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); }
    });
  });

  it('has outward shank normals and finite, individually faceted center stones', () => {
    const band = createBandGeometry();
    const normal = band.getAttribute('normal');
    const position = band.getAttribute('position');
    let rightmost = 0;
    for (let i = 1; i < position.count; i++) if (position.getX(i) > position.getX(rightmost)) rightmost = i;
    expect(normal.getX(rightmost)).toBeGreaterThan(0.9);
    band.dispose();
    for (const shape of ['Round', 'Oval'] as const) {
      const gem = createGemGeometry(shape);
      expect(gem.index).toBeNull();
      expect(gem.getAttribute('position').count % 3).toBe(0);
      expect(Array.from(gem.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
      const bounds = gem.boundingBox!.getSize(new Vector3());
      expect(bounds.x).toBeCloseTo(ILLUSTRATIVE_STONE_PROFILES[shape].width, 4);
      expect(bounds.z).toBeCloseTo(ILLUSTRATIVE_STONE_PROFILES[shape].length, 4);
      gem.dispose();
    }
  });

  it('has distinct calibrated metal colors and normalizes catalog labels', () => {
    expect(new Set(Object.values(METAL_PRESETS).map((preset) => preset.color)).size).toBe(4);
    expect(normalizeMetal('White gold')).toBe('14K white gold');
    expect(normalizeMetal('14K rose gold')).toBe('14K rose gold');
    expect(normalizeMetal('Platinum')).toBe('Platinum');
  });

  it('ships valid, versioned binary models with separately editable shank and stone', async () => {
    for (const shape of ['round', 'oval']) {
      const path = fileURLToPath(new URL(`../public/models/${MODEL_VERSION}-${shape}.glb`, import.meta.url));
      const bytes = await readFile(path);
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
      expect(bytes.readUInt32LE(4)).toBe(2);
      expect(bytes.length).toBeLessThan(600_000);
      const document = await new NodeIO().readBinary(bytes);
      expect(document.getRoot().getExtras()).toMatchObject({ version: MODEL_VERSION, physicalFitVerified: false });
      expect(document.getRoot().listNodes().map((node) => node.getName())).toEqual(expect.arrayContaining(['Band', 'CenterStone', 'HiddenHaloRail', 'Prong-1']));
    }
  });
  it('retains the exact v1 shank alongside separately versioned v2 integrated shoulders', async () => {
    const bytes = await readFile(fileURLToPath(new URL('../public/models/lumen-visual-v1-round.glb', import.meta.url)));
    const document = await new NodeIO().readBinary(bytes);
    const original = document.getRoot().listMeshes().find(mesh => mesh.getName() === 'Band')!.listPrimitives()[0].getAttribute('POSITION')!.getArray();
    const legacy = createLegacyBandGeometry();
    expect(Array.from(legacy.getAttribute('position').array)).toEqual(Array.from(original!));
    const current = createBandGeometry(); expect(current.getAttribute('position').count).toBeGreaterThan(legacy.getAttribute('position').count);
    legacy.dispose(); current.dispose();
  });
});
