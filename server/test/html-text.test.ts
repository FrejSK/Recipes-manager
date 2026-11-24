import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText } from '../src/html-text';

describe('decodeEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('&amp;&lt;&gt;&quot;&apos;&#65;&#x42;')).toBe('&<>"\'AB');
    expect(decodeEntities('Gul&aacute;&scaron;')).toBe('Guláš');
  });
});

describe('htmlToText', () => {
  it('strips scripts, converts blocks to newlines, decodes entities', () => {
    expect(htmlToText('<p>A&amp;B</p><script>x()</script><ul><li>1</li><li>2</li></ul>')).toBe('A&B\n1\n2');
  });
  it('limits length', () => {
    expect(htmlToText('a'.repeat(200000)).length).toBe(100000);
  });
});
