import { RangeSet, type Range } from './RangeSet.js';

/**
 * Deephaven's run-length compressed RowSet format. Direct port of
 * `web/client-api/src/main/java/io/deephaven/web/client/api/barrage/CompressedRangeSetReader.java`.
 *
 * Keeps the wire format byte-for-byte compatible with the server and with the
 * legacy JS API bundle.
 */

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

const SHORT_MAX = 32767;
const SHORT_MIN = -32768;
const BYTE_MAX = 127;
const BYTE_MIN = -128;

/** Decode a compressed row-set payload into a RangeSet. */
export function decodeCompressedRangeSet(bytes: Uint8Array): RangeSet {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  let offset = 0;
  let pending = -1;
  const ranges: Range[] = [];

  const append = (value: number): void => {
    if (pending === -1) {
      pending = value;
    } else if (value < 0) {
      ranges.push({ first: pending, last: -value });
      pending = -1;
    } else {
      ranges.push({ first: pending, last: pending });
      pending = value;
    }
  };

  const readValue = (command: number): number => {
    switch (command & VALUE_MASK) {
      case LONG_VALUE: {
        const v = view.getBigInt64(pos, true);
        pos += 8;
        return Number(v);
      }
      case INT_VALUE: {
        const v = view.getInt32(pos, true);
        pos += 4;
        return v;
      }
      case SHORT_VALUE: {
        const v = view.getInt16(pos, true);
        pos += 2;
        return v;
      }
      case BYTE_VALUE: {
        const v = view.getInt8(pos);
        pos += 1;
        return v;
      }
      default:
        throw new Error(`CompressedRangeSet: bad command ${command}`);
    }
  };

  for (;;) {
    const command = view.getUint8(pos++);
    switch (command & CMD_MASK) {
      case OFFSET: {
        const value = readValue(command);
        const actual = offset + Math.abs(value);
        append(value < 0 ? -actual : actual);
        offset = actual;
        break;
      }
      case SHORT_ARRAY: {
        const count = readValue(command);
        for (let i = 0; i < count; i++) {
          const s = view.getInt16(pos, true);
          pos += 2;
          const actual = offset + Math.abs(s);
          append(s < 0 ? -actual : actual);
          offset = actual;
        }
        break;
      }
      case BYTE_ARRAY: {
        const count = readValue(command);
        for (let i = 0; i < count; i++) {
          const b = view.getInt8(pos++);
          const actual = offset + Math.abs(b);
          append(b < 0 ? -actual : actual);
          offset = actual;
        }
        break;
      }
      case END:
        if (pending >= 0) append(pending);
        return RangeSet.fromSortedRanges(ranges);
      default:
        throw new Error(`CompressedRangeSet: bad command ${command} at ${pos - 1}`);
    }
  }
}

/**
 * Encode a `RangeSet` using the compact layout the server expects.
 * Mirrors `CompressedRangeSetReader.writeRange` in Java.
 */
export function encodeCompressedRangeSet(set: RangeSet): Uint8Array {
  // Generous upper bound: two 9-byte values per range, plus END.
  const payload: number[] = [];
  const shorts: number[] = [];
  let offset = 0;

  const flushShorts = (): void => {
    const size = shorts.length;
    let written = 0;
    let consecBytes = 0;
    for (let i = 0; i < size; i++) {
      const v = shorts[i]!;
      if (v <= BYTE_MAX && v >= BYTE_MIN) {
        consecBytes++;
        continue;
      }
      if (consecBytes >= 4) {
        const shortCount = i - written - consecBytes;
        writeShortsThenBytes(payload, shorts, written, shortCount, consecBytes);
        written = i;
      }
      consecBytes = 0;
    }
    const shortCount = size - written - consecBytes;
    writeShortsThenBytes(payload, shorts, written, shortCount, consecBytes);
    shorts.length = 0;
  };

  const appendWithDelta = (value: number, negate: boolean): number => {
    const delta = value - offset;
    if (delta >= SHORT_MAX) {
      flushShorts();
      writeValue(payload, OFFSET, negate ? -delta : delta);
      return value;
    }
    shorts.push(negate ? -delta : delta);
    return value;
  };

  for (const r of set.rangeIterator()) {
    offset = appendWithDelta(r.first, false);
    if (r.last !== r.first) {
      offset = appendWithDelta(r.last, true);
    }
  }
  flushShorts();
  payload.push(END);

  return Uint8Array.from(payload);
}

function writeShortsThenBytes(
  out: number[],
  shorts: number[],
  index: number,
  shortCount: number,
  byteCount: number,
): void {
  if (shortCount === 1) {
    writeValue(out, OFFSET, shorts[index++]!);
  } else if (shortCount > 1) {
    writeValue(out, SHORT_ARRAY, shortCount);
    const limit = index + shortCount;
    while (index < limit) pushInt16LE(out, shorts[index++]!);
  }
  if (byteCount === 1) {
    writeValue(out, OFFSET, shorts[index]!);
  } else if (byteCount > 1) {
    writeValue(out, BYTE_ARRAY, byteCount);
    const limit = index + byteCount;
    while (index < limit) out.push(shorts[index++]! & 0xff);
  }
}

function writeValue(out: number[], command: number, value: number): void {
  if (value > 0x7fffffff || value < -0x80000000) {
    out.push(command | LONG_VALUE);
    pushInt64LE(out, value);
  } else if (value > SHORT_MAX || value < SHORT_MIN) {
    out.push(command | INT_VALUE);
    pushInt32LE(out, value);
  } else if (value > BYTE_MAX || value < BYTE_MIN) {
    out.push(command | SHORT_VALUE);
    pushInt16LE(out, value);
  } else {
    out.push(command | BYTE_VALUE);
    out.push(value & 0xff);
  }
}

function pushInt16LE(out: number[], v: number): void {
  out.push(v & 0xff, (v >> 8) & 0xff);
}

function pushInt32LE(out: number[], v: number): void {
  out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
}

function pushInt64LE(out: number[], v: number): void {
  const big = BigInt(v);
  for (let i = 0; i < 8; i++) {
    out.push(Number((big >> BigInt(i * 8)) & 0xffn));
  }
}
