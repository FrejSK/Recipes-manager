/** Parses a user-typed number; accepts both decimal comma and dot. Empty or invalid → null. */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

export const MAX_INTEGER = 100000;

/** Like parseAmount, rounded to a whole number (servings, minutes). Outside 0..MAX_INTEGER → null. */
export function parseInteger(text: string): number | null {
  const n = parseAmount(text);
  if (n === null || n < 0) return null;
  const r = Math.round(n);
  return r > MAX_INTEGER ? null : r;
}
