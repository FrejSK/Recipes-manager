import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleRequest } from '../src/handler';
import type { KVLike } from '../src/rate-limit';
import type { Extractor } from '../src/handler';

const data = {
  recipe: {
    title: 'T', servings: null, prepMinutes: null, cookMinutes: null, totalMinutes: null,
    ingredientGroups: [], steps: [], categoryNames: [],
  },
  photoUrl: null,
};

function fakeKv(): KVLike {
  const m = new Map<string, string>();
  return {
    async get(k) { return m.get(k) ?? null; },
    async put(k, v) { m.set(k, v); },
  };
}

function req(opts: { method?: string; token?: string | null; body?: unknown; path?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token !== null) headers.authorization = `Bearer ${opts.token ?? 'secret'}`;
  const method = opts.method ?? 'POST';
  return new Request(`https://x.test${opts.path ?? '/extract'}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? { kind: 'text', text: 'hello', categories: [] }),
  });
}

function setup(extract: Extractor = async () => ({ ok: true, data }), dailyLimit = 50) {
  let now = new Date('2026-01-01T10:00:00Z');
  const deps = { appToken: 'secret', dailyLimit, kv: fakeKv(), extract, now: () => now };
  return { deps, advanceDay: () => { now = new Date(now.getTime() + 86400000); } };
}

describe('handleRequest', () => {
  afterEach(() => vi.restoreAllMocks());
  it('401 without header', async () => {
    const { deps } = setup();
    const r = await handleRequest(req({ token: null }), deps);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'unauthorized' });
    expect(r.headers.get('content-type')).toContain('application/json');
  });
  it('401 with wrong token', async () => {
    const r = await handleRequest(req({ token: 'nope' }), setup().deps);
    expect(r.status).toBe(401);
  });
  it('404 for GET /extract', async () => {
    const r = await handleRequest(req({ method: 'GET' }), setup().deps);
    expect(r.status).toBe(404);
  });
  it('400 for invalid body', async () => {
    const r = await handleRequest(req({ body: { kind: 'text', text: '', categories: [] } }), setup().deps);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'bad_request' });
  });
  it('200 with extractor data', async () => {
    const r = await handleRequest(req(), setup().deps);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(data);
  });
  it('maps extractor error to status', async () => {
    const r = await handleRequest(req(), setup(async () => ({ ok: false, error: 'not_a_recipe' })).deps);
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: 'not_a_recipe' });
  });
  it('502 when extractor throws', async () => {
    const r = await handleRequest(req(), setup(async () => { throw new Error('boom'); }).deps);
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: 'ai_failed' });
  });
  it('logs only the error class and status when the extractor throws', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    class FetchError extends Error {
      status = 503;
    }
    await handleRequest(req({ body: { kind: 'text', text: 'tajný recept', categories: [] } }), setup(async () => {
      throw new FetchError('upstream said: tajný recept Bearer secret');
    }).deps);
    expect(log).toHaveBeenCalledWith('extract_failed', { error: 'FetchError', status: 503 });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/tajný|secret/);
  });
  it('rate limits at the third call and resets next day', async () => {
    const { deps, advanceDay } = setup(undefined, 2);
    expect((await handleRequest(req(), deps)).status).toBe(200);
    expect((await handleRequest(req(), deps)).status).toBe(200);
    const third = await handleRequest(req(), deps);
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: 'rate_limited' });
    advanceDay();
    expect((await handleRequest(req(), deps)).status).toBe(200);
  });
  it('401 and 400 do not count toward the limit', async () => {
    const { deps } = setup(undefined, 1);
    expect((await handleRequest(req({ token: 'bad' }), deps)).status).toBe(401);
    expect((await handleRequest(req({ body: { kind: 'text', text: '' } }), deps)).status).toBe(400);
    expect((await handleRequest(req(), deps)).status).toBe(200);
  });
});
