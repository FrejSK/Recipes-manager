/** `24. 11. 2026` — Slovak short date, local time, no leading zeros. */
export function formatDate(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}
