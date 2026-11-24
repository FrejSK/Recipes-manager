import { describe, it, expect } from 'vitest';
import { shouldRemindBackup } from '../src/backup-reminder';

const d = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);
const base = { now: d(70), installedAt: d(0), lastBackupAt: null, lastDismissedAt: null, lastChangeAt: d(5), recipeCount: 3 };

describe('shouldRemindBackup', () => {
  it('reminds 30 days after install with unbacked changes', () => {
    expect(shouldRemindBackup({ ...base, now: d(31) })).toBe(true);
  });
  it('does not remind before 30 days', () => {
    expect(shouldRemindBackup({ ...base, now: d(20) })).toBe(false);
  });
  it('does not remind when backup is newer than last change', () => {
    expect(shouldRemindBackup({ ...base, lastBackupAt: d(40), lastChangeAt: d(30) })).toBe(false);
  });
  it('does not remind after a recent dismissal', () => {
    expect(shouldRemindBackup({ ...base, lastBackupAt: d(10), lastDismissedAt: d(60), lastChangeAt: d(30) })).toBe(false);
  });
  it('does not remind with no recipes', () => {
    expect(shouldRemindBackup({ ...base, lastChangeAt: null, recipeCount: 0 })).toBe(false);
  });
});
