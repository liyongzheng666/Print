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

export function Inspector() {
  const selectedId = useSceneStore((state) => state.selectedId);
  const entity = useSceneStore((state) => (selectedId ? state.entities[selectedId] : undefined));

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
              {Object.entries(entity.metadata ?? {}).map(([key, value]) => (
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
