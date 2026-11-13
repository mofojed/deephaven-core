import { RangeSet } from './RangeSet.js';

// Commands of Deephaven's compressed row set encoding (ExternalizableRowSetUtils on the server)
const SHORT_VALUE = 0b00000001;
const INT_VALUE = 0b00000010;
const LONG_VALUE = 0b00000011;
const BYTE_VALUE = 0b00000100;
const VALUE_MASK = 0b00000111;

const OFFSET = 0b00001000;
const SHORT_ARRAY = 0b00010000;
const BYTE_ARRAY = 0b00011000;
const END = 0b00100000;
const CMD_MASK = 0b00111000;

/** A shifted range of row keys from a Barrage update: keys `first..last` moved by `delta`. */
export interface ShiftedRange {
  readonly first: number;
  readonly last: number;
  readonly delta: number;
}

class Reader {
  private readonly view: DataView;
  pos = 0;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  int8(): number {
    return this.view.getInt8(this.pos++);
  }

  int16(): number {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  int32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  int64(): number {
    const v = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return Number(v);
  }

  value(command: number): number {
    switch (command & VALUE_MASK) {
      case LONG_VALUE:
        return this.int64();
      case INT_VALUE:
        return this.int32();
      case SHORT_VALUE:
        return this.int16();
      case BYTE_VALUE:
        return this.int8();
      default:
        throw new Error(`Bad row set command ${command}`);
    }
  }
}

function readRangeSet(reader: Reader): RangeSet {
  const ranges: [number, number][] = [];
  let pending = -1;
  let offset = 0;
  const append = (value: number) => {
    if (pending === -1) {
      pending = value;
    } else if (value < 0) {
      ranges.push([pending, -value]);
      pending = -1;
    } else {
      ranges.push([pending, pending]);
      pending = value;
    }
  };
  const appendDelta = (delta: number) => {
    const actual = offset + Math.abs(delta);
    append(delta < 0 ? -actual : actual);
    offset = actual;
  };
  for (;;) {
    const command = reader.int8() & 0xff;
    switch (command & CMD_MASK) {
      case OFFSET:
        appendDelta(reader.value(command));
        break;
      case SHORT_ARRAY: {
        const count = reader.value(command);
        for (let i = 0; i < count; i++) {
          appendDelta(reader.int16());
        }
        break;
      }
      case BYTE_ARRAY: {
        const count = reader.value(command);
        for (let i = 0; i < count; i++) {
          appendDelta(reader.int8());
        }
        break;
      }
      case END:
        if (pending >= 0) {
          ranges.push([pending, pending]);
        }
        return RangeSet.fromSortedRanges(ranges);
      default:
        throw new Error(`Bad row set command ${command} at ${reader.pos - 1}`);
    }
  }
}

/** Decodes a row set in Deephaven's compressed encoding. An empty or missing buffer is the empty set. */
export function decodeRangeSet(bytes: Uint8Array | null | undefined): RangeSet {
  if (bytes == null || bytes.byteLength === 0) {
    return RangeSet.EMPTY;
  }
  return readRangeSet(new Reader(bytes));
}

/** Decodes Barrage shift data: three row sets holding each shift's first key, last key, and new first key. */
export function decodeShifts(bytes: Uint8Array | null | undefined): ShiftedRange[] {
  if (bytes == null || bytes.byteLength === 0) {
    return [];
  }
  const reader = new Reader(bytes);
  const starts = [...readRangeSet(reader)];
  const ends = [...readRangeSet(reader)];
  const postShiftStarts = [...readRangeSet(reader)];
  return starts.map((first, i) => ({ first, last: ends[i], delta: postShiftStarts[i] - first }));
}

function writeValue(out: number[], command: number, value: number): void {
  if (value > 0x7fffffff || value < -0x80000000) {
    out.push(command | LONG_VALUE);
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true);
    out.push(...bytes);
  } else if (value > 0x7fff || value < -0x8000) {
    out.push(command | INT_VALUE);
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setInt32(0, value, true);
    out.push(...bytes);
  } else if (value > 0x7f || value < -0x80) {
    out.push(command | SHORT_VALUE);
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setInt16(0, value, true);
    out.push(...bytes);
  } else {
    out.push(command | BYTE_VALUE, value & 0xff);
  }
}

/**
 * Encodes a row set in Deephaven's compressed encoding. Every value is written as its own delta from the previous one;
 * the server accepts this simplest form of the encoding, and the row sets a client sends are small.
 */
export function encodeRangeSet(set: RangeSet): Uint8Array {
  const out: number[] = [];
  let offset = 0;
  for (const [first, last] of set.rangeIterator()) {
    writeValue(out, OFFSET, first - offset);
    offset = first;
    if (last !== first) {
      writeValue(out, OFFSET, -(last - offset));
      offset = last;
    }
  }
  out.push(END);
  return Uint8Array.from(out);
}
