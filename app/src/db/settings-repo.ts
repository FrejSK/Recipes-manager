import type { SqlDb } from './sql';

/** Known keys: installedAt, lastBackupAt, lastBackupDismissedAt, lastRecipeChangeAt (ISO strings). */
export function createSettingsRepo(db: SqlDb) {
  return {
    async get(key: string): Promise<string | null> {
      const row = await db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
      return row ? row.value : null;
    },
    async set(key: string, value: string): Promise<void> {
      await db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value],
      );
    },
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
