/** A Map-backed cache with a TTL per entry and a hard cap on entry count.
 * Once at capacity, the oldest entry is evicted to make room for a new one
 * (Map iteration order is insertion order in JS, so the first key is always
 * the oldest) — prevents unbounded growth on a long-running, multi-user
 * server, where TTL alone only expires an entry lazily on its next read. */
export class TtlCache<T> {
  private map = new Map<string, { value: T; ts: number }>();

  constructor(private ttlMs: number, private maxEntries: number) {}

  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.ttlMs) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (!this.map.has(key) && this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, ts: Date.now() });
  }

  get size(): number {
    return this.map.size;
  }
}
