import { MAX_EXTRACT_IMAGES, planImageTiles, type Tile } from '@recipes/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest edge the extraction model uses without downscaling it itself. */
export const MAX_EDGE = 1568;

export type PreparedImage = { mediaType: 'image/jpeg'; data: string };

/**
 * Splits each image into tiles (long screenshots → several overlapping tiles), shrinks each tile so its
 * long edge is ≤ MAX_EDGE and encodes it as base64 JPEG.
 *
 * All tiles are planned first from the image sizes alone, so nothing is encoded when the request would be
 * refused anyway. Throws Error('image_too_long') from planImageTiles, or Error('too_many_images') when the
 * images together need more than MAX_EXTRACT_IMAGES tiles.
 */
export async function prepareImages(uris: string[]): Promise<PreparedImage[]> {
  const plans: Tile[][] = [];
  for (const uri of uris) {
    const ctx = ImageManipulator.manipulate(uri);
    const source = await ctx.renderAsync();
    try {
      plans.push(planImageTiles(source.width, source.height));
    } finally {
      source.release();
      ctx.release();
    }
  }
  const total = plans.reduce((sum, tiles) => sum + tiles.length, 0);
  if (total > MAX_EXTRACT_IMAGES) throw new Error('too_many_images');

  const out: PreparedImage[] = [];
  for (const [i, uri] of uris.entries()) {
    const load = ImageManipulator.manipulate(uri);
    const source = await load.renderAsync();
    try {
      for (const tile of plans[i]) {
        const ctx = ImageManipulator.manipulate(source).crop(tile);
        if (Math.max(tile.width, tile.height) > MAX_EDGE) {
          ctx.resize(tile.width >= tile.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
        }
        const image = await ctx.renderAsync();
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
        image.release();
        ctx.release();
        if (!saved.base64) throw new Error('no_base64');
        out.push({ mediaType: 'image/jpeg', data: saved.base64 });
      }
    } finally {
      source.release();
      load.release();
    }
  }
  return out;
}
