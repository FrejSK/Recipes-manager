import { formatAmount } from '@recipes/core';
import { render, screen } from '@testing-library/react-native';

import HomeScreen from '../app/index';
import { DbContext, type Repos } from '../src/db/context';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      React.useEffect(cb, []);
    },
  };
});
jest.mock('../src/files/images', () => ({ imageUri: (p: string) => `file:///docs/${p}` }));

const emptyRepos = {
  recipes: { list: async () => [] },
  categories: { list: async () => [] },
  settings: {},
} as unknown as Repos;

describe('app skeleton', () => {
  it('renders the home screen', async () => {
    await render(
      <DbContext.Provider value={emptyRepos}>
        <HomeScreen />
      </DbContext.Provider>,
    );
    expect(screen.getByText('Pridať recept')).toBeTruthy();
  });

  it('resolves @recipes/core from the workspace', () => {
    expect(formatAmount(0.5, 'PL')).toBe('½');
  });
});
