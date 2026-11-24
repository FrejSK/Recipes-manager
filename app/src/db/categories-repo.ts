import type { Category } from '@recipes/core';
import { randomUUID } from 'expo-crypto';

import type { SqlDb } from './sql';

type Row = { id: string; name: string; sort_order: number };

export function createCategoriesRepo(db: SqlDb) {
  return {
    async list(): Promise<Category[]> {
      const rows = await db.all<Row>('SELECT id, name, sort_order FROM categories ORDER BY sort_order');
      return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
    },
    async create(name: string): Promise<Category> {
      const max = await db.get<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM categories');
      const category = { id: randomUUID(), name, sortOrder: (max?.m ?? -1) + 1 };
      await db.run('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)', [
        category.id,
        category.name,
        category.sortOrder,
      ]);
      return category;
    },
    async rename(id: string, name: string): Promise<void> {
      await db.run('UPDATE categories SET name = ? WHERE id = ?', [name, id]);
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM categories WHERE id = ?', [id]);
    },
    /** Does not open its own transaction; callers (backup restore) wrap it. */
    async replaceAll(categories: Category[]): Promise<void> {
      await db.run('DELETE FROM categories');
      for (const c of categories) {
        await db.run('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)', [
          c.id,
          c.name,
          c.sortOrder,
        ]);
      }
    },
  };
}

export type CategoriesRepo = ReturnType<typeof createCategoriesRepo>;
