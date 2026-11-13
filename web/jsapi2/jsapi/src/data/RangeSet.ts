/**
 * An immutable, sorted set of non-negative integers stored as inclusive ranges. Row positions (which is all the client
 * works with) fit in a double exactly.
 */
export class RangeSet {
  static readonly EMPTY = new RangeSet([]);

  /** Sorted, non-overlapping, non-adjacent inclusive ranges. */
  private constructor(private readonly ranges: readonly (readonly [number, number])[]) {}

  static ofRange(first: number, last: number): RangeSet {
    return last < first ? RangeSet.EMPTY : new RangeSet([[first, last]]);
  }

  /** Builds a set from ranges in any order, which may overlap or touch. */
  static fromRanges(ranges: Iterable<readonly [number, number]>): RangeSet {
    const sorted = [...ranges].filter(([a, b]) => b >= a).sort((x, y) => x[0] - y[0]);
    const merged: [number, number][] = [];
    for (const [first, last] of sorted) {
      const prev = merged[merged.length - 1];
      if (prev != null && first <= prev[1] + 1) {
        prev[1] = Math.max(prev[1], last);
      } else {
        merged.push([first, last]);
      }
    }
    return merged.length === 0 ? RangeSet.EMPTY : new RangeSet(merged);
  }

  /** Builds a set from sorted ranges that may touch, but are known not to overlap or be out of order. */
  static fromSortedRanges(ranges: (readonly [number, number])[]): RangeSet {
    const merged: [number, number][] = [];
    for (const [first, last] of ranges) {
      const prev = merged[merged.length - 1];
      if (prev != null && first <= prev[1] + 1) {
        prev[1] = Math.max(prev[1], last);
      } else {
        merged.push([first, last]);
      }
    }
    return merged.length === 0 ? RangeSet.EMPTY : new RangeSet(merged);
  }

  get isEmpty(): boolean {
    return this.ranges.length === 0;
  }

  get size(): number {
    let size = 0;
    for (const [first, last] of this.ranges) {
      size += last - first + 1;
    }
    return size;
  }

  get rangeCount(): number {
    return this.ranges.length;
  }

  /** The first value, or -1 if empty. */
  get first(): number {
    return this.ranges.length === 0 ? -1 : this.ranges[0][0];
  }

  /** The last value, or -1 if empty. */
  get last(): number {
    return this.ranges.length === 0 ? -1 : this.ranges[this.ranges.length - 1][1];
  }

  rangeIterator(): IterableIterator<readonly [number, number]> {
    return this.ranges[Symbol.iterator]();
  }

  *[Symbol.iterator](): IterableIterator<number> {
    for (const [first, last] of this.ranges) {
      for (let i = first; i <= last; i++) {
        yield i;
      }
    }
  }

  has(value: number): boolean {
    return this.indexOf(value) >= 0;
  }

  /** The position of `value` within this set, or -1 if it is not a member. */
  indexOf(value: number): number {
    let position = 0;
    for (const [first, last] of this.ranges) {
      if (value < first) {
        return -1;
      }
      if (value <= last) {
        return position + value - first;
      }
      position += last - first + 1;
    }
    return -1;
  }

  /** The value at `position` within this set, or -1 if the set is not that large. */
  get(position: number): number {
    let remaining = position;
    for (const [first, last] of this.ranges) {
      const count = last - first + 1;
      if (remaining < count) {
        return first + remaining;
      }
      remaining -= count;
    }
    return -1;
  }

  union(other: RangeSet): RangeSet {
    if (other.isEmpty) {
      return this;
    }
    if (this.isEmpty) {
      return other;
    }
    return RangeSet.fromRanges([...this.ranges, ...other.ranges]);
  }

  minus(other: RangeSet): RangeSet {
    if (other.isEmpty || this.isEmpty) {
      return this;
    }
    const result: [number, number][] = [];
    let j = 0;
    for (const [first, last] of this.ranges) {
      let start = first;
      while (j < other.ranges.length && other.ranges[j][1] < start) {
        j++;
      }
      let k = j;
      while (k < other.ranges.length && other.ranges[k][0] <= last) {
        const [oFirst, oLast] = other.ranges[k];
        if (oFirst > start) {
          result.push([start, oFirst - 1]);
        }
        start = Math.max(start, oLast + 1);
        if (start > last) {
          break;
        }
        k++;
      }
      if (start <= last) {
        result.push([start, last]);
      }
    }
    return result.length === 0 ? RangeSet.EMPTY : new RangeSet(result);
  }

  intersect(other: RangeSet): RangeSet {
    const result: [number, number][] = [];
    let i = 0;
    let j = 0;
    while (i < this.ranges.length && j < other.ranges.length) {
      const [aFirst, aLast] = this.ranges[i];
      const [bFirst, bLast] = other.ranges[j];
      const first = Math.max(aFirst, bFirst);
      const last = Math.min(aLast, bLast);
      if (first <= last) {
        result.push([first, last]);
      }
      if (aLast < bLast) {
        i++;
      } else {
        j++;
      }
    }
    return result.length === 0 ? RangeSet.EMPTY : new RangeSet(result);
  }

  equals(other: RangeSet): boolean {
    if (this.ranges.length !== other.ranges.length) {
      return false;
    }
    return this.ranges.every(([first, last], i) => other.ranges[i][0] === first && other.ranges[i][1] === last);
  }

  toString(): string {
    return `{${this.ranges.map(([first, last]) => (first === last ? `${first}` : `${first}-${last}`)).join(',')}}`;
  }
}
