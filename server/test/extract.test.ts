import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedRecipe } from '@recipes/core';
import { createGeminiAI, DEFAULT_MODEL, type AiInput, type GenerateClient, type RecipeAI } from '../src/ai';
import { extract, resolvePhotoUrl } from '../src/extract';
import { fetchPage, MAX_PAGE_BYTES } from '../src/fetch-page';
import { htmlToText } from '../src/html-text';
import { SYSTEM_PROMPT } from '../src/prompt';

const fx = (n: string) => readFileSync(`test/fixtures/${n}`, 'utf8');

const recipe: ExtractedRecipe = {
  title: 'Guláš',
  servings: 4,
  prepMinutes: null,
  cookMinutes: 120,
  totalMinutes: null,
  ingredientGroups: [
    { name: null, items: [{ amount: 500, amountMax: null, unit: 'g', name: 'hovädzie mäso', note: null }] },
  ],
  steps: ['Opražíme cibuľu.'],
  categoryNames: ['Hlavné jedlá'],
};

type AiResult = Awaited<ReturnType<RecipeAI['extract']>>;

function fakeAI(result: AiResult = { ok: true, recipe }) {
  const calls: { input: AiInput; categories: string[] }[] = [];
  const ai: RecipeAI = {
    async extract(input, categories) {
      calls.push({ input, categories });
      return result;
    },
  };
  return { ai, calls };
}

function fakeFetch(res: Awaited<ReturnType<typeof fetchPage>>) {
  const urls: string[] = [];
  const fn: typeof fetchPage = async (url) => {
    urls.push(url);
    return res;
  };
  return { fn, urls };
}

const categories = ['Polievky', 'Hlavné jedlá'];

describe('extract', () => {
  it('text → AI gets the text and categories, photoUrl null', async () => {
    const { ai, calls } = fakeAI();
    const { fn, urls } = fakeFetch({ ok: false });
    const r = await extract({ kind: 'text', text: 'Recept na guláš', categories }, { ai, fetchPage: fn });
    expect(calls).toEqual([{ input: { kind: 'text', text: 'Recept na guláš' }, categories }]);
    expect(urls).toEqual([]);
    expect(r).toEqual({ ok: true, data: { recipe, photoUrl: null } });
  });

  it('images → AI gets images in order, photoUrl null', async () => {
    const { ai, calls } = fakeAI();
    const images = [
      { mediaType: 'image/png' as const, data: 'AAA' },
      { mediaType: 'image/jpeg' as const, data: 'BBB' },
    ];
    const r = await extract({ kind: 'images', images, categories }, { ai, fetchPage: fakeFetch({ ok: false }).fn });
    expect(calls).toEqual([{ input: { kind: 'images', images }, categories }]);
    expect(r).toEqual({ ok: true, data: { recipe, photoUrl: null } });
  });

  it('url with JSON-LD → AI gets JSON-LD text, photoUrl from JSON-LD', async () => {
    const { ai, calls } = fakeAI();
    const { fn, urls } = fakeFetch({ ok: true, html: fx('jsonld-simple.html') });
    const r = await extract({ kind: 'url', url: 'https://example.com/r', categories }, { ai, fetchPage: fn });
    expect(urls).toEqual(['https://example.com/r']);
    expect(calls).toHaveLength(1);
    const input = calls[0].input;
    expect(input.kind).toBe('text');
    expect(input.kind === 'text' && input.text.startsWith('Názov: ')).toBe(true);
    expect(calls[0].categories).toEqual(categories);
    expect(r).toEqual({ ok: true, data: { recipe, photoUrl: 'https://example.com/halusky.jpg' } });
  });

  it('url without JSON-LD → AI gets page text, photoUrl from og:image', async () => {
    const { ai, calls } = fakeAI();
    const html = fx('no-jsonld.html');
    const r = await extract(
      { kind: 'url', url: 'https://example.com/r', categories },
      { ai, fetchPage: fakeFetch({ ok: true, html }).fn },
    );
    expect(calls).toEqual([{ input: { kind: 'text', text: htmlToText(html) }, categories }]);
    expect(r).toEqual({ ok: true, data: { recipe, photoUrl: 'https://example.com/photo.jpg' } });
  });

  it('url, fetch fails → url_unreadable', async () => {
    const { ai, calls } = fakeAI();
    const r = await extract(
      { kind: 'url', url: 'https://example.com/r', categories },
      { ai, fetchPage: fakeFetch({ ok: false }).fn },
    );
    expect(r).toEqual({ ok: false, error: 'url_unreadable' });
    expect(calls).toEqual([]);
  });

  it('url without JSON-LD and too little text → url_unreadable without AI call', async () => {
    const { ai, calls } = fakeAI();
    const html = '<html><body><h1>Login</h1><p>Prihláste sa.</p></body></html>';
    const r = await extract(
      { kind: 'url', url: 'https://example.com/r', categories },
      { ai, fetchPage: fakeFetch({ ok: true, html }).fn },
    );
    expect(r).toEqual({ ok: false, error: 'url_unreadable' });
    expect(calls).toEqual([]);
  });

  it('url without JSON-LD, AI says not_a_recipe → url_unreadable', async () => {
    const { ai } = fakeAI({ ok: false, error: 'not_a_recipe' });
    const r = await extract(
      { kind: 'url', url: 'https://example.com/r', categories },
      { ai, fetchPage: fakeFetch({ ok: true, html: fx('no-jsonld.html') }).fn },
    );
    expect(r).toEqual({ ok: false, error: 'url_unreadable' });
  });

  it('url with JSON-LD, AI says not_a_recipe → not_a_recipe', async () => {
    const { ai } = fakeAI({ ok: false, error: 'not_a_recipe' });
    const r = await extract(
      { kind: 'url', url: 'https://example.com/r', categories },
      { ai, fetchPage: fakeFetch({ ok: true, html: fx('jsonld-simple.html') }).fn },
    );
    expect(r).toEqual({ ok: false, error: 'not_a_recipe' });
  });

  it('text, AI says not_a_recipe → not_a_recipe', async () => {
    const { ai } = fakeAI({ ok: false, error: 'not_a_recipe' });
    const r = await extract({ kind: 'text', text: 'Ahoj', categories }, { ai, fetchPage: fakeFetch({ ok: false }).fn });
    expect(r).toEqual({ ok: false, error: 'not_a_recipe' });
  });

  it('AI failure is passed through', async () => {
    const { ai } = fakeAI({ ok: false, error: 'ai_failed' });
    const r = await extract({ kind: 'text', text: 'Ahoj', categories }, { ai, fetchPage: fakeFetch({ ok: false }).fn });
    expect(r).toEqual({ ok: false, error: 'ai_failed' });
  });
});

type GeminiParams = Parameters<GenerateClient['models']['generateContent']>[0];
type GeminiResponse = Awaited<ReturnType<GenerateClient['models']['generateContent']>>;

function fakeClient(respond: () => Promise<GeminiResponse>) {
  const params: GeminiParams[] = [];
  const client: GenerateClient = {
    models: {
      async generateContent(p) {
        params.push(p);
        return respond();
      },
    },
  };
  return { client, params };
}

/** A successful Gemini response whose text is `body` (JSON-encoded unless already a string). */
const reply = (body: unknown): GeminiResponse => ({
  text: typeof body === 'string' ? body : JSON.stringify(body),
  candidates: [{ finishReason: 'STOP' }],
});

const ok = () => fakeClient(async () => reply({ ...recipe, isRecipe: true }));
const failed = { ok: false, error: 'ai_failed' };

describe('createGeminiAI', () => {
  // Failure paths log by design; keep the test output clean.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('uses gemini-3.8-flash by default', () => {
    expect(DEFAULT_MODEL).toBe('gemini-3.8-flash');
  });

  it('returns the recipe without isRecipe on success', async () => {
    const { client } = ok();
    const r = await createGeminiAI('key', 'm', client).extract({ kind: 'text', text: 'Recept' }, categories);
    expect(r).toEqual({ ok: true, recipe });
    expect(r.ok && 'isRecipe' in r.recipe).toBe(false);
  });

  it('sends model, system prompt, JSON mime type, schema and categories in the user text', async () => {
    const { client, params } = ok();
    await createGeminiAI('key', 'gemini-test-model', client).extract({ kind: 'text', text: 'Recept na guláš' }, categories);
    expect(params).toHaveLength(1);
    const p = params[0];
    expect(p.model).toBe('gemini-test-model');
    expect(p.config.systemInstruction).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).not.toContain('Polievky');
    expect(p.config.responseMimeType).toBe('application/json');
    expect(p.config.responseJsonSchema).toBeTypeOf('object');
    expect(p.config).not.toHaveProperty('responseSchema');
    expect(p.config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    expect(p.config.httpOptions).toEqual({ timeout: 80_000 });
    expect(p.contents).toHaveLength(1);
    expect(p.contents[0].role).toBe('user');
    const parts = p.contents[0].parts ?? [];
    expect(parts).toHaveLength(1);
    expect(Object.keys(parts[0])).toEqual(['text']);
    expect(parts[0].text).toContain('Recept na guláš');
    expect(parts[0].text).toContain('"Polievky"');
    expect(parts[0].text).toContain('"Hlavné jedlá"');
  });

  it('falls back to DEFAULT_MODEL when the model is missing or empty', async () => {
    const { client, params } = ok();
    await createGeminiAI('key', undefined, client).extract({ kind: 'text', text: 'x' }, []);
    await createGeminiAI('key', '', client).extract({ kind: 'text', text: 'x' }, []);
    expect(params.map((p) => p.model)).toEqual([DEFAULT_MODEL, DEFAULT_MODEL]);
  });

  it('sends images as inlineData parts in order with their mime types, followed by one text part', async () => {
    const { client, params } = ok();
    await createGeminiAI('key', 'm', client).extract(
      {
        kind: 'images',
        images: [
          { mediaType: 'image/png', data: 'AAA' },
          { mediaType: 'image/webp', data: 'BBB' },
          { mediaType: 'image/jpeg', data: 'CCC' },
        ],
      },
      categories,
    );
    const parts = params[0].contents[0].parts ?? [];
    expect(parts).toHaveLength(4);
    expect(parts[0]).toEqual({ inlineData: { mimeType: 'image/png', data: 'AAA' } });
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'image/webp', data: 'BBB' } });
    expect(parts[2]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'CCC' } });
    expect(Object.keys(parts[3])).toEqual(['text']);
    expect(parts[3].text).toContain('screenshots');
    expect(parts[3].text).toContain('"Polievky"');
  });

  it('isRecipe false → not_a_recipe', async () => {
    const { client } = fakeClient(async () => reply({ ...recipe, isRecipe: false }));
    expect(await createGeminiAI('key', 'm', client).extract({ kind: 'text', text: 'x' }, [])).toEqual({
      ok: false,
      error: 'not_a_recipe',
    });
  });

  it('text that is not valid JSON → ai_failed', async () => {
    for (const text of ['not json', '{"title": "Guláš", ', '```json\n{}\n```']) {
      const { client } = fakeClient(async () => reply(text));
      expect(await createGeminiAI('key', 'm', client).extract({ kind: 'text', text: 'x' }, [])).toEqual(failed);
    }
  });

  it('JSON that misses required fields or has wrong types → ai_failed, never a partial recipe', async () => {
    const { isRecipe: _drop, ...noIsRecipe } = { ...recipe, isRecipe: true };
    const { steps: _steps, ...noSteps } = { ...recipe, isRecipe: true };
    const bodies: unknown[] = [
      { title: 'Guláš', isRecipe: true },
      noIsRecipe,
      noSteps,
      { ...recipe, isRecipe: true, servings: 2.5 },
      { ...recipe, isRecipe: true, servings: '4' },
      { ...recipe, isRecipe: true, ingredientGroups: [{ name: null, items: [{ amount: 1, amountMax: null, unit: 'cup', name: 'x', note: null }] }] },
      null,
      [],
      42,
    ];
    for (const body of bodies) {
      const { client } = fakeClient(async () => reply(body));
      expect(await createGeminiAI('key', 'm', client).extract({ kind: 'text', text: 'x' }, [])).toEqual(failed);
    }
  });

  it('empty or missing text (e.g. blocked, no candidates) → ai_failed', async () => {
    const responses: GeminiResponse[] = [
      { text: undefined, candidates: [] },
      { text: undefined, promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } },
      { text: '', candidates: [{ finishReason: 'STOP' }] },
      {},
    ];
    for (const res of responses) {
      const { client } = fakeClient(async () => res);
      expect(await createGeminiAI('key', 'm', client).extract({ kind: 'text', text: 'x' }, [])).toEqual(failed);
    }
  });

  it('a prompt block reason or a finish reason other than STOP → ai_failed, even with valid JSON text', async () => {
    const body = JSON.stringify({ ...recipe, isRecipe: true });
    const responses: GeminiResponse[] = [
      { text: body, candidates: [{ finishReason: 'SAFETY' }] },
      { text: body, candidates: [{ finishReason: 'MAX_TOKENS' }] },
      { text: body, candidates: [{ finishReason: 'STOP' }], promptFeedback: { blockReason: 'SAFETY' } },
    ];
    for (const res of responses) {
      const { client } = fakeClient(async () => res);
      expect(await createGeminiAI('key', 'm', client).extract({ kind: 'text', text: 'x' }, [])).toEqual(failed);
    }
  });

  it('request timeout (abort) → ai_failed, logged by error class only', async () => {
    const { client } = fakeClient(async () => {
      throw new DOMException('The operation was aborted. tajný', 'AbortError');
    });
    expect(await createGeminiAI('key', 'm', client).extract({ kind: 'text', text: 'tajný recept' }, [])).toEqual(failed);
    expect(console.error).toHaveBeenLastCalledWith('ai_failed', { error: 'DOMException' });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/tajný|aborted/);
  });

  it('SDK throw → ai_failed', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('overloaded');
    });
    expect(await createGeminiAI('key', 'm', client).extract({ kind: 'text', text: 'x' }, [])).toEqual(failed);
  });

  it('missing API key → ai_failed per request, without calling the client or throwing at creation', async () => {
    const { client, params } = ok();
    expect(() => createGeminiAI('')).not.toThrow();
    expect(await createGeminiAI('').extract({ kind: 'text', text: 'x' }, [])).toEqual(failed);
    expect(await createGeminiAI(undefined as unknown as string).extract({ kind: 'text', text: 'x' }, [])).toEqual(failed);
    expect(await createGeminiAI('', 'm', client).extract({ kind: 'text', text: 'x' }, [])).toEqual(failed);
    expect(params).toEqual([]);
  });

  it('response schema: required fields, unit enum, nullable integers, only keywords Gemini supports', async () => {
    const { client, params } = ok();
    await createGeminiAI('key', 'm', client).extract({ kind: 'text', text: 'x' }, []);
    const schema = params[0].config.responseJsonSchema as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(expect.arrayContaining(['isRecipe', 'ingredientGroups', 'title', 'steps']));
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.servings).toEqual({ anyOf: [{ type: 'integer' }, { type: 'null' }] });
    expect(props.title).toEqual({ type: 'string' });
    expect(props.isRecipe).toEqual({ type: 'boolean' });
    const item = ((props.ingredientGroups.items as Record<string, unknown>).properties as Record<string, Record<string, unknown>>)
      .items.items as Record<string, unknown>;
    const itemProps = item.properties as Record<string, Record<string, unknown>>;
    expect(item.required).toEqual(['amount', 'amountMax', 'unit', 'name', 'note']);
    expect(itemProps.amount).toEqual({ anyOf: [{ type: 'number' }, { type: 'null' }] });
    expect(itemProps.note).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    const unit = itemProps.unit.anyOf as { type: string; enum?: string[] }[];
    expect(unit.map((u) => u.type)).toEqual(['string', 'null']);
    expect(unit[0].enum).toContain('CL');
    expect(unit[0].enum).toContain('strucik');

    // Keywords from the responseJsonSchema list in the @google/genai typings; anything else (e.g. $schema) is dropped.
    const supported = new Set([
      '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum', 'items', 'prefixItems',
      'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf', 'properties', 'additionalProperties',
      'required', 'propertyOrdering',
    ]);
    const found: string[] = [];
    const walk = (v: unknown, path: string, inProps = false) => {
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          if (inProps) {
            walk(x, `${path}.${k}`);
            continue;
          }
          if (!supported.has(k)) found.push(`${path}.${k}`);
          if (k === 'type' && typeof x !== 'string') found.push(`${path}.type(non-string)`);
          if ((k === 'minimum' || k === 'maximum') && Math.abs(x as number) >= Number.MAX_SAFE_INTEGER) {
            found.push(`${path}.${k}(safe-integer bound)`);
          }
          if (k !== 'enum' && k !== 'required' && k !== 'description') walk(x, `${path}.${k}`, k === 'properties');
        }
      }
    };
    walk(schema, '$');
    expect(found).toEqual([]);
  });
});

describe('fetchPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
    const mock = vi.fn(impl);
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  it('returns html with User-Agent header and a timeout signal', async () => {
    const mock = stubFetch(async () =>
      new Response('<html>ok</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    );
    expect(await fetchPage('https://example.com/r')).toEqual({ ok: true, html: '<html>ok</html>' });
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('https://example.com/r');
    expect(new Headers(init?.headers).get('User-Agent')).toBe('Mozilla/5.0 (compatible; ReceptyApp/1.0)');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('accepts application/xhtml+xml', async () => {
    stubFetch(async () => new Response('<html/>', { headers: { 'content-type': 'application/xhtml+xml' } }));
    expect(await fetchPage('https://example.com/r')).toEqual({ ok: true, html: '<html/>' });
  });

  it('non-2xx → ok:false', async () => {
    stubFetch(async () => new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } }));
    expect(await fetchPage('https://example.com/r')).toEqual({ ok: false });
  });

  it('non-html content-type → ok:false', async () => {
    stubFetch(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
    expect(await fetchPage('https://example.com/r')).toEqual({ ok: false });
  });

  it('missing content-type → ok:false', async () => {
    stubFetch(async () => new Response(new Uint8Array([1, 2, 3])));
    expect(await fetchPage('https://example.com/r')).toEqual({ ok: false });
  });

  it('network error or timeout → ok:false', async () => {
    stubFetch(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    expect(await fetchPage('https://example.com/r')).toEqual({ ok: false });
  });
});

describe('fetchPage size cap', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A streamed HTML response of `chunks` chunks of `size` bytes; records how many chunks were pulled. */
  function streamed(chunks: number, size: number) {
    const state = { pulled: 0, cancelled: false };
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (state.pulled >= chunks) return controller.close();
        state.pulled++;
        controller.enqueue(new Uint8Array(size).fill(0x61)); // 'a'
      },
      cancel() {
        state.cancelled = true;
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { headers: { 'content-type': 'text/html' } })));
    return state;
  }

  it('reads a page up to 3 MB', async () => {
    streamed(3, 1024 * 1024);
    const r = await fetchPage('https://example.com/r');
    expect(r.ok && r.html.length).toBe(MAX_PAGE_BYTES);
  });

  it('a page over 3 MB → ok:false, and reading stops at the cap', async () => {
    const state = streamed(1000, 1024 * 1024); // would be ~1 GB
    expect(await fetchPage('https://example.com/r')).toEqual({ ok: false });
    expect(state.pulled).toBeLessThan(10);
    expect(state.cancelled).toBe(true);
  });

  it('decodes multi-byte UTF-8 split across chunks', async () => {
    const bytes = new TextEncoder().encode('<p>Halušky s bryndzou</p>');
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const b of bytes) c.enqueue(new Uint8Array([b]));
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { headers: { 'content-type': 'text/html' } })));
    expect(await fetchPage('https://example.com/r')).toEqual({ ok: true, html: '<p>Halušky s bryndzou</p>' });
  });
});

describe('photo URL resolution', () => {
  it('resolves relative and protocol-relative URLs against the page URL, keeps only http(s)', () => {
    const page = 'https://www.example.sk/recepty/halusky?x=1';
    expect(resolvePhotoUrl('//cdn.example.sk/a.jpg', page)).toBe('https://cdn.example.sk/a.jpg');
    expect(resolvePhotoUrl('/img/a.jpg', page)).toBe('https://www.example.sk/img/a.jpg');
    expect(resolvePhotoUrl('img/a.jpg', page)).toBe('https://www.example.sk/recepty/img/a.jpg');
    expect(resolvePhotoUrl('http://x.sk/a.jpg', page)).toBe('http://x.sk/a.jpg');
    expect(resolvePhotoUrl('data:image/png;base64,AAA', page)).toBeNull();
    expect(resolvePhotoUrl('javascript:alert(1)', page)).toBeNull();
    expect(resolvePhotoUrl(null, page)).toBeNull();
    expect(resolvePhotoUrl('', page)).toBeNull();
  });

  it('applies to JSON-LD image and og:image', async () => {
    const { ai } = fakeAI();
    const url = 'https://www.example.sk/recepty/halusky';
    const jsonLdHtml = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe',
      name: 'Halušky',
      image: '//cdn.example.sk/halusky.jpg',
      recipeIngredient: ['1 kg zemiakov'],
      recipeInstructions: ['Nastrúhame.'],
    })}</script>`;
    const a = await extract({ kind: 'url', url, categories }, { ai, fetchPage: fakeFetch({ ok: true, html: jsonLdHtml }).fn });
    expect(a.ok && a.data.photoUrl).toBe('https://cdn.example.sk/halusky.jpg');

    const ogHtml = `<html><head><meta property="og:image" content="/foto/halusky.jpg"></head><body><p>${'Halušky s bryndzou. '.repeat(20)}</p></body></html>`;
    const b = await extract({ kind: 'url', url, categories }, { ai, fetchPage: fakeFetch({ ok: true, html: ogHtml }).fn });
    expect(b.ok && b.data.photoUrl).toBe('https://www.example.sk/foto/halusky.jpg');

    // A JSON-LD image that is not http(s) falls back to og:image.
    const badLd = jsonLdHtml.replace('//cdn.example.sk/halusky.jpg', 'data:image/png;base64,AAA') +
      '<meta property="og:image" content="/foto/og.jpg">';
    const c = await extract({ kind: 'url', url, categories }, { ai, fetchPage: fakeFetch({ ok: true, html: badLd }).fn });
    expect(c.ok && c.data.photoUrl).toBe('https://www.example.sk/foto/og.jpg');
  });
});

describe('createGeminiAI logging', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the error class and HTTP status of an SDK failure, nothing else', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    class ApiError extends Error {
      status = 429;
    }
    const { client } = fakeClient(async () => {
      throw new ApiError('429 {"error":"rate limited"} key AIza-secret');
    });
    await createGeminiAI('AIza-secret', 'm', client).extract({ kind: 'text', text: 'tajný recept' }, []);
    expect(log).toHaveBeenCalledWith('ai_failed', { error: 'ApiError', status: 429 });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|tajný/);
  });

  it('logs finish and block reasons when there is no usable output', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const blocked = fakeClient(async () => ({ promptFeedback: { blockReason: 'SAFETY' } }));
    await createGeminiAI('key', 'm', blocked.client).extract({ kind: 'text', text: 'x' }, []);
    expect(log).toHaveBeenLastCalledWith('ai_failed', { finishReason: undefined, blockReason: 'SAFETY' });
    const truncated = fakeClient(async () => ({ text: '{"title":"Gul', candidates: [{ finishReason: 'MAX_TOKENS' }] }));
    await createGeminiAI('key', 'm', truncated.client).extract({ kind: 'text', text: 'x' }, []);
    expect(log).toHaveBeenLastCalledWith('ai_failed', { finishReason: 'MAX_TOKENS', blockReason: undefined });
  });

  it('logs only a reason, never the content, for invalid JSON or a schema mismatch', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = fakeClient(async () => reply('tajný recept, nie JSON'));
    await createGeminiAI('key', 'm', bad.client).extract({ kind: 'text', text: 'x' }, []);
    expect(log).toHaveBeenLastCalledWith('ai_failed', { reason: 'invalid_json' });
    const partial = fakeClient(async () => reply({ title: 'tajný recept', isRecipe: true }));
    await createGeminiAI('key', 'm', partial.client).extract({ kind: 'text', text: 'x' }, []);
    expect(log).toHaveBeenLastCalledWith('ai_failed', { reason: 'schema_mismatch' });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/tajný/);
  });

  it('logs a missing API key without the key itself', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await createGeminiAI('').extract({ kind: 'text', text: 'x' }, []);
    expect(log).toHaveBeenCalledWith('ai_failed', { reason: 'missing_api_key' });
  });
});
