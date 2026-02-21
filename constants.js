// constants.js – 全局常量：示例数据、颜色调色板、虚线样式
"use strict";

// ── 内置示例数据 ─────────────────────────────────────────────────
const SAMPLE_DATA = {
    format: "cg_edge_export",
    version: "1.0",
    meta: {
        unit: "mm",
        coord_system: "right_handed",
        point_merge_tolerance: 1e-6
    },
    points: [
        { id: "P1", x: 0.0, y: 0.0, z: 0.0 },
        { id: "P2", x: 1.0, y: 0.0, z: 0.0 },
        { id: "P3", x: 2.0, y: 0.5, z: 0.0 },
        { id: "P4", x: 2.0, y: 1.0, z: 0.0 },
        { id: "P5", x: 1.2, y: 1.4, z: 0.8 }
    ],
    edges: [
        {
            id: "E1001",
            point_ids: ["P1", "P2", "P3"],
            start_point_id: "P1",
            end_point_id: "P3",
            type: "polyline",
            connected_edges: []
        },
        {
            id: "E1002",
            point_ids: ["P3", "P4", "P5"],
            start_point_id: "P3",
            end_point_id: "P5",
            type: "polyline",
            connected_edges: []
        }
    ]
};

// ── 重叠边高对比度颜色调色板 ──────────────────────────────────────
const OVERLAP_PALETTE = [
    "hsl(210, 80%, 50%)",    // 蓝
    "hsl(0, 75%, 52%)",      // 红
    "hsl(140, 70%, 38%)",    // 绿
    "hsl(280, 65%, 50%)",    // 紫
    "hsl(35, 90%, 50%)",     // 橙
    "hsl(180, 65%, 40%)",    // 青
    "hsl(320, 70%, 48%)",    // 品红
    "hsl(55, 80%, 42%)"      // 黄绿
];

// ── 重叠边虚线样式表（不同组序的边使用不同线型）──────────────────
const DASH_PATTERNS = [
    [],               // 实线
    [8, 4],           // 短划
    [2, 4],           // 点线
    [12, 4, 2, 4],    // 划点
    [6, 3, 2, 3, 2, 3], // 划点点
    [16, 6],          // 长划
    [4, 4],           // 密短划
    [10, 4, 4, 4]     // 长短混合
];
