import type * as Core from '@deephaven/jsapi-core';
import type { CoreModule } from '../core.js';
import { BatchContext, type ColumnReader, columnReader, DictionaryRegistry } from './arrow.js';
import { RangeSet } from './RangeSet.js';
import { decodeRangeSet, decodeShifts, type ShiftedRange } from './rowsetCodec.js';
import { readMessage } from './schema.js';

/** One complete Barrage update, assembled from the FlightData messages that carry it. */
export interface BarrageMessage {
  readonly isSnapshot: boolean;
  /** For a snapshot, the viewport (in positions) the server is now sending, or null for the whole table. */
  readonly snapshotRowSet: RangeSet | null;
  /** For a snapshot, the columns the server is now sending, or null for all of them. */
  readonly snapshotColumns: readonly boolean[] | null;
  readonly snapshotRowSetIsReversed: boolean;
  readonly tableSize: number;
  readonly rowsAdded: RangeSet;
  readonly rowsRemoved: RangeSet;
  readonly shifted: readonly ShiftedRange[];
  /** The added rows whose data this update includes. */
  readonly rowsIncluded: RangeSet;
  /** Per column, the values of the included rows. */
  readonly addColumnData: unknown[][];
  /** Per column, which rows were modified and their new values. */
  readonly modColumnData: { rowsModified: RangeSet; data: unknown[] }[];
}

interface MutableMessage extends BarrageMessage {
  addColumnData: unknown[][];
  modColumnData: { rowsModified: RangeSet; data: unknown[] }[];
}

/** Flatbuffers reads `[byte]` vectors as signed; view them as the unsigned bytes they are. */
function u8(bytes: Int8Array | null | undefined): Uint8Array | null {
  return bytes == null ? null : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function decodeBitSet(bytes: Uint8Array | null): boolean[] | null {
  if (bytes == null) {
    return null;
  }
  const result: boolean[] = [];
  for (let i = 0; i < bytes.length * 8; i++) {
    result.push((bytes[i >> 3] & (1 << (i & 7))) !== 0);
  }
  return result;
}

/**
 * Reads the FlightData messages of a Barrage stream (a subscription or a snapshot) into complete updates. The first
 * message is the schema; each update then starts with metadata naming its rows, followed by record batches with the
 * added rows' data, then the modified rows' data.
 */
export class BarrageMessageReader {
  private readers: ColumnReader[] | null = null;
  private readonly dictionaries = new DictionaryRegistry();
  private msg: MutableMessage | null = null;
  private numAddRowsRead = 0;
  private numAddRowsTotal = 0;
  private numModRowsRead = 0;
  private numModRowsTotal = 0;

  constructor(private readonly core: CoreModule) {}

  /** The schema of the stream, once it has arrived. */
  schema: Core.arrow.Schema | null = null;

  /** Reads one FlightData message, returning the update it completes, if any. */
  parse(flightData: Core.flight.FlightData): BarrageMessage | null {
    const { core } = this;
    const { arrow, barrage, flatbuffers } = core;
    if (flightData.appMetadata.byteLength > 0) {
      const wrapper = barrage.BarrageMessageWrapper.getRootAsBarrageMessageWrapper(
        new flatbuffers.ByteBuffer(flightData.appMetadata)
      );
      if (wrapper.magic() === core.BARRAGE_MAGIC && wrapper.msgType() === barrage.BarrageMessageType.BarrageUpdateMetadata) {
        this.startUpdate(
          barrage.BarrageUpdateMetadata.getRootAsBarrageUpdateMetadata(
            new flatbuffers.ByteBuffer(u8(wrapper.msgPayloadArray()) ?? new Uint8Array(0))
          )
        );
      }
    }
    if (flightData.dataHeader.byteLength === 0) {
      return null;
    }
    const header = readMessage(core, flightData.dataHeader);
    const headerType = header.headerType();
    if (headerType === arrow.MessageHeader.Schema) {
      const schema = header.header(new arrow.Schema()) as Core.arrow.Schema;
      this.schema = schema;
      this.readers = [];
      for (let i = 0; i < schema.fieldsLength(); i++) {
        this.readers.push(columnReader(core, schema.fields(i)!, this.dictionaries));
      }
      return null;
    }
    if (headerType === arrow.MessageHeader.DictionaryBatch) {
      this.dictionaries.apply(header.header(new arrow.DictionaryBatch()) as Core.arrow.DictionaryBatch, flightData.dataBody);
      return null;
    }
    if (headerType !== arrow.MessageHeader.RecordBatch) {
      throw new Error(`Unsupported Arrow message ${arrow.MessageHeader[headerType]} in Barrage stream`);
    }
    const msg = this.msg;
    const readers = this.readers;
    if (msg == null || readers == null) {
      throw new Error('Record batch arrived without its schema or update metadata');
    }
    const batch = header.header(new arrow.RecordBatch()) as Core.arrow.RecordBatch;
    if (batch.compression() != null) {
      throw new Error('Compressed Barrage record batches are not supported');
    }
    const length = Number(batch.length());
    const ctx = new BatchContext(batch, flightData.dataBody);

    // Added rows all arrive before the first modified rows, and are never in the same batch
    if (this.numAddRowsRead < this.numAddRowsTotal) {
      if (length > this.numAddRowsTotal - this.numAddRowsRead) {
        throw new Error('Record batch has more rows than the update metadata promised');
      }
      for (let ci = 0; ci < msg.addColumnData.length; ci++) {
        const values = readers[ci](ctx);
        const column = msg.addColumnData[ci];
        for (const v of values) {
          column.push(v);
        }
      }
      this.numAddRowsRead += length;
    } else {
      for (let ci = 0; ci < msg.modColumnData.length; ci++) {
        // Each column's node holds only as many rows as that column still has modified
        const values = readers[ci](ctx);
        const column = msg.modColumnData[ci].data;
        for (const v of values) {
          column.push(v);
        }
      }
      this.numModRowsRead += length;
    }

    if (this.numAddRowsRead >= this.numAddRowsTotal && this.numModRowsRead >= this.numModRowsTotal) {
      this.msg = null;
      return msg;
    }
    return null;
  }

  private startUpdate(metadata: Core.barrage.BarrageUpdateMetadata): void {
    if (this.msg != null) {
      throw new Error('Barrage update metadata arrived before the previous update was complete');
    }
    const columnCount = this.readers?.length ?? 0;
    const isSnapshot = metadata.isSnapshot();
    const rowsAdded = decodeRangeSet(u8(metadata.addedRowsArray()));
    const included = u8(metadata.addedRowsIncludedArray());
    const rowsIncluded = included != null ? decodeRangeSet(included) : rowsAdded;
    const modColumnData: { rowsModified: RangeSet; data: unknown[] }[] = [];
    let numModRowsTotal = 0;
    for (let i = 0; i < metadata.modColumnNodesLength(); i++) {
      const rowsModified = decodeRangeSet(u8(metadata.modColumnNodes(i)?.modifiedRowsArray()));
      modColumnData.push({ rowsModified, data: [] });
      numModRowsTotal = Math.max(numModRowsTotal, rowsModified.size);
    }
    this.msg = {
      isSnapshot,
      snapshotRowSet:
        isSnapshot && metadata.effectiveViewportArray() != null ? decodeRangeSet(u8(metadata.effectiveViewportArray())) : null,
      snapshotColumns: isSnapshot ? decodeBitSet(u8(metadata.effectiveColumnSetArray())) : null,
      snapshotRowSetIsReversed: metadata.effectiveReverseViewport(),
      tableSize: Number(metadata.tableSize()),
      rowsAdded,
      rowsRemoved: decodeRangeSet(u8(metadata.removedRowsArray())),
      shifted: decodeShifts(u8(metadata.shiftDataArray())),
      rowsIncluded,
      addColumnData: Array.from({ length: columnCount }, () => []),
      modColumnData,
    };
    this.numAddRowsRead = 0;
    this.numAddRowsTotal = rowsIncluded.size;
    this.numModRowsRead = 0;
    this.numModRowsTotal = numModRowsTotal;
  }
}

export { RangeSet };
