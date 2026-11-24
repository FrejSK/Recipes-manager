import { shareToPending } from '../src/import/share-intent';

describe('shareToPending', () => {
  it('maps image files to images', () => {
    expect(
      shareToPending({
        files: [
          { path: 'file:///a.jpg', mimeType: 'image/jpeg' },
          { path: 'content://b', mimeType: 'image/png' },
        ],
      }),
    ).toEqual({ kind: 'images', uris: ['file:///a.jpg', 'content://b'] });
  });

  it('prefixes scheme-less paths with file://', () => {
    expect(shareToPending({ files: [{ path: '/data/a.jpg', mimeType: 'image/jpeg' }] })).toEqual({
      kind: 'images',
      uris: ['file:///data/a.jpg'],
    });
  });

  it('maps webUrl to url', () => {
    expect(shareToPending({ webUrl: 'https://x.sk/r' })).toEqual({ kind: 'url', url: 'https://x.sk/r' });
  });

  it('classifies short text with a link as url', () => {
    expect(shareToPending({ text: 'Názov\nhttps://x.sk/r' })).toEqual({ kind: 'url', url: 'https://x.sk/r' });
  });

  it('keeps long text as text', () => {
    const text = 'Ingrediencie a postup. '.repeat(30);
    expect(shareToPending({ text })).toEqual({ kind: 'text', text });
  });

  it('long text with a link stays text even when webUrl is set', () => {
    const text = 'Ingrediencie a postup. '.repeat(30) + ' https://x.sk/r';
    expect(shareToPending({ text, webUrl: 'https://x.sk/r' })).toEqual({ kind: 'text', text });
  });

  it('short text with link and webUrl is url', () => {
    expect(shareToPending({ text: 'Názov\nhttps://x.sk/r', webUrl: 'https://x.sk/r' })).toEqual({
      kind: 'url',
      url: 'https://x.sk/r',
    });
  });

  it('returns null for a pdf without text', () => {
    expect(shareToPending({ files: [{ path: 'file:///a.pdf', mimeType: 'application/pdf' }], text: null })).toBeNull();
  });

  it('returns null for empty intent', () => {
    expect(shareToPending({})).toBeNull();
  });
});
