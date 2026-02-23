# JSON Data Format Specification (`cg_edge_export`) / JSON 数据格式说明 (`cg_edge_export`)

This directory contains test datasets generated for 3D/2D parameter space rendering, using a custom JSON format designed to export boundary edge information from geometric surfaces (e.g., OpenCASCADE `TopoDS_Face`).
本目录包含用于 3D曲面/2D参数空间渲染的测试数据集，采用自定义 JSON 格式，旨在导出几何曲面（如 OpenCASCADE 的 `TopoDS_Face`）的边界信息。

The current schema version is `1.0` under the format identifier `cg_edge_export`.
当前格式标识符为 `cg_edge_export`，版本号为 `1.0`。

## Structure Overview / 结构总览

The root of the JSON file consists of three main sections: **Metadata (`meta`)**, **Points (`points`)**, and **Edges (`edges`)**.
JSON 文件的根节点由三个主要部分组成：**元数据 (`meta`)**、**点集 (`points`)** 和 **边集 (`edges`)**。

```json
{
  "format": "cg_edge_export",
  "version": "1.0",
  "meta": { ... },
  "points": [ ... ],
  "edges": [ ... ]
}
```

### 1. Metadata (`meta`) / 元数据

Provides general context for the mesh/geometry data.
提供网格或几何数据的通用上下文信息。

*   `unit`: Physical unit of the 3D coordinates (e.g., `"mm"`). / 3D 坐标的物理单位（例如 `"mm"`）。
*   `coord_system`: Orientation of the 3D space (e.g., `"right_handed"`). / 3D 坐标系的方向（例如左手/右手系，`"right_handed"`）。
*   `note`: Description or human-readable comments about the context of the dataset. / 关于数据集背景的人类可读描述或注释。

### 2. Points (`points`) / 点集

A flat array containing all unique vertices and sampled curve points in the dataset. Each point maps a 3D Cartesian coordinate to its 2D parametric (`u, v`) equivalent on a specific surface.
包含数据集中所有唯一顶点和采样曲线点的扁平数组。每个点都将 3D 的笛卡尔坐标映射为了特定曲面上的 2D 参数坐标 (`u, v`)。

*   `id`: A globally unique string identifier for the point (e.g., `"P0001"`). / 全局唯一的点字符串标识符。
*   `x`, `y`, `z`: The 3D world coordinates. / 3D 世界坐标。
*   `u`, `v`: The 2D parametric coordinates mapping to the surface domain. / 映射到曲面域内的 2D 参数坐标。

**Example / 示例:**
```json
{
  "id": "P0042",
  "x": 5.0,
  "y": 0.0,
  "z": 10.0,
  "u": 0.0,
  "v": 10.0
}
```

### 3. Edges (`edges`) / 边集

Defines the boundary wires of the surface. Each edge is essentially a polyline constructed by connecting a sequence of IDs defined in the `points` array. It also retains topological connectivity information with other edges.
定义了曲面的边界线框。每条边本质上是一条多段线，由连接 `points` 数组中的 ID 序列构成。它还保留了与其他边的拓扑连接信息。

*   `id`: A globally unique string identifier for the edge (e.g., `"E0001"`). / 全局唯一的边字符串标识符。
*   `type`: Geometry type line format (e.g., `"polyline"`). / 几何线段类型的格式说明。
*   `point_ids`: An ordered array of point IDs defining the sampling nodes along the curve. / 包含沿曲线采样节点的有序点 ID 数组。
*   `start_point_id` / `end_point_id`: The explicitly stated start and end traversal nodes of this edge (must match the first and last elements in `point_ids`). / 明确声明的此边遍历的起始和结束节点（必须与 `point_ids` 中的首尾元素匹配）。
*   `curve_hint`: Additional rendering or geometric insights about the raw curve. / 关于原始曲线的附加渲染或几何提示。
    *   `kind`: Categorical hint (e.g., `"nurbs_discrete"`, `"circle"`, `"seam_line"`). / 类别提示（如：离散nurbs、圆、缝合线）。
    *   `degree`: (Optional) The polynomial degree of the curve if applicable (e.g., `3`). / (可选) 曲线的多项式阶数。
    *   `sample_count`: (Optional) The number of discrete points the curve was evaluated at. / (可选) 曲线被计算估值的离散点数量。
    *   `closed_u`: (Optional) Boolean flag indicating if the geometry wraps around in the U parameter (useful for cylinders/spheres). / (可选) 布尔标志，指示几何体是否在 U 参数方向上闭合（适用于圆柱/球体）。
*   `connected_edges`: Represents the topological graph. Defines which other edges connect to the current edge's endpoints. / 表示拓扑图。定义其他哪些边连接到了当前边的端点。
    *   `edge_id`: The ID of the connecting edge. / 连接边的 ID。
    *   `via_point_id`: The shared vertex ID where the connection occurs. / 发生连接的共享顶点 ID。
    *   `self_at`: Specifies which end of the current edge the connection is on (`"start"` or `"end"`). / 指定连接在当前边的哪一端。
    *   `other_at`: Specifies which end of the connecting edge is attached (`"start"` or `"end"`). / 指定连接在对接边的哪一端。

**Example / 示例:**
```json
{
  "id": "E0001",
  "point_ids": ["P0001", "P0002", "P0003"],
  "start_point_id": "P0001",
  "end_point_id": "P0003",
  "type": "polyline",
  "curve_hint": {
    "kind": "circle",
    "closed_u": true
  },
  "connected_edges": [
    {
      "edge_id": "E0004",
      "via_point_id": "P0001",
      "self_at": "start",
      "other_at": "end"
    }
  ]
}
```

## Design Principles / 设计原则
1.  **Vertex Deduplication / 顶点去重**: Any geometric intersection or junction point (such as `via_point_id`) only appears exactly once in the `points` array to ensure consistent topology selection during rendering/highlighting. / 任何几何交点或连接点（例如 `via_point_id`）在 `points` 数组中只出现一次，以确保在渲染或高亮选择时有统一的拓扑一致性。
2.  **UV Verification / UV 确认**: By preserving both `(x, y, z)` and `(u, v)` inside the same element, viewing applications can seamlessly toggle or dual-render the mapping between the 3D shape and the unrolled 2D parameter space. / 通过在相同元素中保留 3D 和 2D 坐标值，查看应用能够无缝地在 3D 几何图形与展开的 UV 二维参数空间之间切换或提供双屏对照渲染。
3.  **Topology Graphing / 拓扑图构建**: The bidirectional `connected_edges` lists ensure that closed wire boundary loops can be programmatically verified and traversed without needing to perform spatial coordinate searches. / 双向的连接关系列表确保能够以编程方式校验与遍历已闭合的线框边界环，而无需执行繁重的空间坐标搜索。
