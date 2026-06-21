import {
  ArrowHelper,
  Box3,
  Box3Helper,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Material,
} from "three";
import type {
  BoundingBoxGeometry,
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

const polylineRenderer: EntityRenderer = {
  create(entity) {
    const geometry = entity.geometry as PolylineGeometry | undefined;
    if (!geometry?.points || geometry.points.length < 2) return null;
    const values = geometry.closed ? [...geometry.points, geometry.points[0]] : geometry.points;
    const buffer = new BufferGeometry();
    buffer.setAttribute("position", new Float32BufferAttribute(positions(values), 3));
    return tag(
      new Line(
        buffer,
        new LineBasicMaterial({ color: colorOf(entity, "#7fb0a1"), ...materialOptions(entity) }),
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
    const geometry = entity.geometry as BoundingBoxGeometry | undefined;
    if (!geometry?.min || !geometry.max) return null;
    return tag(
      new Box3Helper(
        new Box3(new Vector3().fromArray(geometry.min), new Vector3().fromArray(geometry.max)),
        colorOf(entity, "#92998e"),
      ),
      entity,
    );
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
  return registry;
}

export function disposeObjectMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material.dispose();
}
