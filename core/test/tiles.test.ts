import { describe, it, expect } from 'vitest';
import { planImageTiles } from '../src/tiles';

describe('planImageTiles', () => {
  it('returns the whole image when not too tall', () => {
    expect(planImageTiles(1080, 2400)).toEqual([{ originX: 0, originY: 0, width: 1080, height: 2400 }]);
  });
  it('splits tall images into overlapping tiles covering everything', () => {
    const t = planImageTiles(1080, 6000);
    expect(t).toHaveLength(3);
    expect(t[0].originY).toBe(0);
    expect(t[2].originY + t[2].height).toBe(6000);
    for (let i = 1; i < t.length; i++) expect(t[i].originY).toBeLessThan(t[i - 1].originY + t[i - 1].height);
    t.forEach((x) => expect(x.height).toBeLessThanOrEqual(2.5 * 1080 * 1.1));
  });
  it('throws for too long images', () => {
    expect(() => planImageTiles(100, 100 * 2.5 * 21)).toThrow('image_too_long');
  });
});
