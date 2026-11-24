import type { Category } from '@recipes/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { emptyDraft, type RecipeDraft } from '../src/recipe/draft';
import { RecipeForm } from '../src/ui/RecipeForm';

jest.mock('../src/files/images', () => ({ imageUri: (p: string) => `file:///docs/${p}` }));
const mockLaunch = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunch(...args),
}));

const categories: Category[] = [
  { id: 'c1', name: 'Polievky', sortOrder: 0 },
  { id: 'c2', name: 'Hlavné jedlá', sortOrder: 1 },
];

async function setup(initial: RecipeDraft = emptyDraft(), onSave = jest.fn(async (_d: RecipeDraft) => {})) {
  await render(<RecipeForm initial={initial} categories={categories} onSave={onSave} />);
  return onSave;
}

beforeEach(() => jest.clearAllMocks());

describe('RecipeForm', () => {
  it('requires a title', async () => {
    const onSave = await setup();
    await fireEvent.press(screen.getByText('Uložiť'));
    expect(await screen.findByText('Recept musí mať názov.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('parses decimal comma in amounts', async () => {
    const onSave = await setup();
    await fireEvent.changeText(screen.getByLabelText('Názov'), 'Palacinky');
    await fireEvent.press(screen.getByText('Pridať surovinu'));
    await fireEvent.changeText(screen.getByPlaceholderText('Množstvo'), '1,5');
    await fireEvent.changeText(screen.getByPlaceholderText('Názov'), 'mlieko');
    await fireEvent.press(screen.getByText('Uložiť'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const d = onSave.mock.calls[0][0];
    expect(d.title).toBe('Palacinky');
    expect(d.ingredientGroups[0].items[0]).toEqual({
      amount: 1.5,
      amountMax: null,
      unit: null,
      name: 'mlieko',
      note: null,
    });
  });

  it('edits servings, unit, categories and steps', async () => {
    const onSave = await setup({ ...emptyDraft(), title: 'Guláš' });
    await fireEvent.changeText(screen.getByLabelText('Porcie'), '4');
    await fireEvent.press(screen.getByText('Polievky'));
    await fireEvent.press(screen.getByText('Pridať surovinu'));
    await fireEvent.changeText(screen.getByPlaceholderText('Názov'), 'mäso');
    await fireEvent.press(screen.getByLabelText('Jednotka'));
    await fireEvent.press(screen.getByText('ČL'));
    await fireEvent.press(screen.getByText('Pridať krok'));
    await fireEvent.press(screen.getByText('Pridať krok'));
    const steps = screen.getAllByPlaceholderText(/^Krok/);
    await fireEvent.changeText(steps[0], 'Prvý');
    await fireEvent.changeText(steps[1], 'Druhý');
    await fireEvent.press(screen.getAllByLabelText('Posunúť hore')[1]);
    await fireEvent.press(screen.getByText('Uložiť'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const d = onSave.mock.calls[0][0];
    expect(d.servings).toBe(4);
    expect(d.categoryIds).toEqual(['c1']);
    expect(d.ingredientGroups[0].items[0].unit).toBe('CL');
    expect(d.steps).toEqual(['Druhý', 'Prvý']);
  });

  it('picks a photo from the gallery', async () => {
    mockLaunch.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picked.jpg' }] });
    const onSave = await setup({ ...emptyDraft(), title: 'Guláš' });
    await fireEvent.press(screen.getByText('Vybrať z galérie'));
    await screen.findByText('Odstrániť fotku');
    expect(mockLaunch).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.8 });
    await fireEvent.press(screen.getByText('Uložiť'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].photo).toEqual({ kind: 'local', uri: 'file:///picked.jpg' });
  });

  it('shows an error when saving fails', async () => {
    const onSave = jest.fn(async (_d: RecipeDraft) => {
      throw new Error('boom');
    });
    await setup({ ...emptyDraft(), title: 'Guláš' }, onSave);
    await fireEvent.press(screen.getByText('Uložiť'));
    expect(await screen.findByText('Recept sa nepodarilo uložiť.')).toBeTruthy();
  });

  it('shows originals strip', async () => {
    await render(
      <RecipeForm
        initial={{ ...emptyDraft(), title: 'X' }}
        categories={categories}
        onSave={async () => {}}
        originals={[{ kind: 'local', uri: 'file:///a.jpg' }]}
      />,
    );
    expect(screen.getAllByLabelText('Originál')).toHaveLength(1);
  });
});
