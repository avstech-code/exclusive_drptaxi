import 'server-only';

// Tiny per-instance cache for data that is read on every quote but changes rarely (vehicles, switches, cities).
// Each read used to cost a database round trip, and a fare needs several of them one after another.
// Writers call clearCaches() so they show at once on the instance that handled the change; other
// instances catch up within TTL_MS.

export const TTL_MS = 15_000;

const store = new Map<string, { value: Promise<unknown>; expires: number }>();

/** Returns the cached value for `key`, or runs `load` once (concurrent callers share the same call). */
export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load().catch((e) => {
    store.delete(key); // never keep a failure
    throw e;
  });
  store.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

export function clearCaches(): void {
  store.clear();
}
