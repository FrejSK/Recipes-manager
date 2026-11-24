import type { UnitCode } from './units';

export type Ingredient = {
  amount: number | null;
  amountMax: number | null;
  unit: UnitCode | null;
  name: string;
  note: string | null;
};

export type IngredientGroup = { name: string | null; items: Ingredient[] };

export type Category = { id: string; name: string; sortOrder: number };

export type Recipe = {
  id: string;
  title: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  ingredientGroups: IngredientGroup[];
  steps: string[];
  categoryIds: string[];
  notes: string | null;
  photo: string | null;
  sourceImages: string[];
  sourceUrl: string | null;
  sourceText: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecipeInput = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>;
