import { UNITS, unitLabel } from './units';
import type { UnitCode } from './units';
import type { Ingredient } from './recipe';

const clean = (n: number): number => Math.round(n * 100) / 100;

function roundingStep(value: number, unit: UnitCode | null): number {
  switch (unit) {
    case 'g':
    case 'ml':
      return value < 20 ? 1 : value < 100 ? 5 : 10;
    case 'kg':
    case 'l':
    case 'dl':
      return 0.1;
    case 'PL':
    case 'CL':
    case 'KL':
    case 'salka':
    case 'hrncek':
      return 0.25;
    default:
      return 0.5;
  }
}

function scaleValue(value: number, unit: UnitCode | null, factor: number): number {
  const scaled = value * factor;
  const step = roundingStep(scaled, unit);
  const rounded = Math.round(Number((scaled / step).toFixed(9))) * step;
  return clean(rounded === 0 && scaled !== 0 ? step : rounded);
}

export function scaleIngredient(item: Ingredient, factor: number): Ingredient {
  if (factor === 1 || item.amount === null) return item;
  if (item.unit !== null && !UNITS[item.unit].scalable) return item;
  return {
    ...item,
    amount: scaleValue(item.amount, item.unit, factor),
    amountMax: item.amountMax === null ? null : scaleValue(item.amountMax, item.unit, factor),
  };
}

const GLYPHS: ReadonlyArray<[number, string]> = [
  [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'],
];

const decimal = (n: number): string => String(clean(n)).replace('.', ',');

export function formatAmount(value: number, unit: UnitCode | null): string {
  if (unit !== null && UNITS[unit].kind === 'metric') return decimal(value);
  let whole = Math.floor(value);
  const frac = value - whole;
  if (frac > 0.99) whole += 1;
  else if (frac >= 0.01) {
    const glyph = GLYPHS.find(([v]) => Math.abs(frac - v) <= 0.01);
    if (glyph) return (whole > 0 ? String(whole) : '') + glyph[1];
    return decimal(value);
  }
  return String(whole);
}

export function formatIngredient(item: Ingredient, factor: number): { amountText: string; nameText: string } {
  const s = scaleIngredient(item, factor);
  let amountText = '';
  if (s.amount !== null) {
    amountText = formatAmount(s.amount, s.unit);
    if (s.amountMax !== null) amountText += '–' + formatAmount(s.amountMax, s.unit);
    if (s.unit !== null) amountText += ' ' + unitLabel(s.unit, s.amountMax ?? s.amount);
  }
  const nameText = s.note ? `${s.name} (${s.note})` : s.name;
  return { amountText, nameText };
}
