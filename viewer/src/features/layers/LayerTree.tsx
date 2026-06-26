import { useMemo } from "react";
import { isGroupLocked, isGroupVisible } from "../../core/scene-store/reducer";
import { useSceneStore } from "../../core/scene-store/store";

export function LayerTree() {
  const entities = useSceneStore((state) => state.entities);
  const entityVisibility = useSceneStore((state) => state.entityVisibility);
  const groupVisibility = useSceneStore((state) => state.groupVisibility);
  const selectedId = useSceneStore((state) => state.selectedId);
  const selectEntity = useSceneStore((state) => state.selectEntity);
  const setEntityVisibility = useSceneStore((state) => state.setEntityVisibility);
  const setGroupVisibility = useSceneStore((state) => state.setGroupVisibility);
  const soloGroup = useSceneStore((state) => state.soloGroup);
  const showAllGroups = useSceneStore((state) => state.showAllGroups);
  const hideAllGroups = useSceneStore((state) => state.hideAllGroups);
  const clearGroup = useSceneStore((state) => state.clearGroup);
  const lockedGroups = useSceneStore((state) => state.lockedGroups);
  const setGroupLocked = useSceneStore((state) => state.setGroupLocked);

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
        <button className="text-action" type="button" onClick={showAllGroups}>显示全部</button>
        <button className="text-action" type="button" onClick={hideAllGroups}>隐藏全部</button>
        <span className="panel-count">{Object.keys(entities).length}</span>
      </header>
      <div className="layer-list">
        {groups.map(([group, ids]) => {
          const visible = isGroupVisible(group, groupVisibility);
          const locked = isGroupLocked(group, lockedGroups);
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
                <button
                  className={`lock-toggle${locked ? " locked" : ""}`}
                  type="button"
                  title={locked ? "已锁定：清空调试对象时保留。点击解锁" : "未锁定：清空调试对象时移除。点击锁定"}
                  aria-label={locked ? `解锁 ${group}` : `锁定 ${group}`}
                  onClick={() => setGroupLocked(group, !locked)}
                >
                  {locked ? "🔒锁定" : "🔓未锁"}
                </button>
                <span className="layer-count">{ids.length}</span>
                <button className="text-action" type="button" onClick={() => soloGroup(group)}>Solo</button>
                {!locked && (
                  <button className="text-action danger" type="button" onClick={() => clearGroup(group)}>清空</button>
                )}
              </div>
              <div className="entity-list">
                {ids.map((id) => {
                  const entity = entities[id];
                  const entityVisible = entityVisibility[id] !== false;
                  return (
                    <div key={id} className={`entity-row${selectedId === id ? " selected" : ""}`}>
                      <button
                        className="visibility-button"
                        type="button"
                        aria-label={entityVisible ? `隐藏 ${entity.label ?? id}` : `显示 ${entity.label ?? id}`}
                        onClick={() => setEntityVisibility(id, !entityVisible)}
                      >
                        {entityVisible ? "显示" : "隐藏"}
                      </button>
                      <button
                        type="button"
                        className={`entity-select${entityVisible ? "" : " entity-hidden"}`}
                        onClick={() => selectEntity(id)}
                      >
                        <span className="entity-kind">{entity.kind}</span>
                        <span className="entity-label">{entity.label ?? entity.id}</span>
                      </button>
                    </div>
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
