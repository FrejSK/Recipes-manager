import type { ExtractResponse } from '@recipes/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ImportScreen from '../app/import';
import { DbContext, type Repos } from '../src/db/context';
import { setPendingImport, takeDraft, takePendingImport } from '../src/import/pending';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockRouter = { replace: mockReplace, back: mockBack };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Stack: { Screen: () => null },
}));
const mockExtract = jest.fn();
jest.mock('../src/import/extract-client', () => ({
  extractRecipe: (...args: unknown[]) => mockExtract(...args),
}));
const mockPrepare = jest.fn();
jest.mock('../src/import/prepare-images', () => ({
  prepareImages: (...args: unknown[]) => mockPrepare(...args),
}));

const categories = [
  { id: 'c1', name: 'Polievky', sortOrder: 0 },
  { id: 'c2', name: 'Dezerty', sortOrder: 1 },
];
const repos = {
  recipes: {},
  categories: { list: async () => categories },
  settings: {},
} as unknown as Repos;

const renderScreen = () =>
  render(
    <DbContext.Provider value={repos}>
      <ImportScreen />
    </DbContext.Provider>,
  );

const data: ExtractResponse = {
  recipe: {
    title: 'Palacinky',
    servings: 4,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    ingredientGroups: [],
    steps: ['Zmiešaj.'],
    categoryNames: ['Dezerty'],
  },
  photoUrl: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  takePendingImport();
  takeDraft();
});

describe('import screen', () => {
  it('shows the rate_limited message with retry and manual buttons', async () => {
    setPendingImport({ kind: 'text', text: 'recept' });
    mockExtract.mockResolvedValue({ ok: false, error: 'rate_limited' });
    await renderScreen();
    expect(
      await screen.findByText('Dnes sa už načítalo veľa receptov. Skús to zajtra alebo recept vyplň ručne.'),
    ).toBeTruthy();
    expect(screen.getByText('Skúsiť znova')).toBeTruthy();
    expect(screen.getByText('Vyplniť ručne')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('on success sets the draft and replaces with /new', async () => {
    setPendingImport({ kind: 'text', text: 'recept' });
    mockExtract.mockResolvedValue({ ok: true, data });
    await renderScreen();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/new'));
    expect(mockExtract).toHaveBeenCalledWith({ kind: 'text', text: 'recept', categories: ['Polievky', 'Dezerty'] });
    const draft = takeDraft();
    expect(draft?.title).toBe('Palacinky');
    expect(draft?.categoryIds).toEqual(['c2']);
    expect(draft?.sourceText).toBe('recept');
  });

  it('shows the loading text while reading', async () => {
    setPendingImport({ kind: 'url', url: 'https://recept.sk/a' });
    mockExtract.mockReturnValue(new Promise(() => {}));
    await renderScreen();
    expect(screen.getByText('Čítam recept…')).toBeTruthy();
  });

  it('goes back when there is nothing pending', async () => {
    await renderScreen();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('prepares images, retries the whole flow with the same input', async () => {
    setPendingImport({ kind: 'images', uris: ['file:///a.jpg'] });
    mockPrepare.mockResolvedValue([{ mediaType: 'image/jpeg', data: 'b64' }]);
    mockExtract.mockResolvedValueOnce({ ok: false, error: 'network' }).mockResolvedValueOnce({ ok: true, data });
    await renderScreen();
    await fireEvent.press(await screen.findByText('Skúsiť znova'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/new'));
    expect(mockPrepare).toHaveBeenCalledTimes(2);
    expect(mockPrepare).toHaveBeenCalledWith(['file:///a.jpg']);
    expect(mockExtract).toHaveBeenCalledTimes(2);
    expect(mockExtract).toHaveBeenLastCalledWith({
      kind: 'images',
      images: [{ mediaType: 'image/jpeg', data: 'b64' }],
      categories: ['Polievky', 'Dezerty'],
    });
    expect(takeDraft()?.sourceImages).toEqual([{ kind: 'local', uri: 'file:///a.jpg' }]);
  });

  it('shows image_too_long and fills manually with the images as originals', async () => {
    setPendingImport({ kind: 'images', uris: ['file:///a.jpg', 'file:///b.jpg'] });
    mockPrepare.mockRejectedValue(new Error('image_too_long'));
    await renderScreen();
    expect(await screen.findByText('Obrázok je príliš dlhý. Rozdeľ ho na viac screenshotov.')).toBeTruthy();
    expect(mockExtract).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Vyplniť ručne'));
    expect(mockReplace).toHaveBeenCalledWith('/new');
    const draft = takeDraft();
    expect(draft?.title).toBe('');
    expect(draft?.sourceImages).toEqual([
      { kind: 'local', uri: 'file:///a.jpg' },
      { kind: 'local', uri: 'file:///b.jpg' },
    ]);
  });

  it('maps any other prepareImages failure to the generic message', async () => {
    setPendingImport({ kind: 'images', uris: ['file:///a.jpg'] });
    mockPrepare.mockRejectedValue(new Error('decode failed'));
    await renderScreen();
    expect(await screen.findByText('Recept sa nepodarilo prečítať. Skús to znova alebo ho vyplň ručne.')).toBeTruthy();
  });

  it('fills manually with the source url for a url import', async () => {
    setPendingImport({ kind: 'url', url: 'https://facebook.com/x' });
    mockExtract.mockResolvedValue({ ok: false, error: 'url_unreadable' });
    await renderScreen();
    await fireEvent.press(await screen.findByText('Vyplniť ručne'));
    expect(takeDraft()?.sourceUrl).toBe('https://facebook.com/x');
  });

  it('does not navigate after unmount', async () => {
    setPendingImport({ kind: 'text', text: 'recept' });
    let resolve: (v: unknown) => void = () => {};
    mockExtract.mockReturnValue(new Promise((r) => (resolve = r)));
    const view = await renderScreen();
    await waitFor(() => expect(mockExtract).toHaveBeenCalled());
    await view.unmount();
    resolve({ ok: true, data });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(takeDraft()).toBeNull();
  });
});
