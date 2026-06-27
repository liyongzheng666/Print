import { describe, expect, it, vi } from "vitest";
import type { AssetRef, PrintMeshAsset } from "../core/protocol/types";
import { MeshAssetLoader, mergePrintMesh } from "./meshAsset";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Not Found",
    json: async () => body,
  } as unknown as Response;
}

const TRI = (z: number) => [0, 0, z, 1, 0, z, 0, 1, z];
const NORMALS = [0, 0, 1, 0, 0, 1, 0, 0, 1];

describe("mergePrintMesh", () => {
  it("merges faces and rebases each face's indices onto the combined buffer", () => {
    const geom = mergePrintMesh({
      format_version: "1.0",
      unit: "mm",
      faces: [
        { face_id: "F1", positions: TRI(0), indices: [0, 1, 2], normals: NORMALS },
        { face_id: "F2", positions: TRI(1), indices: [0, 1, 2], normals: NORMALS },
      ],
    })!;
    expect(geom.positions).toHaveLength(18);
    expect(geom.indices).toEqual([0, 1, 2, 3, 4, 5]); // F2 rebased by F1's 3 verts
    expect(geom.normals).toHaveLength(18);
  });

  it("drops normals unless every face supplies them (renderer recomputes)", () => {
    const geom = mergePrintMesh({
      format_version: "1.0",
      unit: "mm",
      faces: [
        { face_id: "F1", positions: TRI(0), indices: [0, 1, 2], normals: NORMALS },
        { face_id: "F2", positions: TRI(1), indices: [0, 1, 2] },
      ],
    })!;
    expect(geom.normals).toBeUndefined();
    expect(geom.indices).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("returns null when the asset has no triangles", () => {
    expect(mergePrintMesh({ format_version: "1.0", unit: "mm", faces: [] })).toBeNull();
    expect(mergePrintMesh({ format_version: "1.0", unit: "mm" })).toBeNull();
  });
});

describe("MeshAssetLoader", () => {
  const asset: AssetRef = { format: "print-mesh", path: "run-0001/shape-7.mesh.json", sha256: "a".repeat(64) };
  const mesh: PrintMeshAsset = {
    format_version: "1.0",
    unit: "mm",
    faces: [{ face_id: "F1", positions: TRI(0), indices: [0, 1, 2] }],
  };

  it("fetches /assets/<path>, caches the merge, and dedupes concurrent loads", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(mesh));
    const loader = new MeshAssetLoader(fetchImpl as unknown as typeof fetch);
    expect(loader.get(asset)).toBeUndefined();

    const [a, b] = await Promise.all([loader.load(asset), loader.load(asset)]);
    expect(a).toEqual(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/assets/run-0001/shape-7.mesh.json");
    expect(loader.get(asset)?.indices).toEqual([0, 1, 2]);
    expect(loader.isSettled(asset)).toBe(true);
  });

  it("surfaces a fetch failure and still marks the asset settled (no retry storm)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(null, false, 404));
    const loader = new MeshAssetLoader(fetchImpl as unknown as typeof fetch);
    await expect(loader.load(asset)).rejects.toThrow(/404/);
    expect(loader.isSettled(asset)).toBe(true);
    expect(loader.get(asset)).toBeUndefined();
  });
});
