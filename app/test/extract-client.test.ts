import type { ExtractRequest, ExtractResponse } from '@recipes/core';

import { extractRecipe } from '../src/import/extract-client';
import { errorMessage } from '../src/import/messages';

const req: ExtractRequest = { kind: 'text', text: 'Palacinky: mlieko, múka, vajce', categories: ['Dezerty'] };

const data: ExtractResponse = {
  recipe: {
    title: 'Palacinky',
    servings: 4,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    ingredientGroups: [],
    steps: ['Zmiešaj.'],
    categoryNames: ['Dezerty'],
  },
  photoUrl: null,
};

function fakeResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  } as unknown as Response;
}

const opts = { baseUrl: 'https://extract.example.dev', token: 'secret-token' };

describe('extractRecipe', () => {
  it('returns data on 200 and sends the bearer token to {baseUrl}/extract', async () => {
    const fetchFn = jest.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      fakeResponse(200, JSON.stringify(data)),
    );
    const res = await extractRecipe(req, { ...opts, fetchFn: fetchFn as unknown as typeof fetch });
    expect(res).toEqual({ ok: true, data });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://extract.example.dev/extract');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(init?.body as string)).toEqual(req);
  });

  it('strips a trailing slash from the base url', async () => {
    const fetchFn = jest.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      fakeResponse(200, JSON.stringify(data)),
    );
    await extractRecipe(req, {
      ...opts,
      baseUrl: 'https://extract.example.dev/',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(fetchFn.mock.calls[0][0]).toBe('https://extract.example.dev/extract');
  });

  it('maps a known server error code', async () => {
    const fetchFn = async () => fakeResponse(422, JSON.stringify({ error: 'not_a_recipe' }));
    expect(await extractRecipe(req, { ...opts, fetchFn: fetchFn as unknown as typeof fetch })).toEqual({
      ok: false,
      error: 'not_a_recipe',
    });
  });

  it('maps a non-JSON error body to ai_failed', async () => {
    const fetchFn = async () => fakeResponse(500, '<html>Internal Server Error</html>');
    expect(await extractRecipe(req, { ...opts, fetchFn: fetchFn as unknown as typeof fetch })).toEqual({
      ok: false,
      error: 'ai_failed',
    });
  });

  it('maps an unknown error code to ai_failed', async () => {
    const fetchFn = async () => fakeResponse(400, JSON.stringify({ error: 'something_new' }));
    expect(await extractRecipe(req, { ...opts, fetchFn: fetchFn as unknown as typeof fetch })).toEqual({
      ok: false,
      error: 'ai_failed',
    });
  });

  it('maps a thrown TypeError to network', async () => {
    const fetchFn = async () => {
      throw new TypeError('Network request failed');
    };
    expect(await extractRecipe(req, { ...opts, fetchFn: fetchFn as unknown as typeof fetch })).toEqual({
      ok: false,
      error: 'network',
    });
  });

  it('aborts a slow request after timeoutMs and returns timeout', async () => {
    // Behaves like real fetch: resolves late, but rejects with AbortError when the signal fires.
    const fetchFn = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(fakeResponse(200, JSON.stringify(data))), 2000);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    expect(
      await extractRecipe(req, { ...opts, timeoutMs: 10, fetchFn: fetchFn as unknown as typeof fetch }),
    ).toEqual({ ok: false, error: 'timeout' });
  });
});

describe('errorMessage', () => {
  it('returns the exact Slovak texts', () => {
    expect(errorMessage('url_unreadable')).toBe(
      'Z tohto odkazu sa recept nedá načítať. Skús radšej poslať screenshot.',
    );
    expect(errorMessage('network')).toBe(
      'Nepodarilo sa spojiť so serverom. Skontroluj pripojenie na internet a skús znova.',
    );
    expect(errorMessage('timeout')).toBe('Čítanie receptu trvá príliš dlho. Skús to znova.');
    expect(errorMessage('not_a_recipe')).toBe('V tomto obsahu sa nenašiel žiadny recept.');
    expect(errorMessage('rate_limited')).toBe(
      'Dnes sa už načítalo veľa receptov. Skús to zajtra alebo recept vyplň ručne.',
    );
    expect(errorMessage('image_too_long')).toBe('Obrázok je príliš dlhý. Rozdeľ ho na viac screenshotov.');
    const generic = 'Recept sa nepodarilo prečítať. Skús to znova alebo ho vyplň ručne.';
    expect(errorMessage('ai_failed')).toBe(generic);
    expect(errorMessage('unauthorized')).toBe(generic);
    expect(errorMessage('bad_request')).toBe(generic);
  });
});
