import { formatAmount } from '@recipes/core';
import { render, screen } from '@testing-library/react-native';

import HomeScreen from '../app/index';

describe('app skeleton', () => {
  it('renders the home screen title', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText('Recepty')).toBeTruthy();
  });

  it('resolves @recipes/core from the workspace', () => {
    expect(formatAmount(0.5, 'PL')).toBe('½');
  });
});
