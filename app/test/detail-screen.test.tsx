import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import RecipeDetail from '../app/recipe/[id]';
import { DbContext, type Repos } from '../src/db/context';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: 'r1' }),
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => unknown } }) =>
      options?.headerRight ? options.headerRight() : null,
  },
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
const mockDelete = jest.fn(async (_p?: unknown) => {});
jest.mock('../src/files/images', () => ({
  imageUri: (p: string) => `file:///docs/${p}`,
  deleteImages: (p: unknown) => mockDelete(p),
}));

const base = {
  id: 'r1',
  title: 'Koláč',
  servings: 4 as number | null,
  prepMinutes: null,
  cookMinutes: null,
  totalMinutes: 90 as number | null,
  ingredientGroups: [
    {
      name: 'Na cesto',
      items: [
        { name: 'múka', amount: 800, amountMax: null, unit: 'g', note: null },
        { name: 'soľ', amount: null, amountMax: null, unit: null, note: 'podľa chuti' },
      ],
    },
  ],
  steps: ['Zmiešaj.', 'Upeč.'],
  categoryIds: ['1', '2'],
  notes: null as string | null,
  photo: 'images/p.jpg' as string | null,
  sourceImages: [] as string[],
  sourceUrl: null as string | null,
  sourceText: null,
  createdAt: '',
  updatedAt: '',
};

const remove = jest.fn();
function renderScreen(recipe: unknown) {
  const repos = {
    recipes: { get: async () => recipe, remove },
    categories: {
      list: async () => [
        { id: '1', name: 'Dezerty', sortOrder: 0 },
        { id: '2', name: 'Sladké', sortOrder: 1 },
      ],
    },
    settings: {},
  } as unknown as Repos;
  return render(
    <DbContext.Provider value={repos}>
      <RecipeDetail />
    </DbContext.Provider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('detail screen', () => {
  it('scales ingredients with portions', async () => {
    await renderScreen(base);
    expect(await screen.findByText('800 g')).toBeTruthy();
    expect(screen.getByText('Na cesto')).toBeTruthy();
    expect(screen.getByText('Dezerty · Sladké')).toBeTruthy();
    expect(screen.getByText('1 h 30 min')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Viac porcií'));
    await fireEvent.press(screen.getByLabelText('Viac porcií'));
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('1200 g')).toBeTruthy();
  });

  it('does not go below 1 portion', async () => {
    await renderScreen({ ...base, servings: 1 });
    await screen.findByText('Porcie:');
    await fireEvent.press(screen.getByLabelText('Menej porcií'));
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('navigates to edit', async () => {
    await renderScreen(base);
    await fireEvent.press(await screen.findByText('Upraviť'));
    expect(mockPush).toHaveBeenCalledWith('/recipe/r1/edit');
  });

  it('hides portion controls when servings is null', async () => {
    await renderScreen({ ...base, servings: null });
    expect(await screen.findByText('soľ (podľa chuti)')).toBeTruthy();
    expect(screen.queryByLabelText('Viac porcií')).toBeNull();
    expect(screen.queryByText('Porcie:')).toBeNull();
  });

  it('shows not found', async () => {
    await renderScreen(null);
    expect(await screen.findByText('Recept sa nenašiel.')).toBeTruthy();
  });

  it('confirms and deletes with images', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    remove.mockResolvedValue({ ...base, sourceImages: ['images/s.jpg'] });
    await renderScreen(base);
    await screen.findByText('800 g');
    await fireEvent.press(screen.getByText('Zmazať'));
    expect(spy).toHaveBeenCalledWith('Zmazať recept „Koláč“?', undefined, expect.any(Array));
    const buttons = spy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((b) => b.text)).toEqual(['Zrušiť', 'Zmazať']);
    await act(async () => {
      await buttons[1].onPress?.();
    });
    expect(remove).toHaveBeenCalledWith('r1');
    expect(mockDelete).toHaveBeenCalledWith(['images/p.jpg', 'images/s.jpg']);
    expect(mockBack).toHaveBeenCalled();
  });

  it('opens source link and original image', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await renderScreen({ ...base, sourceUrl: 'https://x.sk/r', sourceImages: ['images/s.jpg'] });
    await fireEvent.press(await screen.findByText('https://x.sk/r'));
    expect(open).toHaveBeenCalledWith('https://x.sk/r');
    expect(screen.getByText('Originál')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Zobraziť originál'));
    expect(screen.getByText('Zavrieť')).toBeTruthy();
  });
});
