/** @jest-environment node */
import type { Category, Recipe } from '@recipes/core';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

import { formatDate } from '../src/backup/format-date';
import { BackupFormatError, buildBackupJson, parseBackupJson, type BackupFile } from '../src/backup/format';
import { applyRestore, type RestoreFileOps } from '../src/backup/restore';
import { openBackupZip, writeBackupZip, type ByteSink, type ByteSource } from '../src/backup/zip';
import { createCategoriesRepo } from '../src/db/categories-repo';
import { migrate } from '../src/db/migrations';
import { createRecipesRepo } from '../src/db/recipes-repo';
import { createSettingsRepo } from '../src/db/settings-repo';
import { createNodeDb } from './sqlite-node';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('crypto').randomUUID() }));

const NOW = new Date('2026-11-24T10:00:00.000Z');
const FORMAT_MSG = 'Súbor nie je záloha receptov.';

const categories: Category[] = [
  { id: 'c1', name: 'Polievky', sortOrder: 0 },
  { id: 'c2', name: 'Hlavné jedlá', sortOrder: 1 },
];

function recipe(id: string, over: Partial<Recipe> = {}): Recipe {
  return {
    id,
    title: `Recept ${id}`,
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 30,
    totalMinutes: 40,
    ingredientGroups: [
      { name: null, items: [{ amount: 500, amountMax: null, unit: 'g', name: 'mäso', note: null }] },
    ],
    steps: ['Krok 1', 'Krok 2'],
    categoryIds: ['c1'],
    notes: null,
    photo: 'images/a.jpg',
    sourceImages: ['images/b.jpg'],
    sourceUrl: null,
    sourceText: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...over,
  };
}

const A_BYTES = new Uint8Array([1, 2, 3, 4]);

/** ~300 KB of pseudo-random bytes that also contain every zip signature, like a JPEG may by chance. */
function bigImage(): Uint8Array {
  const out = new Uint8Array(300_000);
  let x = 12345;
  for (let i = 0; i < out.length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  const sigs = [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x07, 0x08],
    [0x50, 0x4b, 0x01, 0x02],
    [0x50, 0x4b, 0x05, 0x06],
  ];
  sigs.forEach((s, k) => out.set(s, 1000 + k * 50_000));
  return out;
}

function memorySink() {
  const chunks: Uint8Array[] = [];
  const sink: ByteSink & { bytes(): Uint8Array; closed: boolean } = {
    closed: false,
    async write(c) {
      chunks.push(c.slice());
    },
    async close() {
      sink.closed = true;
    },
    bytes() {
      const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.length;
      }
      return out;
    },
  };
  return sink;
}

/** Random-access source over a buffer that never returns more than `maxRead` bytes per call. */
function memorySource(buf: Uint8Array, maxRead = Infinity) {
  const reads: number[] = [];
  const src: ByteSource & { reads: number[] } = {
    size: buf.length,
    reads,
    async read(offset, length) {
      const n = Math.min(length, maxRead);
      reads.push(n);
      return buf.slice(offset, offset + n);
    },
  };
  return src;
}

async function writeToMemory(file: BackupFile, readImage: (p: string) => Promise<Uint8Array | null>) {
  const sink = memorySink();
  await writeBackupZip(file, readImage, sink);
  return sink.bytes();
}

async function extractAll(src: ByteSource, chunkSize?: number) {
  const opened = await openBackupZip(src, chunkSize);
  const sinks = new Map<string, ReturnType<typeof memorySink>>();
  await opened.extractImages(async (name) => {
    const s = memorySink();
    sinks.set(name, s);
    return s;
  });
  return { file: opened.file, sinks };
}

describe('streaming backup zip', () => {
  it('round-trips recipes, categories and image bytes', async () => {
    const recipes = [recipe('r1'), recipe('r2', { photo: 'images/big.jpg', sourceImages: [], categoryIds: [] })];
    const file = buildBackupJson(categories, recipes, NOW);
    expect(file.format).toBe('recepty-backup');
    expect(file.version).toBe(1);
    expect(file.exportedAt).toBe(NOW.toISOString());

    const big = bigImage();
    const readImage = jest.fn(async (p: string) =>
      p === 'images/a.jpg' ? A_BYTES : p === 'images/big.jpg' ? big : null,
    );
    const zip = await writeToMemory(file, readImage);
    // small reads + small chunks force many chunk boundaries inside entries
    const { file: back, sinks } = await extractAll(memorySource(zip, 7_000), 10_000);

    expect(back.recipes).toEqual(recipes);
    expect(back.categories).toEqual(categories);
    expect(Array.from(sinks.get('images/a.jpg')!.bytes())).toEqual([1, 2, 3, 4]);
    expect(Buffer.from(sinks.get('images/big.jpg')!.bytes()).equals(Buffer.from(big))).toBe(true);
    expect([...sinks.values()].every((s) => s.closed)).toBe(true);
    // images/b.jpg was missing → skipped, export did not fail
    expect(sinks.has('images/b.jpg')).toBe(false);
    expect(readImage).toHaveBeenCalledWith('images/b.jpg');
  });

  it('writes each image to the sink before reading the next one', async () => {
    const file = buildBackupJson(categories, [recipe('r1', { sourceImages: ['images/c.jpg'] })], NOW);
    const big = bigImage();
    const sink = memorySink();
    const writtenWhenRead: number[] = [];
    await writeBackupZip(
      file,
      async () => {
        writtenWhenRead.push(sink.bytes().length);
        return big;
      },
      sink,
    );
    // when the 2nd image is read, the 1st one is already fully in the sink
    expect(writtenWhenRead[1] - writtenWhenRead[0]).toBeGreaterThanOrEqual(big.length);
  });

  it('reads the source in bounded chunks', async () => {
    const file = buildBackupJson(categories, [recipe('r1', { sourceImages: [] })], NOW);
    const big = bigImage();
    const zip = await writeToMemory(file, async () => big);
    const src = memorySource(zip);
    await extractAll(src, 64 * 1024);
    expect(Math.max(...src.reads)).toBeLessThanOrEqual(64 * 1024 + 22);
  });

  it('stores only relative paths in backup.json', async () => {
    const zip = await writeToMemory(buildBackupJson(categories, [recipe('r1')], NOW), async () => A_BYTES);
    const json = new TextDecoder().decode(unzipSync(zip)['backup.json']);
    const paths: string[] = [];
    JSON.parse(json).recipes.forEach((r: Recipe) => {
      if (r.photo) paths.push(r.photo);
      paths.push(...r.sourceImages);
    });
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p.startsWith('/')).toBe(false);
      expect(p.startsWith('file:')).toBe(false);
    }
  });

  it('a throwing image reader does not fail the export', async () => {
    const zip = await writeToMemory(buildBackupJson(categories, [recipe('r1')], NOW), async () => {
      throw new Error('io');
    });
    const { sinks } = await extractAll(memorySource(zip));
    expect(sinks.size).toBe(0);
  });

  it('reads archives written by the earlier zipSync exporter', async () => {
    const file = buildBackupJson(categories, [recipe('r1')], NOW);
    const big = bigImage();
    const zip = zipSync({
      'backup.json': strToU8(JSON.stringify(file)),
      'images/a.jpg': [A_BYTES, { level: 0 }],
      'images/b.jpg': big, // deflated entry exercises UnzipInflate
    });
    const { file: back, sinks } = await extractAll(memorySource(zip, 5_000), 8_000);
    expect(back).toEqual(file);
    expect(Array.from(sinks.get('images/a.jpg')!.bytes())).toEqual([1, 2, 3, 4]);
    expect(Buffer.from(sinks.get('images/b.jpg')!.bytes()).equals(Buffer.from(big))).toBe(true);
  });

  it('missing backup.json throws BackupFormatError', async () => {
    const zip = zipSync({ 'other.txt': strToU8('x') });
    await expect(openBackupZip(memorySource(zip))).rejects.toThrow(BackupFormatError);
  });

  it('non-zip bytes throw BackupFormatError', async () => {
    await expect(openBackupZip(memorySource(strToU8('definitely not a zip')))).rejects.toThrow(FORMAT_MSG);
    await expect(openBackupZip(memorySource(new Uint8Array(0)))).rejects.toThrow(FORMAT_MSG);
  });

  it('an invalid backup.json throws BackupFormatError before any image is touched', async () => {
    const zip = zipSync({ 'backup.json': strToU8('{}'), 'images/a.jpg': A_BYTES });
    await expect(openBackupZip(memorySource(zip))).rejects.toThrow(FORMAT_MSG);
  });

  it('rejects zip-slip entry names', async () => {
    const json = strToU8(JSON.stringify(buildBackupJson(categories, [], NOW)));
    const evil: Zippable[] = [
      { 'backup.json': json, 'images/../../evil.jpg': A_BYTES },
      { 'backup.json': json, '/abs.jpg': A_BYTES },
      { 'backup.json': json, '\\win.jpg': A_BYTES },
    ];
    for (const entries of evil) {
      await expect(openBackupZip(memorySource(zipSync(entries)))).rejects.toThrow(BackupFormatError);
    }
  });

  it('only extracts flat images/ entries', async () => {
    const json = strToU8(JSON.stringify(buildBackupJson(categories, [], NOW)));
    const zip = zipSync({
      'backup.json': json,
      'images/ok.jpg': A_BYTES,
      'images/nested/x.jpg': A_BYTES,
      'other/y.jpg': A_BYTES,
    });
    const { sinks } = await extractAll(memorySource(zip));
    expect([...sinks.keys()]).toEqual(['images/ok.jpg']);
  });

  it('a truncated archive throws BackupFormatError', async () => {
    const zip = await writeToMemory(buildBackupJson(categories, [recipe('r1')], NOW), async () => bigImage());
    await expect(extractAll(memorySource(zip.slice(0, zip.length - 30)))).rejects.toThrow(BackupFormatError);
  });
});

describe('parseBackupJson', () => {
  it('rejects non-backups with BackupFormatError', () => {
    expect(() => parseBackupJson('{}')).toThrow(BackupFormatError);
    expect(() => parseBackupJson('{}')).toThrow(FORMAT_MSG);
    expect(() => parseBackupJson('not json')).toThrow(FORMAT_MSG);
    const good = buildBackupJson(categories, [recipe('r1')], NOW);
    expect(() => parseBackupJson(JSON.stringify({ ...good, format: 'x' }))).toThrow(FORMAT_MSG);
    expect(() => parseBackupJson(JSON.stringify({ ...good, version: 2 }))).toThrow(FORMAT_MSG);
    expect(parseBackupJson(JSON.stringify(good))).toEqual(good);
  });

  it('rejects garbage recipes', () => {
    const good = buildBackupJson(categories, [recipe('r1')], NOW);
    const bad = (r: unknown) =>
      JSON.stringify({ ...good, recipes: [{ ...good.recipes[0], ...(r as object) }] });
    expect(() => parseBackupJson(bad({ title: 5 }))).toThrow(FORMAT_MSG);
    expect(() => parseBackupJson(bad({ photo: '../../etc/passwd' }))).toThrow(FORMAT_MSG);
    expect(() => parseBackupJson(bad({ photo: '/abs/x.jpg' }))).toThrow(FORMAT_MSG);
    expect(() => parseBackupJson(bad({ sourceImages: ['file:///x.jpg'] }))).toThrow(FORMAT_MSG);
    expect(() => parseBackupJson(bad({ categoryIds: ['missing'] }))).toThrow(FORMAT_MSG);
    expect(() => parseBackupJson(bad({ ingredientGroups: [{ name: null, items: [{}] }] }))).toThrow(
      FORMAT_MSG,
    );
    expect(() => parseBackupJson(bad({ photo: 'images/a.png' }))).toThrow(FORMAT_MSG);
    expect(() => parseBackupJson(bad({ photo: 'images/a b.jpg' }))).toThrow(FORMAT_MSG);
  });

  it('accepts the uuid paths saveImage produces', () => {
    const r = recipe('r1', {
      photo: 'images/123e4567-e89b-12d3-a456-426614174000.jpg',
      sourceImages: ['images/ABCDEF01-2345-6789-abcd-ef0123456789.jpg'],
    });
    const file = buildBackupJson(categories, [r], NOW);
    expect(parseBackupJson(JSON.stringify(file))).toEqual(file);
  });
});

describe('buildBackupJson', () => {
  it('refuses to build a backup the restore would reject', () => {
    expect(() => buildBackupJson(categories, [recipe('r1', { categoryIds: ['missing'] })], NOW)).toThrow(
      'invalid_backup',
    );
    expect(() => buildBackupJson(categories, [recipe('r1', { servings: -1 })], NOW)).toThrow('invalid_backup');
    expect(() => buildBackupJson(categories, [recipe('r1', { photo: 'file:///x.jpg' })], NOW)).toThrow(
      'invalid_backup',
    );
  });
});

describe('formatDate', () => {
  it('formats as d. M. yyyy without leading zeros', () => {
    expect(formatDate(new Date(2026, 10, 24, 12))).toBe('24. 11. 2026');
    expect(formatDate(new Date(2026, 0, 5, 12))).toBe('5. 1. 2026');
  });
  it('accepts ISO strings', () => {
    const d = new Date(2026, 2, 7, 12);
    expect(formatDate(d.toISOString())).toBe('7. 3. 2026');
  });
});

describe('applyRestore', () => {
  async function setup() {
    const db = createNodeDb();
    await migrate(db);
    const settings = createSettingsRepo(db);
    const recipes = createRecipesRepo(db, settings);
    const cats = createCategoriesRepo(db);
    // current data: one category + one recipe
    await cats.replaceAll([{ id: 'old-c', name: 'Staré', sortOrder: 0 }]);
    await recipes.replaceAll([recipe('old-r', { categoryIds: ['old-c'] })]);
    await settings.set('lastRecipeChangeAt', '2026-05-05T00:00:00.000Z');
    const calls: string[] = [];
    const files: RestoreFileOps = {
      stageImages: jest.fn(async () => {
        calls.push('stage');
      }),
      deleteCurrentImages: jest.fn(async () => {
        calls.push('deleteCurrent');
      }),
      installStagedImages: jest.fn(async () => {
        calls.push('install');
      }),
      removeStaged: jest.fn(async () => {
        calls.push('removeStaged');
      }),
    };
    return { db, settings, recipes, categories: cats, files, calls };
  }

  const backup = () =>
    buildBackupJson(categories, [recipe('r1'), recipe('r2', { categoryIds: ['c1', 'c2'] })], NOW);
  const RESTORED_AT = new Date('2026-11-25T08:00:00.000Z');

  it('replaces DB contents with the backup and swaps images after commit', async () => {
    const s = await setup();
    const file = backup();
    await applyRestore(file, { ...s, now: () => RESTORED_AT });

    expect(await s.categories.list()).toEqual(categories);
    expect(await s.recipes.all()).toEqual(file.recipes);
    expect(s.calls).toEqual(['stage', 'deleteCurrent', 'install', 'removeStaged']);
    expect(await s.settings.get('lastBackupAt')).toBe(RESTORED_AT.toISOString());
    expect(await s.settings.get('lastRecipeChangeAt')).toBe('2026-05-05T00:00:00.000Z');
  });

  it('keeps old data and current images when the DB swap fails', async () => {
    const s = await setup();
    const before = await s.recipes.all();
    const beforeCats = await s.categories.list();
    s.recipes.replaceAll = jest.fn(async () => {
      throw new Error('boom');
    });

    await expect(applyRestore(backup(), { ...s, now: () => RESTORED_AT })).rejects.toThrow('boom');

    expect(await s.recipes.all()).toEqual(before);
    expect(await s.categories.list()).toEqual(beforeCats);
    expect(s.files.deleteCurrentImages).not.toHaveBeenCalled();
    expect(s.files.installStagedImages).not.toHaveBeenCalled();
    expect(s.files.removeStaged).toHaveBeenCalled();
    expect(await s.settings.get('lastBackupAt')).toBeNull();
  });

  it('cleans up and keeps data when streaming images into staging fails', async () => {
    const s = await setup();
    const before = await s.recipes.all();
    (s.files.stageImages as jest.Mock).mockImplementationOnce(async () => {
      throw new BackupFormatError();
    });
    await expect(applyRestore(backup(), { ...s, now: () => RESTORED_AT })).rejects.toThrow(FORMAT_MSG);
    expect(await s.recipes.all()).toEqual(before);
    expect(s.files.deleteCurrentImages).not.toHaveBeenCalled();
    expect(s.files.removeStaged).toHaveBeenCalled();
  });
});
