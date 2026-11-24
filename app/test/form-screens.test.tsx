import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import NewRecipe from '../app/new';
import EditRecipe from '../app/recipe/[id]/edit';
import { DbContext, type Repos } from '../src/db/context';
import { setDraft } from '../src/import/pending';
import { emptyDraft } from '../src/recipe/draft';

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => ({ id: 'r1' }),
  Stack: { Screen: () => null },
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
const mockSaveImage = jest.fn(async (_uri: string) => 'images/new.jpg');
const mockDeleteImages = jest.fn(async (_p: unknown) => {});
jest.mock('../src/files/images', () => ({
  imageUri: (p: string) => `file:///docs/${p}`,
  saveImage: (u: string) => mockSaveImage(u),
  deleteImages: (p: unknown) => mockDeleteImages(p),
}));

const existing = {
  ...emptyDraft(),
  id: 'r1',
  title: 'Koláč',
  photo: 'images/old.jpg',
  sourceImages: [] as string[],
  createdAt: '',
  updatedAt: '',
};

const create = jest.fn(async (input: object) => ({ ...input, id: 'new-id' }));
const update = jest.fn(async (id: string, input: object) => ({ ...input, id }));
const repos = {
  recipes: { create, update, get: async () => existing },
  categories: { list: async () => [{ id: 'c1', name: 'Polievky', sortOrder: 0 }] },
  settings: {},
} as unknown as Repos;

const renderWith = (el: React.ReactElement) => render(<DbContext.Provider value={repos}>{el}</DbContext.Provider>);

beforeEach(() => jest.clearAllMocks());

describe('form screens', () => {
  it('new screen uses the pending draft, shows originals and navigates to the recipe', async () => {
    setDraft({ ...emptyDraft(), title: 'Z importu', sourceImages: [{ kind: 'local', uri: 'file:///a.jpg' }] });
    await renderWith(<NewRecipe />);
    expect(await screen.findByDisplayValue('Z importu')).toBeTruthy();
    expect(screen.getAllByLabelText('Originál')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Uložiť'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/recipe/new-id'));
    expect(mockSaveImage).toHaveBeenCalledWith('file:///a.jpg');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ sourceImages: ['images/new.jpg'] }));
  });

  it('new screen starts empty without a pending draft', async () => {
    await renderWith(<NewRecipe />);
    expect(await screen.findByText('Uložiť')).toBeTruthy();
    expect(screen.getByLabelText('Názov').props.value).toBe('');
    expect(screen.queryByLabelText('Originál')).toBeNull();
  });

  it('edit screen saves changes and goes back', async () => {
    await renderWith(<EditRecipe />);
    await fireEvent.changeText(await screen.findByDisplayValue('Koláč'), 'Bábovka');
    await fireEvent.press(screen.getByText('Odstrániť fotku'));
    await fireEvent.press(screen.getByText('Uložiť'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith('r1', expect.objectContaining({ title: 'Bábovka', photo: null }));
    expect(mockDeleteImages).toHaveBeenCalledWith(['images/old.jpg']);
  });
});
