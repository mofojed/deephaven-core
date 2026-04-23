import { tableFromArrays, tableToIPC, type Table as ArrowTable } from 'apache-arrow';
import { Builder } from 'flatbuffers';
import { encodeCompressedRangeSet } from '../../barrage/CompressedRangeSet.js';
import { BARRAGE_MAGIC, BarrageMessageType } from '../../barrage/flatbuf/BarrageMessageType.js';
import { BarrageMessageWrapper } from '../../barrage/flatbuf/BarrageMessageWrapper.js';
import { BarrageUpdateMetadata } from '../../barrage/flatbuf/BarrageUpdateMetadata.js';
import { RangeSet } from '../../barrage/RangeSet.js';
import type { DoExchangeFrame } from '../../transport/OpenApiTransport.js';

/**
 * Build a sequence of `DoExchangeFrame`s that together deliver a snapshot
 * Barrage message for the given column data. Used by viewport unit tests.
 */
export function makeSnapshotFrames(
  columns: Record<string, ArrayLike<unknown>>,
  opts: { tableSize?: number; rowsIncludedStart?: number } = {},
): DoExchangeFrame[] {
  const arrowTable = tableFromArrays(columns as Record<string, ArrayLike<number | bigint | string>>);
  const ipcBytes = tableToIPC(arrowTable, 'stream');
  const { schemaHeader, batches } = splitIpcStream(ipcBytes);

  const rowCount = arrowTable.numRows;
  const rowsIncludedStart = opts.rowsIncludedStart ?? 0;
  const tableSize = opts.tableSize ?? rowsIncludedStart + rowCount;
  const rowsIncluded = RangeSet.ofRange(rowsIncludedStart, rowsIncludedStart + rowCount - 1);
  const metadata = encodeBarrageSnapshotMetadata({ rowsIncluded, tableSize });

  const frames: DoExchangeFrame[] = [];
  frames.push({ dataHeader: schemaHeader, appMetadata: new Uint8Array(0), dataBody: new Uint8Array(0) });

  for (let i = 0; i < batches.length; i++) {
    frames.push({
      dataHeader: batches[i]!.header,
      appMetadata: i === 0 ? metadata : new Uint8Array(0),
      dataBody: batches[i]!.body,
    });
  }
  return frames;
}

/**
 * Split an Arrow IPC stream into its framed messages, stripping the
 * continuation + length prefix so each piece can be placed into a
 * FlightData `data_header` / `data_body`.
 */
function splitIpcStream(bytes: Uint8Array): {
  schemaHeader: Uint8Array;
  batches: Array<{ header: Uint8Array; body: Uint8Array }>;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  let schemaHeader: Uint8Array | null = null;
  const batches: Array<{ header: Uint8Array; body: Uint8Array }> = [];

  while (pos < bytes.length) {
    const contMarker = view.getUint32(pos, true);
    pos += 4;
    if (contMarker !== 0xffffffff) break;
    const len = view.getUint32(pos, true);
    pos += 4;
    if (len === 0) break; // EOS
    const header = bytes.subarray(pos, pos + len);
    pos += len;
    // Align to 8-byte boundary (relative to start of message including prefix).
    // Here we advanced by (8 prefix + len header); pad so pos % 8 == 0.
    if (pos % 8 !== 0) pos += 8 - (pos % 8);

    // Peek body length from the Message flatbuffer: bodyLength is in the Message root.
    // Easier: the next continuation marker is at pos + bodyLength (rounded to 8). We
    // search forward for the next 0xFFFFFFFF. If we don't find one (or find EOS),
    // body extends to end.
    let bodyEnd = bytes.length;
    for (let scan = pos; scan + 4 <= bytes.length; scan += 8) {
      if (view.getUint32(scan, true) === 0xffffffff) {
        bodyEnd = scan;
        break;
      }
    }
    const body = bytes.subarray(pos, bodyEnd);
    pos = bodyEnd;

    if (schemaHeader === null) {
      schemaHeader = header;
    } else {
      batches.push({ header, body });
    }
  }
  if (!schemaHeader) throw new Error('splitIpcStream: no schema found');
  return { schemaHeader, batches };
}

function encodeBarrageSnapshotMetadata(args: {
  rowsIncluded: RangeSet;
  tableSize: number;
  reversed?: boolean;
}): Uint8Array {
  const innerBuilder = new Builder(256);
  const includedBytes = encodeCompressedRangeSet(args.rowsIncluded);
  const addedBytes = includedBytes; // for snapshot, addedRows == rowsIncluded
  const addedOffset = innerBuilder.createByteVector(addedBytes);
  const includedOffset = innerBuilder.createByteVector(includedBytes);

  innerBuilder.startObject(12);
  innerBuilder.addFieldInt8(2, 1, 0); // isSnapshot = true
  innerBuilder.addFieldOffset(6, addedOffset, 0); // addedRows
  innerBuilder.addFieldOffset(9, includedOffset, 0); // addedRowsIncluded
  innerBuilder.addFieldInt8(4, args.reversed ? 1 : 0, 0); // effectiveReverseViewport
  innerBuilder.addFieldInt64(11, BigInt(args.tableSize), 0n); // tableSize
  const metaOffset = innerBuilder.endObject();
  innerBuilder.finish(metaOffset);
  const innerBytes = innerBuilder.asUint8Array();

  void BarrageUpdateMetadata; // imported for future type checks
  void encodeBarrageSnapshotMetadataFromInner; // keep the helper referenced

  const outer = new Builder(innerBytes.length + 64);
  const payloadOffset = outer.createByteVector(innerBytes);
  BarrageMessageWrapper.startBarrageMessageWrapper(outer);
  BarrageMessageWrapper.addMagic(outer, BARRAGE_MAGIC);
  BarrageMessageWrapper.addMsgType(outer, BarrageMessageType.BarrageUpdateMetadata);
  BarrageMessageWrapper.addMsgPayload(outer, payloadOffset);
  outer.finish(BarrageMessageWrapper.endBarrageMessageWrapper(outer));
  return outer.asUint8Array();
}

// Placeholder to keep the inner metadata helper if we split it out later.
function encodeBarrageSnapshotMetadataFromInner(inner: Uint8Array): Uint8Array {
  return inner;
}

// Re-export Arrow types for test helpers that want to inspect results.
export type { ArrowTable };
