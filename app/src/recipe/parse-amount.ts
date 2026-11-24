/** Parses a user-typed number; accepts both decimal comma and dot. Empty or invalid → null. */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

/** Like parseAmount, rounded to a whole number (servings, minutes). */
export function parseInteger(text: string): number | null {
  const n = parseAmount(text);
  return n === null ? null : Math.round(n);
}
