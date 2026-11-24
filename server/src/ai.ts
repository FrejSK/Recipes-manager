import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Base64ImageSource, ContentBlockParam, MessageParam } from '@anthropic-ai/sdk/resources/messages';
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

// zodOutputFormat moves keywords that structured outputs do not support (e.g. the safe-integer
// minimum/maximum zod 4 emits for .int()) into the description; the type stays "integer".
const AiRecipeSchema = ExtractedRecipeSchema.extend({ isRecipe: z.boolean() });
type AiRecipe = z.infer<typeof AiRecipeSchema>;
const outputFormat = zodOutputFormat(AiRecipeSchema);

export const MODEL = 'claude-opus-5-5';

export type AiParams = {
  model: typeof MODEL;
  max_tokens: number;
  system: string;
  messages: MessageParam[];
  output_config: { effort: 'low'; format: typeof outputFormat };
};

/** The part of the Anthropic client this module uses; lets tests inject a fake. */
export interface ParseClient {
  messages: {
    parse(params: AiParams): Promise<{ stop_reason: string | null; parsed_output: AiRecipe | null }>;
  };
}

function userContent(input: AiInput, categories: string[]): ContentBlockParam[] {
  if (input.kind === 'text') return [{ type: 'text', text: textInstruction(input.text, categories) }];
  return [
    ...input.images.map(
      (img): ContentBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType as Base64ImageSource['media_type'], data: img.data },
      }),
    ),
    { type: 'text', text: imagesInstruction(categories) },
  ];
}

export function createClaudeAI(apiKey: string, client?: ParseClient): RecipeAI {
  const api: ParseClient = client ?? new Anthropic({ apiKey });
  return {
    async extract(input, categories) {
      try {
        const res = await api.messages.parse({
          model: MODEL,
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent(input, categories) }],
          output_config: { effort: 'low', format: outputFormat },
        });
        if (res.stop_reason === 'refusal' || !res.parsed_output) {
          // Visible in `wrangler tail`; stop_reason only, never the output.
          console.error('ai_failed', { stop_reason: res.stop_reason });
          return { ok: false, error: 'ai_failed' };
        }
        const { isRecipe, ...recipe } = res.parsed_output;
        if (!isRecipe) return { ok: false, error: 'not_a_recipe' };
        return { ok: true, recipe };
      } catch (e) {
        console.error('ai_failed', errorInfo(e));
        return { ok: false, error: 'ai_failed' };
      }
    },
  };
}
