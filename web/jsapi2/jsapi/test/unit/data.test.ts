import { describe, expect, it } from 'vitest';
import type { BarrageMessage } from '../../src/data/barrage.js';
import { DateTime } from '../../src/data/DateTime.js';
import { RangeSet } from '../../src/data/RangeSet.js';
import { decodeRangeSet, decodeShifts, encodeRangeSet } from '../../src/data/rowsetCodec.js';
import { applyPositionalUpdate, ViewportState } from '../../src/data/ViewportState.js';
import { encodeFrame, FrameParser } from '../../src/grpc/frames.js';

describe('row set codec', () => {
  it.each([
    ['empty', RangeSet.EMPTY],
    ['single value', RangeSet.ofRange(5, 5)],
    ['ranges and values', RangeSet.fromRanges([[0, 9], [12, 12], [100, 40_000], [70_000, 70_001]])],
    ['values past 2^31', RangeSet.fromRanges([[1, 1], [2 ** 33, 2 ** 33 + 10]])],
  ])('round-trips %s', (_name, set) => {
    expect(decodeRangeSet(encodeRangeSet(set)).equals(set)).toBe(true);
  });

  it('decodes the short and byte arrays the server writes', () => {
    // SHORT_ARRAY of 2: [1000, -1500] => 1000..2500; BYTE_ARRAY of 2: [3, -2] => 2503..2505; END
    const bytes = Uint8Array.from([0x14, 2, 0xe8, 0x03, 0x24, 0xfa, 0x1c, 2, 3, 0xfe, 0x20]);
    expect(decodeRangeSet(bytes).toString()).toBe('{1000-2500,2503-2505}');
  });

  it('decodes shift data as three row sets of firsts, lasts and new firsts', () => {
    const shifts = new Uint8Array([
      ...encodeRangeSet(RangeSet.fromRanges([[10, 10], [20, 20]])),
      ...encodeRangeSet(RangeSet.fromRanges([[15, 15], [25, 25]])),
      ...encodeRangeSet(RangeSet.fromRanges([[12, 12], [30, 30]])),
    ]);
    expect(decodeShifts(shifts)).toEqual([
      { first: 10, last: 15, delta: 2 },
      { first: 20, last: 25, delta: 10 },
    ]);
  });
});

describe('RangeSet', () => {
  const set = RangeSet.fromRanges([[0, 2], [5, 6], [10, 10]]);

  it('finds values by position and positions by value', () => {
    expect([...set]).toEqual([0, 1, 2, 5, 6, 10]);
    expect(set.get(3)).toBe(5);
    expect(set.get(6)).toBe(-1);
    expect(set.indexOf(6)).toBe(4);
    expect(set.indexOf(4)).toBe(-1);
  });

  it('subtracts and intersects', () => {
    expect(set.minus(RangeSet.ofRange(1, 5)).toString()).toBe('{0,6,10}');
    expect(set.intersect(RangeSet.ofRange(2, 9)).toString()).toBe('{2,5-6}');
  });
});

describe('applyPositionalUpdate', () => {
  it('removes rows by their old positions, then inserts added rows at their new positions', () => {
    const before = ['a', 'b', 'c', 'd'];
    const after = applyPositionalUpdate(before, ['x', 'y'], RangeSet.fromRanges([[0, 0], [3, 3]]), RangeSet.ofRange(1, 2));
    expect(after).toEqual(['x', 'a', 'd', 'y']);
    expect(before).toEqual(['a', 'b', 'c', 'd']);
  });
});

function message(overrides: Partial<BarrageMessage>): BarrageMessage {
  return {
    isSnapshot: false,
    snapshotRowSet: null,
    snapshotColumns: null,
    snapshotRowSetIsReversed: false,
    tableSize: 0,
    rowsAdded: RangeSet.EMPTY,
    rowsRemoved: RangeSet.EMPTY,
    shifted: [],
    rowsIncluded: RangeSet.EMPTY,
    addColumnData: [[], []],
    modColumnData: [],
    ...overrides,
  };
}

describe('ViewportState', () => {
  const columns = [
    { name: 'A', type: 'int', componentType: null, index: 0, description: null, isPartitionColumn: false },
    { name: 'B', type: 'int', componentType: null, index: 1, description: null, isPartitionColumn: false },
  ];

  it('applies a snapshot, then adds, removes and modifications in viewport positions', () => {
    const state = new ViewportState(2);
    state.apply(
      message({
        isSnapshot: true,
        snapshotRowSet: RangeSet.ofRange(10, 12),
        tableSize: 100,
        rowsAdded: RangeSet.ofRange(0, 2),
        rowsIncluded: RangeSet.ofRange(0, 2),
        addColumnData: [
          [1, 2, 3],
          [10, 20, 30],
        ],
      })
    );
    let data = state.toTableData(columns);
    expect(data.offset).toBe(10);
    expect(data.rows.map(r => r.get('A'))).toEqual([1, 2, 3]);

    // A row inserted above the viewport pushes its last row out, and B changes in the (new) first row
    state.apply(
      message({
        tableSize: 101,
        rowsAdded: RangeSet.ofRange(0, 0),
        rowsRemoved: RangeSet.ofRange(2, 2),
        rowsIncluded: RangeSet.ofRange(0, 0),
        addColumnData: [[0], [0]],
        modColumnData: [
          { rowsModified: RangeSet.EMPTY, data: [] },
          { rowsModified: RangeSet.ofRange(1, 1), data: [11] },
        ],
      })
    );
    data = state.toTableData(columns);
    expect(data.rows.map(r => [r.position, r.get('A'), r.get('B')])).toEqual([
      [10, 0, 0],
      [11, 1, 11],
      [12, 2, 20],
    ]);
    expect(data.totalSize).toBe(101);
  });

  it('holds only the rows that exist when the viewport extends past the end of the table', () => {
    const state = new ViewportState(2);
    state.apply(
      message({
        isSnapshot: true,
        snapshotRowSet: RangeSet.ofRange(0, 9),
        snapshotColumns: [true, false],
        tableSize: 2,
        rowsAdded: RangeSet.ofRange(0, 1),
        rowsIncluded: RangeSet.ofRange(0, 1),
        addColumnData: [[5, 6], []],
      })
    );
    const data = state.toTableData(columns);
    expect(data.positions.toString()).toBe('{0-1}');
    expect(data.columns.map(c => c.name)).toEqual(['A']);
    expect(() => data.getData(0, 'B')).toThrow(/not part of this data/);
  });
});

describe('grpc frames', () => {
  it('reassembles data and trailer frames split across chunks', () => {
    const data = encodeFrame(Uint8Array.from([1, 2, 3]));
    const trailerText = new TextEncoder().encode('grpc-status: 0\r\ngrpc-message: ok\r\n');
    const trailer = new Uint8Array(5 + trailerText.length);
    trailer[0] = 0x80;
    new DataView(trailer.buffer).setUint32(1, trailerText.length);
    trailer.set(trailerText, 5);
    const all = new Uint8Array([...data, ...trailer]);

    const parser = new FrameParser();
    const frames = [...parser.push(all.subarray(0, 4)), ...parser.push(all.subarray(4, 12)), ...parser.push(all.subarray(12))];
    expect(frames).toEqual([
      { kind: 'data', data: Uint8Array.from([1, 2, 3]) },
      { kind: 'trailers', metadata: { 'grpc-status': '0', 'grpc-message': 'ok' } },
    ]);
  });
});

describe('DateTime', () => {
  it('keeps nanoseconds, including before the epoch', () => {
    const t = new DateTime(1_704_164_645_123_456_789n);
    expect(t.toString()).toBe('2024-01-02T03:04:05.123456789Z');
    expect(t.toDate().toISOString()).toBe('2024-01-02T03:04:05.123Z');
    const before = new DateTime(-1n);
    expect(before.epochMillis).toBe(-1);
    expect(before.toString()).toBe('1969-12-31T23:59:59.999999999Z');
  });
});
