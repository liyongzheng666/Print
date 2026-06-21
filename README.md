# Print · OCCT 几何调试器

Print 是面向 FreeCAD / OpenCASCADE 几何算法调试的独立 Viewer。它同时服务于 Agent 自动调试和人类开发者分析，以原始模型为基准，增量显示算法内部产生的点、曲线、面和 Shape。

当前分支处于 M0 基础阶段：建立新协议、Scene Store、Renderer Registry 和中文工程界面。旧版 Canvas 点/边查看器仍保留在仓库根目录，迁移期间不会被直接删除。

## 已确认的产品边界

- 3D 是主视图，UV 通过按钮按需开启。
- 左侧显示适度简化的 FreeCAD 对象层级和调试分组。
- 右侧显示几何、拓扑、FreeCAD element 和源码位置。
- 支持 add/update/remove、分组显示、Solo 和清空。
- baseline 默认受保护，新 Run 默认清理旧调试对象。
- Viewer 运行在 localhost 浏览器，不内嵌 FreeCAD 或 VS Code。
- MVP 不直接控制 Agent，不实现完整时间轴。
- UI 使用中文；协议字段、类型和代码使用英文。

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
2. M1：SSE Bridge、旧 JSON adapter、搜索和 UV pane 迁移。
3. M2：BREP/mesh、FCStd baseline 和世界坐标对齐。
4. M3：Stripe、SurfData、CommonPoint 和圆角失败可视化。

完整系统架构见 [freecad-occt-debug-kit 架构文档](https://github.com/liyongzheng666/freecad-occt-debug-kit/blob/codex/occ-debug-agent-architecture/docs/occ-fillet-debug-agent-architecture.md)。M0 初始化时核对的依赖版本见 [docs/product-facts.md](docs/product-facts.md)。
