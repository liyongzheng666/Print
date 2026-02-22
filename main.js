// main.js – UI 接线：DOM 绑定、文件加载、自动加载
// 依赖: constants.js, parser.js, viewer.js
"use strict";

/* ── DOM 元素引用 ──────────────────────────────────────────────── */

const fileInput = document.getElementById("fileInput");
const loadSampleBtn = document.getElementById("loadSampleBtn");
const resetViewBtn = document.getElementById("resetViewBtn");
const toggleLabelsBtn = document.getElementById("toggleLabelsBtn");
const searchInput = document.getElementById("searchInput");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const canvas2D = document.getElementById("viewerCanvas2D");
const canvas3D = document.getElementById("viewerCanvas3D");

/* ── 状态栏更新 ─────────────────────────────────────────────────── */

function setStatus(message, type = "info") {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
}

function setStats(pointCount, edgeCount) {
    statsEl.textContent = `点: ${pointCount} | 边: ${edgeCount}`;
}

/* ── Viewer 实例 ─────────────────────────────────────────────────── */

const viewer2D = new EdgeViewer(canvas2D, "2D");
const viewer3D = new EdgeViewer(canvas3D, "3D");

// Synchronize edge selection
viewer2D.onSelectEdge = (edgeId) => {
    viewer3D.setSelectedEdge(edgeId);
};
viewer3D.onSelectEdge = (edgeId) => {
    viewer2D.setSelectedEdge(edgeId);
};

const AUTO_LOAD_FILES = ["edge-2d3d-sample.json", "edge-sample.json", "edge-data.json"];

/* ── 标签按钮同步 ────────────────────────────────────────────────── */

function updateLabelToggleButton() {
    if (!toggleLabelsBtn) return;
    toggleLabelsBtn.textContent = viewer3D.showLabels ? "隐藏标签" : "显示标签";
}

/* ── 数据加载（解析 + 渲染 + 状态更新）────────────────────────── */

function loadDataObject(rawData, sourceLabel) {
    const model = parseModel(rawData);
    viewer2D.setModel(model);
    viewer3D.setModel(model);
    setStats(model.points.length, model.edges.length);

    const overlapCount = model.edges.filter((e) => e.overlapCount > 1).length;
    const suffix = overlapCount > 0 ? ` (检测到 ${overlapCount} 条重叠边)` : "";
    setStatus(`已加载 ${sourceLabel}${suffix}`, "ok");

    resetViewBtn.disabled = false;
}

/* ── 事件监听 ────────────────────────────────────────────────────── */

// 文件选择
fileInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
        const json = JSON.parse(await file.text());
        loadDataObject(json, file.name);
    } catch (error) {
        setStatus(`加载失败: ${error.message}`, "err");
        setStats(0, 0);
    }
});

// 内置示例
if (loadSampleBtn) {
    loadSampleBtn.addEventListener("click", () => {
        try {
            loadDataObject(SAMPLE_DATA, "内置示例");
        } catch (error) {
            setStatus(`示例加载失败: ${error.message}`, "err");
        }
    });
}

// 重置视角
resetViewBtn.addEventListener("click", () => {
    viewer2D.resetView();
    viewer3D.resetView();
});

// 切换标签
if (toggleLabelsBtn) {
    toggleLabelsBtn.addEventListener("click", () => {
        viewer2D.toggleLabelVisibility();
        viewer3D.toggleLabelVisibility();
        updateLabelToggleButton();
    });
}

// 标签搜索
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim().toLowerCase();

        // 如果没有输入或者没有模型，清空高亮
        if (!query || !viewer2D.model || !viewer3D.model) {
            viewer2D.setSelectedEdge(null);
            viewer3D.setSelectedEdge(null);
            return;
        }

        // 查找第一个匹配的标签
        const match = viewer2D.model.edges.find(edge =>
            edge.label && edge.label.toLowerCase().includes(query)
        );

        if (match) {
            viewer2D.setSelectedEdge(match.id);
            viewer3D.setSelectedEdge(match.id);
        } else {
            // 如果没找到，可以选择清空高亮或者保持不变
            viewer2D.setSelectedEdge(null);
            viewer3D.setSelectedEdge(null);
        }
    });
}

updateLabelToggleButton();

/* ── 自动加载（优先加载同目录的 JSON 文件）────────────────────── */

async function tryAutoLoad() {
    for (const fileName of AUTO_LOAD_FILES) {
        try {
            const response = await fetch(`./${fileName}`, { cache: "no-store" });
            if (!response.ok) continue;
            loadDataObject(await response.json(), fileName);
            break;
        } catch (e) {
            console.log(`[AutoLoad] 无法获取 ${fileName}`);
        }
    }
}

tryAutoLoad();
