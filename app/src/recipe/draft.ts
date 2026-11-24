import {
  mapCategoryNames,
  type Category,
  type ExtractResponse,
  type Recipe,
  type RecipeInput,
} from '@recipes/core';

export type ImageRef =
  | { kind: 'stored'; path: string }
  | { kind: 'local'; uri: string }
  | { kind: 'remote'; url: string };

export type RecipeDraft = Omit<RecipeInput, 'photo' | 'sourceImages'> & {
  photo: ImageRef | null;
  sourceImages: ImageRef[];
};

export type DraftSource =
  | { kind: 'images'; uris: string[] }
  | { kind: 'text'; text: string }
  | { kind: 'url'; url: string };

export function emptyDraft(): RecipeDraft {
  return {
    title: '',
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    ingredientGroups: [{ name: null, items: [] }],
    steps: [],
    categoryIds: [],
    notes: null,
    photo: null,
    sourceImages: [],
    sourceUrl: null,
    sourceText: null,
  };
}

export function extractedToDraft(res: ExtractResponse, categories: Category[], source: DraftSource): RecipeDraft {
  const r = res.recipe;
  return {
    title: r.title,
    servings: r.servings,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    totalMinutes: r.totalMinutes,
    ingredientGroups: r.ingredientGroups.length > 0 ? r.ingredientGroups : [{ name: null, items: [] }],
    steps: r.steps,
    categoryIds: mapCategoryNames(r.categoryNames, categories),
    notes: null,
    photo: res.photoUrl ? { kind: 'remote', url: res.photoUrl } : null,
    sourceImages: source.kind === 'images' ? source.uris.map((uri) => ({ kind: 'local', uri })) : [],
    sourceUrl: source.kind === 'url' ? source.url : null,
    sourceText: source.kind === 'text' ? source.text : null,
  };
}

export function recipeToDraft(r: Recipe): RecipeDraft {
  const { id: _id, createdAt: _c, updatedAt: _u, photo, sourceImages, ...rest } = r;
  return {
    ...rest,
    photo: photo ? { kind: 'stored', path: photo } : null,
    sourceImages: sourceImages.map((path) => ({ kind: 'stored', path })),
  };
}

export function validateDraft(d: RecipeDraft): string | null {
  return d.title.trim() === '' ? 'Recept musí mať názov.' : null;
}

/** How to display an ImageRef; `storedUri` maps a relative stored path to a file URI. */
export function imageRefUri(ref: ImageRef, storedUri: (path: string) => string): string {
  if (ref.kind === 'stored') return storedUri(ref.path);
  if (ref.kind === 'local') return ref.uri;
  return ref.url;
}
