import { createGeminiAI, DEFAULT_MODEL } from './ai';
import { extract } from './extract';
import { fetchPage } from './fetch-page';
import { handleRequest } from './handler';
import type { KVLike } from './rate-limit';

export interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  /** Unset → DEFAULT_FALLBACK_MODEL, "" → no fallback. */
  GEMINI_FALLBACK_MODEL?: string;
  APP_TOKEN: string;
  DAILY_LIMIT: string;
  LIMITS: KVLike;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const ai = createGeminiAI(env.GEMINI_API_KEY, env.GEMINI_MODEL || DEFAULT_MODEL, undefined, {
      fallbackModel: env.GEMINI_FALLBACK_MODEL,
    });
    return handleRequest(request, {
      appToken: env.APP_TOKEN,
      dailyLimit: Number.parseInt(env.DAILY_LIMIT, 10) || 50,
      kv: env.LIMITS,
      extract: (req) => extract(req, { ai, fetchPage }),
      now: () => new Date(),
    });
  },
};
