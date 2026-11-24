import { shouldRemindBackup } from '@recipes/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { exportBackup } from '../backup/actions';
import { useRepos } from '../db/context';

function toDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function BackupBanner() {
  const repos = useRepos();
  const { recipes, settings } = repos;
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [installedAt, lastBackupAt, lastDismissedAt, lastChangeAt, recipeCount] = await Promise.all([
            settings.get('installedAt'),
            settings.get('lastBackupAt'),
            settings.get('lastBackupDismissedAt'),
            settings.get('lastRecipeChangeAt'),
            recipes.count(),
          ]);
          const now = new Date();
          const show = shouldRemindBackup({
            now,
            installedAt: toDate(installedAt) ?? now,
            lastBackupAt: toDate(lastBackupAt),
            lastDismissedAt: toDate(lastDismissedAt),
            lastChangeAt: toDate(lastChangeAt),
            recipeCount,
          });
          if (!cancelled) setVisible(show);
        } catch {
          // The reminder is best-effort; never break the list because of it.
          if (!cancelled) setVisible(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [recipes, settings]),
  );

  if (!visible) return null;

  const later = async () => {
    setVisible(false);
    try {
      await settings.set('lastBackupDismissedAt', new Date().toISOString());
    } catch {
      // ignore; it will simply show again next time
    }
  };

  const backup = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await exportBackup(repos);
      setVisible(false);
    } catch {
      Alert.alert('Záloha', 'Zálohu sa nepodarilo vytvoriť.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Recepty sú zatiaľ iba v tomto telefóne. Zálohuj si ich.</Text>
      <View style={styles.actions}>
        <Pressable onPress={() => void later()} disabled={busy} style={styles.button}>
          <Text>Neskôr</Text>
        </Pressable>
        <Pressable onPress={() => void backup()} disabled={busy} style={[styles.button, styles.primary]}>
          <Text style={styles.primaryText}>Zálohovať</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff8e1',
    borderWidth: 1,
    borderColor: '#ffe082',
    gap: 8,
  },
  text: { color: '#5d4037' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  primary: { backgroundColor: '#2e7d32' },
  primaryText: { color: '#fff', fontWeight: '600' },
});
