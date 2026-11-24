import type { Category } from './recipe';
import { normalizeText } from './search';

export const DEFAULT_CATEGORIES: readonly string[] = [
  'Polievky',
  'Hlavné jedlá',
  'Prílohy',
  'Šaláty',
  'Koláče a dezerty',
  'Pečivo',
  'Nápoje',
];

export function mapCategoryNames(names: string[], categories: Category[]): string[] {
  const byName = new Map(categories.map((c) => [normalizeText(c.name), c.id]));
  const result: string[] = [];
  for (const name of names) {
    const id = byName.get(normalizeText(name));
    if (id !== undefined && !result.includes(id)) result.push(id);
  }
  return result;
}
