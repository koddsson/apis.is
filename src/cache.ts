interface Entry {
  value: Promise<unknown>;
  expires: number;
}

// Lives in the isolate's memory, so it's per-isolate and lost whenever
// Workers recycles the isolate. Good enough to absorb bursts of requests.
const entries = new Map<string, Entry>();

export function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = entries.get(key);
  if (cached && cached.expires > now) return cached.value as Promise<T>;

  const value = fetcher();
  entries.set(key, { value, expires: now + ttlSeconds * 1000 });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}

export function cacheControl(ttlSeconds: number): string {
  return `public, max-age=${ttlSeconds}`;
}

export function clearCache(): void {
  entries.clear();
}
