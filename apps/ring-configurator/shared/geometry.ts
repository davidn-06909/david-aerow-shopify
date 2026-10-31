import {
  BufferGeometry, CatmullRomCurve3, CubicBezierCurve3, Float32BufferAttribute, Group, IcosahedronGeometry,
  Mesh, MeshPhysicalMaterial, SphereGeometry, TubeGeometry, Vector3,
} from 'three';

/** All distances are illustrative millimetres, never certified gemstone measurements. */
export const MODEL_VERSION = 'lumen-visual-v2';
export const SUPPORTED_MODEL_VERSIONS = ['lumen-visual-v1', 'lumen-visual-v2', 'lumen-visual-v3', 'solitaire-visual-v1'] as const;
export const REFERENCE_RING_SIZE = 6.5;
const SHOULDER_ANGLE = 55 * Math.PI / 180;
export type GemShape = 'Round' | 'Oval';
export type RingMetal = '14K yellow gold' | '14K white gold' | '14K rose gold' | 'Platinum';
export const METAL_PRESETS: Record<RingMetal, { color: string; roughness: number; metalness: number }> = {
  '14K yellow gold': { color: '#e8be70', roughness: 0.16, metalness: 1 },
  '14K white gold': { color: '#e2e2da', roughness: 0.13, metalness: 1 },
  '14K rose gold': { color: '#dba08e', roughness: 0.18, metalness: 1 },
  Platinum: { color: '#b9c8d3', roughness: 0.2, metalness: 1 },
};

export const ILLUSTRATIVE_STONE_PROFILES = {
  Round: { width: 8.1, length: 8.1, depth: 4.9 },
  Oval: { width: 7.3, length: 10.2, depth: 4.8 },
} as const;

export function normalizeMetal(value: string): RingMetal {
  const name = value.toLowerCase();
  if (name.includes('platinum')) return 'Platinum';
  if (name.includes('rose')) return '14K rose gold';
  if (name.includes('white')) return '14K white gold';
  return '14K yellow gold';
}

/** US ring-size approximation affects the visual band only. */
export function visualInnerRadius(size: string | number): number {
  const parsed = Number(size);
  const value = Number.isFinite(parsed) ? Math.min(9, Math.max(4, parsed)) : REFERENCE_RING_SIZE;
  return (11.63 + value * 0.8128) / 2;
}

export function bandCenterOffset(size: string | number): number {
  return (visualInnerRadius(REFERENCE_RING_SIZE) - visualInnerRadius(size)) * Math.sin(SHOULDER_ANGLE);
}

/** Retained v1 band generator so saved records never mix a v1 head with v2's integrated shoulders. */
export function createLegacyBandGeometry(size: string | number = REFERENCE_RING_SIZE): BufferGeometry {
  const radius = visualInnerRadius(size) + 0.65;
  const anchorOffset = bandCenterOffset(size);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= 192; ring++) {
    const angle = Math.PI - SHOULDER_ANGLE + ring / 192 * (Math.PI + 2 * SHOULDER_ANGLE);
    const shoulder = Math.max(0, Math.sin(angle)) ** 5;
    for (let section = 0; section <= 20; section++) {
      const phi = section / 20 * Math.PI * 2;
      const radial = Math.sign(Math.cos(phi)) * Math.abs(Math.cos(phi)) ** 0.65 * (0.67 + shoulder * 0.06);
      const axial = Math.sign(Math.sin(phi)) * Math.abs(Math.sin(phi)) ** 0.65 * (1.12 - shoulder * 0.31);
      positions.push(Math.cos(angle) * (radius + radial), Math.sin(angle) * (radius + radial) + anchorOffset, axial);
      if (ring < 192 && section < 20) { const a = ring * 21 + section; const b = a + 21; indices.push(a, b, a + 1, b, b + 1, a + 1); }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}

/** Rounded rectangular comfort shank with tapered shoulders. The top is anchored beneath the head. */
export function createBandGeometry(size: string | number = REFERENCE_RING_SIZE): BufferGeometry {
  const radius = visualInnerRadius(size) + 0.65;
  const anchorOffset = bandCenterOffset(size);
  const ringSegments = 192;
  const shoulderSegments = 24;
  const profileSegments = 20;
  const positions: number[] = [];
  const indices: number[] = [];
  const path: { x: number; y: number; nx: number; ny: number; axial: number; radial: number; exponent: number }[] = [];
  const endpointX = Math.cos(SHOULDER_ANGLE) * radius;
  const endpointY = Math.sin(SHOULDER_ANGLE) * radius + anchorOffset;
  const edgeShoulder = Math.sin(SHOULDER_ANGLE) ** 5;
  const edgeAxial = 1.12 - edgeShoulder * 0.31;
  const edgeRadial = 0.67 + edgeShoulder * 0.06;
  const left = new CubicBezierCurve3(new Vector3(-2.3, 8.9, 0), new Vector3(-3.05, 8.9, 0), new Vector3(-endpointX + Math.sin(SHOULDER_ANGLE), endpointY + Math.cos(SHOULDER_ANGLE), 0), new Vector3(-endpointX, endpointY, 0));
  const right = new CubicBezierCurve3(new Vector3(endpointX, endpointY, 0), new Vector3(endpointX - Math.sin(SHOULDER_ANGLE), endpointY + Math.cos(SHOULDER_ANGLE), 0), new Vector3(3.05, 8.9, 0), new Vector3(2.3, 8.9, 0));
  function addShoulder(curve: CubicBezierCurve3, index: number, start: boolean) {
    const t = index / shoulderSegments;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const blend = start ? t : 1 - t;
    const smooth = blend * blend * (3 - 2 * blend);
    path.push({ x: point.x, y: point.y, nx: tangent.y, ny: -tangent.x, axial: 0.43 + (edgeAxial - 0.43) * smooth, radial: 0.43 + (edgeRadial - 0.43) * smooth, exponent: 1 - 0.35 * smooth });
  }
  for (let i = 0; i < shoulderSegments; i++) addShoulder(left, i, true);
  for (let ring = 0; ring <= ringSegments; ring++) {
    // The basket replaces the top arc: no metal shank passes through the pavilion.
    const angle = Math.PI - SHOULDER_ANGLE + (ring / ringSegments) * (Math.PI + 2 * SHOULDER_ANGLE);
    const shoulder = Math.max(0, Math.sin(angle)) ** 5;
    path.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius + anchorOffset, nx: Math.cos(angle), ny: Math.sin(angle), axial: 1.12 - shoulder * 0.31, radial: 0.67 + shoulder * 0.06, exponent: 0.65 });
  }
  for (let i = 1; i <= shoulderSegments; i++) addShoulder(right, i, false);
  path.forEach((point, ring) => {
    for (let section = 0; section <= profileSegments; section++) {
      const phi = (section / profileSegments) * Math.PI * 2;
      // A superellipse keeps the broad polished face gently rounded, with a comfortable inner edge.
      const radial = Math.sign(Math.cos(phi)) * Math.abs(Math.cos(phi)) ** point.exponent * point.radial;
      const axial = Math.sign(Math.sin(phi)) * Math.abs(Math.sin(phi)) ** point.exponent * point.axial;
      positions.push(point.x + point.nx * radial, point.y + point.ny * radial, axial);
      if (ring < path.length - 1 && section < profileSegments) {
        const a = ring * (profileSegments + 1) + section;
        const b = a + profileSegments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  });
  for (const end of [0, path.length - 1]) {
    const point = path[end];
    const center = positions.length / 3;
    positions.push(point.x, point.y, 0);
    const first = end * (profileSegments + 1);
    for (let section = 0; section < profileSegments; section++) {
      if (end === 0) indices.push(center, first + section, first + section + 1);
      else indices.push(center, first + section + 1, first + section);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

/** Flat normals preserve individual crown, girdle and pavilion facets. */
export function createGemGeometry(shape: GemShape, scale = 1): BufferGeometry {
  const profile = ILLUSTRATIVE_STONE_PROFILES[shape];
  const xRadius = profile.width * 0.5 * scale;
  const zRadius = profile.length * 0.5 * scale;
  const segments = 32;
  const rings = [
    { radius: 0.5, y: 1.23 },
    { radius: 0.79, y: 0.65 },
    { radius: 1, y: 0 },
    { radius: 1, y: -0.1 },
    { radius: 0.43, y: -2.45 },
    { radius: 0.018, y: -3.65 },
  ];
  const vertices: number[] = [];
  const indices: number[] = [];
  rings.forEach((ring, row) => {
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const scallop = row === 1 ? (i % 2 === 0 ? 1 : 0.93) : 1;
      vertices.push(Math.cos(angle) * xRadius * ring.radius * scallop, ring.y * scale, Math.sin(angle) * zRadius * ring.radius * scallop);
      if (row > 0) {
        const previous = (row - 1) * segments;
        const current = row * segments;
        const next = (i + 1) % segments;
        indices.push(previous + i, current + next, current + i, previous + i, previous + next, current + next);
      }
    }
  });
  vertices.push(0, rings[0].y * scale, 0);
  const tableCenter = vertices.length / 3 - 1;
  for (let i = 0; i < segments; i++) indices.push(tableCenter, (i + 1) % segments, i);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  faceted.computeBoundingBox();
  return faceted;
}

export function createMetalMaterial(metal: string = 'Platinum'): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({ ...METAL_PRESETS[normalizeMetal(metal)], envMapIntensity: 1.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  material.name = 'aevow-metal';
  return material;
}

export function createGemMaterial(): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: '#fbfdff', metalness: 0, roughness: 0.025,
    transmission: 0.94, thickness: 3.8, ior: 2.417, dispersion: 0.035,
    envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.015,
    attenuationColor: '#d9eaf9', attenuationDistance: 24,
  });
  material.name = 'aevow-diamond';
  return material;
}

function tube(points: Vector3[], radius: number, material: MeshPhysicalMaterial, name: string): Mesh {
  const path = new CatmullRomCurve3(points);
  const mesh = new Mesh(new TubeGeometry(path, 32, radius, 8, false), material);
  mesh.name = name;
  return mesh;
}

export function createRingAssembly(shape: GemShape = 'Round', size: string | number = REFERENCE_RING_SIZE, family: 'hidden-halo' | 'solitaire' = 'hidden-halo'): Group {
  const group = new Group();
  group.name = `${family === 'solitaire' ? 'Solitaire' : 'The Lumen'} — ${shape}`;
  group.userData = { assetVersion: MODEL_VERSION, units: 'illustrative-mm', physicalFitVerified: false, referenceSize: REFERENCE_RING_SIZE };
  const metal = createMetalMaterial();
  const gemMaterial = createGemMaterial();
  const band = new Mesh(createBandGeometry(size), metal);
  band.name = 'Band';
  group.add(band);

  const head = new Group();
  head.name = 'Head';
  group.add(head);
  const { width, length } = ILLUSTRATIVE_STONE_PROFILES[shape];
  const rx = width * 0.46;
  const rz = length * 0.46;
  const headY = 12.35;
  const gem = new Mesh(createGemGeometry(shape), gemMaterial);
  gem.position.y = headY;
  gem.name = 'CenterStone';
  head.add(gem);

  // The concealed halo sits just below the girdle, rather than framing the stone's crown.
  const haloPoints = Array.from({ length: 65 }, (_, i) => {
    const angle = (i / 64) * Math.PI * 2;
    return new Vector3(Math.cos(angle) * rx, headY - 0.84, Math.sin(angle) * rz);
  });
  if (family === 'hidden-halo') head.add(tube(haloPoints, 0.2, metal, 'HiddenHaloRail'));
  head.add(tube(Array.from({ length: 49 }, (_, i) => {
    const angle = i / 48 * Math.PI * 2;
    return new Vector3(Math.cos(angle) * 2.5, 8.55, Math.sin(angle) * 0.95);
  }), 0.19, metal, 'BasketBridge'));
  const haloCount = family === 'solitaire' ? 0 : shape === 'Round' ? 24 : 28;
  for (let i = 0; i < haloCount; i++) {
    const angle = (i / haloCount) * Math.PI * 2;
    const accent = new Mesh(new IcosahedronGeometry(0.27, 0), gemMaterial);
    accent.position.set(Math.cos(angle) * (rx + 0.11), headY - 0.73, Math.sin(angle) * (rz + 0.11));
    accent.name = `HaloDiamond-${i + 1}`;
    head.add(accent);
    if (i % 2 === 0) {
      const bead = new Mesh(new SphereGeometry(0.075, 8, 6), metal);
      bead.position.set(Math.cos(angle + 0.06) * (rx + 0.18), headY - 0.63, Math.sin(angle + 0.06) * (rz + 0.18));
      bead.name = `HaloBead-${i + 1}`;
      head.add(bead);
    }
  }

  const prongCount = family === 'solitaire' ? 6 : 4;
  for (let i = 0; i < prongCount; i++) {
    const angle = Math.PI / 4 + i * Math.PI * 2 / prongCount;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    head.add(tube([
      new Vector3(x * 2.5, 8.55, z * 0.95),
      new Vector3(x * (rx + 0.25), 10.1, z * (rz + 0.2)),
      new Vector3(x * (rx + 0.37), headY + 0.14, z * (rz + 0.37)),
      new Vector3(x * (rx + 0.03), headY + 0.55, z * (rz + 0.03)),
    ], 0.21, metal, `Prong-${i + 1}`));
    const tip = new Mesh(new SphereGeometry(0.23, 12, 8), metal);
    tip.position.set(x * (rx + 0.03), headY + 0.55, z * (rz + 0.03));
    tip.name = `ProngTip-${i + 1}`;
    head.add(tip);
  }

  return group;
}
