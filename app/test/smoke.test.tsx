import { formatAmount } from '@recipes/core';

describe('app skeleton', () => {
  it('resolves @recipes/core from the workspace', () => {
    expect(formatAmount(0.5, 'PL')).toBe('½');
  });
});
