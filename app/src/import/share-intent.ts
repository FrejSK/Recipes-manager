import { classifySharedText } from '@recipes/core';

import type { PendingImport } from './pending';

// Structural subset of expo-share-intent's `ShareIntent` (files: path + mimeType, text, webUrl).
export type SharedIntentInput = {
  files?: { path: string; mimeType: string }[] | null;
  text?: string | null;
  webUrl?: string | null;
};

function toUri(path: string): string {
  // The library already returns file:// or content:// URIs; only add a scheme for bare paths.
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(path) ? path : `file://${path}`;
}

export function shareToPending(intent: SharedIntentInput): PendingImport | null {
  const images = (intent.files ?? []).filter((f) => f.mimeType?.startsWith('image/') && f.path);
  if (images.length > 0) return { kind: 'images', uris: images.map((f) => toUri(f.path)) };
  if (intent.webUrl) return { kind: 'url', url: intent.webUrl };
  if (intent.text?.trim()) return classifySharedText(intent.text);
  return null;
}
