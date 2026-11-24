import { formatIngredient, type Category, type Recipe } from '@recipes/core';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRepos } from '../../src/db/context';
import { deleteImages, imageUri } from '../../src/files/images';
import { formatDuration } from '../../src/recipe/format-duration';

function totalTime(r: Recipe): number | null {
  if (r.totalMinutes !== null) return r.totalMinutes;
  if (r.prepMinutes === null && r.cookMinutes === null) return null;
  return (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
}

export default function RecipeDetail() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recipes, categories } = useRepos();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [portions, setPortions] = useState(1);
  const [viewing, setViewing] = useState<string | null>(null);

  // Reload on focus so changes made on the edit screen show up after router.back().
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [r, c] = await Promise.all([recipes.get(id), categories.list()]);
          if (cancelled) return;
          setRecipe(r);
          setCats(c);
          if (r?.servings) setPortions(r.servings);
        } catch {
          if (!cancelled) setRecipe(null);
        } finally {
          if (!cancelled) setLoaded(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [id, recipes, categories]),
  );

  if (!loaded) return null;
  if (!recipe) return <Text style={styles.empty}>Recept sa nenašiel.</Text>;

  const confirmDelete = () => {
    Alert.alert(`Zmazať recept „${recipe.title}“?`, undefined, [
      { text: 'Zrušiť', style: 'cancel' },
      {
        text: 'Zmazať',
        style: 'destructive',
        onPress: async () => {
          const removed = (await recipes.remove(id)) ?? recipe;
          await deleteImages([removed.photo, ...removed.sourceImages]);
          router.back();
        },
      },
    ]);
  };

  const headerRight = () => (
    <View style={styles.headerActions}>
      <Pressable onPress={() => router.push(`/recipe/${id}/edit` as never)}>
        <Text style={styles.headerText}>Upraviť</Text>
      </Pressable>
      <Pressable onPress={confirmDelete}>
        <Text style={[styles.headerText, styles.danger]}>Zmazať</Text>
      </Pressable>
    </View>
  );

  const factor = recipe.servings ? portions / recipe.servings : 1;
  const minutes = totalTime(recipe);
  const catNames = recipe.categoryIds
    .map((cid) => cats.find((c) => c.id === cid)?.name)
    .filter((n): n is string => !!n);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: recipe.title, headerRight }} />
      {recipe.photo ? <Image source={{ uri: imageUri(recipe.photo) }} style={styles.photo} /> : null}
      <Text style={styles.title}>{recipe.title}</Text>
      {catNames.length > 0 ? <Text style={styles.meta}>{catNames.join(' · ')}</Text> : null}
      {minutes !== null ? <Text style={styles.meta}>{formatDuration(minutes)}</Text> : null}

      {recipe.servings !== null ? (
        <View style={styles.portions}>
          <Text style={styles.label}>Porcie:</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Menej porcií"
            style={styles.stepBtn}
            onPress={() => setPortions((p) => Math.max(1, p - 1))}
          >
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.count}>{portions}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Viac porcií"
            style={styles.stepBtn}
            onPress={() => setPortions((p) => p + 1)}
          >
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.heading}>Suroviny</Text>
      {recipe.ingredientGroups.map((g, gi) => (
        <View key={gi} style={styles.group}>
          {g.name ? <Text style={styles.subheading}>{g.name}</Text> : null}
          {g.items.map((item, ii) => {
            const { amountText, nameText } = formatIngredient(item, factor);
            return (
              <View key={ii} style={styles.ingredient}>
                {amountText ? <Text style={styles.amount}>{amountText}</Text> : null}
                <Text style={styles.ingName}>{nameText}</Text>
              </View>
            );
          })}
        </View>
      ))}

      <Text style={styles.heading}>Postup</Text>
      {recipe.steps.map((s, i) => (
        <Text key={i} style={styles.step}>{`${i + 1}. ${s}`}</Text>
      ))}

      {recipe.notes ? (
        <>
          <Text style={styles.heading}>Poznámky</Text>
          <Text>{recipe.notes}</Text>
        </>
      ) : null}

      {recipe.sourceImages.length > 0 || recipe.sourceUrl ? (
        <>
          <Text style={styles.heading}>Originál</Text>
          <View style={styles.thumbs}>
            {recipe.sourceImages.map((p) => (
              <Pressable
                key={p}
                accessibilityRole="imagebutton"
                accessibilityLabel="Zobraziť originál"
                onPress={() => setViewing(p)}
              >
                <Image source={{ uri: imageUri(p) }} style={styles.thumb} />
              </Pressable>
            ))}
          </View>
          {recipe.sourceUrl ? (
            <Pressable onPress={() => Linking.openURL(recipe.sourceUrl as string)}>
              <Text style={styles.link}>{recipe.sourceUrl}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      <Modal visible={viewing !== null} animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.modal}>
          {viewing ? <Image source={{ uri: imageUri(viewing) }} style={styles.full} resizeMode="contain" /> : null}
          <Pressable style={styles.close} onPress={() => setViewing(null)}>
            <Text style={styles.closeText}>Zavrieť</Text>
          </Pressable>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 6 },
  empty: { padding: 24, textAlign: 'center', color: '#666' },
  headerActions: { flexDirection: 'row', gap: 16 },
  headerText: { color: '#2e7d32', fontWeight: '600' },
  danger: { color: '#c62828' },
  photo: { width: '100%', height: 220, borderRadius: 8, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  meta: { color: '#666' },
  portions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 10 },
  label: { fontWeight: '600' },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2e7d32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 20, color: '#2e7d32' },
  count: { fontSize: 18, minWidth: 24, textAlign: 'center' },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 14 },
  subheading: { fontWeight: '600', marginTop: 6 },
  group: { gap: 4 },
  ingredient: { flexDirection: 'row', gap: 8 },
  amount: { fontWeight: '600', minWidth: 70 },
  ingName: { flex: 1 },
  step: { marginTop: 4 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 80, height: 80, borderRadius: 6 },
  link: { color: '#1565c0', textDecorationLine: 'underline' },
  modal: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  full: { flex: 1 },
  close: { position: 'absolute', top: 48, right: 16, padding: 10, backgroundColor: '#333', borderRadius: 8 },
  closeText: { color: '#fff' },
});
