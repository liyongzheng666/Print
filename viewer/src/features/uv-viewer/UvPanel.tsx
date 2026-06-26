import type { ReactElement } from "react";
import { useSceneStore } from "../../core/scene-store/store";

// P0b: render geom-sidecar pcurves in parameter (UV) space. scripts/mesh-to-session.py
// attaches metadata.uv = { panels:[{face_id, surface_type, bounds:[umin,umax,vmin,vmax],
// curves:[{label,is_seam,degenerate,selected,points:[[u,v]...]}]}] }.
// ONE PANEL PER FACE — an edge on several faces lives in different parameter
// spaces (e.g. a closed circle on a cylinder vs its planar cap), so they are
// never mixed in one plot. A face entity has one panel (its full unwrap); an
// edge entity has one panel per face it touches, with the edge highlighted.

interface UvCurve {
  readonly label?: string;
  readonly is_seam?: boolean;
  readonly degenerate?: boolean;
  readonly selected?: boolean;
  readonly points: ReadonlyArray<ReadonlyArray<number>>;
}
interface UvPanelData {
  readonly face_id?: string;
  readonly surface_type?: string;
  readonly bounds?: ReadonlyArray<number> | null;
  readonly curves?: ReadonlyArray<UvCurve>;
}
interface UvData {
  readonly panels?: ReadonlyArray<UvPanelData>;
}

const VB = 300;
const PAD = 28;

function UvPlot({ panel }: { readonly panel: UvPanelData }): ReactElement {
  const curves = panel.curves ?? [];
  const all = curves.flatMap((c) => c.points);
  const b = panel.bounds && panel.bounds.length === 4 ? panel.bounds : null;
  const us = all.map((p) => p[0]).concat(b ? [b[0], b[1]] : []);
  const vs = all.map((p) => p[1]).concat(b ? [b[2], b[3]] : []);
  const u0 = us.length ? Math.min(...us) : 0;
  const u1 = us.length ? Math.max(...us) : 1;
  const v0 = vs.length ? Math.min(...vs) : 0;
  const v1 = vs.length ? Math.max(...vs) : 1;
  const sx = (VB - 2 * PAD) / (u1 - u0 || 1);
  const sy = (VB - 2 * PAD) / (v1 - v0 || 1);
  const T = (u: number, v: number): [number, number] => [PAD + (u - u0) * sx, VB - PAD - (v - v0) * sy];

  // draw selected curves last so they sit on top
  const ordered = [...curves].sort((a, c) => Number(a.selected) - Number(c.selected));
  const els: ReactElement[] = [];
  if (b) {
    const [x0, y0] = T(b[0], b[3]);
    const [x1, y1] = T(b[1], b[2]);
    els.push(<rect key="b" x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke="#4c566a" strokeWidth={1} strokeDasharray="4 3" />);
  }
  ordered.forEach((c, i) => {
    const color = c.selected ? "#f4f4f4" : c.is_seam ? "#e74c3c" : c.degenerate ? "#ff9f40" : "#36d1c4";
    const w = c.selected ? 3.4 : c.is_seam ? 2.6 : 2;
    const sp = c.points.map(([u, v]) => T(u, v));
    if (sp.length === 1) {
      els.push(<circle key={`c${i}`} cx={sp[0][0]} cy={sp[0][1]} r={c.selected ? 5 : 4} fill={color} />);
    } else if (sp.length > 1) {
      const d = "M" + sp.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
      els.push(<path key={`c${i}`} d={d} fill="none" stroke={color} strokeWidth={w} strokeDasharray={c.degenerate ? "6 3" : undefined} strokeLinecap="round" strokeLinejoin="round" />);
    }
    sp.forEach(([x, y], j) => els.push(<circle key={`c${i}_${j}`} cx={x} cy={y} r={c.selected ? 2.2 : 1.6} fill={color} />));
  });

  return (
    <div className="uv-plot">
      <div className="uv-plot-head">
        {panel.face_id ?? "?"}
        {panel.surface_type ? ` · ${panel.surface_type}` : ""}
      </div>
      <svg className="uv-svg" viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="xMidYMid meet">
        {els}
        <text x={7} y={VB - 7} fill="#7a8290" fontSize={12}>U →</text>
        <text x={7} y={17} fill="#7a8290" fontSize={12}>V ↑</text>
      </svg>
    </div>
  );
}

export function UvPanel() {
  const entity = useSceneStore((state) => (state.selectedId ? state.entities[state.selectedId] : undefined));
  const meta = entity?.metadata as Record<string, unknown> | undefined;
  const uv = meta?.uv as UvData | undefined;
  const typeLabel = (meta?.surface_type as string) ?? (meta?.curve_type as string) ?? "";
  const panels = uv?.panels ?? [];

  return (
    <section className="uv-panel" aria-label="二维参数空间">
      <header>
        <span>二维参数空间 (UV)</span>
        <span className="uv-object">
          {entity?.label ?? "未选择"}
          {typeLabel ? ` · ${typeLabel}` : ""}
        </span>
      </header>
      <div className="uv-stage">
        {panels.length > 0 ? (
          <div className="uv-panels">
            {panels.map((p, i) => (
              <UvPlot key={p.face_id ?? i} panel={p} />
            ))}
          </div>
        ) : (
          <div className="uv-placeholder">
            选中带 geom 的面/边查看其 pcurve（参数空间，每个面单独一张）。白=选中边 · 红=缝边 · 橙虚线=极点/退化边 · 青=普通。
          </div>
        )}
      </div>
    </section>
  );
}
