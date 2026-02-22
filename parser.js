// parser.js – JSON 解析、重叠检测、颜色分配
// 依赖: constants.js (OVERLAP_PALETTE)
"use strict";

/* ── 校验辅助 ─────────────────────────────────────────────────── */

function numberOrThrow(value, fieldName) {
    if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`字段 ${fieldName} 必须是数字`);
    }
    return value;
}

/* ── 哈希颜色（备用）─────────────────────────────────────────── */

function hashColor(id, index) {
    let hash = 17 + index * 31;
    for (let i = 0; i < id.length; i += 1) {
        hash = (hash * 37 + id.charCodeAt(i)) >>> 0;
    }
    const hue = hash % 360;
    return `hsl(${hue}, 72%, 46%)`;
}

/* ── 包围盒计算 ───────────────────────────────────────────────── */

function computeBounds(points) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let minU = Infinity, minV = Infinity;
    let maxU = -Infinity, maxV = -Infinity;

    for (const p of points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
        minU = Math.min(minU, p.u); minV = Math.min(minV, p.v);
        maxU = Math.max(maxU, p.u); maxV = Math.max(maxV, p.v);
    }

    // 3D Bounds
    const center = {
        x: (minX + maxX) * 0.5,
        y: (minY + maxY) * 0.5,
        z: (minZ + maxZ) * 0.5
    };
    const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
    const radius = Math.max(Math.hypot(dx, dy, dz) * 0.5, 1e-6);

    // 2D Bounds
    const center2D = {
        u: (minU + maxU) * 0.5,
        v: (minV + maxV) * 0.5
    };
    const du = maxU - minU, dv = maxV - minV;
    const radius2D = Math.max(Math.hypot(du, dv) * 0.5, 1e-6);

    return { center, radius, center2D, radius2D };
}

/* ── 重叠检测：正向/反向点序列视为同一条 ─────────────────────── */

function canonicalPointIdKey(pointIds) {
    const forward = pointIds.join("|");
    const reversed = [...pointIds].reverse().join("|");
    return forward < reversed ? forward : reversed;
}

function buildOverlapGroups(edges) {
    const groupMap = new Map();
    for (const edge of edges) {
        const key = canonicalPointIdKey(edge.pointIds);
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key).push(edge);
    }

    for (const group of groupMap.values()) {
        group.sort((a, b) => a.serial - b.serial);
        const count = group.length;
        for (let i = 0; i < count; i += 1) {
            group[i].overlapCount = count;
            group[i].overlapOrder = i;
        }
    }
}

/* ── 颜色分配（核心改进）──────────────────────────────────────── */
//
// 策略：
//   1. 黄金角 137.5° 旋转分配各组 baseHue，使每个重叠组的整体色调
//      在色轮上均匀分布，组与组之间天然有视觉差异。
//   2. 同一重叠组内，各边在 baseHue 基础上等分 360° 分配偏移
//      (2 条边相差 180° = 互补色，3 条差 120° = 三角色)，
//      使组内各条线也能一眼区分。
//   3. 奇偶交替明度，提供额外一层区分维度。

function assignEdgeColors(edges) {
    const groupMap = new Map();
    for (const edge of edges) {
        const key = canonicalPointIdKey(edge.pointIds);
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key).push(edge);
    }

    const groups = [...groupMap.values()];

    groups.forEach((group, groupIdx) => {
        // 黄金角分布，确保每组与其他组色调明显不同
        const baseHue = Math.round((groupIdx * 137.5) % 360);

        if (group.length === 1) {
            // 单条边：直接使用基础色相
            group[0].color = `hsl(${baseHue}, 75%, 47%)`;
        } else {
            // 重叠组：组内等分色相，保证组内也有强对比
            const hueStep = Math.round(360 / group.length);
            group.forEach((edge, orderIdx) => {
                const hue = (baseHue + orderIdx * hueStep) % 360;
                // 奇偶交替明度，增加额外区分维度
                const sat = orderIdx % 2 === 0 ? 82 : 76;
                const lit = orderIdx % 2 === 0 ? 50 : 43;
                edge.color = `hsl(${hue}, ${sat}%, ${lit}%)`;
            });
        }
    });
}

/* ── 主解析入口 ────────────────────────────────────────────────── */

function parseModel(data) {
    if (!data || typeof data !== "object") throw new Error("JSON 根节点必须是对象");
    if (!Array.isArray(data.points)) throw new Error("缺少 points 数组");
    if (!Array.isArray(data.edges)) throw new Error("缺少 edges 数组");
    if (data.points.length === 0) throw new Error("points 不能为空");
    if (data.edges.length === 0) throw new Error("edges 不能为空");

    // 解析点
    const pointMap = new Map();
    const points = data.points.map((point, idx) => {
        if (!point || typeof point !== "object")
            throw new Error(`points[${idx}] 不是有效对象`);
        if (typeof point.id !== "string" || point.id.length === 0)
            throw new Error(`points[${idx}].id 必须是非空字符串`);
        if (pointMap.has(point.id))
            throw new Error(`点 id 重复: ${point.id}`);

        const p = {
            id: point.id,
            x: numberOrThrow(point.x, `points[${idx}].x`),
            y: numberOrThrow(point.y, `points[${idx}].y`),
            z: numberOrThrow(point.z, `points[${idx}].z`),
            u: point.u !== undefined ? point.u : point.x,
            v: point.v !== undefined ? point.v : point.y
        };
        pointMap.set(p.id, p);
        return p;
    });

    // 解析边
    const edgeIdSet = new Set();
    const edges = data.edges.map((edge, idx) => {
        if (!edge || typeof edge !== "object")
            throw new Error(`edges[${idx}] 不是有效对象`);

        const edgeId =
            typeof edge.id === "string" && edge.id.length > 0 ? edge.id : `E_${idx}`;
        if (edgeIdSet.has(edgeId)) throw new Error(`边 id 重复: ${edgeId}`);
        edgeIdSet.add(edgeId);

        if (!Array.isArray(edge.point_ids) || edge.point_ids.length < 2)
            throw new Error(`edges[${idx}].point_ids 至少需要 2 个点`);

        const pointIds = edge.point_ids.slice();
        const positions = pointIds.map((pid, j) => {
            if (typeof pid !== "string")
                throw new Error(`edges[${idx}].point_ids[${j}] 必须是字符串`);
            const pt = pointMap.get(pid);
            if (!pt) throw new Error(`edges[${idx}] 引用了不存在的点: ${pid}`);
            return pt;
        });

        return {
            serial: idx + 1,
            id: edgeId,
            label: `${idx + 1}:${edgeId}`,
            pointIds,
            positions,
            color: hashColor(edgeId, idx), // 后续会被 assignEdgeColors 覆盖
            overlapCount: 1,
            overlapOrder: 0
        };
    });

    buildOverlapGroups(edges);
    assignEdgeColors(edges);

    return { points, edges, bounds: computeBounds(points) };
}
