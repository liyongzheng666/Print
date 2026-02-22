"""
生成封闭曲面的测试 JSON 文件。

包含：
  - 圆柱面 (Cylinder)：U 方向封闭，半径 R，高度 H
  - 圆台面 (Truncated Cone / Frustum)：U 方向封闭，上半径 r，下半径 R，高度 H

每个面的 2D 参数空间边界：
  - 上边界线 (u 从 0 到 2π，v = v_max)
  - 下边界线 (u 从 0 到 2π，v = v_min)
  - 左缝合线 (u = 0, v 从 v_min 到 v_max) —— 为了在 2D 上表达封闭性
  - 右缝合线 (u = 2π, v 从 v_min 到 v_max) —— 和左缝合线实际上在 3D 上重合

2D 参数映射：u → 水平轴、v → 垂直轴
3D 映射：
  - 圆柱   x = R*cos(u), y = R*sin(u), z = v
  - 圆台   x = r(v)*cos(u), y = r(v)*sin(u), z = v
           其中 r(v) = R_bottom + (R_top - R_bottom) * (v - v_min) / (v_max - v_min)
"""

import json, math

N_SAMPLES_U = 40   # U 方向采样数（圆周）
N_SAMPLES_V = 2    # 缝合线采样数（只需上下两个端点 + 中间可选）


def make_cylinder(name, radius, height, center_x=0, center_y=0, center_z=0, u_offset=0, v_offset=0):
    """生成一个圆柱面的四条边界线（上环、下环、左缝合线、右缝合线）"""
    v_min, v_max = 0.0, height
    points = []
    edges = []
    pid_counter = [1]

    def next_pid():
        pid = f"P{pid_counter[0]:04d}"
        pid_counter[0] += 1
        return pid

    # --- 下环 (v = 0) ---
    bottom_ids = []
    for i in range(N_SAMPLES_U + 1):
        u = 2 * math.pi * i / N_SAMPLES_U
        pid = next_pid()
        bottom_ids.append(pid)
        points.append({
            "id": pid,
            "x": round(center_x + radius * math.cos(u), 4),
            "y": round(center_y + radius * math.sin(u), 4),
            "z": round(center_z + v_min, 4),
            "u": round(u + u_offset, 4),
            "v": round(v_min + v_offset, 4)
        })
    edges.append({
        "id": f"{name}_E_bottom",
        "point_ids": bottom_ids,
        "start_point_id": bottom_ids[0],
        "end_point_id": bottom_ids[-1],
        "type": "polyline",
        "curve_hint": {"kind": "circle", "closed_u": True},
        "connected_edges": []
    })

    # --- 上环 (v = height) ---
    top_ids = []
    for i in range(N_SAMPLES_U + 1):
        u = 2 * math.pi * i / N_SAMPLES_U
        pid = next_pid()
        top_ids.append(pid)
        points.append({
            "id": pid,
            "x": round(center_x + radius * math.cos(u), 4),
            "y": round(center_y + radius * math.sin(u), 4),
            "z": round(center_z + v_max, 4),
            "u": round(u + u_offset, 4),
            "v": round(v_max + v_offset, 4)
        })
    edges.append({
        "id": f"{name}_E_top",
        "point_ids": top_ids,
        "start_point_id": top_ids[0],
        "end_point_id": top_ids[-1],
        "type": "polyline",
        "curve_hint": {"kind": "circle", "closed_u": True},
        "connected_edges": []
    })

    # --- 左缝合线 (u = 0, v from 0 to height) ---
    seam_left_ids = []
    n_seam = 10
    for i in range(n_seam + 1):
        v = v_min + (v_max - v_min) * i / n_seam
        u = 0.0
        pid = next_pid()
        seam_left_ids.append(pid)
        points.append({
            "id": pid,
            "x": round(center_x + radius * math.cos(u), 4),
            "y": round(center_y + radius * math.sin(u), 4),
            "z": round(center_z + v, 4),
            "u": round(u + u_offset, 4),
            "v": round(v + v_offset, 4)
        })
    edges.append({
        "id": f"{name}_E_seam_left",
        "point_ids": seam_left_ids,
        "start_point_id": seam_left_ids[0],
        "end_point_id": seam_left_ids[-1],
        "type": "polyline",
        "curve_hint": {"kind": "seam_line"},
        "connected_edges": []
    })

    # --- 右缝合线 (u = 2π, v from 0 to height) — 3D 和左缝合线重合 ---
    seam_right_ids = []
    for i in range(n_seam + 1):
        v = v_min + (v_max - v_min) * i / n_seam
        u = 2 * math.pi
        pid = next_pid()
        seam_right_ids.append(pid)
        points.append({
            "id": pid,
            "x": round(center_x + radius * math.cos(u), 4),
            "y": round(center_y + radius * math.sin(u), 4),
            "z": round(center_z + v, 4),
            "u": round(u + u_offset, 4),
            "v": round(v + v_offset, 4)
        })
    edges.append({
        "id": f"{name}_E_seam_right",
        "point_ids": seam_right_ids,
        "start_point_id": seam_right_ids[0],
        "end_point_id": seam_right_ids[-1],
        "type": "polyline",
        "curve_hint": {"kind": "seam_line"},
        "connected_edges": []
    })

    return points, edges


def make_frustum(name, r_bottom, r_top, height, center_x=0, center_y=0, center_z=0, u_offset=0, v_offset=0):
    """生成一个圆台面的四条边界线"""
    v_min, v_max = 0.0, height
    points = []
    edges = []
    pid_counter = [1]

    def next_pid():
        pid = f"P{pid_counter[0]:04d}"
        pid_counter[0] += 1
        return pid

    def r_of_v(v):
        t = (v - v_min) / (v_max - v_min) if (v_max - v_min) > 1e-12 else 0
        return r_bottom + (r_top - r_bottom) * t

    # --- 下环 (v = 0, r = r_bottom) ---
    bottom_ids = []
    for i in range(N_SAMPLES_U + 1):
        u = 2 * math.pi * i / N_SAMPLES_U
        r = r_of_v(v_min)
        pid = next_pid()
        bottom_ids.append(pid)
        points.append({
            "id": pid,
            "x": round(center_x + r * math.cos(u), 4),
            "y": round(center_y + r * math.sin(u), 4),
            "z": round(center_z + v_min, 4),
            "u": round(u + u_offset, 4),
            "v": round(v_min + v_offset, 4)
        })
    edges.append({
        "id": f"{name}_E_bottom",
        "point_ids": bottom_ids,
        "start_point_id": bottom_ids[0],
        "end_point_id": bottom_ids[-1],
        "type": "polyline",
        "curve_hint": {"kind": "circle", "closed_u": True},
        "connected_edges": []
    })

    # --- 上环 (v = height, r = r_top) ---
    top_ids = []
    for i in range(N_SAMPLES_U + 1):
        u = 2 * math.pi * i / N_SAMPLES_U
        r = r_of_v(v_max)
        pid = next_pid()
        top_ids.append(pid)
        points.append({
            "id": pid,
            "x": round(center_x + r * math.cos(u), 4),
            "y": round(center_y + r * math.sin(u), 4),
            "z": round(center_z + v_max, 4),
            "u": round(u + u_offset, 4),
            "v": round(v_max + v_offset, 4)
        })
    edges.append({
        "id": f"{name}_E_top",
        "point_ids": top_ids,
        "start_point_id": top_ids[0],
        "end_point_id": top_ids[-1],
        "type": "polyline",
        "curve_hint": {"kind": "circle", "closed_u": True},
        "connected_edges": []
    })

    # --- 左缝合线 (u = 0) ---
    seam_left_ids = []
    n_seam = 10
    for i in range(n_seam + 1):
        v = v_min + (v_max - v_min) * i / n_seam
        u = 0.0
        r = r_of_v(v)
        pid = next_pid()
        seam_left_ids.append(pid)
        points.append({
            "id": pid,
            "x": round(center_x + r * math.cos(u), 4),
            "y": round(center_y + r * math.sin(u), 4),
            "z": round(center_z + v, 4),
            "u": round(u + u_offset, 4),
            "v": round(v + v_offset, 4)
        })
    edges.append({
        "id": f"{name}_E_seam_left",
        "point_ids": seam_left_ids,
        "start_point_id": seam_left_ids[0],
        "end_point_id": seam_left_ids[-1],
        "type": "polyline",
        "curve_hint": {"kind": "seam_line"},
        "connected_edges": []
    })

    # --- 右缝合线 (u = 2π) ---
    seam_right_ids = []
    for i in range(n_seam + 1):
        v = v_min + (v_max - v_min) * i / n_seam
        u = 2 * math.pi
        r = r_of_v(v)
        pid = next_pid()
        seam_right_ids.append(pid)
        points.append({
            "id": pid,
            "x": round(center_x + r * math.cos(u), 4),
            "y": round(center_y + r * math.sin(u), 4),
            "z": round(center_z + v, 4),
            "u": round(u + u_offset, 4),
            "v": round(v + v_offset, 4)
        })
    edges.append({
        "id": f"{name}_E_seam_right",
        "point_ids": seam_right_ids,
        "start_point_id": seam_right_ids[0],
        "end_point_id": seam_right_ids[-1],
        "type": "polyline",
        "curve_hint": {"kind": "seam_line"},
        "connected_edges": []
    })

    return points, edges


def main():
    all_points = []
    all_edges = []

    # ─── 圆柱面 1: R=5, H=10, 位于原点 ───
    pts, eds = make_cylinder("CYL1", radius=5, height=10, center_x=0, center_y=0, center_z=0, u_offset=0, v_offset=0)
    # 需要给 point id 加全局偏移以避免和后面的面冲突
    offset = len(all_points)
    for p in pts:
        p["id"] = f"P{offset + int(p['id'][1:]):04d}"
    for e in eds:
        e["point_ids"] = [f"P{offset + int(pid[1:]):04d}" for pid in e["point_ids"]]
        e["start_point_id"] = e["point_ids"][0]
        e["end_point_id"] = e["point_ids"][-1]
    all_points.extend(pts)
    all_edges.extend(eds)

    # ─── 圆柱面 2: R=3, H=8, 偏移到 (20, 0, 0) ───
    pts, eds = make_cylinder("CYL2", radius=3, height=8, center_x=20, center_y=0, center_z=0, u_offset=10, v_offset=0)
    offset = len(all_points)
    for p in pts:
        p["id"] = f"P{offset + int(p['id'][1:]):04d}"
    for e in eds:
        e["point_ids"] = [f"P{offset + int(pid[1:]):04d}" for pid in e["point_ids"]]
        e["start_point_id"] = e["point_ids"][0]
        e["end_point_id"] = e["point_ids"][-1]
    all_points.extend(pts)
    all_edges.extend(eds)

    # ─── 圆台面 1: R_bottom=6, R_top=3, H=12, 偏移到 (40, 0, 0) ───
    pts, eds = make_frustum("FRS1", r_bottom=6, r_top=3, height=12, center_x=40, center_y=0, center_z=0, u_offset=20, v_offset=0)
    offset = len(all_points)
    for p in pts:
        p["id"] = f"P{offset + int(p['id'][1:]):04d}"
    for e in eds:
        e["point_ids"] = [f"P{offset + int(pid[1:]):04d}" for pid in e["point_ids"]]
        e["start_point_id"] = e["point_ids"][0]
        e["end_point_id"] = e["point_ids"][-1]
    all_points.extend(pts)
    all_edges.extend(eds)

    # ─── 圆台面 2: R_bottom=4, R_top=7, H=10, 偏移到 (60, 0, 0) — 上大下小 ───
    pts, eds = make_frustum("FRS2", r_bottom=4, r_top=7, height=10, center_x=60, center_y=0, center_z=0, u_offset=30, v_offset=0)
    offset = len(all_points)
    for p in pts:
        p["id"] = f"P{offset + int(p['id'][1:]):04d}"
    for e in eds:
        e["point_ids"] = [f"P{offset + int(pid[1:]):04d}" for pid in e["point_ids"]]
        e["start_point_id"] = e["point_ids"][0]
        e["end_point_id"] = e["point_ids"][-1]
    all_points.extend(pts)
    all_edges.extend(eds)

    data = {
        "format": "cg_edge_export",
        "version": "1.0",
        "meta": {
            "unit": "mm",
            "coord_system": "right_handed",
            "note": "封闭曲面测试：2 个圆柱面 + 2 个圆台面，U 方向封闭，带缝合线"
        },
        "points": all_points,
        "edges": all_edges
    }

    out_path = "TestJson/closed-surfaces-sample.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✅ 已生成 {out_path}")
    print(f"   点数: {len(all_points)}，边数: {len(all_edges)}")


if __name__ == "__main__":
    main()
