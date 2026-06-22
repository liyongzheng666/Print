export const SCHEMA_VERSION = "1.0" as const;

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export type GeometryKind =
  | "point"
  | "point_set"
  | "vector"
  | "polyline"
  | "curve"
  | "edge"
  | "wire"
  | "surface_patch"
  | "face"
  | "shape"
  | "bbox"
  | "defect";

export interface SourceLocation {
  readonly file?: string;
  readonly line?: number;
  readonly function?: string;
  readonly phase?: string;
}

export interface TopologyRef {
  readonly freecad_object?: string;
  readonly freecad_element?: string;
  readonly mapped_element?: string;
  readonly occurrence_path?: string;
  readonly shape_type?: string;
  readonly orientation?: "FORWARD" | "REVERSED" | "INTERNAL" | "EXTERNAL";
  readonly location_hash?: string;
  readonly runtime_tshape?: string;
}

export type DefectCategory =
  | "self_intersection"
  | "open_boundary"
  | "twisted_surface"
  | "degenerate"
  | "non_manifold"
  | "invalid_pcurve"
  | "walking_failure";

export interface DefectRef {
  readonly entity_id?: string;
  readonly face_id?: string;
  readonly edge_id?: string;
}

export interface DefectInfo {
  readonly category: DefectCategory;
  readonly source: "brepcheck" | "bopcheck" | "chfi3d";
  readonly severity: "error" | "warning";
  readonly status?: string;
  readonly message?: string;
  readonly ref?: DefectRef;
}

export interface EntityStyle {
  readonly color?: string;
  readonly opacity?: number;
  readonly size?: number;
  readonly line_width?: number;
  readonly depth_mode?: "normal" | "xray";
  readonly protected?: boolean;
}

export interface PointGeometry {
  readonly position: Vec3;
}

export interface PointSetGeometry {
  readonly positions: readonly Vec3[];
}

export interface PolylineGeometry {
  readonly points: readonly Vec3[];
  readonly closed?: boolean;
}

export interface VectorGeometry {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly length?: number;
}

export interface BoundingBoxGeometry {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface AssetRef {
  readonly format: "occt-brep" | "print-mesh";
  readonly path: string;
  readonly sha256?: string;
}

export type Unit = "mm" | "cm" | "m" | "in";

/** Parsed print-mesh asset (occ-debug-mesh output); world-coordinate doubles. */
export interface MeshFace {
  readonly face_id: string;
  readonly orientation?: "FORWARD" | "REVERSED" | "INTERNAL" | "EXTERNAL";
  readonly positions: readonly number[];
  readonly indices: readonly number[];
  readonly normals?: readonly number[];
}

export interface MeshEdge {
  readonly edge_id: string;
  readonly points: readonly number[];
}

export interface PrintMeshAsset {
  readonly format_version: "1.0";
  readonly unit: Unit;
  readonly partial?: boolean;
  readonly failed_faces?: readonly string[];
  readonly faces?: readonly MeshFace[];
  readonly edges?: readonly MeshEdge[];
}

/** Session-level metadata the viewer needs (from manifest.json). */
export interface SessionInfo {
  readonly session_id: string;
  readonly unit: Unit;
  /** World-coordinate offset subtracted before Float32 downcast (M2-6). */
  readonly local_origin?: Vec3;
}

export type InlineGeometry =
  | PointGeometry
  | PointSetGeometry
  | PolylineGeometry
  | VectorGeometry
  | BoundingBoxGeometry
  | Readonly<Record<string, unknown>>;

export interface SceneEntity {
  readonly id: string;
  readonly group: string;
  readonly kind: GeometryKind;
  readonly label?: string;
  readonly run_id: string;
  readonly geometry?: InlineGeometry;
  readonly asset?: AssetRef;
  readonly style?: EntityStyle;
  readonly source?: SourceLocation;
  readonly topology_ref?: TopologyRef;
  readonly defect?: DefectInfo;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface EventEnvelope {
  readonly schema_version: typeof SCHEMA_VERSION;
  readonly session_id: string;
  readonly run_id: string;
  readonly seq: number;
  readonly timestamp_ns?: number;
}

export interface AddEvent extends EventEnvelope, SceneEntity {
  readonly op: "add";
}

export interface UpdateEvent extends EventEnvelope {
  readonly op: "update";
  readonly id: string;
  readonly patch: Partial<Omit<SceneEntity, "id">>;
}

export interface RemoveEvent extends EventEnvelope {
  readonly op: "remove";
  readonly id: string;
}

export interface ClearGroupEvent extends EventEnvelope {
  readonly op: "clear_group";
  readonly group: string;
  readonly include_protected?: boolean;
}

export interface ClearSceneEvent extends EventEnvelope {
  readonly op: "clear_scene";
  readonly include_protected?: boolean;
}

export interface SetVisibilityEvent extends EventEnvelope {
  readonly op: "set_visibility";
  readonly target: { readonly type: "entity" | "group"; readonly id: string };
  readonly visible: boolean;
}

export interface HighlightEvent extends EventEnvelope {
  readonly op: "highlight";
  readonly ids: readonly string[];
}

export interface FocusEvent extends EventEnvelope {
  readonly op: "focus";
  readonly id: string;
}

export interface NoteEvent extends EventEnvelope {
  readonly op: "note";
  readonly level: "info" | "warning" | "algorithm_failure" | "capture_failure" | "infrastructure_failure";
  readonly message: string;
  readonly group?: string;
  readonly source?: SourceLocation;
}

export interface RunEndEvent extends EventEnvelope {
  readonly op: "run_end";
  readonly status: "succeeded" | "failed" | "aborted";
  readonly summary?: Readonly<Record<string, unknown>>;
}

export type DebugEvent =
  | AddEvent
  | UpdateEvent
  | RemoveEvent
  | ClearGroupEvent
  | ClearSceneEvent
  | SetVisibilityEvent
  | HighlightEvent
  | FocusEvent
  | NoteEvent
  | RunEndEvent;

export function entityFromAddEvent(event: AddEvent): SceneEntity {
  return {
    id: event.id,
    group: event.group,
    kind: event.kind,
    label: event.label,
    run_id: event.run_id,
    geometry: event.geometry,
    asset: event.asset,
    style: event.style,
    source: event.source,
    topology_ref: event.topology_ref,
    defect: event.defect,
    metadata: event.metadata,
  };
}
