import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { MeshGeometry, SceneEntity } from "../core/protocol/types";
import { MeshAssetLoader } from "./meshAsset";
import { createBasicRendererRegistry, disposeObjectMaterial } from "./renderers/basicRenderers";

function hasInlineMesh(entity: SceneEntity): boolean {
  const geometry = entity.geometry as MeshGeometry | undefined;
  return Boolean(geometry?.positions?.length && geometry.indices?.length);
}

export class SceneController {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(45, 1, 0.01, 100000);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly entityRoot = new Group();
  private readonly registry = createBasicRendererRegistry();
  private readonly objects = new Map<string, Object3D>();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly resizeObserver: ResizeObserver;
  private readonly meshLoader = new MeshAssetLoader();
  private lastEntities: readonly SceneEntity[] = [];
  private frameHandle = 0;
  private xray = false;
  private onSelect: (id: string | null) => void = () => undefined;
  private onDiagnostic: (message: string) => void = () => undefined;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = "srgb";
    this.renderer.domElement.className = "viewport-canvas";
    this.container.append(this.renderer.domElement);

    this.scene.background = new Color("#171916");
    this.scene.add(this.entityRoot);
    const grid = new GridHelper(40, 40, "#4a5048", "#292c28");
    grid.rotation.x = Math.PI / 2;
    this.scene.add(grid);

    // Lights for shaded faces (MeshStandardMaterial); line/point materials are
    // unlit and unaffected. Z-up scene, so place the key light high in +Z.
    this.scene.add(new AmbientLight("#ffffff", 1.4));
    const key = new DirectionalLight("#ffffff", 2.2);
    key.position.set(0.6, -1, 1.6);
    this.scene.add(key);
    const fill = new DirectionalLight("#cdd6e6", 0.8);
    fill.position.set(-1, 0.8, -0.5);
    this.scene.add(fill);

    this.camera.position.set(13, -16, 12);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 2);

    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  setSelectionHandler(handler: (id: string | null) => void): void {
    this.onSelect = handler;
  }

  setDiagnosticHandler(handler: (message: string) => void): void {
    this.onDiagnostic = handler;
  }

  sync(entities: readonly SceneEntity[]): void {
    this.lastEntities = entities;
    const nextIds = new Set(entities.map((entity) => entity.id));
    for (const [id, object] of this.objects) {
      if (!nextIds.has(id)) this.removeObject(id, object);
    }

    for (const entity of entities) {
      const previous = this.objects.get(entity.id);
      if (previous) this.removeObject(entity.id, previous);
      const renderEntity = this.resolveMeshAsset(entity);
      const object = this.registry.get(renderEntity.kind)?.create(renderEntity) ?? null;
      if (!object) continue;
      this.applyDepthMode(object);
      this.objects.set(entity.id, object);
      this.entityRoot.add(object);
    }
    this.updateLineResolution();  // fat lines (Line2) need canvas-size resolution
  }

  // Async placeholder upgrade (M2-1 plan A): a mesh-kind entity whose `update`
  // points at a print-mesh asset has no inline triangles. Fetch + cache the
  // asset off the main path; render the placeholder (bbox) now, and re-sync to
  // swap in the real mesh once it lands. Cross-cut so the renderers stay pure.
  private resolveMeshAsset(entity: SceneEntity): SceneEntity {
    const asset = entity.asset;
    if (!asset || asset.format !== "print-mesh" || hasInlineMesh(entity)) return entity;

    const mesh = this.meshLoader.get(asset);
    if (mesh) return { ...entity, geometry: mesh };

    if (!this.meshLoader.isSettled(asset)) {
      this.meshLoader
        .load(asset)
        .then((loaded) => {
          if (loaded) this.sync(this.lastEntities);  // swap placeholder -> mesh
        })
        .catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          this.onDiagnostic(`网格资产加载失败 ${asset.path}：${detail}`);
        });
    }
    return entity;  // placeholder bbox until the mesh arrives
  }

  // Keep every Line2/LineMaterial's resolution matched to the canvas, or the
  // pixel linewidth renders wrong. Called on sync (new lines) and on resize.
  private updateLineResolution(): void {
    const size = new Vector2();
    this.renderer.getSize(size);
    this.entityRoot.traverse((object) => {
      const material = "material" in object ? (object as { material?: unknown }).material : undefined;
      if (material && (material as { isLineMaterial?: boolean }).isLineMaterial) {
        (material as LineMaterial).resolution.set(size.x, size.y);
      }
    });
  }

  setXray(enabled: boolean): void {
    this.xray = enabled;
    this.entityRoot.traverse((object) => this.applyDepthMode(object));
  }

  focus(id: string): void {
    const object = this.objects.get(id);
    if (!object) return;
    const bounds = new Box3().setFromObject(object);
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3()).length();
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center.clone().add(direction.multiplyScalar(Math.max(size * 1.6, 4))));
    this.controls.update();
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    for (const [id, object] of this.objects) this.removeObject(id, object);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.objects.values()], true)[0];
    if (!hit) {
      this.onSelect(null);
      return;
    }
    let object: Object3D | null = hit.object;
    while (object && typeof object.userData.entityId !== "string") object = object.parent;
    this.onSelect((object?.userData.entityId as string | undefined) ?? null);
  };

  private removeObject(id: string, object: Object3D): void {
    this.entityRoot.remove(object);
    object.traverse((child) => {
      const geometry = "geometry" in child ? child.geometry : undefined;
      const disposableGeometry = geometry as { dispose?: () => void } | undefined;
      disposableGeometry?.dispose?.();
      const material = "material" in child ? (child.material as Material | Material[]) : undefined;
      if (material) disposeObjectMaterial(material);
    });
    this.objects.delete(id);
  }

  private applyDepthMode(object: Object3D): void {
    const material = "material" in object ? (object.material as Material | Material[]) : undefined;
    if (!material) return;
    const values = Array.isArray(material) ? material : [material];
    values.forEach((item) => {
      item.depthTest = !this.xray;
      item.needsUpdate = true;
    });
  }

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.updateLineResolution();
  }

  private animate = (): void => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frameHandle = requestAnimationFrame(this.animate);
  };
}
