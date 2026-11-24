// iOS share extension reopens the app with `recepty://dataUrl=<key>`; useShareIntent handles it,
// so keep expo-router from trying to route it.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return path.includes('dataUrl=') ? '/' : path;
}
