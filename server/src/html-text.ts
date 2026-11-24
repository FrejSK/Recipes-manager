import { decodeHTML } from 'entities';

const MAX_TEXT = 100_000;

export function decodeEntities(s: string): string {
  return decodeHTML(s);
}

export function htmlToText(html: string): string {
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/?(br|p|li|h[1-6]|div|tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ ?(\n ?)+/g, '\n')
    .trim();
  return text.slice(0, MAX_TEXT);
}
