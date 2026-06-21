# Print · OCCT 几何调试器

Print 是面向 FreeCAD / OpenCASCADE 几何算法调试的独立 Viewer。它同时服务于 Agent 自动调试和人类开发者分析，以原始模型为基准，增量显示算法内部产生的点、曲线、面和 Shape。

当前版本处于 M0 基础阶段：建立新协议、Scene Store、Renderer Registry 和中文工程界面。旧版 Canvas 点/边查看器仍保留在仓库根目录，迁移期间不会被直接删除。

## 已确认的产品边界

- 3D 是主视图，UV 通过按钮按需开启。
- 左侧显示适度简化的 FreeCAD 对象层级和调试分组。
- 右侧显示几何、拓扑、FreeCAD element 和源码位置。
- 支持 add/update/remove、分组显示、Solo 和清空。
- baseline 默认受保护，新 Run 默认清理旧调试对象。
- Viewer 运行在 localhost 浏览器，不内嵌 FreeCAD 或 VS Code。
- MVP 不直接控制 Agent，不实现完整时间轴。
- UI 使用中文；协议字段、类型和代码使用英文。

## 数据如何进入 Print

Print 不要求开发者手工制作一个完整 JSON 文件。新版以 Session 为单位增量消费：

```text
VS Code Variables/Watch 右键 ─► LLDB 动态命令 ─┐
手工 LLDB 动态命令 ───────────────────────────┤
断点自动采集 ─────────────────────────────────┼──► events.ndjson + assets/*.brep ──► Bridge ──► Print
关键路径源码探针 ─────────────────────────────┘
```

第一版必须支持 FreeCAD/OCCT 在断点暂停时，从 VS Code Variables 或 Watch 右键“发送到 Print”。常用入口自动识别 `gp_Pnt`、Curve、`TopoDS_Edge/Wire/Face/Shape`，歧义时允许明确选择类型；操作必须绑定变量所属的准确栈帧。

Debug Console 命令作为高级入口和故障回退：

```text
(lldb) occdbg point P1 -- CP.Point()
(lldb) occdbg edge selected -- edge
(lldb) occdbg face support -- HS1->Face()
(lldb) occdbg shape current -- myShape
(lldb) occdbg clear fillet/stripe/2
```

Capture 动态库只需一次构建和加载；之后无论右键发送还是手工命令，观察不同变量都不需要修改源码或重新编译。高频循环、极短生命周期和异常前关键状态才使用源码探针。

“发送到 Print”是用户操作语义，扩展不会把进程内 C++ 对象直接通过 HTTP 交给浏览器。实际路径仍是 `CodeLLDB → occdbg/Capture → Session → Bridge → Print`，因此 Bridge 或 Viewer 暂时离线时事件仍可落盘，并在重连后恢复。右键菜单、frame 跟踪、类型识别和 F5 编排属于 Kit；Print 保持纯协议消费者。

小几何以内联事件写入 `events.ndjson`，Face/Shape 等大几何写为 BREP 资产并由事件引用。BREP→显示 Mesh 的三角化由 Kit 生产端（`occ-debug-mesh`，与被调试进程同一 OCCT ABI）在写入资产时完成；Bridge 只负责 tail NDJSON、静态托管 `assets/`（含 BREP 与派生 mesh），并通过 SSE 推送给当前 Scene Store——Bridge 不调用 Kit 二进制，Print 保持纯消费。完整接缝见 [Kit 联动技术选型](https://github.com/liyongzheng666/freecad-occt-debug-kit/blob/main/docs/print-linkage-tech-decisions.md)。

事件可以在 `metadata.producer` 中标明来源：

- `lldb-dynamic`
- `lldb-breakpoint`
- `source-probe`
- `freecad-baseline`

渲染逻辑不依赖生产方式。完整设计见 [Kit 的 LLDB 动态几何采集文档](https://github.com/liyongzheng666/freecad-occt-debug-kit/blob/main/docs/lldb-dynamic-geometry-capture.md) 和 [VS Code 一键发送设计](https://github.com/liyongzheng666/freecad-occt-debug-kit/blob/main/docs/vscode-send-to-print.md)。

## 技术栈

- TypeScript 6
- Vite 8
- React 19
- Zustand 5
- Three.js r184
- Vitest 4

React 负责工具栏、分组树、属性检查器和 UV 面板；Three.js 由独立 `SceneController` 管理，不使用 React Three Fiber。

## 新版开发入口

要求 Node.js 20.19+；当前开发环境使用 Node.js 24。

```bash
npm install
npm run dev
```

浏览器访问 <http://127.0.0.1:5777>。

验证命令：

```bash
npm run typecheck
npm test
npm run build
```

## 目录结构

```text
Print/
├── protocol/
│   ├── event.schema.json
│   └── session.schema.json
├── viewer/
│   ├── index.html
│   └── src/
│       ├── core/
│       │   ├── protocol/
│       │   └── scene-store/
│       ├── rendering/
│       │   └── renderers/
│       ├── features/
│       │   ├── layers/
│       │   ├── inspector/
│       │   ├── uv-viewer/
│       │   └── viewport/
│       └── sample/
├── TestJson/                     # 旧版测试数据，继续复用
├── OCCTest/                      # 旧版 OCCT 导出实验
├── index.html                    # 旧版入口
├── viewer.js / parser.js         # 旧版实现
└── package.json
```

## M0 已建立的边界

### 增量事件

`protocol/event.schema.json` 定义：

- `add`
- `update`
- `remove`
- `clear_group`
- `clear_scene`
- `set_visibility`
- `highlight`
- `focus`
- `note`
- `run_end`

### Scene Store

Scene Store 负责：

- 按 ID 保存调试实体。
- 检测重复 ID 和事件序号缺口。
- 分组递归清理。
- 保护 baseline。
- 管理可见性、高亮、定位请求和运行摘要。

纯 reducer 与 Zustand adapter 分离，便于无浏览器单元测试和后续 Bridge 回放。

### Renderer Registry

几何类型通过注册器接入，不在主 Viewport 中堆积条件分支：

```ts
registry.register("point", pointRenderer);
registry.register("polyline", polylineRenderer);
registry.register("shape", shapeRenderer);
```

当前 M0 已提供 point、point_set、vector、polyline/curve/edge/wire 和 bbox 的基础 Renderer。BREP/mesh、Face 和 surface_patch 在后续里程碑接入。

## 旧版能力如何复用

保留并迁移：

- 2D UV 与 3D 联动思路。
- 搜索、选中和高亮交互。
- 标签和重合边可读性经验。
- `TestJson` 中的曲线、周期面和闭合面数据。

逐步替换：

- Canvas 3D Renderer。
- `parseModel()` 的 points/edges 单次模型。
- `setModel()` 全量覆盖流程。
- 重复维护的 `app.js`。

旧 `cg_edge_export` 将通过兼容适配器导入，不再继续扩展为新协议。

## 几何约束

- BREP 是权威几何，浏览器 Mesh 只是派生显示数据。
- UV 属于 Edge 在 Face 上的 occurrence/Pcurve，不属于全局三维点。
- 调试对象 ID 只保证单个 Session/Run 内稳定。
- TShape 地址只能用于同进程诊断，不能作为持久拓扑命名。
- Viewer 不应默认偏移真实几何来区分重合边。

## 旧版运行方式

迁移期间仍可在仓库根目录启动旧版：

```bash
python3 -m http.server 5778
```

打开 <http://127.0.0.1:5778/index.html>。

## 近期里程碑

1. M0：协议、Scene Store、Renderer Registry 和工程界面。
2. M1：SSE Bridge、NDJSON Session、旧 JSON adapter、搜索和 UV pane 迁移。
3. M2：LLDB 动态 Capture、BREP/mesh、FCStd baseline、世界坐标对齐，以及 Variables/Watch 右键发送和 F5 一键编排；这是第一版端到端闭环。
4. M3：断点自动采集、Stripe、SurfData、CommonPoint 和圆角失败可视化。

完整系统架构见 [freecad-occt-debug-kit 主分支架构文档](https://github.com/liyongzheng666/freecad-occt-debug-kit/blob/main/docs/occ-fillet-debug-agent-architecture.md)。M0 初始化时核对的依赖版本见 [docs/product-facts.md](docs/product-facts.md)。
