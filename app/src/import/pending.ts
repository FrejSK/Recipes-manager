import type { DraftSource, RecipeDraft } from '../recipe/draft';

export type PendingImport = DraftSource;

// In-memory hand-off between screens (share intent → import → form). Not persisted.
let pendingImport: PendingImport | null = null;
let draft: RecipeDraft | null = null;

export function setPendingImport(p: PendingImport): void {
  pendingImport = p;
}

export function takePendingImport(): PendingImport | null {
  const p = pendingImport;
  pendingImport = null;
  return p;
}

export function setDraft(d: RecipeDraft): void {
  draft = d;
}

export function takeDraft(): RecipeDraft | null {
  const d = draft;
  draft = null;
  return d;
}
