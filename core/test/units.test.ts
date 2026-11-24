import { describe, it, expect } from 'vitest';
import { UNIT_CODES, UNITS, unitLabel } from '../src';

describe('units', () => {
  it('has exactly the 17 units from the spec', () => {
    expect(UNIT_CODES).toHaveLength(17);
  });
  it('picks Slovak word forms by value', () => {
    expect(unitLabel('salka', 1)).toBe('šálka');
    expect(unitLabel('salka', 3)).toBe('šálky');
    expect(unitLabel('salka', 5)).toBe('šálok');
    expect(unitLabel('salka', 1.5)).toBe('šálky');
    expect(unitLabel('platok', 0.5)).toBe('plátku');
    expect(unitLabel('CL', 2)).toBe('ČL');
  });
  it('does not scale a pinch', () => {
    expect(UNITS.stipka.scalable).toBe(false);
    expect(UNITS.g.scalable).toBe(true);
  });
});
