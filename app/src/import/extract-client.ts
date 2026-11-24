import {
  ERROR_STATUS,
  ExtractedRecipeSchema,
  type ExtractErrorCode,
  type ExtractRequest,
  type ExtractResponse,
} from '@recipes/core';

export type ClientErrorCode = ExtractErrorCode | 'network' | 'timeout' | 'image_too_long' | 'too_many_images';

export type ExtractResult = { ok: true; data: ExtractResponse } | { ok: false; error: ClientErrorCode };

export type ExtractOptions = {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Worker base URL without `/extract`, e.g. `https://recepty-extract.x.workers.dev`. */
  baseUrl?: string;
  token?: string;
};

const DEFAULT_TIMEOUT_MS = 90_000;

function isServerCode(v: unknown): v is ExtractErrorCode {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ERROR_STATUS, v);
}

export async function extractRecipe(req: ExtractRequest, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  // EXPO_PUBLIC_* must be read with literal dot access so Expo inlines them at build time.
  const baseUrl = (opts.baseUrl ?? process.env.EXPO_PUBLIC_EXTRACT_URL ?? '').replace(/\/+$/, '');
  const token = opts.token ?? process.env.EXPO_PUBLIC_APP_TOKEN ?? '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
    } catch {
      return { ok: false, error: controller.signal.aborted ? 'timeout' : 'network' };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // Body read was aborted, or it is not JSON (e.g. an HTML error page from a proxy).
      return { ok: false, error: controller.signal.aborted ? 'timeout' : 'ai_failed' };
    }

    if (!res.ok) {
      const code = (body as { error?: unknown } | null)?.error;
      return { ok: false, error: isServerCode(code) ? code : 'ai_failed' };
    }

    const data = body as Partial<ExtractResponse> | null;
    const recipe = ExtractedRecipeSchema.safeParse(data?.recipe);
    if (!recipe.success) return { ok: false, error: 'ai_failed' };
    const photoUrl = typeof data?.photoUrl === 'string' ? data.photoUrl : null;
    return { ok: true, data: { recipe: recipe.data, photoUrl } };
  } finally {
    clearTimeout(timer);
  }
}
