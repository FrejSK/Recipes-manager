import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findOgImage, findRecipeJsonLd, jsonLdToText } from '../src/jsonld';

const fx = (n: string) => readFileSync(`test/fixtures/${n}`, 'utf8');

describe('findRecipeJsonLd', () => {
  it('parses simple recipe', () => {
    const r = findRecipeJsonLd(fx('jsonld-simple.html'))!;
    expect(r.title).toBe('Bryndzové halušky');
    expect(r.servingsText).toBe('4 porcie');
    expect(r.totalMinutes).toBe(90);
    expect(r.prepMinutes).toBeNull();
    expect(r.ingredients.length).toBe(3);
    expect(r.steps[0]).toBe('Zemiaky nastrúhame.');
    expect(r.imageUrl).toBe('https://example.com/halusky.jpg');
  });
  it('skips invalid JSON and unwraps @graph', () => {
    const r = findRecipeJsonLd(fx('jsonld-graph.html'))!;
    expect(r.title).toBe('Palacinky');
    expect(r.prepMinutes).toBe(45);
    expect(r.servingsText).toBe('4');
    expect(r.steps).toEqual(['Zmiešame cesto.', 'Upečieme palacinky.']);
    expect(r.imageUrl).toBe('https://example.com/p1.jpg');
  });
  it('handles type arrays, HowToSection, entities', () => {
    const r = findRecipeJsonLd(fx('jsonld-type-array.html'))!;
    expect(r.title).toBe('Guláš');
    expect(r.servingsText).toBe('6');
    expect(r.cookMinutes).toBe(120);
    expect(r.steps).toEqual(['Nakrájame mäso.', 'Opražíme cibuľu.']);
    expect(r.imageUrl).toBeNull();
  });
  it('returns null without JSON-LD and finds og:image', () => {
    const html = fx('no-jsonld.html');
    expect(findRecipeJsonLd(html)).toBeNull();
    expect(findOgImage(html)).toBe('https://example.com/photo.jpg');
  });
});

describe('jsonLdToText', () => {
  it('formats text for AI', () => {
    const r = findRecipeJsonLd(fx('jsonld-simple.html'))!;
    const t = jsonLdToText(r);
    expect(t).toContain('Názov: Bryndzové halušky');
    expect(t).toContain('Porcie: 4 porcie');
    expect(t).toContain('Celkový čas: 90 min');
    expect(t).not.toContain('Čas prípravy');
    expect(t).toContain('- ' + r.ingredients[0]);
    expect(t).toContain('1. ' + r.steps[0]);
  });
});
