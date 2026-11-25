import { DEFAULT_CATEGORIES } from '@recipes/core';
import { randomUUID } from '../util/uuid';

import type { SqlDb } from './sql';

const SCHEMA_VERSION = 1;

export async function migrate(db: SqlDb, now: () => Date = () => new Date()): Promise<void> {
  await db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const row = await db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
    'schemaVersion',
  ]);
  const current = row ? Number(row.value) : 0;
  if (current >= SCHEMA_VERSION) return;

  await db.transaction(async () => {
    await db.run(`CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      title_norm TEXT NOT NULL,
      servings INTEGER,
      prep_minutes INTEGER,
      cook_minutes INTEGER,
      total_minutes INTEGER,
      ingredient_groups TEXT NOT NULL,
      steps TEXT NOT NULL,
      notes TEXT,
      photo TEXT,
      source_images TEXT NOT NULL,
      source_url TEXT,
      source_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await db.run(`CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    )`);
    await db.run(`CREATE TABLE IF NOT EXISTS recipe_categories (
      recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (recipe_id, category_id)
    )`);
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      await db.run('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)', [
        randomUUID(),
        DEFAULT_CATEGORIES[i],
        i,
      ]);
    }
    await db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [
      'installedAt',
      now().toISOString(),
    ]);
    await db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['schemaVersion', String(SCHEMA_VERSION)],
    );
  });
}
