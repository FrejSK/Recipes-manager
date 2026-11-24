import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

const IMAGES_DIR = 'images';

/** Copies (file/content URI) or downloads (http/https) an image into app storage; returns the relative path. */
export async function saveImage(uri: string): Promise<string> {
  const dir = new Directory(Paths.document, IMAGES_DIR);
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  const rel = `${IMAGES_DIR}/${randomUUID()}.jpg`;
  const dest = new File(Paths.document, rel);
  if (/^https?:\/\//i.test(uri)) {
    await File.downloadFileAsync(uri, dest);
  } else {
    await new File(uri).copy(dest);
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
