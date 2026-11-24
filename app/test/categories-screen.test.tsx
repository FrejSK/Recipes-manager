import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import CategoriesScreen from '../app/categories';
import { DbContext, type Repos } from '../src/db/context';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

type Cat = { id: string; name: string; sortOrder: number };

function makeRepos(initial: Cat[]) {
  let cats = [...initial];
  const categories = {
    list: jest.fn(async () => [...cats]),
    create: jest.fn(async (name: string) => {
      const c = { id: String(cats.length + 100), name, sortOrder: cats.length };
      cats.push(c);
      return c;
    }),
    rename: jest.fn(async (id: string, name: string) => {
      cats = cats.map((c) => (c.id === id ? { ...c, name } : c));
    }),
    remove: jest.fn(async (id: string) => {
      cats = cats.filter((c) => c.id !== id);
    }),
  };
  return { repos: { categories, recipes: {}, settings: {} } as unknown as Repos, categories };
}

const base: Cat[] = [{ id: '1', name: 'Polievky', sortOrder: 0 }];

const renderScreen = (r: Repos) =>
  render(
    <DbContext.Provider value={r}>
      <CategoriesScreen />
    </DbContext.Provider>,
  );

describe('categories screen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('adds a category and shows it', async () => {
    const { repos, categories } = makeRepos(base);
    await renderScreen(repos);
    await screen.findByText('Polievky');
    await fireEvent.press(screen.getByText('Pridať kategóriu'));
    await fireEvent.changeText(screen.getByPlaceholderText('Názov kategórie'), 'Raňajky');
    await fireEvent.press(screen.getByText('Uložiť'));
    expect(await screen.findByText('Raňajky')).toBeTruthy();
    expect(categories.create).toHaveBeenCalledWith('Raňajky');
  });

  it('rejects duplicate names', async () => {
    const { repos, categories } = makeRepos([{ id: '1', name: 'Polievky', sortOrder: 0 }]);
    await renderScreen(repos);
    await screen.findByText('Polievky');
    await fireEvent.press(screen.getByText('Pridať kategóriu'));
    await fireEvent.changeText(screen.getByPlaceholderText('Názov kategórie'), 'polievky');
    await fireEvent.press(screen.getByText('Uložiť'));
    expect(await screen.findByText('Kategória s týmto názvom už existuje.')).toBeTruthy();
    expect(categories.create).not.toHaveBeenCalled();
  });

  it('rejects empty names', async () => {
    const { repos, categories } = makeRepos(base);
    await renderScreen(repos);
    await screen.findByText('Polievky');
    await fireEvent.press(screen.getByText('Pridať kategóriu'));
    await fireEvent.changeText(screen.getByPlaceholderText('Názov kategórie'), '   ');
    await fireEvent.press(screen.getByText('Uložiť'));
    expect(await screen.findByText('Zadaj názov kategórie.')).toBeTruthy();
    expect(categories.create).not.toHaveBeenCalled();
  });

  it('renames a category, allowing its own name', async () => {
    const { repos, categories } = makeRepos(base);
    await renderScreen(repos);
    await screen.findByText('Polievky');
    await fireEvent.press(screen.getByText('Premenovať'));
    await fireEvent.changeText(screen.getByPlaceholderText('Názov kategórie'), 'Polievočky');
    await fireEvent.press(screen.getByText('Uložiť'));
    expect(await screen.findByText('Polievočky')).toBeTruthy();
    expect(categories.rename).toHaveBeenCalledWith('1', 'Polievočky');
  });

  it('deletes after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { repos, categories } = makeRepos(base);
    await renderScreen(repos);
    await screen.findByText('Polievky');
    await fireEvent.press(screen.getByText('Zmazať'));
    expect(alert).toHaveBeenCalledWith(
      'Kategórie',
      'Zmazať kategóriu „Polievky“? Recepty v nej ostanú.',
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0][2]!;
    const destructive = buttons.find((b) => b.style === 'destructive')!;
    expect(buttons.find((b) => b.style === 'cancel')!.text).toBe('Zrušiť');
    await act(async () => {
      await destructive.onPress!();
    });
    expect(categories.remove).toHaveBeenCalledWith('1');
    expect(screen.queryByText('Polievky')).toBeNull();
  });
});
