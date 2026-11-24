import {
  strFromU8,
  strToU8,
  UnzipInflate,
  UnzipPassThrough,
  Zip,
  ZipDeflate,
  ZipPassThrough,
  type UnzipDecoder,
} from 'fflate';

import { BackupFormatError, IMAGE_PATH_RE, parseBackupJson, referencedImages, type BackupFile } from './format';

/**
 * Streaming backup zip. Nothing here holds the whole archive in memory:
 * - the writer emits the archive chunk by chunk into a sink, holding at most one image at a time;
 * - the reader uses random access (central directory) and streams each image entry into its own sink.
 *
 * The reader deliberately does not use fflate's sequential `Unzip`: archives written by fflate's
 * streaming `Zip` use data descriptors (sizes unknown in the local header), and `Unzip` then finds the
 * end of a stored entry by scanning for `PK` signatures, which a JPEG can contain by chance and which
 * would silently corrupt the restore. The central directory always carries the real sizes.
 */

const JSON_ENTRY = 'backup.json';
const DEFAULT_CHUNK = 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024 * 1024;

export type ByteSink = {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
};

/** Random-access byte source (a file handle on device, a buffer in tests). */
export type ByteSource = {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
};

/** Writes `backup.json` (deflated) then every referenced image (stored) into `sink`. Missing/unreadable images are skipped. */
export async function writeBackupZip(
  file: BackupFile,
  readImage: (path: string) => Promise<Uint8Array | null>,
  sink: ByteSink,
): Promise<void> {
  const pending: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) failure = err;
    else pending.push(chunk);
  });
  const flush = async () => {
    if (failure) throw failure;
    while (pending.length) await sink.write(pending.shift()!);
  };

  const json = new ZipDeflate(JSON_ENTRY);
  zip.add(json);
  json.push(strToU8(JSON.stringify(file)), true);
  await flush();

  for (const path of referencedImages(file)) {
    let bytes: Uint8Array | null = null;
    try {
      bytes = await readImage(path);
    } catch {
      bytes = null;
    }
    if (!bytes) continue;
    // Images are already compressed; store them as-is.
    const entry = new ZipPassThrough(path);
    zip.add(entry);
    entry.push(bytes, true);
    bytes = null;
    await flush();
  }

  zip.end();
  await flush();
}

type Entry = {
  name: string;
  compression: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
};

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

async function readExact(src: ByteSource, offset: number, length: number): Promise<Uint8Array> {
  if (offset < 0 || offset + length > src.size) throw new BackupFormatError();
  const out = new Uint8Array(length);
  let got = 0;
  while (got < length) {
    const chunk = await src.read(offset + got, length - got);
    if (chunk.length === 0) throw new BackupFormatError();
    out.set(chunk.subarray(0, length - got), got);
    got += chunk.length;
  }
  return out;
}

async function readCentralDirectory(src: ByteSource): Promise<Entry[]> {
  const tailLen = Math.min(src.size, 22 + 0xffff);
  if (tailLen < 22) throw new BackupFormatError();
  const tail = await readExact(src, src.size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new BackupFormatError();
  const count = u16(tail, eocd + 10);
  const cdSize = u32(tail, eocd + 12);
  const cdOffset = u32(tail, eocd + 16);
  // Zip64 is never produced for a recipe backup; refuse instead of misreading it.
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new BackupFormatError();
  const cd = await readExact(src, cdOffset, cdSize);

  const entries: Entry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.length || u32(cd, p) !== 0x02014b50) throw new BackupFormatError();
    const flags = u16(cd, p + 8);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    if (p + 46 + nameLen > cd.length) throw new BackupFormatError();
    if (flags & 1) throw new BackupFormatError(); // encrypted
    entries.push({
      name: strFromU8(cd.subarray(p + 46, p + 46 + nameLen), !(flags & 0x800)),
      compression: u16(cd, p + 10),
      compressedSize: u32(cd, p + 20),
      size: u32(cd, p + 24),
      localHeaderOffset: u32(cd, p + 42),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Streams one entry's decompressed bytes to `onData`; rejects output larger than the declared size. */
async function streamEntry(
  src: ByteSource,
  entry: Entry,
  chunkSize: number,
  onData: (chunk: Uint8Array) => Promise<void>,
): Promise<void> {
  const header = await readExact(src, entry.localHeaderOffset, 30);
  if (u32(header, 0) !== 0x04034b50) throw new BackupFormatError();
  const dataStart = entry.localHeaderOffset + 30 + u16(header, 26) + u16(header, 28);
  if (dataStart + entry.compressedSize > src.size) throw new BackupFormatError();

  let decoder: UnzipDecoder;
  if (entry.compression === 0) decoder = new UnzipPassThrough();
  else if (entry.compression === 8) decoder = new UnzipInflate();
  else throw new BackupFormatError();

  const pending: Uint8Array[] = [];
  let produced = 0;
  decoder.ondata = (err, chunk) => {
    if (err) throw err;
    produced += chunk.length;
    if (chunk.length) pending.push(chunk);
  };
  const push = async (chunk: Uint8Array, final: boolean) => {
    try {
      decoder.push(chunk, final);
    } catch {
      throw new BackupFormatError();
    }
    if (produced > entry.size) throw new BackupFormatError();
    while (pending.length) await onData(pending.shift()!);
  };

  let done = 0;
  if (entry.compressedSize === 0) await push(new Uint8Array(0), true);
  while (done < entry.compressedSize) {
    const len = Math.min(chunkSize, entry.compressedSize - done);
    const chunk = await readExact(src, dataStart + done, len);
    done += len;
    await push(chunk, done === entry.compressedSize);
  }
  if (produced !== entry.size) throw new BackupFormatError();
}

export type OpenedBackup = {
  file: BackupFile;
  /** Streams every image entry into the sink `openSink(name)` returns; closes each sink. */
  extractImages(openSink: (name: string) => Promise<ByteSink>): Promise<void>;
};

/**
 * Reads and validates `backup.json` without touching any image data.
 * Throws `BackupFormatError` for non-zips, zip-slip names, a missing or invalid `backup.json`.
 */
export async function openBackupZip(src: ByteSource, chunkSize = DEFAULT_CHUNK): Promise<OpenedBackup> {
  const entries = await readCentralDirectory(src);
  // Zip-slip: refuse archives with path traversal or absolute entry names.
  if (entries.some((e) => e.name.includes('..') || e.name.startsWith('/') || e.name.startsWith('\\'))) {
    throw new BackupFormatError();
  }
  const jsonEntry = entries.find((e) => e.name === JSON_ENTRY);
  if (!jsonEntry || jsonEntry.size > MAX_JSON_BYTES) throw new BackupFormatError();

  const parts: Uint8Array[] = [];
  await streamEntry(src, jsonEntry, chunkSize, async (c) => {
    parts.push(c.slice());
  });
  const jsonBytes = new Uint8Array(jsonEntry.size);
  let o = 0;
  for (const part of parts) {
    jsonBytes.set(part, o);
    o += part.length;
  }
  let text: string;
  try {
    text = strFromU8(jsonBytes);
  } catch {
    throw new BackupFormatError();
  }
  const file = parseBackupJson(text);

  const images = entries.filter((e) => IMAGE_PATH_RE.test(e.name));
  return {
    file,
    async extractImages(openSink) {
      for (const entry of images) {
        const sink = await openSink(entry.name);
        try {
          await streamEntry(src, entry, chunkSize, (c) => sink.write(c));
        } finally {
          await sink.close();
        }
      }
    },
  };
}
