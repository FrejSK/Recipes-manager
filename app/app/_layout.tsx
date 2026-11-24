import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { DbProvider } from '../src/db/context';
import { ShareIntentHandler } from '../src/import/ShareIntentHandler';

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
  return (
    <DbProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Recepty', headerRight: () => <SettingsButton /> }} />
        <Stack.Screen name="settings" options={{ title: 'Nastavenia' }} />
        <Stack.Screen name="categories" options={{ title: 'Kategórie' }} />
      </Stack>
      {/* Inside DbProvider and after <Stack>: the share intent is only handled once the navigator exists. */}
      <ShareIntentHandler />
    </DbProvider>
  );
}
