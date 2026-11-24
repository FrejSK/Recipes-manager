const DAY_MS = 86_400_000;
const REMIND_AFTER_DAYS = 30;

export function shouldRemindBackup(s: {
  now: Date;
  installedAt: Date;
  lastBackupAt: Date | null;
  lastDismissedAt: Date | null;
  lastChangeAt: Date | null;
  recipeCount: number;
}): boolean {
  if (s.recipeCount < 1 || s.lastChangeAt === null) return false;
  if (s.lastBackupAt !== null && s.lastChangeAt.getTime() <= s.lastBackupAt.getTime()) return false;
  const since = Math.max(
    s.installedAt.getTime(),
    s.lastBackupAt?.getTime() ?? -Infinity,
    s.lastDismissedAt?.getTime() ?? -Infinity,
  );
  return s.now.getTime() - since >= REMIND_AFTER_DAYS * DAY_MS;
}
