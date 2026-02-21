// main.js – UI 接线：DOM 绑定、文件加载、自动加载
// 依赖: constants.js, parser.js, viewer.js
"use strict";

/* ── DOM 元素引用 ──────────────────────────────────────────────── */

const fileInput = document.getElementById("fileInput");
const loadSampleBtn = document.getElementById("loadSampleBtn");
const resetViewBtn = document.getElementById("resetViewBtn");
const toggleLabelsBtn = document.getElementById("toggleLabelsBtn");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const canvas = document.getElementById("viewerCanvas");

/* ── 状态栏更新 ─────────────────────────────────────────────────── */

function setStatus(message, type = "info") {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
}

function setStats(pointCount, edgeCount) {
    statsEl.textContent = `点: ${pointCount} | 边: ${edgeCount}`;
}

/* ── Viewer 实例 ─────────────────────────────────────────────────── */

const viewer = new EdgeViewer(canvas);
const AUTO_LOAD_FILES = ["edge-data.json", "edge-sample.json"];

/* ── 标签按钮同步 ────────────────────────────────────────────────── */

function updateLabelToggleButton() {
    if (!toggleLabelsBtn) return;
    toggleLabelsBtn.textContent = viewer.showLabels ? "隐藏标签" : "显示标签";
}

/* ── 数据加载（解析 + 渲染 + 状态更新）────────────────────────── */

function loadDataObject(rawData, sourceLabel) {
    const model = parseModel(rawData);
    viewer.setModel(model);
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
loadSampleBtn.addEventListener("click", () => {
    try {
        loadDataObject(SAMPLE_DATA, "内置示例");
    } catch (error) {
        setStatus(`示例加载失败: ${error.message}`, "err");
    }
});

// 重置视角
resetViewBtn.addEventListener("click", () => viewer.resetView());

// 切换标签
if (toggleLabelsBtn) {
    toggleLabelsBtn.addEventListener("click", () => {
        viewer.toggleLabelVisibility();
        updateLabelToggleButton();
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
            return;
        } catch (_err) {
            // file:// 协议下 fetch 可能因安全限制失败，忽略即可
        }
    }
}

tryAutoLoad();
