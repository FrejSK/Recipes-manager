import { randomUUID } from '../src/util/uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUUID', () => {
  const original = (globalThis as { crypto?: unknown }).crypto;
  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true, writable: true });
  });

  it('returns a v4 UUID without a global crypto (Hermes)', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    const ids = new Set(Array.from({ length: 200 }, () => randomUUID()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });

  it('matches the backup image path rule', () => {
    expect(`images/${randomUUID()}.jpg`).toMatch(/^images\/[A-Za-z0-9-]+\.jpg$/);
  });
});
