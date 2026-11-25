import { GoogleGenAI, ThinkingLevel, type Content, type GenerateContentConfig, type GenerateContentParameters, type Part } from '@google/genai';
import { ExtractedRecipeSchema, type ExtractedRecipe } from '@recipes/core';
import { z } from 'zod';
import { errorInfo } from './log';
import { SYSTEM_PROMPT, imagesInstruction, textInstruction } from './prompt';

export type AiInput =
  | { kind: 'images'; images: { mediaType: string; data: string }[] }
  | { kind: 'text'; text: string };

export type AiResult = { ok: true; recipe: ExtractedRecipe } | { ok: false; error: 'not_a_recipe' | 'ai_failed' };

export interface RecipeAI {
  extract(input: AiInput, categories: string[]): Promise<AiResult>;
}

/** Overridable without code changes through the GEMINI_MODEL var in wrangler.toml. */
export const DEFAULT_MODEL = 'gemini-3.6-flash';

/** Tried once after the primary model failed twice with a transient error; GEMINI_FALLBACK_MODEL, "" disables it. */
export const DEFAULT_FALLBACK_MODEL = 'gemini-3.8-flash';

/**
 * One deadline shared by all attempts and backoffs. URL imports: up to 15 s page fetch + this stays below
 * the app's 90 s abort, so the Worker still answers (and logs) ai_failed. The SDK itself does not retry
 * (no `retryOptions`); this module does.
 */
const REQUEST_TIMEOUT_MS = 70_000;
/** Pause before calling the primary model again. */
const RETRY_BACKOFF_MS = 1_000;
/** A further attempt starts only if at least this much of the deadline is left for it. */
const MIN_ATTEMPT_MS = 5_000;
/** HTTP statuses of transient API errors (rate limit, overload); anything else is final. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function isRetryable(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === 'number' && RETRYABLE_STATUSES.has(status);
}

const AiRecipeSchema = ExtractedRecipeSchema.extend({ isRecipe: z.boolean() });

// Keywords that `config.responseJsonSchema` accepts, per the @google/genai typings.
const SUPPORTED_KEYWORDS = new Set([
  '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum', 'items', 'prefixItems',
  'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf', 'properties', 'additionalProperties',
  'required', 'propertyOrdering',
]);

/**
 * Adapts zod's JSON Schema to the subset Gemini accepts: drops unsupported keywords (e.g. `$schema`),
 * drops the ±2^53 bounds zod emits for `.int()` (the type stays "integer"), and rewrites
 * `type: [T, "null"]` into `anyOf: [{type: T}, {type: "null"}]` so every nullable field has one form.
 */
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!SUPPORTED_KEYWORDS.has(key)) continue;
    if ((key === 'minimum' || key === 'maximum') && typeof value === 'number' && Math.abs(value) >= Number.MAX_SAFE_INTEGER) {
      continue;
    }
    if (key === 'properties' || key === '$defs') {
      out[key] = Object.fromEntries(Object.entries(value as object).map(([name, s]) => [name, toGeminiSchema(s)]));
    } else if (key === 'enum' || key === 'required' || key === 'propertyOrdering') {
      out[key] = value;
    } else {
      out[key] = toGeminiSchema(value);
    }
  }
  if (Array.isArray(out.type) && out.anyOf === undefined) {
    const { type, enum: values, ...rest } = out;
    const variants = (type as string[]).map((t) => (t === 'null' || values === undefined ? { type: t } : { type: t, enum: values }));
    return { ...rest, anyOf: variants };
  }
  return out;
}

const RESPONSE_JSON_SCHEMA = toGeminiSchema(z.toJSONSchema(AiRecipeSchema));

/** The request this module sends; narrows the SDK's union types so tests can inspect it. */
export type GeminiParams = GenerateContentParameters & { contents: Content[]; config: GenerateContentConfig };

/** The fields of the SDK's GenerateContentResponse this module reads. */
export interface GeminiResponseLike {
  text?: string | undefined;
  candidates?: { finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** The part of the GoogleGenAI client this module uses; lets tests inject a fake. */
export interface GenerateClient {
  models: { generateContent(params: GeminiParams): Promise<GeminiResponseLike> };
}

function userParts(input: AiInput, categories: string[]): Part[] {
  if (input.kind === 'text') return [{ text: textInstruction(input.text, categories) }];
  return [
    ...input.images.map((img): Part => ({ inlineData: { mimeType: img.mediaType, data: img.data } })),
    { text: imagesInstruction(categories) },
  ];
}

export interface GeminiOptions {
  /** Model tried once after two transient failures of the primary. undefined → DEFAULT_FALLBACK_MODEL, "" → none. */
  fallbackModel?: string;
  /** Injected in tests so retries never wait for real. */
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds clock for the shared deadline; injected in tests. */
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Gemini via an AI Studio key. A missing key fails each request with ai_failed instead of crashing the Worker.
 * Transient API errors (429, 5xx) are retried: primary, primary again after RETRY_BACKOFF_MS, then the
 * fallback model once, all within one REQUEST_TIMEOUT_MS deadline. Any other outcome ends the attempts.
 */
export function createGeminiAI(apiKey: string, model?: string, client?: GenerateClient, opts: GeminiOptions = {}): RecipeAI {
  const modelId = model || DEFAULT_MODEL;
  const fallbackId = opts.fallbackModel ?? DEFAULT_FALLBACK_MODEL;
  const plan = fallbackId && fallbackId !== modelId ? [modelId, modelId, fallbackId] : [modelId, modelId];
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;
  const fail = (info: Record<string, unknown>): AiResult => {
    // Visible in `wrangler tail`; never the request, the response text, or the key.
    console.error('ai_failed', info);
    return { ok: false, error: 'ai_failed' };
  };

  /** One call; SDK errors propagate so the caller can decide whether to retry. */
  async function attempt(api: GenerateClient, attemptModel: string, timeout: number, parts: Part[]): Promise<AiResult> {
    const res = await api.models.generateContent({
      model: attemptModel,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        // Extraction needs little reasoning; low thinking keeps latency down.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        httpOptions: { timeout },
      },
    });
    const finishReason = res.candidates?.[0]?.finishReason;
    const blockReason = res.promptFeedback?.blockReason;
    const text = res.text;
    if (blockReason || (finishReason !== undefined && finishReason !== 'STOP') || !text) {
      return fail({ finishReason, blockReason });
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return fail({ reason: 'invalid_json' });
    }
    const parsed = AiRecipeSchema.safeParse(json);
    if (!parsed.success) return fail({ reason: 'schema_mismatch' });
    const { isRecipe, ...recipe } = parsed.data;
    if (!isRecipe) return { ok: false, error: 'not_a_recipe' };
    return { ok: true, recipe };
  }

  return {
    async extract(input, categories) {
      try {
        if (!apiKey) return fail({ reason: 'missing_api_key' });
        const api: GenerateClient = client ?? new GoogleGenAI({ apiKey });
        const parts = userParts(input, categories);
        const deadline = now() + REQUEST_TIMEOUT_MS;
        let lastError: unknown;
        for (let i = 0; i < plan.length; i++) {
          if (i > 0) {
            // Same model again: give its overload a moment. A different model needs no pause.
            const backoff = plan[i] === plan[i - 1] ? RETRY_BACKOFF_MS : 0;
            if (deadline - now() - backoff < MIN_ATTEMPT_MS) break;
            if (backoff > 0) await sleep(backoff);
          }
          try {
            return await attempt(api, plan[i], deadline - now(), parts);
          } catch (e) {
            if (!isRetryable(e)) return fail(errorInfo(e));
            console.error('ai_retry', { model: plan[i], attempt: i + 1, ...errorInfo(e) });
            lastError = e;
          }
        }
        return fail(errorInfo(lastError));
      } catch (e) {
        return fail(errorInfo(e));
      }
    },
  };
}
