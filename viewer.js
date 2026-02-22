// viewer.js – EdgeViewer 类：3D 投影、渲染、交互
// 依赖: constants.js (DASH_PATTERNS)
"use strict";

class EdgeViewer {
    constructor(canvasElement, mode = "3D") {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext("2d");
        this.model = null;
        this.mode = mode; // "2D" or "3D"

        this.width = 0;
        this.height = 0;

        this.dragging = false;
        this.isMouseDown = false;
        this.startX = 0;
        this.startY = 0;
        this.lastX = 0;
        this.lastY = 0;

        // 3D camera properties
        this.defaultYaw = -0.7;
        this.defaultPitch = 0.5;
        this.defaultZoom = 1.0;
        this.yaw = this.defaultYaw;
        this.pitch = this.defaultPitch;
        this.zoom = this.defaultZoom;

        // 2D camera properties
        this.panX = 0;
        this.panY = 0;

        // Label dragging state
        this.labelOffsets = {}; // { edgeId: {x, y} }
        this.draggedLabelEdgeId = null;
        this.labelDragStartX = 0;
        this.labelDragStartY = 0;
        this.labelDragStartOffsetX = 0;
        this.labelDragStartOffsetY = 0;

        this.showLabels = true;
        this.selectedEdgeId = null;
        this.onSelectEdge = null; // Callback for when an edge is clicked

        // Interaction boxes
        this.labelBoxes = []; // { id, x, y, w, h }
        this.legendBoxes = []; // { id, x, y, w, h }

        this.bindEvents();
        this.resize();
    }

    /* ── 事件绑定 ─────────────────────────────────────────────── */

    bindEvents() {
        window.addEventListener("resize", () => this.resize());

        this.canvas.addEventListener("mousedown", (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Check if clicking a label to drag
            if (this.showLabels) {
                // We reverse loop to check top-most labels first
                for (let i = this.labelBoxes.length - 1; i >= 0; i--) {
                    const box = this.labelBoxes[i];
                    if (clickX >= box.x && clickX <= box.x + box.w &&
                        clickY >= box.y && clickY <= box.y + box.h) {

                        this.draggedLabelEdgeId = box.id;
                        this.labelDragStartX = clickX;
                        this.labelDragStartY = clickY;

                        const curOffset = this.labelOffsets[box.id] || { x: 0, y: 0 };
                        this.labelDragStartOffsetX = curOffset.x;
                        this.labelDragStartOffsetY = curOffset.y;
                        return; // Prevent triggering canvas drag
                    }
                }
            }

            this.isMouseDown = true;
            this.dragging = false; // reset flag
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            this.startX = e.clientX;
            this.startY = e.clientY;
        });

        window.addEventListener("mouseup", () => {
            this.isMouseDown = false;
            if (this.draggedLabelEdgeId !== null) {
                this.draggedLabelEdgeId = null;
            }
            // We do NOT reset this.dragging here, so the click handler can check it
        });

        window.addEventListener("mousemove", (e) => {
            if (this.draggedLabelEdgeId !== null) {
                const rect = this.canvas.getBoundingClientRect();
                const curX = e.clientX - rect.left;
                const curY = e.clientY - rect.top;

                const dx = curX - this.labelDragStartX;
                const dy = curY - this.labelDragStartY;

                this.labelOffsets[this.draggedLabelEdgeId] = {
                    x: this.labelDragStartOffsetX + dx,
                    y: this.labelDragStartOffsetY + dy
                };

                this.render();
                return;
            }

            if (!this.isMouseDown) return;

            const dx = e.clientX - this.lastX;
            const dy = e.clientY - this.lastY;

            // If mouse moved more than 3 pixels, consider it a drag
            if (Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > 3) {
                this.dragging = true;
            }

            this.lastX = e.clientX;
            this.lastY = e.clientY;

            if (this.mode === "3D") {
                this.yaw += dx * 0.01;
                this.pitch += dy * 0.01;
                this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
            } else {
                this.panX += dx;
                this.panY += dy;
            }
            this.render();
        });

        this.canvas.addEventListener("click", (e) => {
            if (!this.model) return;
            // Prevent click if we were dragging (e.g. pan/rotate or label drag)
            if (this.dragging) {
                this.dragging = false; // Reset for next time
                return;
            }

            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Check legend clicks first
            if (this.showLabels) {
                for (const box of this.legendBoxes) {
                    if (clickX >= box.x && clickX <= box.x + box.w &&
                        clickY >= box.y && clickY <= box.y + box.h) {

                        if (this.selectedEdgeId !== box.id) {
                            this.setSelectedEdge(box.id);
                            if (this.onSelectEdge) this.onSelectEdge(box.id);
                        } else {
                            this.setSelectedEdge(null);
                            if (this.onSelectEdge) this.onSelectEdge(null);
                        }
                        return; // Found a legend click, stop processing
                    }
                }
            }

            // Fallback to edge hit test requires DPR scaled values 
            // because drawPoints in handleHitTest are previously manually scaled by DPR to match native line geometry
            const dpr = window.devicePixelRatio || 1;
            this.handleHitTest({ x: clickX * dpr, y: clickY * dpr });
        });

        this.canvas.addEventListener("wheel", (e) => {
            e.preventDefault();
            const factor = Math.exp(-e.deltaY * 0.0012);
            this.zoom = Math.max(0.2, Math.min(8, this.zoom * factor));
            this.render();
        }, { passive: false });
    }

    /* ── 画布尺寸同步（HiDPI 支持）───────────────────────────── */

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

    /* ── 模型载入 & 视角重置 ──────────────────────────────────── */

    setModel(model) {
        this.model = model;
        this.resetView();
    }

    resetView() {
        this.yaw = this.defaultYaw;
        this.pitch = this.defaultPitch;
        this.zoom = this.defaultZoom;
        this.panX = 0;
        this.panY = 0;
        this.render();
    }

    setSelectedEdge(edgeId) {
        this.selectedEdgeId = edgeId;
        this.render();
    }

    handleHitTest(clickPoint) {
        let bestEdge = null;
        let minDist = 25 * (window.devicePixelRatio || 1); // Hit tolerance (pixels) accounting for DPR

        const dpr = window.devicePixelRatio || 1;
        const projected = this.model.edges.map(edge => {
            let positions3D = edge.positions;
            if (this.mode === "3D") {
                positions3D = this.offset3DPositions(edge.positions, edge.overlapOrder, edge.overlapCount);
            }
            const drawPoints = positions3D.map(p => {
                const proj = this.project(p);
                return { x: proj.x * dpr, y: proj.y * dpr };
            });
            return { edge, drawPoints };
        });

        for (const { edge, drawPoints } of projected) {
            for (let i = 0; i < drawPoints.length - 1; i++) {
                const p1 = drawPoints[i];
                const p2 = drawPoints[i + 1];
                const dist = this.pointToSegmentDistance(clickPoint, p1, p2);
                if (dist < minDist) {
                    minDist = dist;
                    bestEdge = edge;
                }
            }
        }

        // console.log(`[HitTest ${this.mode}] clicked mapped to`, clickPoint, `closest dist:`, minDist, bestEdge ? `Found edge: ${bestEdge.id}` : `No edge found`);

        if (bestEdge && bestEdge.id !== this.selectedEdgeId) {
            this.selectedEdgeId = bestEdge.id;
            if (this.onSelectEdge) this.onSelectEdge(bestEdge.id);
            this.render();
        } else if (!bestEdge && this.selectedEdgeId !== null) {
            this.selectedEdgeId = null;
            if (this.onSelectEdge) this.onSelectEdge(null);
            this.render();
        }
    }

    pointToSegmentDistance(p, v, w) {
        const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
        if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
    }

    setLabelVisibility(visible) {
        this.showLabels = Boolean(visible);
        this.render();
    }

    toggleLabelVisibility() {
        this.setLabelVisibility(!this.showLabels);
    }

    /* ── 3D → 2D 透视投影 ─────────────────────────────────────── */

    project(point) {
        if (this.mode === "3D") {
            const { center, radius } = this.model.bounds;
            const scale = radius > 0 ? radius : 1;
            const x = (point.x - center.x) / scale;
            const y = (point.y - center.y) / scale;
            const z = (point.z - center.z) / scale;

            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const x1 = cosY * x + sinY * z;
            const z1 = -sinY * x + cosY * z;

            const cosX = Math.cos(this.pitch), sinX = Math.sin(this.pitch);
            const y1 = cosX * y - sinX * z1;
            const z2 = sinX * y + cosX * z1;

            const perspective = (this.height * 0.42 * this.zoom) / (2.8 + z2);
            return {
                x: this.width * 0.5 + x1 * perspective,
                y: this.height * 0.5 - y1 * perspective,
                z: z2
            };
        } else {
            // 2D Orthographic Mode
            const { center2D, radius2D } = this.model.bounds;
            const scale = radius2D > 0 ? radius2D : 1;
            const u = (point.u - center2D.u) / scale;
            const v = (point.v - center2D.v) / scale;

            // Simple scaling to fit canvas height with zoom
            const canvasScale = (this.height * 0.42) * this.zoom;

            return {
                x: this.width * 0.5 + (u * canvasScale) + this.panX,
                y: this.height * 0.5 - (v * canvasScale) + this.panY,
                z: 0 // No depth in 2D
            };
        }
    }

    /* ══════════════ 主渲染循环 ══════════════════════════════════ */

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // 背景渐变
        const bg = ctx.createLinearGradient(0, 0, 0, this.height);
        bg.addColorStop(0, "#ffffff");
        bg.addColorStop(1, "#f0f6ff");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.width, this.height);

        if (!this.model) {
            ctx.fillStyle = "#7d8ea1";
            ctx.font = "14px sans-serif";
            ctx.fillText('请选择 JSON 文件或点击\u201c加载示例\u201d', 16, 28);
            return;
        }

        this.labelBoxes = [];
        this.legendBoxes = [];

        // 投影并按深度排序（画家算法）
        const projected = this.model.edges
            .map((edge) => {
                const points = edge.positions.map((p) => this.project(p));
                const depth = points.reduce((s, p) => s + p.z, 0) / Math.max(points.length, 1);
                return { edge, points, depth };
            })
            .sort((a, b) => a.depth - b.depth);

        for (const { edge, points } of projected) {
            if (points.length < 2) continue;

            let positions3D = edge.positions;
            if (this.mode === "3D") {
                positions3D = this.offset3DPositions(edge.positions, edge.overlapOrder, edge.overlapCount);
            }
            const drawPoints = positions3D.map((p) => this.project(p));

            // 描边（含虚线样式）
            ctx.save();
            const isSelected = (this.selectedEdgeId === edge.id);

            // Draw highlight background first
            if (isSelected) {
                ctx.setLineDash([]);
                ctx.lineWidth = 4.5; // Thicker background for highlight
                ctx.strokeStyle = "#ffeb3b"; // Bright yellow for selection
                ctx.beginPath();
                ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
                for (let i = 1; i < drawPoints.length; i += 1) {
                    ctx.lineTo(drawPoints[i].x, drawPoints[i].y);
                }
                ctx.stroke();
            }

            // Draw regular dashed/solid line on top
            ctx.setLineDash(
                edge.overlapCount > 1
                    ? DASH_PATTERNS[edge.overlapOrder % DASH_PATTERNS.length]
                    : []
            );
            ctx.beginPath();
            ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
            for (let i = 1; i < drawPoints.length; i += 1) {
                ctx.lineTo(drawPoints[i].x, drawPoints[i].y);
            }
            ctx.strokeStyle = isSelected ? "#000000" : edge.color;
            ctx.lineWidth = isSelected ? 2.5 : 1.5;
            ctx.stroke();
            ctx.restore();

            // 箭头 & 端点
            this.drawArrow(
                drawPoints[drawPoints.length - 2],
                drawPoints[drawPoints.length - 1],
                edge.color
            );
            this.drawEndpoint(drawPoints[0], "#1f9d55");
            this.drawEndpoint(drawPoints[drawPoints.length - 1], "#d94841");

            // 标签
            if (this.showLabels) {
                this.drawEdgeLabelStaggered(drawPoints, edge);
            }
        }

        // 图例面板
        if (this.showLabels) {
            this.drawLegend();
        }
    }

    /* ── 3D 模型空间偏移（视角无关，不会扭曲）────────────────── */
    //
    // 原理：在投影前对 3D 坐标施加偏移，偏移方向由固定世界坐标轴叉乘
    // 边的平均切线得出，与摄像机角度无关，旋转时方向稳定不翻转。

    offset3DPositions(positions, overlapOrder, overlapCount) {
        if (!Number.isFinite(overlapCount) || overlapCount <= 1) return positions;

        const center = (overlapCount - 1) * 0.5;
        const steps = overlapOrder - center;  // 0.5, -0.5 / 1, 0, -1 …
        if (Math.abs(steps) < 0.001) return positions;

        // 偏移量 = 模型包围球半径 × 12% × 步数 × zoom
        // 这样在任何缩放下，间距始终占可见区域的固定比例
        const radius = this.model.bounds.radius;
        const zoomFactor = Math.max(0.8, this.zoom);
        const dist = steps * radius * 0.12 * zoomFactor;

        // 计算边的平均切线（首尾向量）
        const p0 = positions[0];
        const p1 = positions[positions.length - 1];
        let tx = p1.x - p0.x, ty = p1.y - p0.y, tz = p1.z - p0.z;
        const tlen = Math.hypot(tx, ty, tz) || 1;
        tx /= tlen; ty /= tlen; tz /= tlen;

        // 用固定参考轴（世界 Y 轴）叉乘切线得偏移方向
        // 若切线接近 Y 轴则改用 X 轴，避免退化
        let rx, ry, rz;
        if (Math.abs(ty) < 0.85) {
            // tangent × (0,1,0) = (-tz, 0, tx)
            rx = -tz; ry = 0; rz = tx;
        } else {
            // tangent × (1,0,0) = (0, tz, -ty)
            rx = 0; ry = tz; rz = -ty;
        }
        const rlen = Math.hypot(rx, ry, rz) || 1;
        rx /= rlen; ry /= rlen; rz /= rlen;

        return positions.map((p) => ({
            x: p.x + rx * dist,
            y: p.y + ry * dist,
            z: p.z + rz * dist
        }));
    }

    /* ── 错位标签绘制 ─────────────────────────────────────────── */

    drawEdgeLabelStaggered(points, edge) {
        const text = edge.label;
        if (!text || points.length < 2) return;

        // 重叠边：各标签错落在折线 25%~75% 处
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

        ctx.font = "bold 11px sans-serif";
        const metrics = ctx.measureText(text);
        const boxW = Math.ceil(metrics.width) + 16;
        const boxH = 20;

        // 夹紧到画布内，防止标签跑出边界（考虑用户自定义偏移）
        const offset = this.labelOffsets[edge.id] || { x: 0, y: 0 };
        const targetX = mid.x + offset.x;
        const targetY = mid.y - 16 + offset.y;

        const lx = Math.round(Math.max(boxW * 0.5 + 4, Math.min(this.width - boxW * 0.5 - 4, targetX)));
        const ly = Math.round(Math.max(boxH * 0.5 + 4, Math.min(this.height - boxH * 0.5 - 4, targetY)));
        const bx = lx - boxW * 0.5;
        const by = ly - boxH * 0.5;

        // Save layout box for hit testing
        this.labelBoxes.push({ id: edge.id, x: bx, y: by, w: boxW, h: boxH });

        // 连接线（中点 → 标签框参考点，考虑到拖拽偏移，可能连接到四边）
        ctx.beginPath();
        ctx.moveTo(mid.x, mid.y);
        ctx.lineTo(lx, ly + boxH * 0.5);
        ctx.strokeStyle = edge.color;
        ctx.lineWidth = 1;
        ctx.stroke();

        // 标签背景框
        this.roundRectPath(bx, by, boxW, boxH, 5);
        ctx.fillStyle = "rgba(255,255,255,0.93)";
        ctx.fill();
        ctx.strokeStyle = edge.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 文字
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = edge.color;
        ctx.fillText(text, lx, ly + 0.5);
        ctx.restore();
    }

    /* ── 折线上按比例取点 ─────────────────────────────────────── */

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
        if (total <= 1e-6) return null;

        const target = total * fraction;
        let acc = 0;
        for (let i = 0; i < segLens.length; i += 1) {
            const len = segLens[i];
            if (acc + len >= target) {
                const t = (target - acc) / Math.max(len, 1e-6);
                const p0 = points[i], p1 = points[i + 1];
                return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
            }
            acc += len;
        }
        const last = points[points.length - 1];
        return { x: last.x, y: last.y };
    }

    /* ── 图例面板 ─────────────────────────────────────────────── */

    drawLegend() {
        if (!this.model || !this.model.edges.length) return;

        const ctx = this.ctx;
        const edges = this.model.edges;
        const lineH = 20, padX = 12, padY = 10;

        ctx.save();
        ctx.font = "12px sans-serif";

        // 测量最宽文字（含重叠后缀）
        let maxW = 0;
        for (const e of edges) {
            const label = e.overlapCount > 1
                ? `${e.label}  [重叠${e.overlapOrder + 1}/${e.overlapCount}]`
                : e.label;
            maxW = Math.max(maxW, ctx.measureText(label).width);
        }

        const panelW = maxW + padX * 2 + 40;
        const panelH = edges.length * lineH + padY * 2;
        const px = this.width - panelW - 12;
        const py = 12;

        // 面板背景
        ctx.setLineDash([]);
        this.roundRectPath(px, py, panelW, panelH, 8);
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.fill();
        ctx.strokeStyle = "#dbe3ee";
        ctx.lineWidth = 1;
        ctx.stroke();

        // 每条边的图例行
        ctx.font = "12px sans-serif";
        for (let i = 0; i < edges.length; i += 1) {
            const e = edges[i];
            const ey = py + padY + i * lineH + lineH * 0.5;
            const sx = px + padX;

            const isLegendSelected = (e.id === this.selectedEdgeId);
            const panelW = maxW + padX * 2 + 40;
            const lineRect = {
                x: px,
                y: ey - lineH * 0.5,
                w: panelW,
                h: lineH
            };
            this.legendBoxes.push({ id: e.id, ...lineRect });

            // Highlight bar behind item if selected
            if (isLegendSelected) {
                ctx.save();
                ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
                this.roundRectPath(lineRect.x, lineRect.y, lineRect.w, lineRect.h, 4);
                ctx.fill();
                ctx.restore();
            }

            // 颜色样本线（复制对应虚线样式）
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(sx, ey);
            ctx.lineTo(sx + 24, ey);
            ctx.strokeStyle = e.color;
            ctx.lineWidth = 3;
            ctx.setLineDash(
                e.overlapCount > 1
                    ? DASH_PATTERNS[e.overlapOrder % DASH_PATTERNS.length]
                    : []
            );
            ctx.stroke();
            ctx.restore();

            // 图例文字
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

    /* ── 圆角矩形路径 ─────────────────────────────────────────── */

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

    /* ── 端点圆点 ─────────────────────────────────────────────── */

    drawEndpoint(point, color) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }

    /* ── 方向箭头 ─────────────────────────────────────────────── */

    drawArrow(from, to, color) {
        const dx = to.x - from.x, dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        if (len < 10) return;

        const ux = dx / len, uy = dy / len;
        const arrowLen = 10, wing = 4;

        const ctx = this.ctx;
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - ux * arrowLen + -uy * wing, to.y - uy * arrowLen + ux * wing);
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - ux * arrowLen - -uy * wing, to.y - uy * arrowLen - ux * wing);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
}
