import { normalizeText, type Recipe, type RecipeInput } from '@recipes/core';
import { randomUUID } from '../util/uuid';

import type { SettingsRepo } from './settings-repo';
import type { SqlDb } from './sql';

export type RecipeListItem = {
  id: string;
  title: string;
  photo: string | null;
  categoryIds: string[];
};

type Row = {
  id: string;
  title: string;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  ingredient_groups: string;
  steps: string;
  notes: string | null;
  photo: string | null;
  source_images: string;
  source_url: string | null;
  source_text: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS = `id, title, servings, prep_minutes, cook_minutes, total_minutes, ingredient_groups,
  steps, notes, photo, source_images, source_url, source_text, created_at, updated_at`;

function toRecipe(row: Row, categoryIds: string[]): Recipe {
  return {
    id: row.id,
    title: row.title,
    servings: row.servings,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    totalMinutes: row.total_minutes,
    ingredientGroups: JSON.parse(row.ingredient_groups),
    steps: JSON.parse(row.steps),
    categoryIds,
    notes: row.notes,
    photo: row.photo,
    sourceImages: JSON.parse(row.source_images),
    sourceUrl: row.source_url,
    sourceText: row.source_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createRecipesRepo(
  db: SqlDb,
  settings: SettingsRepo,
  now: () => Date = () => new Date(),
) {
  async function categoryIdsFor(recipeId: string): Promise<string[]> {
    const rows = await db.all<{ category_id: string }>(
      'SELECT rc.category_id FROM recipe_categories rc JOIN categories c ON c.id = rc.category_id WHERE rc.recipe_id = ? ORDER BY c.sort_order',
      [recipeId],
    );
    return rows.map((r) => r.category_id);
  }

  async function insert(recipe: Recipe): Promise<void> {
    await db.run(
      `INSERT INTO recipes (id, title, title_norm, servings, prep_minutes, cook_minutes, total_minutes,
        ingredient_groups, steps, notes, photo, source_images, source_url, source_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipe.id,
        recipe.title,
        normalizeText(recipe.title),
        recipe.servings,
        recipe.prepMinutes,
        recipe.cookMinutes,
        recipe.totalMinutes,
        JSON.stringify(recipe.ingredientGroups),
        JSON.stringify(recipe.steps),
        recipe.notes,
        recipe.photo,
        JSON.stringify(recipe.sourceImages),
        recipe.sourceUrl,
        recipe.sourceText,
        recipe.createdAt,
        recipe.updatedAt,
      ],
    );
    for (const categoryId of recipe.categoryIds) {
      await db.run('INSERT OR IGNORE INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)', [
        recipe.id,
        categoryId,
      ]);
    }
  }

  async function get(id: string): Promise<Recipe | null> {
    const row = await db.get<Row>(`SELECT ${COLUMNS} FROM recipes WHERE id = ?`, [id]);
    if (!row) return null;
    return toRecipe(row, await categoryIdsFor(id));
  }

  async function touch(): Promise<void> {
    await settings.set('lastRecipeChangeAt', now().toISOString());
  }

  return {
    async list(): Promise<RecipeListItem[]> {
      const rows = await db.all<{ id: string; title: string; photo: string | null }>(
        'SELECT id, title, photo FROM recipes ORDER BY title_norm',
      );
      const links = await db.all<{ recipe_id: string; category_id: string }>(
        'SELECT recipe_id, category_id FROM recipe_categories',
      );
      const byRecipe = new Map<string, string[]>();
      for (const l of links) {
        const arr = byRecipe.get(l.recipe_id);
        if (arr) arr.push(l.category_id);
        else byRecipe.set(l.recipe_id, [l.category_id]);
      }
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        photo: r.photo,
        categoryIds: byRecipe.get(r.id) ?? [],
      }));
    },

    get,

    async create(input: RecipeInput): Promise<Recipe> {
      const ts = now().toISOString();
      const recipe: Recipe = { ...input, id: randomUUID(), createdAt: ts, updatedAt: ts };
      await db.transaction(async () => {
        await insert(recipe);
        await touch();
      });
      return recipe;
    },

    async update(id: string, input: RecipeInput): Promise<Recipe> {
      const existing = await get(id);
      if (!existing) throw new Error(`Recipe not found: ${id}`);
      const recipe: Recipe = {
        ...input,
        id,
        createdAt: existing.createdAt,
        updatedAt: now().toISOString(),
      };
      await db.transaction(async () => {
        await db.run('DELETE FROM recipes WHERE id = ?', [id]);
        await insert(recipe);
        await touch();
      });
      return recipe;
    },

    async remove(id: string): Promise<Recipe | null> {
      const existing = await get(id);
      if (!existing) return null;
      await db.transaction(async () => {
        await db.run('DELETE FROM recipes WHERE id = ?', [id]);
        await touch();
      });
      return existing;
    },

    async all(): Promise<Recipe[]> {
      const rows = await db.all<Row>(`SELECT ${COLUMNS} FROM recipes ORDER BY title_norm`);
      const out: Recipe[] = [];
      for (const row of rows) out.push(toRecipe(row, await categoryIdsFor(row.id)));
      return out;
    },

    /** Does not open its own transaction; callers (backup restore) wrap it. */
    async replaceAll(recipes: Recipe[]): Promise<void> {
      await db.run('DELETE FROM recipes');
      for (const r of recipes) await insert(r);
    },

    async count(): Promise<number> {
      const row = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM recipes');
      return row?.n ?? 0;
    },
  };
}

export type RecipesRepo = ReturnType<typeof createRecipesRepo>;
