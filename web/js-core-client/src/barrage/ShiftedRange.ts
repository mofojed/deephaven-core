import { decodeCompressedRangeSet } from './CompressedRangeSet.js';

export interface ShiftedRange {
  /** Source range (inclusive). */
  readonly first: number;
  readonly last: number;
  /** Signed offset applied to keys in [first, last]. */
  readonly delta: number;
}

/**
 * Decode a Barrage shift-data payload into a list of {@link ShiftedRange}s.
 * Port of `web/client-api/src/main/java/io/deephaven/web/client/api/barrage/ShiftedRangeReader.java`.
 *
 * Wire layout: three back-to-back CompressedRangeSets — startPositions,
 * endPositions, postShiftStartPositions.
 */
export function decodeShiftedRanges(bytes: Uint8Array): ShiftedRange[] {
  // Each decoder starts at the buffer's current position and reads until its
  // END marker. In this Java port, ranges are concatenated in the same blob,
  // so we need to track how many bytes each decode consumed. The Java code
  // relies on ByteBuffer.position(); we replicate by splitting the buffer at
  // END markers.
  const parts = splitAtEndMarkers(bytes, 3);
  const start = decodeCompressedRangeSet(parts[0]!).toArray();
  const end = decodeCompressedRangeSet(parts[1]!).toArray();
  const post = decodeCompressedRangeSet(parts[2]!).toArray();

  const out: ShiftedRange[] = [];
  for (let i = 0; i < start.length; i++) {
    const first = start[i]!;
    const last = end[i]!;
    const delta = post[i]! - first;
    out.push({ first, last, delta });
  }
  return out;
}

/**
 * Walk `bytes` and return the first `n` CompressedRangeSet-terminated
 * sub-buffers (everything up to and including each END byte).
 */
function splitAtEndMarkers(bytes: Uint8Array, n: number): Uint8Array[] {
  const END_CMD = 0b00100000;
  const VALUE_MASK = 0b00000111;
  const CMD_MASK = 0b00111000;
  const BYTE_VALUE = 0b00000100;
  const SHORT_VALUE = 0b00000001;
  const INT_VALUE = 0b00000010;
  const LONG_VALUE = 0b00000011;

  const sizeForValue = (cmd: number): number => {
    switch (cmd & VALUE_MASK) {
      case BYTE_VALUE:
        return 1;
      case SHORT_VALUE:
        return 2;
      case INT_VALUE:
        return 4;
      case LONG_VALUE:
        return 8;
      default:
        throw new Error(`bad value size in cmd ${cmd}`);
    }
  };

  const out: Uint8Array[] = [];
  let start = 0;
  let pos = 0;
  while (out.length < n && pos < bytes.length) {
    const cmd = bytes[pos++]!;
    const op = cmd & CMD_MASK;
    if (op === END_CMD) {
      out.push(bytes.subarray(start, pos));
      start = pos;
      continue;
    }
    const count = readInlineValue(bytes, pos, cmd);
    pos = count.pos;
    if (op === 0b00010000 /* SHORT_ARRAY */) {
      pos += count.value * 2;
    } else if (op === 0b00011000 /* BYTE_ARRAY */) {
      pos += count.value;
    }
    // OFFSET has no payload beyond the inline value.
  }
  if (out.length !== n) throw new Error('decodeShiftedRanges: incomplete payload');
  return out;
}

function readInlineValue(
  bytes: Uint8Array,
  pos: number,
  cmd: number,
): { value: number; pos: number } {
  const VALUE_MASK = 0b00000111;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (cmd & VALUE_MASK) {
    case 0b100:
      return { value: view.getInt8(pos), pos: pos + 1 };
    case 0b001:
      return { value: view.getInt16(pos, true), pos: pos + 2 };
    case 0b010:
      return { value: view.getInt32(pos, true), pos: pos + 4 };
    case 0b011:
      return { value: Number(view.getBigInt64(pos, true)), pos: pos + 8 };
    default:
      throw new Error(`bad value size in cmd ${cmd}`);
  }
}
