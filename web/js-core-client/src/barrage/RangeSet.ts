/**
 * A range of row keys [first, last] (inclusive on both ends).
 */
export interface Range {
  readonly first: number;
  readonly last: number;
}

/**
 * Sorted, non-overlapping set of ranges. Mutable in-place.
 *
 * We only need the small surface used by Barrage decoding + viewport emission:
 * build from sorted ranges, iterate row keys, test membership, compute the
 * number of keys. Full set arithmetic (union/subtract/shift) can be added as
 * needed in later slices.
 *
 * Row keys are modeled as JS numbers. Deephaven servers use int64 internally
 * but practical viewports live comfortably below 2^53.
 */
export class RangeSet {
  private readonly ranges: Range[];

  private constructor(ranges: Range[]) {
    this.ranges = ranges;
  }

  /** Build from an already-sorted, non-overlapping list. Takes ownership. */
  static fromSortedRanges(ranges: Range[]): RangeSet {
    return new RangeSet(ranges);
  }

  /** Single-range convenience. */
  static ofRange(first: number, last: number): RangeSet {
    return new RangeSet([{ first, last }]);
  }

  static empty(): RangeSet {
    return new RangeSet([]);
  }

  get rangeCount(): number {
    return this.ranges.length;
  }

  /** Inclusive row-key count. */
  get size(): number {
    let n = 0;
    for (const r of this.ranges) n += r.last - r.first + 1;
    return n;
  }

  /** Iterate the ranges in order. */
  rangeIterator(): IterableIterator<Range> {
    return this.ranges[Symbol.iterator]();
  }

  /** Iterate every row key in order. */
  *indexIterator(): IterableIterator<number> {
    for (const r of this.ranges) {
      for (let k = r.first; k <= r.last; k++) yield k;
    }
  }

  /** Materialize all row keys. Convenient; not memory-efficient for huge sets. */
  toArray(): number[] {
    return Array.from(this.indexIterator());
  }
}
