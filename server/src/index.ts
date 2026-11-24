import { createClaudeAI } from './ai';
import { extract } from './extract';
import { fetchPage } from './fetch-page';
import { handleRequest } from './handler';
import type { KVLike } from './rate-limit';

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_TOKEN: string;
  DAILY_LIMIT: string;
  LIMITS: KVLike;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const ai = createClaudeAI(env.ANTHROPIC_API_KEY);
    return handleRequest(request, {
      appToken: env.APP_TOKEN,
      dailyLimit: Number.parseInt(env.DAILY_LIMIT, 10) || 50,
      kv: env.LIMITS,
      extract: (req) => extract(req, { ai, fetchPage }),
      now: () => new Date(),
    });
  },
};
