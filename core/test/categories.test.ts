import { describe, it, expect } from 'vitest';
import { mapCategoryNames, DEFAULT_CATEGORIES } from '../src/categories';

describe('mapCategoryNames', () => {
  const cats = [
    { id: '1', name: 'Polievky', sortOrder: 0 },
    { id: '2', name: 'Hlavné jedlá', sortOrder: 1 },
  ];
  it('maps names ignoring case/diacritics, drops unknown and duplicates, keeps order', () => {
    expect(mapCategoryNames(['hlavne jedla', 'Neexistuje', 'Polievky', 'polievky'], cats)).toEqual(['2', '1']);
  });
  it('exposes default categories', () => {
    expect(DEFAULT_CATEGORIES.length).toBeGreaterThan(0);
  });
});
