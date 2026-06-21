import { useMemo } from "react";
import { isGroupVisible } from "../../core/scene-store/reducer";
import { useSceneStore } from "../../core/scene-store/store";

export function LayerTree() {
  const entities = useSceneStore((state) => state.entities);
  const groupVisibility = useSceneStore((state) => state.groupVisibility);
  const selectedId = useSceneStore((state) => state.selectedId);
  const selectEntity = useSceneStore((state) => state.selectEntity);
  const setGroupVisibility = useSceneStore((state) => state.setGroupVisibility);
  const soloGroup = useSceneStore((state) => state.soloGroup);
  const clearGroup = useSceneStore((state) => state.clearGroup);

  const groups = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const entity of Object.values(entities)) {
      const ids = result.get(entity.group) ?? [];
      ids.push(entity.id);
      result.set(entity.group, ids);
    }
    return [...result.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [entities]);

  return (
    <aside className="panel layer-panel" aria-label="模型和调试分组">
      <header className="panel-heading">
        <span>对象与分组</span>
        <span className="panel-count">{Object.keys(entities).length}</span>
      </header>
      <div className="layer-list">
        {groups.map(([group, ids]) => {
          const visible = isGroupVisible(group, groupVisibility);
          const protectedGroup = group === "baseline" || group.startsWith("baseline/");
          return (
            <section key={group} className="layer-group">
              <div className="layer-group-row" style={{ paddingLeft: 10 + (group.split("/").length - 1) * 12 }}>
                <button
                  className="visibility-button"
                  type="button"
                  aria-label={visible ? `隐藏 ${group}` : `显示 ${group}`}
                  onClick={() => setGroupVisibility(group, !visible)}
                >
                  {visible ? "显示" : "隐藏"}
                </button>
                <span className="layer-name" title={group}>{group}</span>
                {protectedGroup && <span className="protected-mark">锁定</span>}
                <span className="layer-count">{ids.length}</span>
                <button className="text-action" type="button" onClick={() => soloGroup(group)}>Solo</button>
                {!protectedGroup && (
                  <button className="text-action danger" type="button" onClick={() => clearGroup(group)}>清空</button>
                )}
              </div>
              <div className="entity-list">
                {ids.map((id) => {
                  const entity = entities[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`entity-row${selectedId === id ? " selected" : ""}`}
                      onClick={() => selectEntity(id)}
                    >
                      <span className="entity-kind">{entity.kind}</span>
                      <span className="entity-label">{entity.label ?? entity.id}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
