const USER_AGENT = 'Mozilla/5.0 (compatible; ReceptyApp/1.0)';
const TIMEOUT_MS = 15_000;

/** Pages larger than this are refused, so parsing a huge page cannot eat the Worker's CPU-time limit. */
export const MAX_PAGE_BYTES = 3 * 1024 * 1024;

/** Reads the body as UTF-8 text, stopping (and cancelling the download) once it exceeds `max` bytes. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function fetchPage(url: string): Promise<{ ok: true; html: string } | { ok: false }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false };
    const type = (res.headers.get('content-type') ?? '').trim().toLowerCase();
    if (!type.startsWith('text/html') && !type.startsWith('application/xhtml+xml')) return { ok: false };
    const html = await readCapped(res, MAX_PAGE_BYTES);
    return html === null ? { ok: false } : { ok: true, html };
  } catch {
    return { ok: false };
  }
}
