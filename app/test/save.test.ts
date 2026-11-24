/** @jest-environment node */
import { migrate } from '../src/db/migrations';
import { createRecipesRepo } from '../src/db/recipes-repo';
import { createSettingsRepo } from '../src/db/settings-repo';
import { emptyDraft, recipeToDraft, type RecipeDraft } from '../src/recipe/draft';
import { saveDraft } from '../src/recipe/save';
import { createNodeDb } from './sqlite-node';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('crypto').randomUUID() }));

async function setup() {
  const db = createNodeDb();
  await migrate(db);
  const recipes = createRecipesRepo(db, createSettingsRepo(db));
  let n = 0;
  const saveImage = jest.fn(async (uri: string) => {
    if (uri.includes('broken')) throw new Error('save failed');
    n += 1;
    return `images/saved-${n}.jpg`;
  });
  const deleteImages = jest.fn(async (_paths: (string | null)[]) => {});
  return { recipes, saveImage, deleteImages, deps: { recipes, saveImage, deleteImages } };
}

const draft = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({ ...emptyDraft(), title: 'Guláš', ...over });

describe('saveDraft', () => {
  it('stores local and remote images as relative paths', async () => {
    const { recipes, saveImage, deps } = await setup();
    const saved = await saveDraft(
      draft({
        photo: { kind: 'remote', url: 'https://x.sk/p.jpg' },
        sourceImages: [{ kind: 'local', uri: 'file:///cache/a.jpg' }],
      }),
      null,
      deps,
    );
    expect(saveImage).toHaveBeenCalledWith('https://x.sk/p.jpg');
    expect(saveImage).toHaveBeenCalledWith('file:///cache/a.jpg');
    const stored = await recipes.get(saved.id);
    expect(stored?.photo).toMatch(/^images\//);
    expect(stored?.sourceImages).toHaveLength(1);
    expect(stored?.sourceImages[0]).toMatch(/^images\//);
    expect(stored?.title).toBe('Guláš');
  });

  it('saves without photo when remote download fails', async () => {
    const { recipes, deps } = await setup();
    const saved = await saveDraft(draft({ photo: { kind: 'remote', url: 'https://broken/p.jpg' } }), null, deps);
    const stored = await recipes.get(saved.id);
    expect(stored).not.toBeNull();
    expect(stored?.photo).toBeNull();
  });

  it('fails when a local source image cannot be saved and cleans up', async () => {
    const { recipes, deleteImages, deps } = await setup();
    await expect(
      saveDraft(
        draft({
          photo: { kind: 'local', uri: 'file:///ok.jpg' },
          sourceImages: [{ kind: 'local', uri: 'file:///broken.jpg' }],
        }),
        null,
        deps,
      ),
    ).rejects.toThrow();
    expect(await recipes.count()).toBe(0);
    expect(deleteImages).toHaveBeenCalledWith(['images/saved-1.jpg']);
  });

  it('keeps stored images and deletes removed ones on update', async () => {
    const { recipes, saveImage, deleteImages, deps } = await setup();
    const created = await recipes.create({
      ...draft(),
      photo: 'images/old.jpg',
      sourceImages: ['images/src.jpg'],
    });
    const d = recipeToDraft(created);
    const updated = await saveDraft({ ...d, photo: null, title: 'Nový' }, created.id, deps);
    expect(updated.id).toBe(created.id);
    expect(saveImage).not.toHaveBeenCalled();
    expect(deleteImages).toHaveBeenCalledWith(['images/old.jpg']);
    const stored = await recipes.get(created.id);
    expect(stored?.photo).toBeNull();
    expect(stored?.sourceImages).toEqual(['images/src.jpg']);
    expect(stored?.title).toBe('Nový');
  });

  it('does not delete anything when images are unchanged', async () => {
    const { recipes, deleteImages, deps } = await setup();
    const created = await recipes.create({ ...draft(), photo: 'images/old.jpg', sourceImages: [] });
    await saveDraft(recipeToDraft(created), created.id, deps);
    expect(deleteImages).not.toHaveBeenCalled();
  });
});
