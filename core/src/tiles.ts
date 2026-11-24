export type Tile = { originX: number; originY: number; width: number; height: number };

const MAX_TILES = 20;

export function planImageTiles(width: number, height: number): Tile[] {
  const n = Math.ceil(height / (2.5 * width));
  if (n > MAX_TILES) throw new Error('image_too_long');
  if (n <= 1) return [{ originX: 0, originY: 0, width, height }];
  const base = Math.ceil(height / n);
  const overlap = Math.round(base * 0.05);
  return Array.from({ length: n }, (_, i) => {
    const originY = Math.max(0, i * base - overlap);
    const endY = Math.min(height, (i + 1) * base + overlap);
    return { originX: 0, originY, width, height: endY - originY };
  });
}
