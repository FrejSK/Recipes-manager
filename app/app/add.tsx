import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { setPendingImport, type PendingImport } from '../src/import/pending';

type Option = 'image' | 'text' | 'url';

const URL_RE = /^https?:\/\/\S+$/;

export default function AddScreen() {
  const router = useRouter();
  const [open, setOpen] = useState<Option | null>(null);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');

  const start = (p: PendingImport) => {
    setPendingImport(p);
    router.push('/import');
  };

  const openUrl = async () => {
    setOpen('url');
    try {
      const clip = (await Clipboard.getStringAsync()).trim();
      if (URL_RE.test(clip)) setUrl((prev) => (prev === '' ? clip : prev));
    } catch {
      // Clipboard is only a convenience.
    }
  };

  const fromGallery = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (res.canceled || res.assets.length === 0) return;
      start({ kind: 'images', uris: res.assets.map((a) => a.uri) });
    } catch {
      Alert.alert('Galériu sa nepodarilo otvoriť.');
    }
  };

  const fromCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Bez povolenia fotoaparátu sa nedá fotiť.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled || res.assets.length === 0) return;
      start({ kind: 'images', uris: res.assets.map((a) => a.uri) });
    } catch {
      Alert.alert('Fotoaparát sa nepodarilo otvoriť.');
    }
  };

  const trimmedText = text.trim();
  const trimmedUrl = url.trim();
  // A typed "www.recept.sk/…" has no scheme; the server only accepts http(s).
  const fullUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Pridať recept' }} />

      <Card title="Obrázok alebo screenshot" onPress={() => setOpen('image')} />
      {open === 'image' ? (
        <View style={styles.row}>
          <Button label="Z galérie" onPress={fromGallery} grow />
          <Button label="Odfotiť" onPress={fromCamera} grow />
        </View>
      ) : null}

      <Card title="Vložiť text" onPress={() => setOpen('text')} />
      {open === 'text' ? (
        <View style={styles.expanded}>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Sem vlož text receptu"
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            autoFocus
          />
          <Button
            label="Načítať"
            disabled={trimmedText === ''}
            onPress={() => start({ kind: 'text', text: trimmedText })}
          />
        </View>
      ) : null}

      <Card title="Vložiť odkaz" onPress={openUrl} />
      {open === 'url' ? (
        <View style={styles.expanded}>
          <TextInput
            style={styles.input}
            placeholder="https://…"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Button label="Načítať" disabled={trimmedUrl === ''} onPress={() => start({ kind: 'url', url: fullUrl })} />
        </View>
      ) : null}

      <Pressable accessibilityRole="link" style={styles.manual} onPress={() => router.push('/new')}>
        <Text style={styles.manualText}>Vyplniť ručne</Text>
      </Pressable>
    </ScrollView>
  );
}

function Card({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" style={styles.card} onPress={onPress}>
      <Text style={styles.cardTitle}>{title}</Text>
    </Pressable>
  );
}

function Button({
  label,
  onPress,
  disabled,
  grow,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  grow?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={[styles.button, grow && styles.grow, disabled && styles.buttonDisabled]}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  card: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    backgroundColor: '#f1f8e9',
  },
  cardTitle: { fontSize: 20, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12 },
  expanded: { gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  multiline: { minHeight: 160 },
  button: { padding: 14, borderRadius: 8, backgroundColor: '#2e7d32', alignItems: 'center' },
  grow: { flex: 1 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  manual: { alignSelf: 'center', padding: 12, marginTop: 8 },
  manualText: { color: '#2e7d32', textDecorationLine: 'underline', fontSize: 16 },
});
