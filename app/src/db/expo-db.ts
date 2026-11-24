import * as SQLite from 'expo-sqlite';

import type { SqlDb } from './sql';

export async function openExpoDb(): Promise<SqlDb> {
  const db = await SQLite.openDatabaseAsync('recepty.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const bind = (params?: unknown[]) => (params ?? []) as SQLite.SQLiteBindValue[];
  return {
    async run(sql, params) {
      await db.runAsync(sql, bind(params));
    },
    all<T>(sql: string, params?: unknown[]) {
      return db.getAllAsync<T>(sql, bind(params));
    },
    get<T>(sql: string, params?: unknown[]) {
      return db.getFirstAsync<T>(sql, bind(params));
    },
    transaction(fn) {
      return db.withTransactionAsync(fn);
    },
  };
}
