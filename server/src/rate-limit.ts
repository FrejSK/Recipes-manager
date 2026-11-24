export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export async function checkAndCount(kv: KVLike, limit: number, now: Date): Promise<boolean> {
  const key = `count:${now.toISOString().slice(0, 10)}`;
  const current = Number.parseInt((await kv.get(key)) ?? '0', 10) || 0;
  if (current + 1 > limit) return false;
  await kv.put(key, String(current + 1), { expirationTtl: 172800 });
  return true;
}
