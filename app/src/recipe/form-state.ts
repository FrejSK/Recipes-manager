import type { UnitCode } from '@recipes/core';

import type { ImageRef, RecipeDraft } from './draft';
import { parseAmount, parseInteger } from './parse-amount';

/** Editable form state: numbers are kept as typed text, list items carry stable keys. */
export type FormIngredient = {
  key: string;
  amount: string;
  amountMax: string;
  unit: UnitCode | null;
  name: string;
  note: string;
};
export type FormGroup = { key: string; name: string; items: FormIngredient[] };
export type FormStep = { key: string; text: string };
export type FormState = {
  title: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  totalMinutes: string;
  categoryIds: string[];
  groups: FormGroup[];
  steps: FormStep[];
  notes: string;
  photo: ImageRef | null;
};

let seq = 0;
export const newKey = (): string => `k${++seq}`;

const numText = (n: number | null): string => (n === null ? '' : String(n).replace('.', ','));
const orNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export const newIngredient = (): FormIngredient => ({
  key: newKey(),
  amount: '',
  amountMax: '',
  unit: null,
  name: '',
  note: '',
});
export const newGroup = (): FormGroup => ({ key: newKey(), name: '', items: [] });
export const newStep = (): FormStep => ({ key: newKey(), text: '' });

export function toFormState(d: RecipeDraft): FormState {
  return {
    title: d.title,
    servings: numText(d.servings),
    prepMinutes: numText(d.prepMinutes),
    cookMinutes: numText(d.cookMinutes),
    totalMinutes: numText(d.totalMinutes),
    categoryIds: d.categoryIds,
    groups: d.ingredientGroups.map((g) => ({
      key: newKey(),
      name: g.name ?? '',
      items: g.items.map((i) => ({
        key: newKey(),
        amount: numText(i.amount),
        amountMax: numText(i.amountMax),
        unit: i.unit,
        name: i.name,
        note: i.note ?? '',
      })),
    })),
    steps: d.steps.map((text) => ({ key: newKey(), text })),
    notes: d.notes ?? '',
    photo: d.photo,
  };
}

/** Builds a draft from the form; blank ingredient rows, blank steps and empty unnamed groups are dropped. */
export function fromFormState(f: FormState, base: RecipeDraft): RecipeDraft {
  const ingredientGroups = f.groups
    .map((g) => ({
      name: orNull(g.name),
      items: g.items
        .map((i) => ({
          amount: parseAmount(i.amount),
          amountMax: parseAmount(i.amountMax),
          unit: i.unit,
          name: i.name.trim(),
          note: orNull(i.note),
        }))
        .filter((i) => i.name !== '' || i.amount !== null),
    }))
    .filter((g) => g.name !== null || g.items.length > 0);
  return {
    ...base,
    title: f.title.trim(),
    servings: parseInteger(f.servings),
    prepMinutes: parseInteger(f.prepMinutes),
    cookMinutes: parseInteger(f.cookMinutes),
    totalMinutes: parseInteger(f.totalMinutes),
    categoryIds: f.categoryIds,
    ingredientGroups,
    steps: f.steps.map((s) => s.text.trim()).filter((s) => s !== ''),
    notes: orNull(f.notes),
    photo: f.photo,
  };
}
