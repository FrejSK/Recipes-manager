import { describe, it, expect } from 'vitest';
import { ExtractRequestSchema, ExtractedRecipeSchema } from '../src';

describe('extract contract', () => {
  it('accepts a url request', () => {
    const r = ExtractRequestSchema.safeParse({ kind: 'url', url: 'https://x.sk/r', categories: ['Polievky'] });
    expect(r.success).toBe(true);
  });
  it('rejects non-http url, empty text and 21 images', () => {
    expect(ExtractRequestSchema.safeParse({ kind: 'url', url: 'file:///etc/passwd', categories: [] }).success).toBe(false);
    expect(ExtractRequestSchema.safeParse({ kind: 'text', text: '', categories: [] }).success).toBe(false);
    const img = { mediaType: 'image/jpeg', data: 'AAAA' };
    expect(ExtractRequestSchema.safeParse({ kind: 'images', images: Array(21).fill(img), categories: [] }).success).toBe(false);
  });
  it('rejects an ingredient with an unknown unit', () => {
    const recipe = { title: 'X', servings: null, prepMinutes: null, cookMinutes: null, totalMinutes: null,
      ingredientGroups: [{ name: null, items: [{ amount: 1, amountMax: null, unit: 'tbsp', name: 'cukor', note: null }] }],
      steps: [], categoryNames: [] };
    expect(ExtractedRecipeSchema.safeParse(recipe).success).toBe(false);
  });
});
