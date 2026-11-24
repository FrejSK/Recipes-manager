import { z } from 'zod';
import { UNIT_CODES, type UnitCode } from './units';

const IngredientSchema = z.object({
  amount: z.number().nullable(),
  amountMax: z.number().nullable(),
  unit: z.enum(UNIT_CODES as readonly [UnitCode, ...UnitCode[]]).nullable(),
  name: z.string(),
  note: z.string().nullable(),
});

export const IngredientGroupSchema = z.object({
  name: z.string().nullable(),
  items: z.array(IngredientSchema),
});

export const ExtractedRecipeSchema = z.object({
  title: z.string(),
  servings: z.number().int().nullable(),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  totalMinutes: z.number().int().nullable(),
  ingredientGroups: z.array(IngredientGroupSchema),
  steps: z.array(z.string()),
  categoryNames: z.array(z.string()),
});
export type ExtractedRecipe = z.infer<typeof ExtractedRecipeSchema>;

const categories = z.array(z.string());

/** Most images (tiles) one extract request may carry. */
export const MAX_EXTRACT_IMAGES = 20;

export const ExtractRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('images'),
    images: z
      .array(z.object({ mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']), data: z.string() }))
      .min(1)
      .max(MAX_EXTRACT_IMAGES),
    categories,
  }),
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(100000), categories }),
  z.object({
    kind: z.literal('url'),
    url: z.string().refine((u) => {
      try {
        const p = new URL(u).protocol;
        return p === 'http:' || p === 'https:';
      } catch {
        return false;
      }
    }, 'must be an http(s) url'),
    categories,
  }),
]);
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

export type ExtractResponse = { recipe: ExtractedRecipe; photoUrl: string | null };

export type ExtractErrorCode =
  | 'bad_request' | 'unauthorized' | 'rate_limited' | 'not_a_recipe' | 'url_unreadable' | 'ai_failed';

export const ERROR_STATUS: Record<ExtractErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  rate_limited: 429,
  not_a_recipe: 422,
  url_unreadable: 422,
  ai_failed: 502,
};
