import { useRootNavigationState, useRouter } from 'expo-router';
import { useShareIntent } from 'expo-share-intent';
import { useEffect, useRef } from 'react';

import { setPendingImport } from './pending';
import { shareToPending } from './share-intent';

/**
 * Turns a share (screenshot, link, text) from the system Share sheet into a pending import and opens
 * the import screen. Render it next to the root `<Stack>` (inside DbProvider) so the navigator exists.
 *
 * On a cold start the intent usually arrives before the root navigator is ready; it is held (not reset)
 * until the navigator has a state key, then pushed, and only then cleared.
 */
export function ShareIntentHandler(): null {
  const router = useRouter();
  const navigationKey = useRootNavigationState()?.key;
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  // The hook returns a new resetShareIntent every render and the reset lands a render later;
  // remember the intent already handled so it is never processed twice.
  const handled = useRef<unknown>(null);

  useEffect(() => {
    if (!hasShareIntent || !navigationKey) return;
    if (handled.current === shareIntent) return;
    handled.current = shareIntent;
    const pending = shareToPending(shareIntent);
    if (pending) {
      setPendingImport(pending);
      router.push('/import' as never);
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, navigationKey, resetShareIntent, router]);

  return null;
}
