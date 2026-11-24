import Database from 'better-sqlite3';

import type { SqlDb } from '../src/db/sql';

export function createNodeDb(): SqlDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  return {
    async run(sql, params = []) {
      raw.prepare(sql).run(...(params as never[]));
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return raw.prepare(sql).all(...(params as never[])) as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return (raw.prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
    },
    async transaction(fn) {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
