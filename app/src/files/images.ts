import { randomUUID } from '../util/uuid';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Folder (under the document directory) holding every stored image; recipes keep `images/<uuid>.jpg`. */
export const IMAGES_DIR = 'images';

/** Stored images are at most this wide; height is never capped so long screenshots stay readable. */
export const MAX_STORED_WIDTH = 1440;
const JPEG_QUALITY = 0.8;

function deleteQuietly(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // best effort
  }
}

/** Re-encodes `source` as JPEG (shrunk to MAX_STORED_WIDTH when wider) and moves the result to `dest`. */
async function encodeInto(source: string, dest: File): Promise<void> {
  const refs: { release(): void }[] = [];
  let output: File | null = null;
  try {
    const load = ImageManipulator.manipulate(source);
    refs.push(load);
    let image = await load.renderAsync();
    refs.push(image);
    if (image.width > MAX_STORED_WIDTH) {
      const resize = ImageManipulator.manipulate(image).resize({ width: MAX_STORED_WIDTH });
      refs.push(resize);
      image = await resize.renderAsync();
      refs.push(image);
    }
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    output = new File(saved.uri);
    await output.move(dest);
    output = null;
  } finally {
    if (output) deleteQuietly(output);
    for (const r of refs) r.release();
  }
}

/**
 * Stores an image (file/content URI, or http/https URL which is downloaded first) as `images/<uuid>.jpg`,
 * re-encoded as JPEG and shrunk to MAX_STORED_WIDTH; returns the relative path. Rejects on any failure and
 * leaves no partial file behind.
 */
export async function saveImage(uri: string): Promise<string> {
  const dir = new Directory(Paths.document, IMAGES_DIR);
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  const rel = `${IMAGES_DIR}/${randomUUID()}.jpg`;
  const dest = new File(Paths.document, rel);
  let download: File | null = null;
  try {
    let source = uri;
    if (/^https?:\/\//i.test(uri)) {
      download = new File(Paths.cache, `download-${randomUUID()}`);
      await File.downloadFileAsync(uri, download);
      source = download.uri;
    }
    await encodeInto(source, dest);
  } catch (e) {
    deleteQuietly(dest);
    throw e;
  } finally {
    if (download) deleteQuietly(download);
  }
  return rel;
}

export function imageUri(path: string): string {
  return new File(Paths.document, path).uri;
}

export async function deleteImages(paths: (string | null)[]): Promise<void> {
  for (const p of paths) {
    if (!p) continue;
    const file = new File(Paths.document, p);
    if (file.exists) file.delete();
  }
}
