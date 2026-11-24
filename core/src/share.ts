export type SharedText = { kind: 'url'; url: string } | { kind: 'text'; text: string };

export function classifySharedText(text: string): SharedText {
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  if (urls.length === 1 && text.replace(urls[0], '').trim().length <= 200) {
    return { kind: 'url', url: urls[0] };
  }
  return { kind: 'text', text };
}
