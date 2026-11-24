import type { Recipe, RecipeInput } from '@recipes/core';

import type { RecipesRepo } from '../db/recipes-repo';
import type { ImageRef, RecipeDraft } from './draft';

export type SaveDeps = {
  recipes: Pick<RecipesRepo, 'create' | 'update' | 'get'>;
  saveImage: (uri: string) => Promise<string>;
  deleteImages: (paths: (string | null)[]) => Promise<void>;
};

/**
 * Persists a draft: copies/downloads non-stored images into app storage, writes the recipe,
 * and (on update) deletes stored images the draft no longer references.
 * A failed remote photo download is tolerated (photo: null); a failed local image is not.
 */
export async function saveDraft(draft: RecipeDraft, existingId: string | null, deps: SaveDeps): Promise<Recipe> {
  const { recipes, saveImage, deleteImages } = deps;
  const fresh: string[] = [];

  async function store(ref: ImageRef): Promise<string | null> {
    if (ref.kind === 'stored') return ref.path;
    if (ref.kind === 'remote') {
      try {
        const path = await saveImage(ref.url);
        fresh.push(path);
        return path;
      } catch {
        return null;
      }
    }
    const path = await saveImage(ref.uri);
    fresh.push(path);
    return path;
  }

  let recipe: Recipe;
  let old: Recipe | null = null;
  try {
    const photo = draft.photo ? await store(draft.photo) : null;
    const sourceImages: string[] = [];
    for (const ref of draft.sourceImages) {
      const path = await store(ref);
      if (path) sourceImages.push(path);
    }
    const input: RecipeInput = { ...draft, photo, sourceImages };
    if (existingId) {
      old = await recipes.get(existingId);
      recipe = await recipes.update(existingId, input);
    } else {
      recipe = await recipes.create(input);
    }
  } catch (e) {
    if (fresh.length > 0) await deleteImages(fresh).catch(() => {});
    throw e;
  }

  if (old) {
    const keep = new Set([recipe.photo, ...recipe.sourceImages]);
    const orphaned = [old.photo, ...old.sourceImages].filter((p): p is string => !!p && !keep.has(p));
    // Orphaned files are harmless; never fail an already-committed save over cleanup.
    if (orphaned.length > 0) await deleteImages(orphaned).catch(() => {});
  }
  return recipe;
}
