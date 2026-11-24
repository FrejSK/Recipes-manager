import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { newStep, type FormStep } from '../recipe/form-state';

type Props = { steps: FormStep[]; onChange(steps: FormStep[]): void };

export function StepsEditor({ steps, onChange }: Props) {
  const setText = (i: number, text: string) => onChange(steps.map((s, j) => (j === i ? { ...s, text } : s)));
  const remove = (i: number) => onChange(steps.filter((_, j) => j !== i));
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <View style={styles.list}>
      {steps.map((s, i) => (
        <View key={s.key} style={styles.row}>
          <Text style={styles.num}>{i + 1}.</Text>
          <TextInput
            style={styles.input}
            multiline
            placeholder={`Krok ${i + 1}`}
            value={s.text}
            onChangeText={(t) => setText(i, t)}
          />
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Posunúť hore"
              disabled={i === 0}
              hitSlop={6}
              onPress={() => move(i, -1)}
            >
              <Text style={[styles.icon, i === 0 && styles.disabled]}>▲</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Posunúť dole"
              disabled={i === steps.length - 1}
              hitSlop={6}
              onPress={() => move(i, 1)}
            >
              <Text style={[styles.icon, i === steps.length - 1 && styles.disabled]}>▼</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Zmazať krok" hitSlop={6} onPress={() => remove(i)}>
              <Text style={[styles.icon, styles.danger]}>✕</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={() => onChange([...steps, newStep()])}>
        <Text style={styles.add}>Pridať krok</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  num: { paddingTop: 10, minWidth: 20 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, minHeight: 40 },
  actions: { gap: 6, paddingTop: 4, alignItems: 'center' },
  icon: { fontSize: 16, color: '#2e7d32' },
  disabled: { color: '#ccc' },
  danger: { color: '#c62828' },
  add: { color: '#2e7d32', fontWeight: '600', paddingVertical: 6 },
});
