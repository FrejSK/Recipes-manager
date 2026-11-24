import type { Category } from '@recipes/core';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useRepos } from '../../../src/db/context';
import { deleteImages, saveImage } from '../../../src/files/images';
import { recipeToDraft, type RecipeDraft } from '../../../src/recipe/draft';
import { saveDraft } from '../../../src/recipe/save';
import { RecipeForm } from '../../../src/ui/RecipeForm';

export default function EditRecipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recipes, categories } = useRepos();
  const router = useRouter();
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, c] = await Promise.all([recipes.get(id), categories.list()]);
        if (cancelled) return;
        setDraft(r ? recipeToDraft(r) : null);
        setCats(c);
      } catch {
        if (!cancelled) setDraft(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, recipes, categories]);

  const onSave = async (d: RecipeDraft) => {
    await saveDraft(d, id, { recipes, saveImage, deleteImages });
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Upraviť recept' }} />
      {!loaded ? null : draft ? (
        <RecipeForm initial={draft} categories={cats} onSave={onSave} />
      ) : (
        <Text style={styles.empty}>Recept sa nenašiel.</Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 24, textAlign: 'center', color: '#666' },
});
