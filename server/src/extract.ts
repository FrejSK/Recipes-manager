import type { ExtractRequest } from '@recipes/core';
import type { AiInput, RecipeAI } from './ai';
import type { fetchPage } from './fetch-page';
import type { ExtractResult } from './handler';
import { htmlToText } from './html-text';
import { findOgImage, findRecipeJsonLd, jsonLdToText } from './jsonld';

const MIN_PAGE_TEXT = 200;

export interface ExtractDeps {
  ai: RecipeAI;
  fetchPage: typeof fetchPage;
}

export async function extract(req: ExtractRequest, deps: ExtractDeps): Promise<ExtractResult> {
  if (req.kind !== 'url') {
    const input: AiInput =
      req.kind === 'images' ? { kind: 'images', images: req.images } : { kind: 'text', text: req.text };
    const r = await deps.ai.extract(input, req.categories);
    return r.ok ? { ok: true, data: { recipe: r.recipe, photoUrl: null } } : r;
  }

  const page = await deps.fetchPage(req.url);
  if (!page.ok) return { ok: false, error: 'url_unreadable' };

  const jsonLd = findRecipeJsonLd(page.html);
  if (jsonLd) {
    const r = await deps.ai.extract({ kind: 'text', text: jsonLdToText(jsonLd) }, req.categories);
    if (!r.ok) return r;
    return { ok: true, data: { recipe: r.recipe, photoUrl: jsonLd.imageUrl ?? findOgImage(page.html) } };
  }

  const text = htmlToText(page.html);
  if (text.length < MIN_PAGE_TEXT) return { ok: false, error: 'url_unreadable' };
  const r = await deps.ai.extract({ kind: 'text', text }, req.categories);
  // A page without JSON-LD that the AI cannot read as a recipe (e.g. a social network login wall)
  // is reported as unreadable; the app then suggests importing a screenshot instead.
  if (!r.ok) return { ok: false, error: r.error === 'not_a_recipe' ? 'url_unreadable' : r.error };
  return { ok: true, data: { recipe: r.recipe, photoUrl: findOgImage(page.html) } };
}
