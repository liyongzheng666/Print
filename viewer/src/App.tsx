import { useEffect, useRef, useState } from "react";
import { Inspector } from "./features/inspector/Inspector";
import { LayerTree } from "./features/layers/LayerTree";
import { UvPanel } from "./features/uv-viewer/UvPanel";
import { Viewport3D } from "./features/viewport/Viewport3D";
import { sampleEvents } from "./sample/sampleEvents";
import { useSceneStore } from "./core/scene-store/store";

export function App() {
  const initialized = useRef(false);
  const [uvOpen, setUvOpen] = useState(false);
  const [xray, setXray] = useState(false);
  const applyEvents = useSceneStore((state) => state.applyEvents);
  const clearLocalDebugScene = useSceneStore((state) => state.clearLocalDebugScene);
  const entityCount = useSceneStore((state) => Object.keys(state.entities).length);
  const diagnostics = useSceneStore((state) => state.diagnostics);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    applyEvents(sampleEvents);
  }, [applyEvents]);

  return (
    <main className={`app-shell${uvOpen ? " uv-open" : ""}`}>
      <header className="topbar">
        <div className="product-mark">
          <strong>PRINT</strong>
          <span>OCCT 几何调试器</span>
        </div>
        <div className="session-strip">
          <span className="session-label">会话</span>
          <strong>示例会话 · run-0001</strong>
          <span className="connection-state">本地数据</span>
        </div>
        <label className="search-box">
          <span>搜索</span>
          <input type="search" placeholder="ID、Edge、Stripe、函数" disabled />
        </label>
        <div className="toolbar-actions">
          <button type="button" className={uvOpen ? "active" : ""} onClick={() => setUvOpen((value) => !value)}>
            UV {uvOpen ? "关闭" : "开启"}
          </button>
          <button type="button" className={xray ? "active" : ""} onClick={() => setXray((value) => !value)}>
            X-Ray {xray ? "开启" : "关闭"}
          </button>
          <button type="button" onClick={clearLocalDebugScene}>清空调试对象</button>
        </div>
      </header>

      <div className="workspace">
        <LayerTree />
        <Viewport3D xray={xray} />
        <Inspector />
        {uvOpen && <UvPanel />}
      </div>

      <footer className="statusbar">
        <span>对象 {entityCount}</span>
        <span>单位 mm</span>
        <span>坐标系 Z 向上</span>
        <span className={diagnostics.length ? "status-warning" : ""}>
          诊断 {diagnostics.length}
        </span>
        <span className="status-spacer" />
        <span>M0 · Scene Store / Renderer Registry</span>
      </footer>
    </main>
  );
}
