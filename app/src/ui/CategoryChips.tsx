import type { Category } from '@recipes/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = { categories: Category[]; selected: string[]; onChange(ids: string[]): void };

/** Multi-select category chips. Keeps the selection in category sort order. */
export function CategoryChips({ categories, selected, onChange }: Props) {
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    onChange(categories.map((c) => c.id).filter((cid) => next.includes(cid)));
  };
  return (
    <View style={styles.row}>
      {categories.map((c) => {
        const on = selected.includes(c.id);
        return (
          <Pressable
            key={c.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => toggle(c.id)}
          >
            <Text style={on ? styles.textOn : undefined}>{c.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#999' },
  chipOn: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  textOn: { color: '#fff' },
});
