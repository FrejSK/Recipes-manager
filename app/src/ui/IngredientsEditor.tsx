import { UNIT_CODES, UNITS, type UnitCode } from '@recipes/core';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { newGroup, newIngredient, type FormGroup, type FormIngredient } from '../recipe/form-state';

type Props = { groups: FormGroup[]; onChange(groups: FormGroup[]): void };

const UNIT_OPTIONS: (UnitCode | null)[] = [null, ...UNIT_CODES];
const unitText = (u: UnitCode | null) => (u ? UNITS[u].forms.one : '—');

export function IngredientsEditor({ groups, onChange }: Props) {
  const [picking, setPicking] = useState<{ gi: number; ii: number } | null>(null);

  const setGroup = (gi: number, g: FormGroup) => onChange(groups.map((x, j) => (j === gi ? g : x)));
  const setItem = (gi: number, ii: number, patch: Partial<FormIngredient>) => {
    const g = groups[gi];
    setGroup(gi, { ...g, items: g.items.map((x, j) => (j === ii ? { ...x, ...patch } : x)) });
  };
  const removeItem = (gi: number, ii: number) => {
    const g = groups[gi];
    setGroup(gi, { ...g, items: g.items.filter((_, j) => j !== ii) });
  };

  return (
    <View style={styles.list}>
      {groups.map((g, gi) => (
        <View key={g.key} style={styles.group}>
          <View style={styles.groupHeader}>
            <TextInput
              style={[styles.input, styles.flex]}
              placeholder="Názov skupiny (nepovinné)"
              value={g.name}
              onChangeText={(name) => setGroup(gi, { ...g, name })}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zmazať skupinu"
              hitSlop={6}
              onPress={() => onChange(groups.filter((_, j) => j !== gi))}
            >
              <Text style={styles.danger}>Zmazať</Text>
            </Pressable>
          </View>
          {g.items.map((item, ii) => (
            <View key={item.key} style={styles.item}>
              <View style={styles.line}>
                <TextInput
                  style={[styles.input, styles.amount]}
                  placeholder="Množstvo"
                  keyboardType="decimal-pad"
                  value={item.amount}
                  onChangeText={(amount) => setItem(gi, ii, { amount })}
                />
                <TextInput
                  style={[styles.input, styles.amount]}
                  placeholder="do"
                  keyboardType="decimal-pad"
                  value={item.amountMax}
                  onChangeText={(amountMax) => setItem(gi, ii, { amountMax })}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Jednotka"
                  style={[styles.input, styles.unit]}
                  onPress={() => setPicking({ gi, ii })}
                >
                  <Text>{unitText(item.unit)}</Text>
                </Pressable>
              </View>
              <View style={styles.line}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  placeholder="Názov"
                  value={item.name}
                  onChangeText={(name) => setItem(gi, ii, { name })}
                />
                <TextInput
                  style={[styles.input, styles.flex]}
                  placeholder="Poznámka"
                  value={item.note}
                  onChangeText={(note) => setItem(gi, ii, { note })}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Zmazať surovinu"
                  hitSlop={6}
                  onPress={() => removeItem(gi, ii)}
                >
                  <Text style={styles.danger}>✕</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setGroup(gi, { ...g, items: [...g.items, newIngredient()] })}
          >
            <Text style={styles.add}>Pridať surovinu</Text>
          </Pressable>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={() => onChange([...groups, newGroup()])}>
        <Text style={styles.add}>Pridať skupinu</Text>
      </Pressable>

      <Modal visible={picking !== null} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(null)}>
          <View style={styles.sheet}>
            <FlatList
              data={UNIT_OPTIONS}
              keyExtractor={(u) => u ?? 'none'}
              initialNumToRender={UNIT_OPTIONS.length}
              renderItem={({ item: u }) => (
                <Pressable
                  accessibilityRole="button"
                  style={styles.option}
                  onPress={() => {
                    if (picking) setItem(picking.gi, picking.ii, { unit: u });
                    setPicking(null);
                  }}
                >
                  <Text style={styles.optionText}>{unitText(u)}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  group: { gap: 8, padding: 8, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  item: { gap: 4, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#eee' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6 },
  flex: { flex: 1 },
  amount: { width: 90 },
  unit: { minWidth: 80, justifyContent: 'center' },
  danger: { color: '#c62828', fontWeight: '600' },
  add: { color: '#2e7d32', fontWeight: '600', paddingVertical: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  sheet: { backgroundColor: '#fff', borderRadius: 8, maxHeight: '80%' },
  option: { paddingVertical: 12, paddingHorizontal: 16 },
  optionText: { fontSize: 16 },
});
