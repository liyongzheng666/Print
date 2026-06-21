import type { Object3D } from "three";
import type { GeometryKind, SceneEntity } from "../core/protocol/types";

export interface EntityRenderer {
  readonly create: (entity: SceneEntity) => Object3D | null;
  readonly update?: (object: Object3D, entity: SceneEntity) => void;
}

export class RendererRegistry {
  private readonly renderers = new Map<GeometryKind, EntityRenderer>();

  register(kind: GeometryKind, renderer: EntityRenderer): this {
    if (this.renderers.has(kind)) {
      throw new Error(`Renderer 已注册：${kind}`);
    }
    this.renderers.set(kind, renderer);
    return this;
  }

  get(kind: GeometryKind): EntityRenderer | undefined {
    return this.renderers.get(kind);
  }

  has(kind: GeometryKind): boolean {
    return this.renderers.has(kind);
  }
}
