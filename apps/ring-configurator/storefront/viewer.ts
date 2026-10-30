import {
  ACESFilmicToneMapping, AmbientLight, CanvasTexture, Color, DirectionalLight,
  Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ViewerConfiguration } from '../shared/contract';
import copy from './locales/en.json';
import {
  bandCenterOffset, createBandGeometry, createLegacyBandGeometry, createGemMaterial, createMetalMaterial, METAL_PRESETS, MODEL_VERSION, SUPPORTED_MODEL_VERSIONS,
  normalizeMetal, visualInnerRadius, type GemShape,
} from '../shared/geometry';

export type ViewerStatus = 'loading' | 'ready' | 'error';
export type ViewerView = 'front' | 'side' | 'top' | 'engraving' | 'reset';
export interface ViewerCallbacks { onStatus?: (status: ViewerStatus, message?: string) => void }
export interface RingViewer {
  updateConfiguration(config: ViewerConfiguration): Promise<void>;
  setView(view: ViewerView): void;
  capturePreview(): Promise<Blob | null>;
  destroy(): void;
}

const VIEW_POSITIONS: Record<ViewerView, [number, number, number]> = {
  reset: [25, 23, 33], front: [0, 10, 43], side: [38, 11, 1.2], top: [0, 47, 0.01], engraving: [2, -1.2, -38],
};

/** Interactive, reference-proportioned visual pilot; it makes no manufacturing-fit claim. */
export function mount(container: HTMLElement, initial: ViewerConfiguration, callbacks: ViewerCallbacks = {}): RingViewer {
  const scene = new Scene();
  scene.background = new Color('#111b2a');
  const camera = new PerspectiveCamera(39, 1, 0.1, 180);
  camera.position.fromArray(VIEW_POSITIONS.reset);
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    callbacks.onStatus?.('error', 'Interactive 3D is unavailable on this device. The product image is still available.');
    throw error;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.transmissionResolutionScale = matchMedia('(max-width: 760px)').matches ? 0.5 : 0.8;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(max-width: 760px)').matches ? 1.5 : 2));
  renderer.domElement.setAttribute('aria-label', copy.viewerInteractionLabel);
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
  renderer.domElement.tabIndex = 0;
  container.append(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minDistance = 24;
  controls.maxDistance = 72;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.7;
  controls.update();

  // PMREM studio panels give polished metal actual reflections instead of flat tinted shading.
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new HemisphereLight('#e7f1ff', '#17233b', 1.3), new AmbientLight('#ffffff', 0.3));
  const keyLight = new DirectionalLight('#fff4dd', 3.4);
  keyLight.position.set(-12, 25, 16);
  const fillLight = new DirectionalLight('#c6ddff', 2.4);
  fillLight.position.set(15, 7, -15);
  const rimLight = new DirectionalLight('#ffffff', 2);
  rimLight.position.set(0, -4, 18);
  scene.add(keyLight, fillLight, rimLight);

  const shadowTexture = makeShadowTexture();
  const shadow = new Mesh(new PlaneGeometry(34, 24), new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.55 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -11;
  scene.add(shadow);

  const metal = createMetalMaterial(initial.metal);
  const gemstone = createGemMaterial();
  const engravingMaterial = new MeshBasicMaterial({ color: '#342b23', transparent: true, opacity: 0.84, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  let engraving: Mesh | undefined;
  let engravingTexture: CanvasTexture | undefined;
  let config = { ...initial };
  let appliedEngraving = '';
  let appliedSize = '';
  let active: Group | undefined;
  let activeHead: Group | undefined;
  let generation = 0;
  let destroyed = false;
  let contextLost = false;
  let frame = 0;
  let visible = true;
  let dirty = true;
  let settlingFrames = 0;
  let cameraDestination: Vector3 | undefined;
  const loader = new GLTFLoader();
  const models = new Map<string, Group>();
  const pending = new Map<string, Promise<Group>>();
  const abortControllers = new Set<AbortController>();

  const resize = () => {
    if (destroyed) return;
    const bounds = container.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height || 480);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  const intersection = new IntersectionObserver((entries) => { visible = entries[0]?.isIntersecting ?? true; dirty = true; });
  intersection.observe(container);

  const changed = () => { dirty = true; settlingFrames = 35; };
  controls.addEventListener('change', changed);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Home') { event.preventDefault(); setView('reset'); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); camera.position.lerp(controls.target, 0.08); changed(); }
    if (event.key === '-') { event.preventDefault(); camera.position.sub(controls.target).multiplyScalar(1.08).add(controls.target); changed(); }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const offset = camera.position.clone().sub(controls.target);
      const axis = event.key.includes('Left') || event.key.includes('Right') ? new Vector3(0, 1, 0) : new Vector3().crossVectors(offset, camera.up).normalize();
      offset.applyAxisAngle(axis, event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? 0.12 : -0.12);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      changed();
    }
  };
  renderer.domElement.addEventListener('keydown', onKey);
  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    callbacks.onStatus?.('error', copy.viewerError);
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);

  function animate() {
    if (destroyed) return;
    frame = requestAnimationFrame(animate);
    if (!visible || document.hidden || contextLost) return;
    if (cameraDestination) {
      camera.position.lerp(cameraDestination, 0.14);
      if (camera.position.distanceTo(cameraDestination) < 0.025) { camera.position.copy(cameraDestination); cameraDestination = undefined; }
      dirty = true;
      settlingFrames = 35;
    }
    if (dirty || settlingFrames > 0) {
      controls.update();
      renderer.render(scene, camera);
      dirty = false;
      settlingFrames--;
    }
  }
  animate();

  async function loadModel(shape: GemShape, baseUrl: string, version: string): Promise<Group> {
    const key = `${baseUrl}|${version}|${shape}`;
    if (models.has(key)) return models.get(key)!;
    if (pending.has(key)) return pending.get(key)!;
    const abort = new AbortController();
    abortControllers.add(abort);
    const task = (async () => {
      const url = `${baseUrl.replace(/\/$/, '')}/${version}-${shape.toLowerCase()}.glb`;
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error(`Ring asset request failed (${response.status}).`);
      const data = await response.arrayBuffer();
      if (destroyed) throw new DOMException('Viewer destroyed', 'AbortError');
      const gltf = await loader.parseAsync(data, `${baseUrl}/`);
      const group = gltf.scene;
      group.userData.assetVersion = version;
      const head = new Group();
      head.name = 'DynamicHead';
      const oldMaterials = new Set<MeshPhysicalMaterial>();
      for (const child of [...group.children]) {
        if (child.name !== 'Band') { group.remove(child); head.add(child); }
      }
      group.add(head);
      group.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const previous = object.material as MeshPhysicalMaterial;
        oldMaterials.add(previous);
        object.material = previous.name === 'aevow-metal' ? metal : gemstone;
      });
      oldMaterials.forEach((material) => material.dispose());
      if (destroyed) { disposeObject(group); throw new DOMException('Viewer destroyed', 'AbortError'); }
      models.set(key, group);
      return group;
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); abortControllers.delete(abort); }
  }

  function updateBandAndEngraving() {
    if (!active) return;
    const band = active.getObjectByName('Band') as Mesh | undefined;
    if (band && appliedSize !== String(config.size)) {
      band.geometry.dispose();
      band.geometry = active.userData.assetVersion === 'lumen-visual-v1' ? createLegacyBandGeometry(config.size) : createBandGeometry(config.size);
    }
    if (appliedSize !== String(config.size) || appliedEngraving !== config.engraving) {
      if (engraving) { scene.remove(engraving); engraving.geometry.dispose(); engraving = undefined; }
      engravingTexture?.dispose();
      engravingTexture = undefined;
      if (config.engraving.trim()) {
        engravingTexture = makeEngravingTexture(config.engraving);
        engravingMaterial.map = engravingTexture;
        engravingMaterial.needsUpdate = true;
        engraving = new Mesh(createEngravingGeometry(config.size), engravingMaterial);
        engraving.name = 'VisualEngraving';
        scene.add(engraving);
      }
    }
    appliedSize = String(config.size);
    appliedEngraving = config.engraving;
    shadow.position.y = -visualInnerRadius(config.size) - 1.8 + bandCenterOffset(config.size);
  }

  async function updateConfiguration(next: ViewerConfiguration) {
    if (destroyed) return;
    if (contextLost) { callbacks.onStatus?.('error', copy.viewerError); return; }
    const requestId = ++generation;
    config = { ...next };
    const preset = METAL_PRESETS[normalizeMetal(config.metal)];
    metal.color.set(preset.color);
    metal.roughness = preset.roughness;
    const base = config.assetBaseUrl || '/models';
    const version = config.assetVersion || MODEL_VERSION;
    const cached = models.get(`${base}|${version}|${config.shape}`);
    if (!cached) callbacks.onStatus?.('loading');
    try {
      if (!SUPPORTED_MODEL_VERSIONS.includes(version as typeof SUPPORTED_MODEL_VERSIONS[number])) throw new Error('The original model version is unavailable.');
      const group = cached || await loadModel(config.shape, base, version);
      if (destroyed || requestId !== generation) return;
      if (active !== group) {
        if (active) scene.remove(active);
        active = group;
        activeHead = group.getObjectByName('DynamicHead') as Group;
        scene.add(group);
        appliedSize = '';
      }
      // This visual carat profile is explicitly illustrative, never a physical-fitting measurement.
      const scale = Math.cbrt(Math.min(3, Math.max(0.5, Number(config.diamondCarat) || 2)) / 2);
      if (activeHead) {
        activeHead.scale.set(scale, 1, scale);
        const stone = activeHead.getObjectByName('CenterStone');
        if (stone) stone.scale.y = scale;
      }
      updateBandAndEngraving();
      dirty = true;
      callbacks.onStatus?.('ready');
    } catch (error) {
      if (destroyed || requestId !== generation || (error as Error).name === 'AbortError') return;
      callbacks.onStatus?.('error', 'The interactive ring could not load. Please retry; your selections are saved.');
    }
  }

  function setView(view: ViewerView) {
    cameraDestination = new Vector3().fromArray(VIEW_POSITIONS[view]);
    dirty = true;
    settlingFrames = 35;
  }

  void updateConfiguration(initial);
  return {
    updateConfiguration,
    setView,
    async capturePreview() {
      if (destroyed || contextLost || !active) return null;
      renderer.render(scene, camera);
      return new Promise<Blob | null>((resolve) => renderer.domElement.toBlob(resolve, 'image/webp', 0.86));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      cancelAnimationFrame(frame);
      abortControllers.forEach((controller) => controller.abort());
      observer.disconnect();
      intersection.disconnect();
      controls.removeEventListener('change', changed);
      controls.dispose();
      renderer.domElement.removeEventListener('keydown', onKey);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      models.forEach(disposeObject);
      models.clear();
      shadow.geometry.dispose();
      (shadow.material as MeshBasicMaterial).dispose();
      shadowTexture.dispose();
      engraving?.geometry.dispose();
      engravingTexture?.dispose();
      engravingMaterial.dispose();
      metal.dispose();
      gemstone.dispose();
      environment.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

function disposeObject(group: Group) {
  const geometries = new Set<Mesh['geometry']>();
  group.traverse((object) => { if (object instanceof Mesh) geometries.add(object.geometry); });
  geometries.forEach((geometry) => geometry.dispose());
}

function makeShadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 63);
  gradient.addColorStop(0, 'rgba(0,0,0,.7)');
  gradient.addColorStop(0.4, 'rgba(0,0,0,.25)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

function makeEngravingTexture(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, 1024, 128);
  context.font = '500 70px Georgia, serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#ffffff';
  context.fillText(text, 512, 65, 960);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createEngravingGeometry(size: string | number) {
  const radius = visualInnerRadius(size) + 0.01;
  const centerOffset = bandCenterOffset(size);
  const geometry = new PlaneGeometry(1, 1, 64, 1);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) + 0.5;
    const v = position.getY(i);
    const angle = -Math.PI / 2 + (u - 0.5) * 1.35;
    position.setXYZ(i, Math.cos(angle) * radius, Math.sin(angle) * radius + centerOffset, -v * 1.18);
  }
  geometry.computeVertexNormals();
  return geometry;
}
