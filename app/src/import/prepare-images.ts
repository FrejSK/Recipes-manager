import { planImageTiles } from '@recipes/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest edge the extraction model uses without downscaling it itself. */
export const MAX_EDGE = 1568;

export type PreparedImage = { mediaType: 'image/jpeg'; data: string };

/**
 * Splits each image into tiles (long screenshots → several overlapping tiles), shrinks each tile so its
 * long edge is ≤ MAX_EDGE and encodes it as base64 JPEG. Throws Error('image_too_long') from planImageTiles.
 */
export async function prepareImages(uris: string[]): Promise<PreparedImage[]> {
  const out: PreparedImage[] = [];
  for (const uri of uris) {
    const source = await ImageManipulator.manipulate(uri).renderAsync();
    try {
      for (const tile of planImageTiles(source.width, source.height)) {
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
    }
  }
  return out;
}
