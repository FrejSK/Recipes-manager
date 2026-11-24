const USER_AGENT = 'Mozilla/5.0 (compatible; ReceptyApp/1.0)';
const TIMEOUT_MS = 15_000;

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
    return { ok: true, html: await res.text() };
  } catch {
    return { ok: false };
  }
}
