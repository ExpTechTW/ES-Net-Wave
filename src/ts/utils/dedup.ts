/**
 * Timestamp-based packet deduplicator.
 *
 * The sensor feed delivers each packet more than once and does NOT guarantee
 * arrival order, so a plain "same as the previous timestamp" check misses
 * duplicates that arrive interleaved or out of order.
 *
 * Strategy: a monotonic high-water mark plus a sliding window of recently seen
 * timestamps.
 *   - the first time a timestamp is seen -> accept();
 *   - a timestamp still inside the window (a duplicate, any order) -> reject;
 *   - a timestamp that has fallen behind the window (stale) -> reject.
 *
 * The window is bounded both by time (windowMs behind the newest timestamp) and
 * by entry count, so memory stays flat regardless of feed behaviour.
 */
export class TimestampDeduplicator {
  private seen = new Set<number>();
  private order: number[] = []; // arrival-ordered FIFO, mirrors `seen`
  private maxTs = -Infinity; // monotonic high-water mark

  constructor(
    private readonly windowMs: number = 5000,
    private readonly maxEntries: number = 2048,
  ) {}

  /** Returns true the first time `ts` is seen; false for duplicates/stale. */
  accept(ts: number): boolean {
    if (this.seen.has(ts)) return false; // duplicate inside the window
    if (ts <= this.maxTs - this.windowMs) return false; // stale, behind window

    this.seen.add(ts);
    this.order.push(ts);
    if (ts > this.maxTs) this.maxTs = ts;
    this.prune();
    return true;
  }

  private prune(): void {
    const cutoff = this.maxTs - this.windowMs;
    while (
      this.order.length > 0 &&
      (this.order.length > this.maxEntries || this.order[0] < cutoff)
    ) {
      this.seen.delete(this.order.shift()!);
    }
  }

  reset(): void {
    this.seen.clear();
    this.order.length = 0;
    this.maxTs = -Infinity;
  }
}
