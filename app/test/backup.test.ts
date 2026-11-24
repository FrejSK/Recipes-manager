/** @jest-environment node */
import type { Category, Recipe } from '@recipes/core';
import { strToU8, unzipSync, zipSync } from 'fflate';

import { formatDate } from '../src/backup/format-date';
import { BackupFormatError, buildBackupJson, parseBackupJson } from '../src/backup/format';
import { applyRestore, type RestoreFileOps } from '../src/backup/restore';
import { createBackupZip, readBackupZip } from '../src/backup/zip';
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

describe('backup format + zip', () => {
  it('round-trips recipes, categories and image bytes', async () => {
    const recipes = [recipe('r1'), recipe('r2', { photo: null, sourceImages: [], categoryIds: [] })];
    const file = buildBackupJson(categories, recipes, NOW);
    expect(file.format).toBe('recepty-backup');
    expect(file.version).toBe(1);
    expect(file.exportedAt).toBe(NOW.toISOString());

    const readImage = jest.fn(async (p: string) => (p === 'images/a.jpg' ? A_BYTES : null));
    const zip = await createBackupZip(file, readImage);
    const out = readBackupZip(zip);

    expect(out.file.recipes).toEqual(recipes);
    expect(out.file.categories).toEqual(categories);
    expect(Array.from(out.images.get('images/a.jpg') ?? [])).toEqual([1, 2, 3, 4]);
    // images/b.jpg was missing → skipped, export did not fail
    expect(out.images.has('images/b.jpg')).toBe(false);
    expect(readImage).toHaveBeenCalledWith('images/a.jpg');
    expect(readImage).toHaveBeenCalledWith('images/b.jpg');
  });

  it('stores only relative paths in backup.json', async () => {
    const file = buildBackupJson(categories, [recipe('r1')], NOW);
    const zip = await createBackupZip(file, async () => A_BYTES);
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
    const file = buildBackupJson(categories, [recipe('r1')], NOW);
    const zip = await createBackupZip(file, async () => {
      throw new Error('io');
    });
    expect(readBackupZip(zip).images.size).toBe(0);
  });

  it('parseBackupJson rejects non-backups with BackupFormatError', () => {
    expect(() => parseBackupJson('{}')).toThrow(BackupFormatError);
    expect(() => parseBackupJson('{}')).toThrow(FORMAT_MSG);
    expect(() => parseBackupJson('not json')).toThrow(FORMAT_MSG);
    const good = buildBackupJson(categories, [recipe('r1')], NOW);
    expect(() => parseBackupJson(JSON.stringify({ ...good, format: 'x' }))).toThrow(FORMAT_MSG);
    expect(() => parseBackupJson(JSON.stringify({ ...good, version: 2 }))).toThrow(FORMAT_MSG);
    expect(parseBackupJson(JSON.stringify(good))).toEqual(good);
  });

  it('parseBackupJson rejects garbage recipes', () => {
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
  });

  it('readBackupZip without backup.json throws BackupFormatError', () => {
    const zip = zipSync({ 'other.txt': strToU8('x') });
    expect(() => readBackupZip(zip)).toThrow(BackupFormatError);
  });

  it('readBackupZip on non-zip bytes throws BackupFormatError', () => {
    expect(() => readBackupZip(strToU8('definitely not a zip'))).toThrow(BackupFormatError);
  });

  it('readBackupZip rejects zip-slip entry names', () => {
    const json = strToU8(JSON.stringify(buildBackupJson(categories, [], NOW)));
    expect(() => readBackupZip(zipSync({ 'backup.json': json, 'images/../../evil.jpg': A_BYTES }))).toThrow(
      BackupFormatError,
    );
    expect(() => readBackupZip(zipSync({ 'backup.json': json, '/abs.jpg': A_BYTES }))).toThrow(
      BackupFormatError,
    );
  });

  it('readBackupZip only keeps flat images/ entries', () => {
    const json = strToU8(JSON.stringify(buildBackupJson(categories, [], NOW)));
    const out = readBackupZip(
      zipSync({
        'backup.json': json,
        'images/ok.jpg': A_BYTES,
        'images/nested/x.jpg': A_BYTES,
        'other/y.jpg': A_BYTES,
      }),
    );
    expect([...out.images.keys()]).toEqual(['images/ok.jpg']);
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
  const images = new Map([['images/a.jpg', A_BYTES]]);
  const RESTORED_AT = new Date('2026-11-25T08:00:00.000Z');

  it('replaces DB contents with the backup and swaps images after commit', async () => {
    const s = await setup();
    const file = backup();
    await applyRestore(file, images, { ...s, now: () => RESTORED_AT });

    expect(await s.categories.list()).toEqual(categories);
    expect(await s.recipes.all()).toEqual(file.recipes);
    expect(s.files.stageImages).toHaveBeenCalledWith(images);
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

    await expect(applyRestore(backup(), images, { ...s, now: () => RESTORED_AT })).rejects.toThrow('boom');

    expect(await s.recipes.all()).toEqual(before);
    expect(await s.categories.list()).toEqual(beforeCats);
    expect(s.files.deleteCurrentImages).not.toHaveBeenCalled();
    expect(s.files.installStagedImages).not.toHaveBeenCalled();
    expect(s.files.removeStaged).toHaveBeenCalled();
    expect(await s.settings.get('lastBackupAt')).toBeNull();
  });

  it('cleans up and keeps data when staging images fails', async () => {
    const s = await setup();
    const before = await s.recipes.all();
    (s.files.stageImages as jest.Mock).mockImplementationOnce(async () => {
      throw new Error('disk full');
    });
    await expect(applyRestore(backup(), images, { ...s, now: () => RESTORED_AT })).rejects.toThrow(
      'disk full',
    );
    expect(await s.recipes.all()).toEqual(before);
    expect(s.files.deleteCurrentImages).not.toHaveBeenCalled();
    expect(s.files.removeStaged).toHaveBeenCalled();
  });
});
