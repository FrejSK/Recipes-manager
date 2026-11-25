import { GoogleGenAI, type Content, type GenerateContentConfig, type GenerateContentParameters, type Part } from '@google/genai';
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
export const DEFAULT_MODEL = 'gemini-3.8-flash';

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

/** Gemini via an AI Studio key. A missing key fails each request with ai_failed instead of crashing the Worker. */
export function createGeminiAI(apiKey: string, model?: string, client?: GenerateClient): RecipeAI {
  const modelId = model || DEFAULT_MODEL;
  const fail = (info: Record<string, unknown>): AiResult => {
    // Visible in `wrangler tail`; never the request, the response text, or the key.
    console.error('ai_failed', info);
    return { ok: false, error: 'ai_failed' };
  };
  return {
    async extract(input, categories) {
      try {
        if (!apiKey) return fail({ reason: 'missing_api_key' });
        const api: GenerateClient = client ?? new GoogleGenAI({ apiKey });
        const res = await api.models.generateContent({
          model: modelId,
          contents: [{ role: 'user', parts: userParts(input, categories) }],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseJsonSchema: RESPONSE_JSON_SCHEMA,
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
      } catch (e) {
        return fail(errorInfo(e));
      }
    },
  };
}
