import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

import { BackupFormatError, IMAGE_PATH_RE, parseBackupJson, referencedImages, type BackupFile } from './format';

const JSON_ENTRY = 'backup.json';

/** Packs `backup.json` plus every referenced image under its relative path. Missing/unreadable images are skipped. */
export async function createBackupZip(
  file: BackupFile,
  readImage: (path: string) => Promise<Uint8Array | null>,
): Promise<Uint8Array> {
  const entries: Zippable = { [JSON_ENTRY]: strToU8(JSON.stringify(file)) };
  for (const path of referencedImages(file)) {
    let bytes: Uint8Array | null = null;
    try {
      bytes = await readImage(path);
    } catch {
      bytes = null;
    }
    // Images are already compressed; store them as-is.
    if (bytes) entries[path] = [bytes, { level: 0 }];
  }
  return zipSync(entries);
}

export function readBackupZip(zip: Uint8Array): { file: BackupFile; images: Map<string, Uint8Array> } {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new BackupFormatError();
  }
  const names = Object.keys(entries);
  // Zip-slip: refuse archives with path traversal or absolute entry names.
  if (names.some((n) => n.includes('..') || n.startsWith('/') || n.startsWith('\\'))) {
    throw new BackupFormatError();
  }
  const json = entries[JSON_ENTRY];
  if (!json) throw new BackupFormatError();
  let text: string;
  try {
    text = strFromU8(json);
  } catch {
    throw new BackupFormatError();
  }
  const file = parseBackupJson(text);
  const images = new Map<string, Uint8Array>();
  for (const name of names) {
    if (IMAGE_PATH_RE.test(name)) images.set(name, entries[name]);
  }
  return { file, images };
}
