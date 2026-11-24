import { IngredientGroupSchema, type Category, type Recipe } from '@recipes/core';
import { z } from 'zod';

export const BACKUP_FORMAT = 'recepty-backup';
export const BACKUP_VERSION = 1;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  categories: Category[];
  recipes: Recipe[];
};

export class BackupFormatError extends Error {
  constructor() {
    super('Súbor nie je záloha receptov.');
    this.name = 'BackupFormatError';
  }
}

/** Image paths stored in recipes: always `images/<uuid>.jpg` (see saveImage), relative to the document directory. */
export const IMAGE_PATH_RE = /^images\/[A-Za-z0-9-]+\.jpg$/;
const ImagePath = z.string().regex(IMAGE_PATH_RE).refine((p) => !p.includes('..'));

const Id = z.string().min(1);
const Count = z.number().int().nonnegative().nullable();

const CategorySchema = z.object({
  id: Id,
  name: z.string(),
  sortOrder: z.number().int(),
});

const RecipeSchema = z.object({
  id: Id,
  title: z.string(),
  servings: Count,
  prepMinutes: Count,
  cookMinutes: Count,
  totalMinutes: Count,
  ingredientGroups: z.array(IngredientGroupSchema),
  steps: z.array(z.string()),
  categoryIds: z.array(Id),
  notes: z.string().nullable(),
  photo: ImagePath.nullable(),
  sourceImages: z.array(ImagePath),
  sourceUrl: z.string().nullable(),
  sourceText: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupFileSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    exportedAt: z.string(),
    categories: z.array(CategorySchema),
    recipes: z.array(RecipeSchema),
  })
  .superRefine((f, ctx) => {
    const catIds = new Set(f.categories.map((c) => c.id));
    if (catIds.size !== f.categories.length) ctx.addIssue({ code: 'custom', message: 'duplicate category id' });
    const recipeIds = new Set(f.recipes.map((r) => r.id));
    if (recipeIds.size !== f.recipes.length) ctx.addIssue({ code: 'custom', message: 'duplicate recipe id' });
    for (const r of f.recipes) {
      if (r.categoryIds.some((id) => !catIds.has(id))) {
        ctx.addIssue({ code: 'custom', message: `unknown category in recipe ${r.id}` });
      }
    }
  });

/**
 * Builds the backup document and validates it against the same schema the restore uses, so an export
 * never writes a file that restore would later refuse. Throws on invalid data.
 */
export function buildBackupJson(categories: Category[], recipes: Recipe[], now: Date): BackupFile {
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    categories,
    recipes,
  };
  const parsed = BackupFileSchema.safeParse(file);
  if (!parsed.success) throw new Error(`invalid_backup: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
  return file;
}

export function parseBackupJson(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupFormatError();
  }
  const parsed = BackupFileSchema.safeParse(raw);
  if (!parsed.success) throw new BackupFormatError();
  return parsed.data as BackupFile;
}

/** Every image path a backup references (photo + sourceImages), de-duplicated. */
export function referencedImages(file: BackupFile): string[] {
  const set = new Set<string>();
  for (const r of file.recipes) {
    if (r.photo) set.add(r.photo);
    for (const p of r.sourceImages) set.add(p);
  }
  return [...set];
}
