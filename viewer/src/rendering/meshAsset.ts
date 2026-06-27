import type { AssetRef, MeshGeometry, PrintMeshAsset } from "../core/protocol/types";

/**
 * Merge a print-mesh asset's per-face triangle arrays into one MeshGeometry the
 * mesh renderer can draw. Each face's indices are rebased onto the combined
 * vertex buffer; normals are kept only when EVERY face supplies them (otherwise
 * the renderer recomputes them, matching the inline-mesh path). Returns null
 * when the asset carries no triangles (e.g. a 0-face shell).
 */
export function mergePrintMesh(mesh: PrintMeshAsset): MeshGeometry | null {
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  let haveAllNormals = true;
  let vertexOffset = 0;
  for (const face of mesh.faces ?? []) {
    const vertexCount = face.positions.length / 3;
    positions.push(...face.positions);
    for (const index of face.indices) indices.push(index + vertexOffset);
    if (face.normals && face.normals.length === face.positions.length) {
      normals.push(...face.normals);
    } else {
      haveAllNormals = false;
    }
    vertexOffset += vertexCount;
  }
  if (indices.length === 0) return null;
  return haveAllNormals && normals.length === positions.length
    ? { positions, indices, normals }
    : { positions, indices };
}

/** Key an asset by content hash when present (sha256), else by path. */
function assetKey(asset: AssetRef): string {
  return asset.sha256 ?? asset.path;
}

/**
 * Fetches + parses print-mesh assets on demand and caches the merged geometry,
 * so the async renderer (M2-1 plan A) can upgrade a placeholder bbox to a real
 * triangle mesh once the daemon's `update` references it.
 *
 *   get(asset)       synchronous cache hit (undefined until a load succeeds)
 *   isSettled(asset) a load attempt finished (success / empty / error) — used to
 *                    avoid re-fetching an asset that yielded no mesh or failed
 *   load(asset)      fetch once; concurrent calls for the same asset are deduped
 *
 * Assets are same-origin — the Bridge serves /assets and the dev server proxies
 * it (contract §3.5) — so a relative `/assets/<path>` URL is correct.
 */
export class MeshAssetLoader {
  private readonly cache = new Map<string, MeshGeometry>();
  private readonly settled = new Set<string>();
  private readonly inflight = new Map<string, Promise<MeshGeometry | null>>();

  constructor(private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init)) {}

  get(asset: AssetRef): MeshGeometry | undefined {
    return this.cache.get(assetKey(asset));
  }

  isSettled(asset: AssetRef): boolean {
    return this.settled.has(assetKey(asset));
  }

  load(asset: AssetRef): Promise<MeshGeometry | null> {
    const key = assetKey(asset);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const task = this.fetchAndMerge(asset)
      .then((geometry) => {
        if (geometry) this.cache.set(key, geometry);
        return geometry;
      })
      .finally(() => {
        this.settled.add(key);
        this.inflight.delete(key);
      });
    this.inflight.set(key, task);
    return task;
  }

  private async fetchAndMerge(asset: AssetRef): Promise<MeshGeometry | null> {
    const response = await this.fetchImpl(`/assets/${asset.path}`);
    if (!response.ok) {
      throw new Error(`asset fetch ${response.status} ${response.statusText}: ${asset.path}`);
    }
    const json = (await response.json()) as PrintMeshAsset;
    return mergePrintMesh(json);
  }
}
