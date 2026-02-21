"use strict";
console.log("[app.js v3] 脚本已加载 – 标签功能已更新");

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

const fileInput = document.getElementById("fileInput");
const loadSampleBtn = document.getElementById("loadSampleBtn");
const resetViewBtn = document.getElementById("resetViewBtn");
const toggleLabelsBtn = document.getElementById("toggleLabelsBtn");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const canvas = document.getElementById("viewerCanvas");

/* ───── Colour helpers ────────────────────────────────────────── */

// Generate colours with guaranteed contrast for overlapping edges
const OVERLAP_PALETTE = [
  "hsl(210, 80%, 50%)",   // blue
  "hsl(0, 75%, 52%)",     // red
  "hsl(140, 70%, 38%)",   // green
  "hsl(280, 65%, 50%)",   // purple
  "hsl(35, 90%, 50%)",    // orange
  "hsl(180, 65%, 40%)",   // teal
  "hsl(320, 70%, 48%)",   // magenta
  "hsl(55, 80%, 42%)"     // olive-yellow
];

// Dash patterns for edges in the same overlap group
const DASH_PATTERNS = [
  [],           // solid
  [8, 4],       // dashed
  [2, 4],       // dotted
  [12, 4, 2, 4], // dash-dot
  [6, 3, 2, 3, 2, 3], // dash-dot-dot
  [16, 6],      // long dash
  [4, 4],       // short dash
  [10, 4, 4, 4] // another combo
];

function hashColor(id, index) {
  let hash = 17 + index * 31;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 37 + id.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 72% 46%)`;
}

/* ───── EdgeViewer ────────────────────────────────────────────── */

class EdgeViewer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext("2d");
    this.model = null;

    this.width = 0;
    this.height = 0;

    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    this.defaultYaw = -0.7;
    this.defaultPitch = 0.5;
    this.defaultZoom = 1.0;
    this.yaw = this.defaultYaw;
    this.pitch = this.defaultPitch;
    this.zoom = this.defaultZoom;
    this.showLabels = true;

    this.bindEvents();
    this.resize();
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());

    this.canvas.addEventListener("mousedown", (event) => {
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    });

    window.addEventListener("mouseup", () => {
      this.dragging = false;
    });

    window.addEventListener("mousemove", (event) => {
      if (!this.dragging) {
        return;
      }

      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;

      this.yaw += dx * 0.01;
      this.pitch += dy * 0.01;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
      this.render();
    });

    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * 0.0012);
        this.zoom *= factor;
        this.zoom = Math.max(0.2, Math.min(8, this.zoom));
        this.render();
      },
      { passive: false }
    );
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.render();
  }

  setModel(model) {
    this.model = model;
    this.resetView();
  }

  resetView() {
    this.yaw = this.defaultYaw;
    this.pitch = this.defaultPitch;
    this.zoom = this.defaultZoom;
    this.render();
  }

  setLabelVisibility(visible) {
    this.showLabels = Boolean(visible);
    this.render();
  }

  toggleLabelVisibility() {
    this.setLabelVisibility(!this.showLabels);
  }

  project(point) {
    const { center, radius } = this.model.bounds;
    const scale = radius > 0 ? radius : 1;

    const x = (point.x - center.x) / scale;
    const y = (point.y - center.y) / scale;
    const z = (point.z - center.z) / scale;

    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const x1 = cosY * x + sinY * z;
    const z1 = -sinY * x + cosY * z;

    const cosX = Math.cos(this.pitch);
    const sinX = Math.sin(this.pitch);
    const y1 = cosX * y - sinX * z1;
    const z2 = sinX * y + cosX * z1;

    const perspective = (this.height * 0.42 * this.zoom) / (2.8 + z2);
    return {
      x: this.width * 0.5 + x1 * perspective,
      y: this.height * 0.5 - y1 * perspective,
      z: z2
    };
  }

  /* ── Render loop ─────────────────────────────────────────── */

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const bg = ctx.createLinearGradient(0, 0, 0, this.height);
    bg.addColorStop(0, "#ffffff");
    bg.addColorStop(1, "#f0f6ff");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    if (!this.model) {
      ctx.fillStyle = "#7d8ea1";
      ctx.font = "14px sans-serif";
      ctx.fillText("请选择 JSON 文件或点击“加载示例”", 16, 28);
      return;
    }

    const projected = this.model.edges
      .map((edge) => {
        const points = edge.positions.map((p) => this.project(p));
        const depth =
          points.reduce((acc, p) => acc + p.z, 0) / Math.max(points.length, 1);
        return { edge, points, depth };
      })
      .sort((a, b) => a.depth - b.depth);

    for (const item of projected) {
      const { edge, points } = item;
      if (points.length < 2) {
        continue;
      }

      // Compute per-segment offset for smooth separation of overlapping edges
      const drawPoints = this.offsetPolylinePerSegment(
        points,
        edge.overlapOrder,
        edge.overlapCount
      );

      // Set dash pattern for overlapping edges
      ctx.save();
      if (edge.overlapCount > 1) {
        const dashIdx = edge.overlapOrder % DASH_PATTERNS.length;
        ctx.setLineDash(DASH_PATTERNS[dashIdx]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
      for (let i = 1; i < drawPoints.length; i += 1) {
        ctx.lineTo(drawPoints[i].x, drawPoints[i].y);
      }
      ctx.strokeStyle = edge.color;
      ctx.lineWidth = edge.overlapCount > 1 ? 2.5 : 2;
      ctx.stroke();
      ctx.restore();

      this.drawArrow(
        drawPoints[drawPoints.length - 2],
        drawPoints[drawPoints.length - 1],
        edge.color
      );
      this.drawEndpoint(drawPoints[0], "#1f9d55");
      this.drawEndpoint(drawPoints[drawPoints.length - 1], "#d94841");

      if (this.showLabels) {
        this.drawEdgeLabelStaggered(drawPoints, edge);
      }
    }

    // Draw edge legend panel
    if (this.showLabels) {
      this.drawLegend();
    }

    // DEBUG: log that render completed
    // console.log("[render] showLabels=", this.showLabels, " edges=", this.model ? this.model.edges.length : 0);
  }

  /* ── Per-segment offset for overlapping polylines ───────── */

  offsetPolylinePerSegment(points, overlapOrder, overlapCount) {
    if (!Number.isFinite(overlapCount) || overlapCount <= 1) {
      return points;
    }

    const center = (overlapCount - 1) * 0.5;
    const offsetAmount = (overlapOrder - center) * 8; // 8px spacing per step

    if (Math.abs(offsetAmount) < 0.01) {
      return points;
    }

    const result = [];
    for (let i = 0; i < points.length; i += 1) {
      let nx, ny;

      if (i === 0) {
        // Use the first segment's normal
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        const len = Math.hypot(dx, dy) || 1;
        nx = -dy / len;
        ny = dx / len;
      } else if (i === points.length - 1) {
        // Use the last segment's normal
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        const len = Math.hypot(dx, dy) || 1;
        nx = -dy / len;
        ny = dx / len;
      } else {
        // Average the normals of the two adjacent segments (smooth miter)
        const dx1 = points[i].x - points[i - 1].x;
        const dy1 = points[i].y - points[i - 1].y;
        const len1 = Math.hypot(dx1, dy1) || 1;
        const nx1 = -dy1 / len1;
        const ny1 = dx1 / len1;

        const dx2 = points[i + 1].x - points[i].x;
        const dy2 = points[i + 1].y - points[i].y;
        const len2 = Math.hypot(dx2, dy2) || 1;
        const nx2 = -dy2 / len2;
        const ny2 = dx2 / len2;

        nx = (nx1 + nx2) * 0.5;
        ny = (ny1 + ny2) * 0.5;
        const nlen = Math.hypot(nx, ny) || 1;
        nx /= nlen;
        ny /= nlen;
      }

      result.push({
        x: points[i].x + nx * offsetAmount,
        y: points[i].y + ny * offsetAmount,
        z: points[i].z
      });
    }

    return result;
  }

  /* ── Staggered label placement ─────────────────────────── */

  drawEdgeLabelStaggered(points, edge) {
    const text = edge.label;
    if (!text || points.length < 2) {
      return;
    }

    // Spread labels at different positions along the curve for overlapping edges
    let tParam = 0.5;
    if (edge.overlapCount > 1) {
      const step = 0.5 / Math.max(edge.overlapCount, 1);
      tParam = 0.25 + step * edge.overlapOrder;
    }

    const mid = this.getPolylinePointAtFraction(points, tParam);
    if (!mid) {
      console.warn("[label] getPolylinePointAtFraction returned null for", edge.id);
      return;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([]);
    ctx.shadowColor = "transparent";
    ctx.globalAlpha = 1;

    // Measure first, then layout
    ctx.font = "bold 11px sans-serif";
    const metrics = ctx.measureText(text);
    const boxW = Math.ceil(metrics.width) + 16;
    const boxH = 20;
    const labelOffset = 16; // px above the midpoint
    // Clamp to canvas so labels never render outside the visible area
    const lx = Math.round(Math.max(boxW * 0.5 + 4, Math.min(this.width - boxW * 0.5 - 4, mid.x)));
    const ly = Math.round(Math.max(boxH * 0.5 + 4, Math.min(this.height - boxH * 0.5 - 4, mid.y - labelOffset)));
    const bx = lx - boxW * 0.5;
    const by = ly - boxH * 0.5;

    // Connector tick from midpoint to label
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    ctx.lineTo(lx, ly + boxH * 0.5);
    ctx.strokeStyle = edge.color;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Background box
    this.roundRectPath(bx, by, boxW, boxH, 5);
    ctx.fillStyle = "rgba(255,255,255,0.93)";
    ctx.fill();
    ctx.strokeStyle = edge.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Text
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = edge.color;
    ctx.fillText(text, lx, ly + 0.5);
    ctx.restore();
  }

  /* ── Point at fraction along polyline ─────────────────── */

  getPolylinePointAtFraction(points, fraction) {
    let total = 0;
    const segLens = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const len = Math.hypot(
        points[i + 1].x - points[i].x,
        points[i + 1].y - points[i].y
      );
      segLens.push(len);
      total += len;
    }
    if (total <= 1e-6) {
      return null;
    }

    const target = total * fraction;
    let acc = 0;
    for (let i = 0; i < segLens.length; i += 1) {
      const len = segLens[i];
      if (acc + len >= target) {
        const t = (target - acc) / Math.max(len, 1e-6);
        const p0 = points[i];
        const p1 = points[i + 1];
        return {
          x: p0.x + (p1.x - p0.x) * t,
          y: p0.y + (p1.y - p0.y) * t
        };
      }
      acc += len;
    }

    const last = points[points.length - 1];
    return { x: last.x, y: last.y };
  }

  /* ── Edge legend panel ─────────────────────────────────── */

  drawLegend() {
    if (!this.model || !this.model.edges.length) {
      return;
    }

    const ctx = this.ctx;
    const edges = this.model.edges;

    const lineH = 20;
    const padX = 12;
    const padY = 10;

    // Measure max text width (including overlap suffix)
    ctx.save();
    ctx.font = "12px sans-serif";
    let maxW = 0;
    for (const e of edges) {
      const fullText = e.overlapCount > 1
        ? `${e.label}  [重叠${e.overlapOrder + 1}/${e.overlapCount}]`
        : e.label;
      const w = ctx.measureText(fullText).width;
      if (w > maxW) maxW = w;
    }

    const panelW = maxW + padX * 2 + 40; // swatch + gap + text + padding
    const panelH = edges.length * lineH + padY * 2;
    const x = this.width - panelW - 12;
    const y = 12;

    // Panel background
    this.roundRectPath(x, y, panelW, panelH, 8);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fill();
    ctx.strokeStyle = "#dbe3ee";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Title
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#1c2430";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // Draw each entry
    ctx.font = "12px sans-serif";
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i];
      const ey = y + padY + i * lineH + lineH * 0.5;
      const sx = x + padX;

      // Colour swatch line
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx, ey);
      ctx.lineTo(sx + 24, ey);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      if (e.overlapCount > 1) {
        const dashIdx = e.overlapOrder % DASH_PATTERNS.length;
        ctx.setLineDash(DASH_PATTERNS[dashIdx]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.restore();

      // Label text
      ctx.fillStyle = "#1c2430";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const labelText = e.overlapCount > 1
        ? `${e.label}  [重叠${e.overlapOrder + 1}/${e.overlapCount}]`
        : e.label;
      ctx.fillText(labelText, sx + 30, ey);
    }

    ctx.restore();
  }

  /* ── Drawing helpers ───────────────────────────────────── */

  roundRectPath(x, y, w, h, r) {
    const ctx = this.ctx;
    const radius = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  drawEndpoint(point, color) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  drawArrow(from, to, color) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 10) {
      return;
    }

    const ux = dx / len;
    const uy = dy / len;
    const arrowLen = 10;
    const wing = 4;

    const leftX = to.x - ux * arrowLen + -uy * wing;
    const leftY = to.y - uy * arrowLen + ux * wing;
    const rightX = to.x - ux * arrowLen - -uy * wing;
    const rightY = to.y - uy * arrowLen - ux * wing;

    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([]); // Arrow always solid
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(leftX, leftY);
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(rightX, rightY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/* ───── Data parsing helpers ─────────────────────────────────── */

function numberOrThrow(value, fieldName) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`字段 ${fieldName} 必须是数字`);
  }
  return value;
}

function computeBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  }

  const center = {
    x: (minX + maxX) * 0.5,
    y: (minY + maxY) * 0.5,
    z: (minZ + maxZ) * 0.5
  };

  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const radius = Math.max(Math.hypot(dx, dy, dz) * 0.5, 1e-6);

  return { center, radius };
}

/* ── Overlap detection (canonical key treats reversed & forward as same) ── */

function canonicalPointIdKey(pointIds) {
  const forward = pointIds.join("|");
  const reversed = [...pointIds].reverse().join("|");
  return forward < reversed ? forward : reversed;
}

function buildOverlapGroups(edges) {
  const groupMap = new Map();
  for (const edge of edges) {
    const key = canonicalPointIdKey(edge.pointIds);
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key).push(edge);
  }

  for (const group of groupMap.values()) {
    group.sort((a, b) => a.serial - b.serial);
    const count = group.length;
    for (let i = 0; i < group.length; i += 1) {
      group[i].overlapCount = count;
      group[i].overlapOrder = i;
    }
  }
}

/* ── Colour assignment with contrast for overlapping edges ────── */

function assignEdgeColors(edges) {
  // Build groups to assign contrasting colours within each overlap group
  const groupMap = new Map();
  for (const edge of edges) {
    const key = canonicalPointIdKey(edge.pointIds);
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key).push(edge);
  }

  // Assign contrasting palette colours to overlapping edges,
  // and hash-based colours to non-overlapping ones
  for (const [, group] of groupMap) {
    if (group.length > 1) {
      // Overlapping — use the high-contrast palette
      for (let i = 0; i < group.length; i += 1) {
        group[i].color = OVERLAP_PALETTE[i % OVERLAP_PALETTE.length];
      }
    } else {
      // Single edge — keep the hash colour
      const e = group[0];
      e.color = hashColor(e.id, e.serial - 1);
    }
  }
}

/* ── Model parser ──────────────────────────────────────────────── */

function parseModel(data) {
  if (!data || typeof data !== "object") {
    throw new Error("JSON 根节点必须是对象");
  }
  if (!Array.isArray(data.points)) {
    throw new Error("缺少 points 数组");
  }
  if (!Array.isArray(data.edges)) {
    throw new Error("缺少 edges 数组");
  }
  if (data.points.length === 0) {
    throw new Error("points 不能为空");
  }
  if (data.edges.length === 0) {
    throw new Error("edges 不能为空");
  }

  const pointMap = new Map();
  const points = data.points.map((point, idx) => {
    if (!point || typeof point !== "object") {
      throw new Error(`points[${idx}] 不是有效对象`);
    }
    if (typeof point.id !== "string" || point.id.length === 0) {
      throw new Error(`points[${idx}].id 必须是非空字符串`);
    }
    if (pointMap.has(point.id)) {
      throw new Error(`点 id 重复: ${point.id}`);
    }

    const parsedPoint = {
      id: point.id,
      x: numberOrThrow(point.x, `points[${idx}].x`),
      y: numberOrThrow(point.y, `points[${idx}].y`),
      z: numberOrThrow(point.z, `points[${idx}].z`)
    };
    pointMap.set(point.id, parsedPoint);
    return parsedPoint;
  });

  const edgeIdSet = new Set();
  const edges = data.edges.map((edge, idx) => {
    if (!edge || typeof edge !== "object") {
      throw new Error(`edges[${idx}] 不是有效对象`);
    }

    const edgeId =
      typeof edge.id === "string" && edge.id.length > 0
        ? edge.id
        : `E_${idx}`;
    if (edgeIdSet.has(edgeId)) {
      throw new Error(`边 id 重复: ${edgeId}`);
    }
    edgeIdSet.add(edgeId);
    if (!Array.isArray(edge.point_ids) || edge.point_ids.length < 2) {
      throw new Error(`edges[${idx}].point_ids 至少需要 2 个点`);
    }

    const pointIds = edge.point_ids.slice();
    const positions = pointIds.map((pointId, j) => {
      if (typeof pointId !== "string") {
        throw new Error(`edges[${idx}].point_ids[${j}] 必须是字符串`);
      }
      const point = pointMap.get(pointId);
      if (!point) {
        throw new Error(`edges[${idx}] 引用了不存在的点: ${pointId}`);
      }
      return point;
    });

    return {
      serial: idx + 1,
      id: edgeId,
      label: `${idx + 1}:${edgeId}`,
      pointIds,
      positions,
      color: hashColor(edgeId, idx), // will be overwritten for overlaps
      overlapCount: 1,
      overlapOrder: 0
    };
  });

  buildOverlapGroups(edges);
  assignEdgeColors(edges);

  return {
    points,
    edges,
    bounds: computeBounds(points)
  };
}

/* ───── UI wiring ────────────────────────────────────────────── */

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function setStats(pointCount, edgeCount) {
  statsEl.textContent = `点: ${pointCount} | 边: ${edgeCount}`;
}

const viewer = new EdgeViewer(canvas);
const AUTO_LOAD_FILES = ["edge-data.json", "edge-sample.json"];

function updateLabelToggleButton() {
  if (!toggleLabelsBtn) {
    return;
  }
  toggleLabelsBtn.textContent = viewer.showLabels ? "隐藏标签" : "显示标签";
}

function loadDataObject(rawData, sourceLabel) {
  const model = parseModel(rawData);
  viewer.setModel(model);
  setStats(model.points.length, model.edges.length);

  // Summarise overlap info
  const overlapEdgeCount = model.edges.filter((e) => e.overlapCount > 1).length;
  const suffix =
    overlapEdgeCount > 0 ? ` (检测到 ${overlapEdgeCount} 条重叠边)` : "";
  setStatus(`已加载 ${sourceLabel}${suffix}`, "ok");

  resetViewBtn.disabled = false;
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const json = JSON.parse(text);
    loadDataObject(json, file.name);
  } catch (error) {
    setStatus(`加载失败: ${error.message}`, "err");
    setStats(0, 0);
  }
});

loadSampleBtn.addEventListener("click", () => {
  try {
    loadDataObject(SAMPLE_DATA, "内置示例");
  } catch (error) {
    setStatus(`示例加载失败: ${error.message}`, "err");
  }
});

resetViewBtn.addEventListener("click", () => {
  viewer.resetView();
});

if (toggleLabelsBtn) {
  toggleLabelsBtn.addEventListener("click", () => {
    viewer.toggleLabelVisibility();
    updateLabelToggleButton();
  });
}

updateLabelToggleButton();

async function tryAutoLoad() {
  for (const fileName of AUTO_LOAD_FILES) {
    try {
      const response = await fetch(`./${fileName}`, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }
      const json = await response.json();
      loadDataObject(json, fileName);
      return;
    } catch (_error) {
      // When opened via file://, fetch may fail due to browser security restrictions.
    }
  }
}

tryAutoLoad();
