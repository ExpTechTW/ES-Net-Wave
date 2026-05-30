/**
 * Ring Buffer implementation for fixed-size circular data storage
 * - O(1) write operations
 * - No array reallocation or garbage collection pressure
 * - Efficient for real-time data streaming
 */

export interface DataPoint {
  t: number;
  x: number;
  y: number;
  z: number;
}

export class RingBuffer {
  private buffer: DataPoint[];
  private writePointer: number = 0;
  private capacity: number;
  private validSize: number = 0; // Number of valid items in buffer

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Add a data point to the ring buffer
   * O(1) operation - just write to current position and advance pointer
   */
  push(point: DataPoint): void {
    this.buffer[this.writePointer] = point;
    this.writePointer = (this.writePointer + 1) % this.capacity;

    // Track valid size until buffer is full
    if (this.validSize < this.capacity) {
      this.validSize++;
    }
  }

  /**
   * Get all valid data points in chronological order
   * Returns a new array for rendering (read-only from caller perspective)
   */
  getAll(): DataPoint[] {
    const result: DataPoint[] = new Array(this.validSize);

    if (this.validSize < this.capacity) {
      // Buffer not full yet, just copy from beginning
      for (let i = 0; i < this.validSize; i++) {
        result[i] = { ...this.buffer[i] };
      }
    } else {
      // Buffer is full, copy from writePointer (oldest) to current position
      let resultIdx = 0;

      // Copy from writePointer to end
      for (let i = this.writePointer; i < this.capacity; i++) {
        result[resultIdx++] = { ...this.buffer[i] };
      }

      // Copy from beginning to writePointer
      for (let i = 0; i < this.writePointer; i++) {
        result[resultIdx++] = { ...this.buffer[i] };
      }
    }

    return result;
  }

  /**
   * Get data points within a time range [startTime, endTime)
   */
  getRange(startTime: number, endTime: number): DataPoint[] {
    const allData = this.getAll();
    return allData.filter((pt) => pt.t >= startTime && pt.t < endTime);
  }

  /**
   * Get the oldest timestamp in the buffer
   */
  getOldestTime(): number | null {
    if (this.validSize === 0) return null;

    if (this.validSize < this.capacity) {
      return this.buffer[0].t;
    } else {
      return this.buffer[this.writePointer].t;
    }
  }

  /**
   * Get the newest timestamp in the buffer
   */
  getNewestTime(): number | null {
    if (this.validSize === 0) return null;

    const idx = (this.writePointer - 1 + this.capacity) % this.capacity;
    return this.buffer[idx].t;
  }

  /**
   * Get the valid data count
   */
  getSize(): number {
    return this.validSize;
  }

  /**
   * Check if buffer has data
   */
  isEmpty(): boolean {
    return this.validSize === 0;
  }

  /**
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.validSize === this.capacity;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.writePointer = 0;
    this.validSize = 0;
    // Don't need to clear array contents, they'll be overwritten
  }

  /**
   * Merge data from another RingBuffer or array
   * Useful for syncing with historical data
   * Deduplicates based on timestamps and maintains sorted order
   */
  mergeData(newData: DataPoint[]): void {
    if (newData.length === 0) return;

    // Get current data
    const currentData = this.getAll();

    // Combine and deduplicate by timestamp
    const combined = [...currentData, ...newData];
    const uniqueMap = new Map<number, DataPoint>();

    for (const point of combined) {
      uniqueMap.set(point.t, point);
    }

    // Get unique points and sort by timestamp
    const sortedPoints = Array.from(uniqueMap.values()).sort(
      (a, b) => a.t - b.t,
    );

    // Clear and refill
    this.clear();
    for (const point of sortedPoints) {
      if (this.isFull()) break;
      this.push(point);
    }
  }

  /**
   * Get time window covered by current buffer
   */
  getTimeWindow(): number {
    const oldest = this.getOldestTime();
    const newest = this.getNewestTime();

    if (oldest === null || newest === null) return 0;
    return newest - oldest;
  }
}
