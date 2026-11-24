import { decodeHTMLAttribute } from 'entities';
import { decodeEntities } from './html-text';

export type JsonLdRecipe = {
  title: string;
  servingsText: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  ingredients: string[];
  steps: string[];
  imageUrl: string | null;
};

type Json = unknown;
type Obj = Record<string, Json>;

const isObj = (v: Json): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function clean(v: Json): string {
  if (typeof v !== 'string') return '';
  return decodeEntities(v.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseDuration(v: Json): number | null {
  if (typeof v !== 'string') return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(v.trim());
  if (!m || v.trim().length <= 1 || /T$/i.test(v.trim())) return null;
  const [, d, h, min, s] = m;
  const total = Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0) + Math.round(Number(s ?? 0) / 60);
  return total;
}

function servings(v: Json): string | null {
  const first = Array.isArray(v) ? v[0] : v;
  if (typeof first === 'number') return String(first);
  if (typeof first === 'string') return clean(first) || null;
  return null;
}

function stringList(v: Json): string[] {
  const arr = Array.isArray(v) ? v : v === undefined ? [] : [v];
  return arr.map(clean).filter(Boolean);
}

function collectSteps(v: Json, out: string[]): void {
  if (typeof v === 'string') {
    for (const line of v.split(/\r?\n|<br\s*\/?>/i)) {
      const c = clean(line);
      if (c) out.push(c);
    }
  } else if (Array.isArray(v)) {
    for (const x of v) collectSteps(x, out);
  } else if (isObj(v)) {
    if (v.itemListElement !== undefined) collectSteps(v.itemListElement, out);
    else collectSteps(v.text ?? v.name, out);
  }
}

function firstImage(v: Json): string | null {
  if (typeof v === 'string') return decodeHTMLAttribute(v.trim()) || null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = firstImage(x);
      if (u) return u;
    }
    return null;
  }
  if (isObj(v)) return firstImage(v.url ?? v.contentUrl);
  return null;
}

function isRecipe(n: Obj): boolean {
  const t = n['@type'];
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
}

function findNode(v: Json): Obj | null {
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = findNode(x);
      if (r) return r;
    }
    return null;
  }
  if (!isObj(v)) return null;
  if (isRecipe(v)) return v;
  return findNode(v['@graph']);
}

function toRecipe(n: Obj): JsonLdRecipe {
  const steps: string[] = [];
  collectSteps(n.recipeInstructions, steps);
  return {
    title: clean(n.name),
    servingsText: servings(n.recipeYield),
    prepMinutes: parseDuration(n.prepTime),
    cookMinutes: parseDuration(n.cookTime),
    totalMinutes: parseDuration(n.totalTime),
    ingredients: stringList(n.recipeIngredient ?? n.ingredients),
    steps,
    imageUrl: firstImage(n.image),
  };
}

export function findRecipeJsonLd(html: string): JsonLdRecipe | null {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (!/\btype\s*=\s*["']?application\/ld\+json\b/i.test(m[1])) continue;
    let data: Json;
    try {
      data = JSON.parse(m[2].trim());
    } catch {
      continue;
    }
    const node = findNode(data);
    if (node) return toRecipe(node);
  }
  return null;
}

export function jsonLdToText(r: JsonLdRecipe): string {
  const lines = [`Názov: ${r.title}`];
  if (r.servingsText !== null) lines.push(`Porcie: ${r.servingsText}`);
  if (r.prepMinutes !== null) lines.push(`Čas prípravy: ${r.prepMinutes} min`);
  if (r.cookMinutes !== null) lines.push(`Čas varenia: ${r.cookMinutes} min`);
  if (r.totalMinutes !== null) lines.push(`Celkový čas: ${r.totalMinutes} min`);
  lines.push('Suroviny:', ...r.ingredients.map((i) => `- ${i}`));
  lines.push('Postup:', ...r.steps.map((s, i) => `${i + 1}. ${s}`));
  return lines.join('\n');
}

export function findOgImage(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/\b(?:property|name)\s*=\s*["']og:image["']/i.test(tag)) continue;
    const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const url = c ? decodeHTMLAttribute(c[1] ?? c[2] ?? '').trim() : '';
    if (url) return url;
  }
  return null;
}
