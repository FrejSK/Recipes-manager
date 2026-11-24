import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { DbProvider } from '../src/db/context';

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
      </Stack>
    </DbProvider>
  );
}
