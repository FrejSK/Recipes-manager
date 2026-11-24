import {
  ERROR_STATUS,
  ExtractRequestSchema,
  type ExtractErrorCode,
  type ExtractRequest,
  type ExtractResponse,
} from '@recipes/core';
import { errorInfo } from './log';
import { checkAndCount, type KVLike } from './rate-limit';

export type ExtractResult = { ok: true; data: ExtractResponse } | { ok: false; error: ExtractErrorCode };
export type Extractor = (req: ExtractRequest) => Promise<ExtractResult>;

export interface HandlerDeps {
  appToken: string;
  dailyLimit: number;
  kv: KVLike;
  extract: Extractor;
  now: () => Date;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function errorResponse(code: ExtractErrorCode): Response {
  return json({ error: code }, ERROR_STATUS[code]);
}

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/extract') return json({ error: 'not_found' }, 404);

  if (!deps.appToken || request.headers.get('Authorization') !== `Bearer ${deps.appToken}`) {
    return errorResponse('unauthorized');
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse('bad_request');
  }
  const parsed = ExtractRequestSchema.safeParse(raw);
  if (!parsed.success) return errorResponse('bad_request');

  if (!(await checkAndCount(deps.kv, deps.dailyLimit, deps.now()))) return errorResponse('rate_limited');

  try {
    const result = await deps.extract(parsed.data);
    return result.ok ? json(result.data) : errorResponse(result.error);
  } catch (e) {
    console.error('extract_failed', errorInfo(e));
    return errorResponse('ai_failed');
  }
}
