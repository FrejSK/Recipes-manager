import type { Category } from '@recipes/core';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { imageUri } from '../files/images';
import { imageRefUri, validateDraft, type ImageRef, type RecipeDraft } from '../recipe/draft';
import { fromFormState, toFormState, type FormState } from '../recipe/form-state';
import { CategoryChips } from './CategoryChips';
import { IngredientsEditor } from './IngredientsEditor';
import { StepsEditor } from './StepsEditor';

type Props = {
  initial: RecipeDraft;
  categories: Category[];
  onSave(d: RecipeDraft): Promise<void>;
  originals?: ImageRef[];
};

const refUri = (ref: ImageRef) => imageRefUri(ref, imageUri);

const NUMBER_FIELDS = [
  ['servings', 'Porcie'],
  ['prepMinutes', 'Čas prípravy (min)'],
  ['cookMinutes', 'Čas varenia (min)'],
  ['totalMinutes', 'Celkový čas (min)'],
] as const;

export function RecipeForm({ initial, categories, onSave, originals }: Props) {
  const [f, setF] = useState<FormState>(() => toFormState(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const pickPhoto = async () => {
    const res = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets && res.assets.length > 0) set('photo', { kind: 'local', uri: res.assets[0].uri });
  };

  const save = async () => {
    if (saving) return;
    const draft = fromFormState(f, initial);
    const invalid = validateDraft(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(draft);
    } catch {
      setError('Recept sa nepodarilo uložiť.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {originals && originals.length > 0 ? (
        <ScrollView horizontal style={styles.originals} contentContainerStyle={styles.originalsRow}>
          {originals.map((ref, i) => (
            <Image key={i} accessibilityLabel="Originál" source={{ uri: refUri(ref) }} style={styles.original} />
          ))}
        </ScrollView>
      ) : null}

      <Text style={styles.label}>Názov</Text>
      <TextInput
        accessibilityLabel="Názov"
        style={styles.input}
        value={f.title}
        onChangeText={(t) => set('title', t)}
      />

      <View style={styles.numbers}>
        {NUMBER_FIELDS.map(([key, label]) => (
          <View key={key} style={styles.numberField}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              accessibilityLabel={label}
              style={styles.input}
              keyboardType="decimal-pad"
              value={f[key]}
              onChangeText={(t) => set(key, t)}
            />
          </View>
        ))}
      </View>

      <Text style={styles.label}>Kategórie</Text>
      <CategoryChips categories={categories} selected={f.categoryIds} onChange={(ids) => set('categoryIds', ids)} />

      <Text style={styles.heading}>Suroviny</Text>
      <IngredientsEditor groups={f.groups} onChange={(g) => set('groups', g)} />

      <Text style={styles.heading}>Postup</Text>
      <StepsEditor steps={f.steps} onChange={(s) => set('steps', s)} />

      <Text style={styles.heading}>Poznámky</Text>
      <TextInput
        accessibilityLabel="Poznámky"
        style={[styles.input, styles.multiline]}
        multiline
        value={f.notes}
        onChangeText={(t) => set('notes', t)}
      />

      <Text style={styles.heading}>Fotka</Text>
      {f.photo ? <Image source={{ uri: refUri(f.photo) }} style={styles.photo} /> : null}
      <View style={styles.photoActions}>
        <Pressable accessibilityRole="button" onPress={pickPhoto}>
          <Text style={styles.link}>Vybrať z galérie</Text>
        </Pressable>
        {f.photo ? (
          <Pressable accessibilityRole="button" onPress={() => set('photo', null)}>
            <Text style={[styles.link, styles.danger]}>Odstrániť fotku</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: saving }}
        disabled={saving}
        style={[styles.save, saving && styles.saveDisabled]}
        onPress={save}
      >
        <Text style={styles.saveText}>Uložiť</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 6, paddingBottom: 48 },
  originals: { flexGrow: 0, marginBottom: 8 },
  originalsRow: { gap: 8 },
  original: { width: 120, height: 160, borderRadius: 6, backgroundColor: '#eee' },
  label: { fontWeight: '600', marginTop: 8 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  numbers: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  numberField: { width: '46%' },
  photo: { width: '100%', height: 200, borderRadius: 8 },
  photoActions: { flexDirection: 'row', gap: 20, paddingVertical: 6 },
  link: { color: '#2e7d32', fontWeight: '600' },
  danger: { color: '#c62828' },
  error: { color: '#c62828', marginTop: 12 },
  save: { marginTop: 16, backgroundColor: '#2e7d32', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
