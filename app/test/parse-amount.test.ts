import { parseAmount, parseInteger } from '../src/recipe/parse-amount';

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

describe('parseInteger', () => {
  it('rounds to a whole number', () => {
    expect(parseInteger('4')).toBe(4);
    expect(parseInteger('2,6')).toBe(3);
    expect(parseInteger('0')).toBe(0);
    expect(parseInteger('100000')).toBe(100000);
  });

  it('returns null outside 0..100000, so a backup can always be restored', () => {
    expect(parseInteger('-1')).toBeNull();
    expect(parseInteger('-0,4')).toBeNull();
    expect(parseInteger('100001')).toBeNull();
    expect(parseInteger('1e9')).toBeNull();
    expect(parseInteger('Infinity')).toBeNull();
    expect(parseInteger('')).toBeNull();
  });
});
