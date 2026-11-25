/** @jest-environment node */
import { DEFAULT_CATEGORIES, type RecipeInput } from '@recipes/core';

import { createCategoriesRepo } from '../src/db/categories-repo';
import { migrate } from '../src/db/migrations';
import { createRecipesRepo } from '../src/db/recipes-repo';
import { createSettingsRepo } from '../src/db/settings-repo';
import type { SqlDb } from '../src/db/sql';
import { createNodeDb } from './sqlite-node';


const FIXED = new Date('2026-01-02T03:04:05.000Z');

async function setup() {
  const db: SqlDb = createNodeDb();
  await migrate(db);
  const settings = createSettingsRepo(db);
  const recipes = createRecipesRepo(db, settings, () => FIXED);
  const categories = createCategoriesRepo(db);
  return { db, settings, recipes, categories };
}

function input(categoryIds: string[]): RecipeInput {
  return {
    title: 'Segedínsky guláš',
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 60,
    totalMinutes: 75,
    ingredientGroups: [
      {
        name: null,
        items: [{ amount: 500, amountMax: null, unit: 'G', name: 'mäso', note: 'bravčové' }],
      },
      {
        name: 'Omáčka',
        items: [{ amount: 1, amountMax: 2, unit: null, name: 'cibuľa', note: null }],
      },
    ] as RecipeInput['ingredientGroups'],
    steps: ['Nakrájaj', 'Varíme'],
    categoryIds,
    notes: 'poznámka',
    photo: 'photo.jpg',
    sourceImages: ['a.jpg', 'b.jpg'],
    sourceUrl: 'https://example.com',
    sourceText: 'text',
  };
}

describe('db', () => {
  it('migrate seeds default categories once', async () => {
    const { db, categories, settings } = await setup();
    expect((await categories.list()).map((c) => c.name)).toEqual([...DEFAULT_CATEGORIES]);
    expect(await settings.get('installedAt')).not.toBeNull();
    await migrate(db);
    expect(await categories.list()).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it('create then get round-trips complex fields', async () => {
    const { recipes, categories } = await setup();
    const cats = await categories.list();
    const ids = [cats[0].id, cats[2].id];
    const created = await recipes.create(input(ids));
    const got = await recipes.get(created.id);
    expect(got).not.toBeNull();
    expect(got!.ingredientGroups).toEqual(input(ids).ingredientGroups);
    expect(got!.steps).toEqual(['Nakrájaj', 'Varíme']);
    expect([...got!.categoryIds].sort()).toEqual([...ids].sort());
    expect(got!.sourceImages).toEqual(['a.jpg', 'b.jpg']);
    expect(got!.createdAt).toBe(FIXED.toISOString());
    expect(got!.updatedAt).toBe(FIXED.toISOString());
  });

  it('list is sorted by normalized title with categoryIds', async () => {
    const { recipes, categories } = await setup();
    const cats = await categories.list();
    await recipes.create({ ...input([cats[0].id]), title: 'Šunka' });
    await recipes.create({ ...input([]), title: 'Bryndzové halušky' });
    const list = await recipes.list();
    expect(list.map((r) => r.title)).toEqual(['Bryndzové halušky', 'Šunka']);
    expect(list[1].categoryIds).toEqual([cats[0].id]);
    expect(await recipes.count()).toBe(2);
  });

  it('update changes title and categories', async () => {
    const { recipes, categories } = await setup();
    const cats = await categories.list();
    const created = await recipes.create(input([cats[0].id, cats[1].id]));
    const updated = await recipes.update(created.id, {
      ...input([cats[1].id, cats[3].id]),
      title: 'Nový názov',
    });
    expect(updated.title).toBe('Nový názov');
    const got = await recipes.get(created.id);
    expect(got!.title).toBe('Nový názov');
    expect([...got!.categoryIds].sort()).toEqual([cats[1].id, cats[3].id].sort());
    expect(got!.createdAt).toBe(created.createdAt);
  });

  it('removing a category keeps the recipe without that id', async () => {
    const { recipes, categories } = await setup();
    const cats = await categories.list();
    const created = await recipes.create(input([cats[0].id, cats[1].id]));
    await categories.remove(cats[0].id);
    const got = await recipes.get(created.id);
    expect(got).not.toBeNull();
    expect(got!.categoryIds).toEqual([cats[1].id]);
  });

  it('categories create appends, rename works', async () => {
    const { categories } = await setup();
    const c = await categories.create('Omáčky');
    expect(c.sortOrder).toBe(DEFAULT_CATEGORIES.length);
    await categories.rename(c.id, 'Dresingy');
    const list = await categories.list();
    expect(list[list.length - 1].name).toBe('Dresingy');
  });

  it('remove returns the deleted recipe', async () => {
    const { recipes } = await setup();
    const created = await recipes.create(input([]));
    const removed = await recipes.remove(created.id);
    expect(removed?.id).toBe(created.id);
    expect(removed?.photo).toBe('photo.jpg');
    expect(await recipes.get(created.id)).toBeNull();
    expect(await recipes.remove(created.id)).toBeNull();
  });

  it('create sets lastRecipeChangeAt', async () => {
    const { recipes, settings } = await setup();
    expect(await settings.get('lastRecipeChangeAt')).toBeNull();
    await recipes.create(input([]));
    expect(await settings.get('lastRecipeChangeAt')).toBe(FIXED.toISOString());
  });

  it('replaceAll replaces recipes and categories', async () => {
    const { db, recipes, categories } = await setup();
    await recipes.create(input([]));
    const newCats = [{ id: 'c1', name: 'Jedna', sortOrder: 0 }];
    const now = FIXED.toISOString();
    const r = {
      ...input(['c1']),
      id: 'r1',
      createdAt: now,
      updatedAt: now,
    };
    await db.transaction(async () => {
      await categories.replaceAll(newCats);
      await recipes.replaceAll([r]);
    });
    expect(await categories.list()).toEqual(newCats);
    const list = await recipes.list();
    expect(list.map((x) => x.id)).toEqual(['r1']);
    expect(await recipes.all()).toEqual([r]);
  });
});
