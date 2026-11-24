import { filterRecipes } from '@recipes/core';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRepos } from '../src/db/context';
import type { Category } from '@recipes/core';
import type { RecipeListItem } from '../src/db/recipes-repo';
import { imageUri } from '../src/files/images';
import { BackupBanner } from '../src/ui/BackupBanner';

export default function HomeScreen() {
  const { recipes, categories } = useRepos();
  const router = useRouter();
  const [items, setItems] = useState<RecipeListItem[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [r, c] = await Promise.all([recipes.list(), categories.list()]);
        if (cancelled) return;
        setItems(r);
        setCats(c);
        // Drop a filter whose category was deleted while we were away.
        setCategoryId((cur) => (cur && !c.some((x) => x.id === cur) ? null : cur));
      })();
      return () => {
        cancelled = true;
      };
    }, [recipes, categories]),
  );

  const visible = filterRecipes(items, query, categoryId);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <TextInput
        style={styles.search}
        placeholder="Hľadať recept…"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Všetko" selected={categoryId === null} onPress={() => setCategoryId(null)} />
          {cats.map((c) => (
            <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
          <Chip label="Upraviť" selected={false} onPress={() => router.push('/categories' as never)} />
        </ScrollView>
      </View>
      <BackupBanner />
      <FlatList
        style={styles.list}
        data={visible}
        keyExtractor={(r) => String(r.id)}
        ListEmptyComponent={
          items.length === 0 ? (
            <Text style={styles.empty}>Zatiaľ tu nie sú žiadne recepty. Pridaj prvý cez tlačidlo nižšie.</Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/recipe/${item.id}`)}>
            {item.photo ? (
              <Image source={{ uri: imageUri(item.photo) }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.placeholder]} />
            )}
            <Text style={styles.rowTitle}>{item.title}</Text>
          </Pressable>
        )}
      />
      <Pressable style={styles.add} onPress={() => router.push('/add')}>
        <Text style={styles.addText}>Pridať recept</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={selected ? styles.chipTextSelected : undefined}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  search: {
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
  },
  chips: { paddingHorizontal: 12, gap: 8, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  chipSelected: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  chipTextSelected: { color: '#fff' },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 12 },
  photo: { width: 56, height: 56, borderRadius: 6 },
  placeholder: { backgroundColor: '#ddd' },
  rowTitle: { flex: 1 },
  empty: { padding: 24, textAlign: 'center', color: '#666' },
  add: {
    margin: 12,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#2e7d32',
    alignItems: 'center',
  },
  addText: { color: '#fff', fontWeight: '600' },
});
