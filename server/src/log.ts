/**
 * What may be logged about a failure: the error class and HTTP status only. Never the message,
 * request body, keys, tokens or recipe content (messages can echo any of them).
 */
export function errorInfo(e: unknown): { error: string; status?: number } {
  if (!(e instanceof Error)) return { error: typeof e };
  const ctor = e.constructor?.name;
  const error = ctor && ctor !== 'Error' ? ctor : e.name;
  const status = (e as { status?: unknown }).status;
  return typeof status === 'number' ? { error, status } : { error };
}
