import { render } from '@testing-library/react-native';

import { takePendingImport } from '../src/import/pending';
import { ShareIntentHandler } from '../src/import/ShareIntentHandler';

// Ordered log of side effects, to check that the intent is reset only after the push.
const mockLog: string[] = [];
const mockNav: { state: { key?: string } | undefined } = { state: undefined };
type Intent = { files: { path: string; mimeType: string }[] | null; text: string | null; webUrl: string | null };
const EMPTY: Intent = { files: null, text: null, webUrl: null };
const mockShare: { intent: Intent } = { intent: EMPTY };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (href: string) => mockLog.push(`push ${href}`) }),
  useRootNavigationState: () => mockNav.state,
}));
jest.mock('expo-share-intent', () => ({
  useShareIntent: () => ({
    hasShareIntent: !!(mockShare.intent.files || mockShare.intent.text || mockShare.intent.webUrl),
    shareIntent: mockShare.intent,
    // A new function each render, like the real hook.
    resetShareIntent: () => mockLog.push('reset'),
  }),
}));

beforeEach(() => {
  mockLog.length = 0;
  mockNav.state = undefined;
  mockShare.intent = EMPTY;
  takePendingImport();
});

describe('ShareIntentHandler', () => {
  it('holds an intent that arrives before navigation is ready and pushes it once ready', async () => {
    mockShare.intent = { files: [{ path: 'file:///s.png', mimeType: 'image/png' }], text: null, webUrl: null };
    const { rerender } = await render(<ShareIntentHandler />);
    // Navigator not mounted yet (state undefined, then a state without key): nothing happens, nothing is lost.
    expect(mockLog).toEqual([]);
    mockNav.state = {};
    await rerender(<ShareIntentHandler />);
    expect(mockLog).toEqual([]);

    mockNav.state = { key: 'stack-1' };
    await rerender(<ShareIntentHandler />);
    expect(mockLog).toEqual(['push /import', 'reset']);
    expect(takePendingImport()).toEqual({ kind: 'images', uris: ['file:///s.png'] });
  });

  it('resets the intent only after the push was issued, and processes it once', async () => {
    mockNav.state = { key: 'stack-1' };
    mockShare.intent = { files: null, text: 'Guláš\nhttps://x.sk/r', webUrl: 'https://x.sk/r' };
    const { rerender } = await render(<ShareIntentHandler />);
    expect(mockLog).toEqual(['push /import', 'reset']);
    expect(takePendingImport()).toEqual({ kind: 'url', url: 'https://x.sk/r' });

    // Re-renders before the reset propagates must not push the same intent again.
    await rerender(<ShareIntentHandler />);
    await rerender(<ShareIntentHandler />);
    expect(mockLog).toEqual(['push /import', 'reset']);

    // A later, new share is handled.
    mockShare.intent = EMPTY;
    await rerender(<ShareIntentHandler />);
    mockShare.intent = { files: null, text: null, webUrl: 'https://y.sk/r' };
    await rerender(<ShareIntentHandler />);
    expect(mockLog).toEqual(['push /import', 'reset', 'push /import', 'reset']);
    expect(takePendingImport()).toEqual({ kind: 'url', url: 'https://y.sk/r' });
  });

  it('silently resets an intent that maps to nothing (e.g. a PDF)', async () => {
    mockNav.state = { key: 'stack-1' };
    mockShare.intent = { files: [{ path: 'file:///a.pdf', mimeType: 'application/pdf' }], text: null, webUrl: null };
    await render(<ShareIntentHandler />);
    expect(mockLog).toEqual(['reset']);
    expect(takePendingImport()).toBeNull();
  });

  it('does nothing without a share intent', async () => {
    mockNav.state = { key: 'stack-1' };
    await render(<ShareIntentHandler />);
    expect(mockLog).toEqual([]);
  });
});
