import { parseAmount } from '../src/recipe/parse-amount';

describe('parseAmount', () => {
  it('accepts decimal comma and dot', () => {
    expect(parseAmount('1,5')).toBe(1.5);
    expect(parseAmount(' 2.25 ')).toBe(2.25);
    expect(parseAmount('3')).toBe(3);
  });

  it('returns null for empty or invalid input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});
