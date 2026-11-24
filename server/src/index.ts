import { handleRequest, type Extractor } from './handler';
import type { KVLike } from './rate-limit';

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_TOKEN: string;
  DAILY_LIMIT: string;
  LIMITS: KVLike;
}

// Stub; replaced by the real extractor in Task 6.
const extract: Extractor = async () => ({ ok: false, error: 'ai_failed' });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, {
      appToken: env.APP_TOKEN,
      dailyLimit: Number.parseInt(env.DAILY_LIMIT, 10) || 50,
      kv: env.LIMITS,
      extract,
      now: () => new Date(),
    });
  },
};
