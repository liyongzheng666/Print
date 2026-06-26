import { describe, expect, it } from "vitest";
import { parseEventData } from "./sseClient";

describe("parseEventData", () => {
  it("parses a complete JSON event line", () => {
    const line = JSON.stringify({
      schema_version: "1.0",
      session_id: "s",
      run_id: "run-0001",
      seq: 1,
      op: "add",
      id: "p1",
      group: "g",
      kind: "point",
      geometry: { position: [1, 2, 3] },
    });
    const event = parseEventData(line);
    expect(event?.op).toBe("add");
    expect(event?.seq).toBe(1);
  });

  it("returns null for blank input", () => {
    expect(parseEventData("")).toBeNull();
    expect(parseEventData("   ")).toBeNull();
  });

  it("returns null for a malformed line instead of throwing", () => {
    expect(parseEventData('{"op":"add"')).toBeNull();
    expect(parseEventData("not json")).toBeNull();
  });
});
