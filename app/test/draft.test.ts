import type { Category, ExtractResponse, Recipe } from '@recipes/core';

import { emptyDraft, extractedToDraft, recipeToDraft, validateDraft } from '../src/recipe/draft';

const categories: Category[] = [
  { id: 'c1', name: 'Polievky', sortOrder: 0 },
  { id: 'c2', name: 'Hlavné jedlá', sortOrder: 1 },
];

function response(photoUrl: string | null = null): ExtractResponse {
  return {
    recipe: {
      title: 'Kapustnica',
      servings: 6,
      prepMinutes: 20,
      cookMinutes: 90,
      totalMinutes: null,
      ingredientGroups: [
        { name: null, items: [{ amount: 500, amountMax: null, unit: 'g', name: 'kapusta', note: null }] },
      ],
      steps: ['Uvar.'],
      categoryNames: ['Polievky', 'Neznáma'],
    },
    photoUrl,
  };
}

describe('extractedToDraft', () => {
  it('maps known category names to ids', () => {
    const d = extractedToDraft(response(), categories, { kind: 'text', text: 'recept' });
    expect(d.categoryIds).toEqual(['c1']);
    expect(d.title).toBe('Kapustnica');
    expect(d.servings).toBe(6);
    expect(d.sourceText).toBe('recept');
    expect(d.sourceUrl).toBeNull();
    expect(d.photo).toBeNull();
  });

  it('uses photoUrl as remote photo', () => {
    const d = extractedToDraft(response('https://x.sk/p.jpg'), categories, { kind: 'text', text: 't' });
    expect(d.photo).toEqual({ kind: 'remote', url: 'https://x.sk/p.jpg' });
  });

  it('keeps image sources as local refs', () => {
    const d = extractedToDraft(response(), categories, {
      kind: 'images',
      uris: ['file:///a.jpg', 'content://b'],
    });
    expect(d.sourceImages).toEqual([
      { kind: 'local', uri: 'file:///a.jpg' },
      { kind: 'local', uri: 'content://b' },
    ]);
    expect(d.sourceText).toBeNull();
  });

  it('stores url source', () => {
    const d = extractedToDraft(response(), categories, { kind: 'url', url: 'https://x.sk/r' });
    expect(d.sourceUrl).toBe('https://x.sk/r');
    expect(d.sourceImages).toEqual([]);
  });
});

describe('emptyDraft / recipeToDraft / validateDraft', () => {
  it('empty draft has one unnamed group and no steps', () => {
    const d = emptyDraft();
    expect(d.ingredientGroups).toEqual([{ name: null, items: [] }]);
    expect(d.steps).toEqual([]);
    expect(d.photo).toBeNull();
  });

  it('converts stored paths to stored refs', () => {
    const r: Recipe = {
      ...emptyDraft(),
      title: 'X',
      id: 'r1',
      createdAt: '',
      updatedAt: '',
      photo: 'images/p.jpg',
      sourceImages: ['images/s.jpg'],
    };
    const d = recipeToDraft(r);
    expect(d.photo).toEqual({ kind: 'stored', path: 'images/p.jpg' });
    expect(d.sourceImages).toEqual([{ kind: 'stored', path: 'images/s.jpg' }]);
    expect(d).not.toHaveProperty('id');
  });

  it('requires a title', () => {
    expect(validateDraft({ ...emptyDraft(), title: '   ' })).toBe('Recept musí mať názov.');
    expect(validateDraft({ ...emptyDraft(), title: 'Guláš' })).toBeNull();
  });
});
