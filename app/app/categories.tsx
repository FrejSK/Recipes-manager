import { normalizeText, type Category } from '@recipes/core';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRepos } from '../src/db/context';

/** null = modal closed, 'new' = adding, otherwise the category being renamed. */
type Editing = null | 'new' | Category;

export default function CategoriesScreen() {
  const { categories } = useRepos();
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setCats(await categories.list());
    } catch {
      // keep the previous list
    }
  }, [categories]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openModal = (target: Exclude<Editing, null>) => {
    setEditing(target);
    setName(target === 'new' ? '' : target.name);
    setError(null);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Zadaj názov kategórie.');
      return;
    }
    const own = editing !== 'new' && editing !== null ? editing.id : null;
    const key = normalizeText(trimmed);
    if (cats.some((c) => c.id !== own && normalizeText(c.name) === key)) {
      setError('Kategória s týmto názvom už existuje.');
      return;
    }
    try {
      if (own) await categories.rename(own, trimmed);
      else await categories.create(trimmed);
      setEditing(null);
    } catch {
      setError('Nepodarilo sa uložiť kategóriu.');
      return;
    }
    await reload();
  };

  const confirmDelete = (c: Category) => {
    Alert.alert('Kategórie', `Zmazať kategóriu „${c.name}“? Recepty v nej ostanú.`, [
      { text: 'Zrušiť', style: 'cancel' },
      {
        text: 'Zmazať',
        style: 'destructive',
        onPress: async () => {
          try {
            await categories.remove(c.id);
          } catch {
            // fall through to reload
          }
          await reload();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <FlatList
        style={styles.list}
        data={cats}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Pressable onPress={() => openModal(item)} hitSlop={8}>
              <Text style={styles.action}>Premenovať</Text>
            </Pressable>
            <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
              <Text style={[styles.action, styles.danger]}>Zmazať</Text>
            </Pressable>
          </View>
        )}
      />
      <Pressable style={styles.add} onPress={() => openModal('new')}>
        <Text style={styles.addText}>Pridať kategóriu</Text>
      </Pressable>
      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <TextInput
              style={styles.input}
              placeholder="Názov kategórie"
              value={name}
              onChangeText={setName}
              autoFocus
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.buttons}>
              <Pressable onPress={() => setEditing(null)}>
                <Text style={styles.action}>Zrušiť</Text>
              </Pressable>
              <Pressable onPress={save}>
                <Text style={styles.action}>Uložiť</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 16 },
  name: { flex: 1 },
  action: { color: '#2e7d32', fontWeight: '600' },
  danger: { color: '#c62828' },
  add: { margin: 12, padding: 14, borderRadius: 8, backgroundColor: '#2e7d32', alignItems: 'center' },
  addText: { color: '#fff', fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#fff', borderRadius: 8, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  error: { color: '#c62828' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24 },
});
