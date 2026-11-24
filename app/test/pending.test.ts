import { emptyDraft } from '../src/recipe/draft';
import { setDraft, setPendingImport, takeDraft, takePendingImport } from '../src/import/pending';

describe('pending', () => {
  it('take returns the value once', () => {
    expect(takePendingImport()).toBeNull();
    setPendingImport({ kind: 'url', url: 'https://x.sk' });
    expect(takePendingImport()).toEqual({ kind: 'url', url: 'https://x.sk' });
    expect(takePendingImport()).toBeNull();

    const d = { ...emptyDraft(), title: 'A' };
    setDraft(d);
    expect(takeDraft()).toBe(d);
    expect(takeDraft()).toBeNull();
  });
});
