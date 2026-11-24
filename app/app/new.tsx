import type { Category } from '@recipes/core';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useRepos } from '../src/db/context';
import { deleteImages, saveImage } from '../src/files/images';
import { takeDraft } from '../src/import/pending';
import { emptyDraft, type RecipeDraft } from '../src/recipe/draft';
import { saveDraft } from '../src/recipe/save';
import { RecipeForm } from '../src/ui/RecipeForm';

export default function NewRecipe() {
  const { recipes, categories } = useRepos();
  const router = useRouter();
  const [initial] = useState(() => takeDraft() ?? emptyDraft());
  const [cats, setCats] = useState<Category[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    categories
      .list()
      .catch(() => [])
      .then((c) => {
        if (!cancelled) setCats(c);
      });
    return () => {
      cancelled = true;
    };
  }, [categories]);

  const onSave = async (d: RecipeDraft) => {
    const recipe = await saveDraft(d, null, { recipes, saveImage, deleteImages });
    router.replace(`/recipe/${recipe.id}`);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Nový recept' }} />
      {cats ? (
        <RecipeForm
          initial={initial}
          categories={cats}
          onSave={onSave}
          originals={initial.sourceImages.length > 0 ? initial.sourceImages : undefined}
        />
      ) : null}
    </>
  );
}
