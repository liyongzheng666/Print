import { describe, expect, it } from "vitest";
import type { SceneEntity } from "../../core/protocol/types";
import { geometryRows } from "./Inspector";

function entity(partial: Partial<SceneEntity> & Pick<SceneEntity, "kind">): SceneEntity {
  return { id: "e", group: "g", run_id: "run-0001", ...partial } as SceneEntity;
}

describe("geometryRows", () => {
  it("shows the coordinate of a point", () => {
    const rows = geometryRows(entity({ kind: "point", geometry: { position: [5, -5, 3] } }));
    expect(rows).toEqual([{ label: "坐标", value: "(5, -5, 3)" }]);
  });

  it("shows head, tail and count of a polyline", () => {
    const rows = geometryRows(
      entity({ kind: "edge", geometry: { points: [[5, -5, 0], [5, -5, 5], [5, -5, 10]] } }),
    );
    expect(rows).toEqual([
      { label: "点数", value: 3 },
      { label: "头", value: "(5, -5, 0)" },
      { label: "尾", value: "(5, -5, 10)" },
      { label: "闭合", value: undefined },
    ]);
  });

  it("trims trailing zeros and keeps precision", () => {
    const rows = geometryRows(entity({ kind: "point", geometry: { position: [1.2500000, 0, -0.333333] } }));
    expect(rows[0].value).toBe("(1.25, 0, -0.333333)");
  });

  it("returns no rows for asset-backed geometry (no inline)", () => {
    expect(geometryRows(entity({ kind: "shape" }))).toEqual([]);
  });
});
