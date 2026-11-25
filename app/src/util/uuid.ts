/**
 * Random UUID v4 for local ids and image file names.
 * Pure JS on purpose: expo-crypto's native module was missing in Expo Go on Android.
 * Uniqueness is all we need here, not cryptographic strength.
 */
export function randomUUID(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
