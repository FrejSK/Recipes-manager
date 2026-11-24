export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function filterRecipes<T extends { title: string; categoryIds: string[] }>(
  items: T[],
  query: string,
  categoryId: string | null,
): T[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  return items
    .filter((r) => categoryId === null || r.categoryIds.includes(categoryId))
    .map((r) => ({ r, key: normalizeText(r.title) }))
    .filter(({ key }) => words.every((w) => key.includes(w)))
    .sort((a, b) => a.key.localeCompare(b.key, 'sk'))
    .map(({ r }) => r);
}
