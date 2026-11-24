import type { CategoriesRepo } from '../db/categories-repo';
import type { RecipesRepo } from '../db/recipes-repo';
import type { SettingsRepo } from '../db/settings-repo';
import type { SqlDb } from '../db/sql';
import type { BackupFile } from './format';

/** File-system side of a restore; injectable so the orchestration is testable without a device. */
export type RestoreFileOps = {
  /** Writes the backup's images into a temporary staging area. */
  stageImages(images: Map<string, Uint8Array>): Promise<void>;
  /** Removes the app's current images directory. */
  deleteCurrentImages(): Promise<void>;
  /** Moves staged images into the app's images directory. */
  installStagedImages(): Promise<void>;
  /** Removes the staging area (idempotent). */
  removeStaged(): Promise<void>;
};

export type RestoreDeps = {
  db: SqlDb;
  recipes: Pick<RecipesRepo, 'replaceAll'>;
  categories: Pick<CategoriesRepo, 'replaceAll'>;
  settings: Pick<SettingsRepo, 'set'>;
  files: RestoreFileOps;
  now?: () => Date;
};

/**
 * Data-safety ordering: stage images → swap DB in one transaction → only after commit replace images.
 * If staging or the DB swap fails, current recipes and images stay untouched.
 */
export async function applyRestore(
  file: BackupFile,
  images: Map<string, Uint8Array>,
  deps: RestoreDeps,
): Promise<void> {
  const { db, recipes, categories, settings, files } = deps;
  const now = deps.now ?? (() => new Date());
  try {
    await files.stageImages(images);
    await db.transaction(async () => {
      await categories.replaceAll(file.categories);
      await recipes.replaceAll(file.recipes);
    });
  } catch (e) {
    await files.removeStaged().catch(() => undefined);
    throw e;
  }
  await files.deleteCurrentImages();
  await files.installStagedImages();
  await files.removeStaged();
  // Restored data is backed up by definition; don't nag right after. lastRecipeChangeAt is left as is.
  await settings.set('lastBackupAt', now().toISOString());
}
