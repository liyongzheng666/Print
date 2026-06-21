import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type DebugEvent } from "../protocol/types";
import { createEmptySceneState, isGroupVisible, reduceScene } from "./reducer";

const base = {
  schema_version: SCHEMA_VERSION,
  session_id: "session-test",
  run_id: "run-1",
};

function apply(events: readonly DebugEvent[]) {
  return events.reduce(reduceScene, createEmptySceneState());
}

describe("scene reducer", () => {
  it("adds, updates and removes an entity", () => {
    const state = apply([
      { ...base, seq: 1, op: "add", id: "p1", group: "fillet/input", kind: "point", geometry: { position: [0, 0, 0] } },
      { ...base, seq: 2, op: "update", id: "p1", patch: { label: "起点" } },
      { ...base, seq: 3, op: "remove", id: "p1" },
    ]);

    expect(state.entities.p1).toBeUndefined();
    expect(state.diagnostics).toHaveLength(0);
  });

  it("clears a group recursively while preserving protected baseline", () => {
    const state = apply([
      { ...base, seq: 1, op: "add", id: "base", group: "baseline/Body", kind: "bbox", style: { protected: true } },
      { ...base, seq: 2, op: "add", id: "s1", group: "fillet/stripe/1", kind: "polyline" },
      { ...base, seq: 3, op: "add", id: "s2", group: "fillet/stripe/2", kind: "polyline" },
      { ...base, seq: 4, op: "clear_group", group: "fillet/stripe" },
    ]);

    expect(Object.keys(state.entities)).toEqual(["base"]);
  });

  it("clear_scene keeps baseline unless explicitly requested", () => {
    const first = apply([
      { ...base, seq: 1, op: "add", id: "base", group: "baseline", kind: "shape", style: { protected: true } },
      { ...base, seq: 2, op: "add", id: "debug", group: "fillet/input", kind: "edge" },
      { ...base, seq: 3, op: "clear_scene" },
    ]);

    expect(Object.keys(first.entities)).toEqual(["base"]);
    const second = reduceScene(first, { ...base, seq: 4, op: "clear_scene", include_protected: true });
    expect(Object.keys(second.entities)).toHaveLength(0);
  });

  it("reports duplicate ids and sequence gaps", () => {
    const state = apply([
      { ...base, seq: 1, op: "add", id: "p1", group: "fillet/input", kind: "point" },
      { ...base, seq: 3, op: "add", id: "p1", group: "fillet/input", kind: "point" },
    ]);

    expect(state.diagnostics.map((item) => item.message)).toEqual([
      "事件序号存在缺口：1 → 3",
      "add 使用了已存在的对象 ID：p1",
    ]);
  });

  it("inherits visibility from parent groups", () => {
    expect(isGroupVisible("fillet/stripe/2", { fillet: false })).toBe(false);
    expect(isGroupVisible("fillet/stripe/2", { fillet: true, "fillet/stripe/2": false })).toBe(false);
    expect(isGroupVisible("fillet/stripe/2", {})).toBe(true);
  });
});
