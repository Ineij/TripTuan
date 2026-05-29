/**
 * Web-Mercator slippy-map helpers shared by P7 (Step7_Board) and P8 (Step8_BoardMap).
 *
 * Everything works in "world pixels" at a given integer zoom:
 *   worldX/worldY(lat,lng,z) → absolute pixel on the global 256·2^z canvas.
 * The on-screen position of a point is  (worldX - viewOriginX, worldY - viewOriginY)
 * where viewOrigin is the world-pixel coordinate of the viewport's top-left corner.
 *
 * This lets us:
 *   • fit the whole route inside the viewport (fitZoom + centerWorld), and
 *   • render only the tiles the viewport currently needs (visibleTiles),
 *     so dragging reveals fresh map instead of blank space.
 */

export const TILE = 256;

export interface LatLng {
  lat: number;
  lng: number;
}

export function worldX(lng: number, z: number): number {
  return ((lng + 180) / 360) * TILE * Math.pow(2, z);
}

export function worldY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * Math.pow(2, z);
}

/** Largest integer zoom at which every point fits inside viewW×viewH (minus padding). */
export function fitZoom(
  points: LatLng[],
  viewW: number,
  viewH: number,
  opts: { pad?: number; min?: number; max?: number } = {},
): number {
  const pad = opts.pad ?? 44;
  const min = opts.min ?? 3;
  const max = opts.max ?? 16;
  if (points.length <= 1) return Math.min(max, 14);

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  for (let z = max; z >= min; z--) {
    const spanX = Math.abs(worldX(maxLng, z) - worldX(minLng, z));
    const spanY = Math.abs(worldY(minLat, z) - worldY(maxLat, z));
    if (spanX <= viewW - pad * 2 && spanY <= viewH - pad * 2) return z;
  }
  return min;
}

/** Geographic centre of a set of points, expressed in world pixels at zoom `z`. */
export function centerWorld(points: LatLng[], z: number): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  const xs = points.map((p) => worldX(p.lng, z));
  const ys = points.map((p) => worldY(p.lat, z));
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

export interface TileSpec {
  key: string;
  src: string;
  left: number;
  top: number;
}

/**
 * Tiles covering the viewport whose top-left world-pixel is (viewX, viewY).
 * `pad` adds a ring of off-screen tiles so panning never flashes blank.
 */
export function visibleTiles(
  viewX: number,
  viewY: number,
  viewW: number,
  viewH: number,
  z: number,
  pad = 1,
): TileSpec[] {
  const n = Math.pow(2, z);
  const minTx = Math.floor(viewX / TILE) - pad;
  const maxTx = Math.floor((viewX + viewW) / TILE) + pad;
  const minTy = Math.floor(viewY / TILE) - pad;
  const maxTy = Math.floor((viewY + viewH) / TILE) + pad;

  const tiles: TileSpec[] = [];
  for (let ty = minTy; ty <= maxTy; ty++) {
    if (ty < 0 || ty >= n) continue; // latitude has no wraparound
    for (let tx = minTx; tx <= maxTx; tx++) {
      const wrapX = ((tx % n) + n) % n; // wrap longitude defensively
      tiles.push({
        key: `${tx}_${ty}`,
        src: `https://tile.openstreetmap.org/${z}/${wrapX}/${ty}.png`,
        left: tx * TILE,
        top: ty * TILE,
      });
    }
  }
  return tiles;
}
