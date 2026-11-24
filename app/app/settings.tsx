import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { exportBackup, restoreBackup } from '../src/backup/actions';
import { BackupFormatError } from '../src/backup/format';
import { formatDate } from '../src/backup/format-date';
import { useRepos } from '../src/db/context';

export default function SettingsScreen() {
  const router = useRouter();
  const repos = useRepos();
  const { settings } = repos;
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setLastBackupAt(await settings.get('lastBackupAt'));
    } catch {
      setLastBackupAt(null);
    }
  }, [settings]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const run = async (op: () => Promise<void>, fallback: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await op();
    } catch (e) {
      Alert.alert('Záloha', e instanceof BackupFormatError ? e.message : fallback);
    } finally {
      busyRef.current = false;
      setBusy(false);
      await refresh();
    }
  };

  const onBackup = () => run(() => exportBackup(repos), 'Zálohu sa nepodarilo vytvoriť.');

  const onRestore = () =>
    run(async () => {
      const result = await restoreBackup(repos);
      if (result === 'restored') Alert.alert('Záloha', 'Recepty boli obnovené.');
    }, 'Zálohu sa nepodarilo obnoviť.');

  const last = lastBackupAt ? new Date(lastBackupAt) : null;
  const lastText =
    last && !Number.isNaN(last.getTime()) ? `Posledná záloha: ${formatDate(last)}` : 'Zatiaľ žiadna záloha';

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.section}>
        <Text style={styles.heading}>Záloha</Text>
        <Text style={styles.muted}>{lastText}</Text>
      </View>
      <Pressable style={[styles.row, busy && styles.disabled]} disabled={busy} onPress={() => void onBackup()}>
        <Text>Zálohovať recepty</Text>
      </Pressable>
      <Pressable style={[styles.row, busy && styles.disabled]} disabled={busy} onPress={() => void onRestore()}>
        <Text>Obnoviť zo zálohy</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/categories' as never)}>
        <Text>Kategórie</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 4 },
  heading: { fontWeight: '600', fontSize: 16 },
  muted: { color: '#666' },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  disabled: { opacity: 0.5 },
});
