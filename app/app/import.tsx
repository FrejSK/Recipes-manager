import type { Category, ExtractRequest } from '@recipes/core';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useRepos } from '../src/db/context';
import { extractRecipe, type ClientErrorCode } from '../src/import/extract-client';
import { errorMessage } from '../src/import/messages';
import { setDraft, takePendingImport, type PendingImport } from '../src/import/pending';
import { prepareImages } from '../src/import/prepare-images';
import { emptyDraft, extractedToDraft, type RecipeDraft } from '../src/recipe/draft';

type Status = { kind: 'loading' } | { kind: 'error'; code: ClientErrorCode };

async function buildRequest(
  input: PendingImport,
  categories: string[],
): Promise<{ ok: true; req: ExtractRequest } | { ok: false; error: ClientErrorCode }> {
  if (input.kind === 'text') return { ok: true, req: { kind: 'text', text: input.text, categories } };
  if (input.kind === 'url') return { ok: true, req: { kind: 'url', url: input.url, categories } };
  try {
    const images = await prepareImages(input.uris);
    return { ok: true, req: { kind: 'images', images, categories } };
  } catch (e) {
    return { ok: false, error: imageErrorCode(e) };
  }
}

function imageErrorCode(e: unknown): ClientErrorCode {
  if (e instanceof Error && (e.message === 'image_too_long' || e.message === 'too_many_images')) return e.message;
  return 'ai_failed';
}

function manualDraft(input: PendingImport): RecipeDraft {
  const d = emptyDraft();
  if (input.kind === 'images') return { ...d, sourceImages: input.uris.map((uri) => ({ kind: 'local', uri })) };
  if (input.kind === 'text') return { ...d, sourceText: input.text };
  return { ...d, sourceUrl: input.url };
}

export default function ImportScreen() {
  const router = useRouter();
  const { categories } = useRepos();
  // Kept in state so "Skúsiť znova" re-runs the flow with the same input.
  const [input] = useState(takePendingImport);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // Runs on mount and on every retry. router/categories are read from the closure on purpose:
  // re-running a paid import because their identity changed would be wrong.
  useEffect(() => {
    if (!input) {
      router.back();
      return;
    }
    let cancelled = false;
    (async () => {
      const cats: Category[] = await categories.list().catch(() => []);
      if (cancelled) return;
      const built = await buildRequest(
        input,
        cats.map((c) => c.name),
      );
      if (cancelled) return;
      const res = built.ok ? await extractRecipe(built.req) : built;
      if (cancelled) return;
      if (res.ok) {
        setDraft(extractedToDraft(res.data, cats, input));
        router.replace('/new');
      } else {
        setStatus({ kind: 'error', code: res.error });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, attempt]);

  const retry = () => {
    setStatus({ kind: 'loading' });
    setAttempt((a) => a + 1);
  };

  const fillManually = () => {
    if (!input) return;
    setDraft(manualDraft(input));
    router.replace('/new');
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Načítavam' }} />
      {status.kind === 'loading' ? (
        <>
          <ActivityIndicator size="large" />
          <Text style={styles.text}>Čítam recept…</Text>
        </>
      ) : (
        <>
          <Text style={styles.text}>{errorMessage(status.code)}</Text>
          <Pressable accessibilityRole="button" style={[styles.button, styles.primary]} onPress={retry}>
            <Text style={styles.primaryText}>Skúsiť znova</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.button} onPress={fillManually}>
            <Text style={styles.secondaryText}>Vyplniť ručne</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  text: { fontSize: 17, textAlign: 'center' },
  button: {
    alignSelf: 'stretch',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2e7d32',
  },
  primary: { backgroundColor: '#2e7d32' },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondaryText: { color: '#2e7d32', fontWeight: '600', fontSize: 16 },
});
