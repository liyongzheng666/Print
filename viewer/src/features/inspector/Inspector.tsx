import type { SceneEntity } from "../../core/protocol/types";
import { useSceneStore } from "../../core/scene-store/store";

function DataRow({ label, value }: { readonly label: string; readonly value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  const display = typeof value === "object" ? JSON.stringify(value) : String(value);
  return (
    <div className="data-row">
      <dt>{label}</dt>
      <dd title={display}>{display}</dd>
    </div>
  );
}

/** Round to at most 6 decimals and drop trailing zeros (mm, double-precision). */
function fmt(n: number): string {
  return Number.isFinite(n) ? String(Number(n.toFixed(6))) : String(n);
}

function asVec3(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const [x, y, z] = value;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return undefined;
  return `(${fmt(x)}, ${fmt(y)}, ${fmt(z)})`;
}

function asVec3List(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export interface InspectorRow {
  readonly label: string;
  readonly value: unknown;
}

/** Human-readable 3D coordinate rows for an entity's inline geometry. */
export function geometryRows(entity: SceneEntity): InspectorRow[] {
  const geometry = entity.geometry as Record<string, unknown> | undefined;
  if (!geometry) return [];
  switch (entity.kind) {
    case "point":
      return [{ label: "坐标", value: asVec3(geometry.position) }];
    case "point_set": {
      const points = asVec3List(geometry.positions);
      return [
        { label: "点数", value: points.length },
        { label: "首点", value: points.length ? asVec3(points[0]) : undefined },
        { label: "末点", value: points.length ? asVec3(points[points.length - 1]) : undefined },
      ];
    }
    case "polyline":
    case "curve":
    case "edge":
    case "wire": {
      const points = asVec3List(geometry.points);
      return [
        { label: "点数", value: points.length },
        { label: "头", value: points.length ? asVec3(points[0]) : undefined },
        { label: "尾", value: points.length ? asVec3(points[points.length - 1]) : undefined },
        { label: "闭合", value: geometry.closed ? "是" : undefined },
      ];
    }
    case "vector":
      return [
        { label: "起点", value: asVec3(geometry.origin) },
        { label: "方向", value: asVec3(geometry.direction) },
        { label: "长度", value: typeof geometry.length === "number" ? fmt(geometry.length) : undefined },
      ];
    case "bbox":
      return [
        { label: "Min", value: asVec3(geometry.min) },
        { label: "Max", value: asVec3(geometry.max) },
      ];
    default:
      return [];
  }
}

export function Inspector() {
  const selectedId = useSceneStore((state) => state.selectedId);
  const entity = useSceneStore((state) => (selectedId ? state.entities[selectedId] : undefined));
  const geomRows = entity ? geometryRows(entity) : [];

  return (
    <aside className="panel inspector-panel" aria-label="对象属性检查器">
      <header className="panel-heading">属性检查器</header>
      {!entity ? (
        <div className="empty-panel">
          <strong>未选择对象</strong>
          <span>在三维视图或左侧列表中选择调试对象。</span>
        </div>
      ) : (
        <div className="inspector-content">
          <section className="inspector-section">
            <h2>对象</h2>
            <dl>
              <DataRow label="ID" value={entity.id} />
              <DataRow label="名称" value={entity.label} />
              <DataRow label="类型" value={entity.kind} />
              <DataRow label="分组" value={entity.group} />
              <DataRow label="Run" value={entity.run_id} />
            </dl>
          </section>
          {geomRows.length > 0 && (
            <section className="inspector-section">
              <h2>几何（世界坐标 · mm）</h2>
              <dl>
                {geomRows.map((row) => (
                  <DataRow key={row.label} label={row.label} value={row.value} />
                ))}
              </dl>
            </section>
          )}
          <section className="inspector-section">
            <h2>拓扑</h2>
            <dl>
              <DataRow label="Shape" value={entity.topology_ref?.shape_type} />
              <DataRow label="方向" value={entity.topology_ref?.orientation} />
              <DataRow label="对象" value={entity.topology_ref?.freecad_object} />
              <DataRow label="Element" value={entity.topology_ref?.freecad_element} />
              <DataRow label="Mapped" value={entity.topology_ref?.mapped_element} />
              <DataRow label="路径" value={entity.topology_ref?.occurrence_path} />
              <DataRow label="TShape" value={entity.topology_ref?.runtime_tshape} />
            </dl>
          </section>
          <section className="inspector-section">
            <h2>调试来源</h2>
            <dl>
              <DataRow label="阶段" value={entity.source?.phase} />
              <DataRow label="函数" value={entity.source?.function} />
              <DataRow
                label="位置"
                value={entity.source?.file ? `${entity.source.file}:${entity.source.line ?? "?"}` : undefined}
              />
            </dl>
          </section>
          <section className="inspector-section">
            <h2>元数据</h2>
            <dl>
              {Object.entries(entity.metadata ?? {})
                .filter(([key]) => key !== "uv")
                .map(([key, value]) => (
                  <DataRow key={key} label={key} value={value} />
                ))}
            </dl>
          </section>
          <div className="inspector-actions">
            <button type="button" onClick={() => void navigator.clipboard.writeText(entity.id)}>复制 ID</button>
            <button type="button" onClick={() => void navigator.clipboard.writeText(JSON.stringify(entity, null, 2))}>复制 JSON</button>
          </div>
        </div>
      )}
    </aside>
  );
}
