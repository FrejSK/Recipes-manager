import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeScreen from '../app/index';
import { DbContext, type Repos } from '../src/db/context';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (cb: () => void) => {
      React.useEffect(cb, []);
    },
  };
});
jest.mock('../src/files/images', () => ({ imageUri: (p: string) => `file:///docs/${p}` }));

function makeRepos(recipes: { id: string; title: string; photo: string | null; categoryIds: string[] }[]): Repos {
  return {
    recipes: { list: async () => recipes },
    categories: {
      list: async () => [
        { id: '1', name: 'Polievky', sortOrder: 0 },
        { id: '2', name: 'Hlavné jedlá', sortOrder: 1 },
      ],
    },
    settings: {},
  } as unknown as Repos;
}

const three = [
  { id: '1', title: 'Hovädzí guláš', photo: null, categoryIds: ['2'] },
  { id: '2', title: 'Paradajková polievka', photo: 'images/a.jpg', categoryIds: ['1'] },
  { id: '3', title: 'Kapustnica', photo: null, categoryIds: ['1'] },
];

const renderScreen = (r: Repos) =>
  render(
    <DbContext.Provider value={r}>
      <HomeScreen />
    </DbContext.Provider>,
  );

describe('list screen', () => {
  it('shows all recipes', async () => {
    await renderScreen(makeRepos(three));
    expect(await screen.findByText('Hovädzí guláš')).toBeTruthy();
    expect(screen.getByText('Paradajková polievka')).toBeTruthy();
    expect(screen.getByText('Kapustnica')).toBeTruthy();
  });

  it('filters by search text', async () => {
    await renderScreen(makeRepos(three));
    await screen.findByText('Kapustnica');
    await fireEvent.changeText(screen.getByPlaceholderText('Hľadať recept…'), 'gulas');
    expect(screen.getByText('Hovädzí guláš')).toBeTruthy();
    expect(screen.queryByText('Kapustnica')).toBeNull();
  });

  it('filters by category tab', async () => {
    await renderScreen(makeRepos(three));
    await screen.findByText('Kapustnica');
    await fireEvent.press(screen.getByText('Polievky'));
    expect(screen.queryByText('Hovädzí guláš')).toBeNull();
    expect(screen.getByText('Kapustnica')).toBeTruthy();
    await fireEvent.press(screen.getByText('Všetko'));
    expect(screen.getByText('Hovädzí guláš')).toBeTruthy();
  });

  it('shows empty state', async () => {
    await renderScreen(makeRepos([]));
    expect(
      await screen.findByText('Zatiaľ tu nie sú žiadne recepty. Pridaj prvý cez tlačidlo nižšie.'),
    ).toBeTruthy();
  });

  it('navigates to add and detail', async () => {
    await renderScreen(makeRepos(three));
    await fireEvent.press(await screen.findByText('Kapustnica'));
    expect(mockPush).toHaveBeenCalledWith('/recipe/3');
    await fireEvent.press(screen.getByText('Pridať recept'));
    expect(mockPush).toHaveBeenCalledWith('/add');
  });

  it('navigates to categories via the Upraviť chip', async () => {
    await renderScreen(makeRepos(three));
    await fireEvent.press(await screen.findByText('Upraviť'));
    expect(mockPush).toHaveBeenCalledWith('/categories');
  });
});
