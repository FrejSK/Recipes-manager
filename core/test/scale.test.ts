import { describe, it, expect } from 'vitest';
import { formatIngredient } from '../src';
import type { Ingredient } from '../src';

const ing = (amount: number|null, unit: Ingredient['unit'], name = 'x', amountMax: number|null = null, note: string|null = null): Ingredient =>
  ({ amount, amountMax, unit, name, note });
const amt = (i: Ingredient, f: number) => formatIngredient(i, f).amountText;

describe('scaling', () => {
  it('keeps original values at factor 1', () => {
    expect(amt(ing(0.333, 'salka'), 1)).toBe('⅓ šálky');
    expect(amt(ing(800, 'g'), 1)).toBe('800 g');
  });
  it('rounds by unit', () => {
    expect(amt(ing(800, 'g'), 6 / 4)).toBe('1200 g');
    expect(amt(ing(250, 'g'), 1 / 3)).toBe('85 g');
    expect(amt(ing(15, 'g'), 1 / 2)).toBe('8 g');
    expect(amt(ing(1, 'CL'), 1.5)).toBe('1½ ČL');
    expect(amt(ing(3, null), 1 / 2)).toBe('1½');
    expect(amt(ing(1, 'ks'), 5 / 4)).toBe('1½ ks');
    expect(amt(ing(0.5, 'l'), 3)).toBe('1,5 l');
  });
  it('never rounds to zero', () => {
    expect(amt(ing(0.1, 'kg'), 1 / 4)).toBe('0,1 kg');
  });
  it('uses Slovak word forms after scaling', () => {
    expect(amt(ing(1, 'salka'), 2)).toBe('2 šálky');
    expect(amt(ing(1, 'salka'), 5)).toBe('5 šálok');
  });
  it('does not scale a pinch or an ingredient without amount', () => {
    expect(amt(ing(1, 'stipka'), 3)).toBe('1 štipka');
    expect(formatIngredient(ing(null, null, 'soľ', null, 'podľa chuti'), 2)).toEqual({ amountText: '', nameText: 'soľ (podľa chuti)' });
  });
  it('scales ranges', () => {
    expect(amt(ing(2, 'ks', 'x', 3), 2)).toBe('4–6 ks');
  });
});
