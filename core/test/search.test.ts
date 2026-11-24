import { describe, it, expect } from 'vitest';
import { filterRecipes, normalizeText } from '../src/search';

describe('normalizeText', () => {
  it('strips Slovak/Czech diacritics and lowercases', () => {
    expect(normalizeText('ŽLUŤOUČKÝ kůň Ďábelské ÓDY Ĺ Ŕ Ä Ô')).toBe('zlutoucky kun dabelske ody l r a o');
  });
});

describe('filterRecipes', () => {
  it('ignores diacritics and case', () => {
    expect(filterRecipes([{ title: 'Hovädzí guláš', categoryIds: [] }], 'gulas', null)).toHaveLength(1);
  });
  it('requires every query word', () => {
    expect(filterRecipes([{ title: 'Hovädzí guláš', categoryIds: [] }], 'hov GUL', null)).toHaveLength(1);
    expect(filterRecipes([{ title: 'Hovädzí guláš', categoryIds: [] }], 'hov xyz', null)).toHaveLength(0);
  });
  it('filters by category', () => {
    expect(filterRecipes([{ title: 'Hovädzí guláš', categoryIds: ['a'] }], '', 'b')).toHaveLength(0);
    expect(filterRecipes([{ title: 'Hovädzí guláš', categoryIds: ['a'] }], '', 'a')).toHaveLength(1);
  });
  it('sorts by normalized title without mutating input', () => {
    const input = [{ title: 'Šalát', categoryIds: [] }, { title: 'Avokádo', categoryIds: [] }];
    expect(filterRecipes(input, '', null).map((r) => r.title)).toEqual(['Avokádo', 'Šalát']);
    expect(input[0].title).toBe('Šalát');
  });
});
