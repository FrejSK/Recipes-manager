import { describe, it, expect } from 'vitest';
import { classifySharedText } from '../src/share';

describe('classifySharedText', () => {
  it('detects a single url with short surrounding text', () => {
    expect(classifySharedText('Mrkvový koláč – Recepty\nhttps://www.recepty.sk/kolac')).toEqual({
      kind: 'url',
      url: 'https://www.recepty.sk/kolac',
    });
  });
  it('treats multiple urls as text', () => {
    expect(classifySharedText('https://x.sk/a https://x.sk/b').kind).toBe('text');
  });
  it('treats long text with a url as text, unchanged', () => {
    const long = 'Suroviny: ' + 'múka, '.repeat(50) + ' viac na https://x.sk';
    expect(classifySharedText(long)).toEqual({ kind: 'text', text: long });
  });
  it('treats text without url as text', () => {
    expect(classifySharedText('200 g múky, 2 vajcia').kind).toBe('text');
  });
});
