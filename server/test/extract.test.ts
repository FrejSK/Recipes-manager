import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedRecipe } from '@recipes/core';
import { createClaudeAI, type AiInput, type ParseClient, type RecipeAI } from '../src/ai';
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

type ParseParams = Parameters<ParseClient['messages']['parse']>[0];
type ParseResponse = Awaited<ReturnType<ParseClient['messages']['parse']>>;

function fakeClient(respond: () => Promise<ParseResponse>) {
  const params: ParseParams[] = [];
  const client: ParseClient = {
    messages: {
      async parse(p) {
        params.push(p);
        return respond();
      },
    },
  };
  return { client, params };
}

describe('createClaudeAI', () => {
  it('returns the recipe without isRecipe on success', async () => {
    const { client } = fakeClient(async () => ({
      stop_reason: 'end_turn',
      parsed_output: { ...recipe, isRecipe: true },
    }));
    const r = await createClaudeAI('key', client).extract({ kind: 'text', text: 'Recept' }, categories);
    expect(r).toEqual({ ok: true, recipe });
    expect(r.ok && 'isRecipe' in r.recipe).toBe(false);
  });

  it('sends model, effort, schema, system prompt and categories in the user text', async () => {
    const { client, params } = fakeClient(async () => ({
      stop_reason: 'end_turn',
      parsed_output: { ...recipe, isRecipe: true },
    }));
    await createClaudeAI('key', client).extract({ kind: 'text', text: 'Recept na guláš' }, categories);
    const p = params[0];
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.max_tokens).toBe(16000);
    expect(p.output_config.effort).toBe('low');
    expect(p.output_config.format.type).toBe('json_schema');
    expect(p.system).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).not.toContain('Polievky');
    expect(p).not.toHaveProperty('thinking');
    expect(p).not.toHaveProperty('temperature');
    expect(p.messages).toHaveLength(1);
    expect(p.messages[0].role).toBe('user');
    const content = p.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    const blocks = content as Exclude<typeof content, string>;
    expect(blocks).toHaveLength(1);
    const text = blocks[0].type === 'text' ? blocks[0].text : '';
    expect(text).toContain('Recept na guláš');
    expect(text).toContain('"Polievky"');
    expect(text).toContain('"Hlavné jedlá"');
  });

  it('sends images as base64 blocks in order, followed by an instruction text block', async () => {
    const { client, params } = fakeClient(async () => ({
      stop_reason: 'end_turn',
      parsed_output: { ...recipe, isRecipe: true },
    }));
    await createClaudeAI('key', client).extract(
      { kind: 'images', images: [{ mediaType: 'image/png', data: 'AAA' }, { mediaType: 'image/webp', data: 'BBB' }] },
      categories,
    );
    const blocks = params[0].messages[0].content as Exclude<ParseParams['messages'][0]['content'], string>;
    expect(blocks.map((b) => b.type)).toEqual(['image', 'image', 'text']);
    expect(blocks[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } });
    expect(blocks[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'BBB' } });
    expect(blocks[2].type === 'text' && blocks[2].text).toContain('"Polievky"');
  });

  it('isRecipe false → not_a_recipe', async () => {
    const { client } = fakeClient(async () => ({
      stop_reason: 'end_turn',
      parsed_output: { ...recipe, isRecipe: false },
    }));
    expect(await createClaudeAI('key', client).extract({ kind: 'text', text: 'x' }, [])).toEqual({
      ok: false,
      error: 'not_a_recipe',
    });
  });

  it('refusal → ai_failed', async () => {
    const { client } = fakeClient(async () => ({ stop_reason: 'refusal', parsed_output: null }));
    expect(await createClaudeAI('key', client).extract({ kind: 'text', text: 'x' }, [])).toEqual({
      ok: false,
      error: 'ai_failed',
    });
  });

  it('refusal with a parsed output still → ai_failed', async () => {
    const { client } = fakeClient(async () => ({
      stop_reason: 'refusal',
      parsed_output: { ...recipe, isRecipe: true },
    }));
    expect(await createClaudeAI('key', client).extract({ kind: 'text', text: 'x' }, [])).toEqual({
      ok: false,
      error: 'ai_failed',
    });
  });

  it('null parsed_output → ai_failed', async () => {
    const { client } = fakeClient(async () => ({ stop_reason: 'end_turn', parsed_output: null }));
    expect(await createClaudeAI('key', client).extract({ kind: 'text', text: 'x' }, [])).toEqual({
      ok: false,
      error: 'ai_failed',
    });
  });

  it('SDK throw → ai_failed', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('overloaded');
    });
    expect(await createClaudeAI('key', client).extract({ kind: 'text', text: 'x' }, [])).toEqual({
      ok: false,
      error: 'ai_failed',
    });
  });

  it('output schema has no JSON-schema keywords that structured outputs reject', async () => {
    const { client, params } = fakeClient(async () => ({ stop_reason: 'end_turn', parsed_output: null }));
    await createClaudeAI('key', client).extract({ kind: 'text', text: 'x' }, []);
    const schema = params[0].output_config.format.schema;
    const banned = new Set([
      'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
      'minLength', 'maxLength', 'pattern', 'maxItems', 'uniqueItems', 'format',
    ]);
    const found: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          if (banned.has(k)) found.push(`${path}.${k}`);
          if (k !== 'description' && k !== 'enum' && k !== 'required') walk(x, `${path}.${k}`);
        }
      }
    };
    walk(schema, '$');
    expect(found).toEqual([]);
    const servings = (schema.properties as Record<string, { anyOf: { type: string }[] }>).servings;
    expect(servings.anyOf.map((s) => s.type)).toEqual(['integer', 'null']);
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

describe('createClaudeAI logging', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the error class and HTTP status of an SDK failure, nothing else', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    class RateLimitError extends Error {
      status = 429;
    }
    const { client } = fakeClient(async () => {
      throw new RateLimitError('429 {"error":"rate limited"} key sk-ant-secret');
    });
    await createClaudeAI('sk-ant-secret', client).extract({ kind: 'text', text: 'tajný recept' }, []);
    expect(log).toHaveBeenCalledWith('ai_failed', { error: 'RateLimitError', status: 429 });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|tajný/);
  });

  it('logs stop_reason when there is no usable output', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeClient(async () => ({ stop_reason: 'max_tokens', parsed_output: null }));
    await createClaudeAI('key', client).extract({ kind: 'text', text: 'x' }, []);
    expect(log).toHaveBeenCalledWith('ai_failed', { stop_reason: 'max_tokens' });
  });
});
