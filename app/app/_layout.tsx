import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useShareIntent } from 'expo-share-intent';
import { useEffect } from 'react';
import { Pressable } from 'react-native';

import { DbProvider } from '../src/db/context';
import { setPendingImport } from '../src/import/pending';
import { shareToPending } from '../src/import/share-intent';

function SettingsButton() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nastavenia"
      hitSlop={8}
      onPress={() => router.push('/settings' as never)}
    >
      <Ionicons name="settings-outline" size={24} />
    </Pressable>
  );
}

export default function RootLayout() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  useEffect(() => {
    if (!hasShareIntent) return;
    const pending = shareToPending(shareIntent);
    // Reset first so the same intent is never processed twice.
    resetShareIntent();
    if (pending) {
      setPendingImport(pending);
      router.push('/import' as never);
    }
  }, [hasShareIntent, shareIntent, resetShareIntent, router]);

  return (
    <DbProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Recepty', headerRight: () => <SettingsButton /> }} />
      </Stack>
    </DbProvider>
  );
}
