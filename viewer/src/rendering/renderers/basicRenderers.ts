import {
  ArrowHelper,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Vector3,
  type Material,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type {
  MeshGeometry,
  PointGeometry,
  PointSetGeometry,
  PolylineGeometry,
  SceneEntity,
  VectorGeometry,
  Vec3,
} from "../../core/protocol/types";
import { RendererRegistry, type EntityRenderer } from "../RendererRegistry";

function colorOf(entity: SceneEntity, fallback: string): Color {
  return new Color(entity.style?.color ?? fallback);
}

function opacityOf(entity: SceneEntity): number {
  return entity.style?.opacity ?? 1;
}

function materialOptions(entity: SceneEntity) {
  const opacity = opacityOf(entity);
  return {
    transparent: opacity < 1,
    opacity,
    depthTest: entity.style?.depth_mode !== "xray",
  };
}

function positions(values: readonly Vec3[]): Float32Array {
  return new Float32Array(values.flatMap(([x, y, z]) => [x, y, z]));
}

function tag<T extends { userData: Record<string, unknown> }>(object: T, entity: SceneEntity): T {
  object.userData.entityId = entity.id;
  object.userData.entityKind = entity.kind;
  return object;
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number");
}

// A bbox can arrive flat ({min,max}, the `bbox` kind) or nested under `bbox`
// ({bbox:{min,max}}, the daemon's `shape` placeholder — plan §4). Accept both.
function extractBBox(geometry: unknown): { min: Vec3; max: Vec3 } | null {
  const root = geometry as Record<string, unknown> | undefined;
  if (!root) return null;
  const box = (root.bbox ?? root) as { min?: unknown; max?: unknown };
  return isVec3(box.min) && isVec3(box.max) ? { min: box.min, max: box.max } : null;
}

// Dashed wireframe box from min/max (12 edges as LineSegments). Dash sizing is
// scaled to the box so dashes stay visible at any model scale; computeLineDistances
// is required for the dash pattern. Shared by `bbox` and the mesh placeholder.
function boxLines(min: Vec3, max: Vec3, entity: SceneEntity, fallbackColor: string): LineSegments {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const corner: Vec3[] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const verts: number[] = [];
  for (const [a, b] of edges) verts.push(...corner[a], ...corner[b]);
  const buffer = new BufferGeometry();
  buffer.setAttribute("position", new Float32BufferAttribute(new Float32Array(verts), 3));
  const span = Math.hypot(x1 - x0, y1 - y0, z1 - z0) || 1;
  const line = new LineSegments(
    buffer,
    new LineDashedMaterial({
      color: colorOf(entity, fallbackColor),
      dashSize: span * 0.03,
      gapSize: span * 0.02,
      ...materialOptions(entity),
    }),
  );
  line.computeLineDistances();
  return line;
}

const pointRenderer: EntityRenderer = {
  create(entity) {
    const geometry = entity.geometry as PointGeometry | undefined;
    if (!geometry?.position) return null;
    const size = entity.style?.size ?? 0.22;
    const object = new Mesh(
      new SphereGeometry(size, 14, 10),
      new MeshBasicMaterial({ color: colorOf(entity, "#efb45f"), ...materialOptions(entity) }),
    );
    object.position.fromArray(geometry.position);
    return tag(object, entity);
  },
};

const pointSetRenderer: EntityRenderer = {
  create(entity) {
    const geometry = entity.geometry as PointSetGeometry | undefined;
    if (!geometry?.positions.length) return null;
    const buffer = new BufferGeometry();
    buffer.setAttribute("position", new Float32BufferAttribute(positions(geometry.positions), 3));
    return tag(
      new Points(
        buffer,
        new PointsMaterial({
          color: colorOf(entity, "#efb45f"),
          size: entity.style?.size ?? 5,
          sizeAttenuation: false,
          ...materialOptions(entity),
        }),
      ),
      entity,
    );
  },
};

// Fat polylines via Line2/LineMaterial — plain LineBasicMaterial.linewidth is
// ignored by WebGL (always 1px), so edges need Line2 for a real thickness.
// linewidth is in screen pixels; SceneController keeps material.resolution in
// sync with the canvas size (required for correct pixel width).
const polylineRenderer: EntityRenderer = {
  create(entity) {
    const geometry = entity.geometry as PolylineGeometry | undefined;
    if (!geometry?.points || geometry.points.length < 2) return null;
    const values = geometry.closed ? [...geometry.points, geometry.points[0]] : geometry.points;
    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions(values.flatMap(([x, y, z]) => [x, y, z]));
    const material = new LineMaterial({
      color: colorOf(entity, "#7fb0a1").getHex(),
      linewidth: entity.style?.line_width ?? 3,
      worldUnits: false,
      ...materialOptions(entity),
    });
    material.resolution.set(window.innerWidth, window.innerHeight);
    return tag(new Line2(lineGeometry, material), entity);
  },
};

// Triangle mesh for `face`/`surface_patch`/`shape` (occ-debug-mesh faces).
// Flat world-coordinate arrays; shaded with MeshStandardMaterial (needs the
// lights SceneController adds), double-sided so we see into open shells.
//
// Async placeholder (M2-1 plan A): a `shape` add arrives with only a bbox and an
// occt-brep asset. SceneController fetches the print-mesh asset and re-renders
// with inline positions once it lands; until then (and for any mesh entity that
// only carries a bbox) we draw the dashed placeholder box so it is visible.
const meshRenderer: EntityRenderer = {
  create(entity) {
    const geometry = entity.geometry as MeshGeometry | undefined;
    if (!geometry?.positions?.length || !geometry.indices?.length) {
      const box = extractBBox(entity.geometry);
      return box ? tag(boxLines(box.min, box.max, entity, "#6f7d9b"), entity) : null;
    }
    const buffer = new BufferGeometry();
    buffer.setAttribute("position", new Float32BufferAttribute(new Float32Array(geometry.positions), 3));
    buffer.setIndex([...geometry.indices]);
    if (geometry.normals?.length === geometry.positions.length) {
      buffer.setAttribute("normal", new Float32BufferAttribute(new Float32Array(geometry.normals), 3));
    } else {
      buffer.computeVertexNormals();
    }
    const opacity = entity.style?.opacity ?? 0.55;
    return tag(
      new Mesh(
        buffer,
        new MeshStandardMaterial({
          color: colorOf(entity, "#6f7d9b"),
          metalness: 0,
          roughness: 0.85,
          side: DoubleSide,
          transparent: opacity < 1,
          opacity,
          depthTest: entity.style?.depth_mode !== "xray",
        }),
      ),
      entity,
    );
  },
};

const vectorRenderer: EntityRenderer = {
  create(entity) {
    const geometry = entity.geometry as VectorGeometry | undefined;
    if (!geometry?.origin || !geometry.direction) return null;
    const direction = new Vector3().fromArray(geometry.direction).normalize();
    const length = geometry.length ?? 1;
    return tag(
      new ArrowHelper(
        direction,
        new Vector3().fromArray(geometry.origin),
        length,
        colorOf(entity, "#d6a55d").getHex(),
        Math.min(length * 0.2, 0.5),
        Math.min(length * 0.08, 0.2),
      ),
      entity,
    );
  },
};

const bboxRenderer: EntityRenderer = {
  create(entity) {
    const box = extractBBox(entity.geometry);
    return box ? tag(boxLines(box.min, box.max, entity, "#92998e"), entity) : null;
  },
};

/** Geometry kinds the basic registry can render today (boundary-review D2). */
export const SUPPORTED_KINDS: ReadonlySet<string> = new Set([
  "point",
  "point_set",
  "vector",
  "polyline",
  "curve",
  "edge",
  "wire",
  "bbox",
  "face",
  "surface_patch",
  "shape",
]);

export function createBasicRendererRegistry(): RendererRegistry {
  const registry = new RendererRegistry();
  registry.register("point", pointRenderer);
  registry.register("point_set", pointSetRenderer);
  registry.register("vector", vectorRenderer);
  registry.register("polyline", polylineRenderer);
  registry.register("curve", polylineRenderer);
  registry.register("edge", polylineRenderer);
  registry.register("wire", polylineRenderer);
  registry.register("bbox", bboxRenderer);
  registry.register("face", meshRenderer);
  registry.register("surface_patch", meshRenderer);
  registry.register("shape", meshRenderer);
  return registry;
}

export function disposeObjectMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material.dispose();
}
