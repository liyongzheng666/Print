import { useSceneStore } from "../../core/scene-store/store";

export function UvPanel() {
  const selectedId = useSceneStore((state) => state.selectedId);
  const entity = useSceneStore((state) => (selectedId ? state.entities[selectedId] : undefined));
  const uv = entity?.metadata?.uv_on_s1 ?? entity?.metadata?.uv_polyline;

  return (
    <section className="uv-panel" aria-label="二维参数空间">
      <header>
        <span>二维参数空间</span>
        <span className="uv-object">{entity?.label ?? "未选择 Edge / Face"}</span>
      </header>
      <div className="uv-stage">
        <div className="uv-axis u-axis">U</div>
        <div className="uv-axis v-axis">V</div>
        {uv ? (
          <div className="uv-value">当前 UV：{JSON.stringify(uv)}</div>
        ) : (
          <div className="uv-placeholder">当前对象没有 Pcurve/UV 数据。后续由 edge-on-face 事件驱动绘制。</div>
        )}
      </div>
    </section>
  );
}
