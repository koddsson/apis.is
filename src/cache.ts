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

// `s-maxage` drives Workers Cache (`cache` in wrangler.jsonc), which answers
// repeat requests at Cloudflare's edge without running the Worker. `max-age`
// stays short by default so browsers pick up fresh data soon after the edge
// copy expires.
export function cacheControl(
  sMaxAge: number,
  maxAge: number = Math.min(60, sMaxAge),
): string {
  return `public, s-maxage=${sMaxAge}, max-age=${maxAge}`;
}

// Workers Cache stores a 200 without `Cache-Control` for two hours (and a 404
// for three minutes), so responses that don't opt in are marked uncacheable.
export function noStore(response: Response): Response {
  if (!response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

export function clearCache(): void {
  entries.clear();
}
