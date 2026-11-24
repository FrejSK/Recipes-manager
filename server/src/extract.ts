import type { ExtractRequest } from '@recipes/core';
import type { AiInput, RecipeAI } from './ai';
import type { fetchPage } from './fetch-page';
import type { ExtractResult } from './handler';
import { htmlToText } from './html-text';
import { findOgImage, findRecipeJsonLd, jsonLdToText } from './jsonld';

const MIN_PAGE_TEXT = 200;

/** Resolves a photo URL from the page (may be relative or protocol-relative) against the page URL; http(s) only. */
export function resolvePhotoUrl(img: string | null, pageUrl: string): string | null {
  if (!img) return null;
  try {
    const u = new URL(img, pageUrl);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

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
    const photoUrl = resolvePhotoUrl(jsonLd.imageUrl, req.url) ?? resolvePhotoUrl(findOgImage(page.html), req.url);
    return { ok: true, data: { recipe: r.recipe, photoUrl } };
  }

  const text = htmlToText(page.html);
  if (text.length < MIN_PAGE_TEXT) return { ok: false, error: 'url_unreadable' };
  const r = await deps.ai.extract({ kind: 'text', text }, req.categories);
  // A page without JSON-LD that the AI cannot read as a recipe (e.g. a social network login wall)
  // is reported as unreadable; the app then suggests importing a screenshot instead.
  if (!r.ok) return { ok: false, error: r.error === 'not_a_recipe' ? 'url_unreadable' : r.error };
  return { ok: true, data: { recipe: r.recipe, photoUrl: resolvePhotoUrl(findOgImage(page.html), req.url) } };
}
