import { Message, tableFromIPC, type Table as ArrowTable } from 'apache-arrow';
import type { DoExchangeFrame } from '../transport/OpenApiTransport.js';
import { decodeCompressedRangeSet } from './CompressedRangeSet.js';
import { BARRAGE_MAGIC, BarrageMessageType } from './flatbuf/BarrageMessageType.js';
import { BarrageUpdateMetadata } from './flatbuf/BarrageUpdateMetadata.js';
import { ByteBuffer } from 'flatbuffers';
import { IpcStreamBuilder } from './IpcStreamBuilder.js';
import { RangeSet } from './RangeSet.js';
import { decodeShiftedRanges, type ShiftedRange } from './ShiftedRange.js';

export interface ParsedMetadata {
  isSnapshot: boolean;
  reversed: boolean;
  tableSize: number;
  rowsIncluded: RangeSet;
  rowsAdded: RangeSet;
  rowsRemoved: RangeSet;
  shifted: ShiftedRange[];
  effectiveViewport: RangeSet | null;
}

export interface ParsedBarrageMessage {
  metadata: ParsedMetadata;
  /** Arrow table with the new rows, columns in schema order. */
  batches: ArrowTable;
}

/**
 * Consumes `DoExchangeFrame`s until a complete Barrage message is assembled,
 * then returns the parsed message. Port of the parseFrom loop in
 * `web/client-api/src/main/java/io/deephaven/web/client/api/barrage/WebBarrageMessageReader.java`,
 * scoped down: we lean on Arrow JS's `tableFromIPC` to do the heavy lifting,
 * so this class's job is to (a) accumulate Arrow IPC messages (Schema,
 * DictionaryBatch, RecordBatch) in order and (b) track row-count progress
 * against the rows-included count so we know when the snapshot is complete.
 */
export class BarrageMessageReader {
  private schemaHeader: Uint8Array | null = null;
  private metadata: ParsedMetadata | null = null;
  private batchBuilder = new IpcStreamBuilder();
  private rowsReceivedInBatches = 0;
  private hasAnyBatch = false;

  feed(frame: DoExchangeFrame): ParsedBarrageMessage | null {
    // 1. BarrageUpdateMetadata from app_metadata (may appear on any frame,
    //    typically the one carrying the first RecordBatch).
    if (frame.appMetadata.length > 0) {
      const metadata = parseBarrageUpdateMetadata(frame.appMetadata);
      if (metadata) {
        if (this.metadata) {
          throw new Error('BarrageMessageReader: previous message not finished before next metadata arrived');
        }
        this.metadata = metadata;
      }
    }

    // 2. Classify the Arrow Message in the data_header.
    if (frame.dataHeader.length > 0) {
      const message = Message.decode(frame.dataHeader);

      if (message.isSchema()) {
        this.schemaHeader = copy(frame.dataHeader);
      } else if (message.isDictionaryBatch()) {
        this.batchBuilder.append(frame.dataHeader, frame.dataBody);
        this.hasAnyBatch = true;
      } else if (message.isRecordBatch()) {
        this.batchBuilder.append(frame.dataHeader, frame.dataBody);
        this.hasAnyBatch = true;
        this.rowsReceivedInBatches += message.header().length;
      }
    }

    // 3. Have we assembled a complete message yet?
    if (!this.metadata) return null;
    const expected = this.metadata.rowsIncluded.size;
    // For pure metadata pings (no rows to deliver) the snapshot is complete
    // as soon as we have metadata + the schema. For row-bearing messages we
    // need the batches to catch up.
    if (expected > 0 && this.rowsReceivedInBatches < expected) return null;

    if (!this.schemaHeader && this.hasAnyBatch) {
      throw new Error('BarrageMessageReader: received RecordBatch without a prior Schema');
    }

    const metadata = this.metadata;
    let batches: ArrowTable;
    if (this.schemaHeader) {
      const ipc = new IpcStreamBuilder();
      ipc.append(this.schemaHeader);
      // Drop the already-assembled batches into a fresh stream after the
      // schema. We rebuild a new IpcStreamBuilder here because
      // batchBuilder.finish() would append an EOS marker; we want the
      // schema first.
      const batchesBytes = takeRawBatches(this.batchBuilder);
      // Glue: push raw batches bytes into ipc, then EOS.
      ipc.pushRaw(batchesBytes);
      batches = tableFromIPC(ipc.finish());
    } else {
      // No schema yet — return an empty table. The caller only relies on
      // schema-bearing messages for anything visible, so this is only hit in
      // degenerate pings.
      batches = tableFromIPC(new IpcStreamBuilder().finish());
    }

    // Reset for the next message.
    this.metadata = null;
    this.batchBuilder = new IpcStreamBuilder();
    this.rowsReceivedInBatches = 0;
    this.hasAnyBatch = false;

    return { metadata, batches };
  }
}

function takeRawBatches(builder: IpcStreamBuilder): Uint8Array {
  // Finish the inner builder to get all batches concatenated with an EOS at
  // the end, then strip the EOS (8 trailing bytes) so we can stitch onto the
  // outer schema-first stream.
  const bytes = builder.finish();
  return bytes.subarray(0, Math.max(0, bytes.length - 8));
}

function parseBarrageUpdateMetadata(appMetadata: Uint8Array): ParsedMetadata | null {
  const bb = new ByteBuffer(appMetadata);
  // Root offset lives at position 0 → wrapper table offset (vtable begins there).
  const wrapperPos = bb.readInt32(bb.position()) + bb.position();
  // Wrapper vtable: 4=magic, 6=msgType, 8=msgPayload.
  const magicSlot = bb.__offset(wrapperPos, 4);
  const magic = magicSlot !== 0 ? bb.readUint32(magicSlot + wrapperPos) : 0;
  if (magic !== BARRAGE_MAGIC) return null;

  const msgTypeOffset = bb.__offset(wrapperPos, 6);
  const msgType = msgTypeOffset !== 0 ? bb.readInt8(msgTypeOffset + wrapperPos) : 0;
  if (msgType !== BarrageMessageType.BarrageUpdateMetadata) return null;

  const payloadOffset = bb.__offset(wrapperPos, 8);
  if (payloadOffset === 0) return null;
  const payloadStart = bb.__vector(payloadOffset + wrapperPos);
  const payloadLen = bb.__vector_len(payloadOffset + wrapperPos);
  const payloadBytes = bb.bytes().subarray(payloadStart, payloadStart + payloadLen);

  const meta = BarrageUpdateMetadata.getRootAsBarrageUpdateMetadata(new ByteBuffer(payloadBytes));

  const rangeOrEmpty = (b: Uint8Array | null): RangeSet =>
    b === null || b.length === 0 ? RangeSet.empty() : decodeCompressedRangeSet(b);

  const rowsAdded = rangeOrEmpty(meta.addedRows());
  const addedIncluded = meta.addedRowsIncluded();
  const rowsIncluded = addedIncluded === null ? rowsAdded : rangeOrEmpty(addedIncluded);
  const shiftBytes = meta.shiftData();

  return {
    isSnapshot: meta.isSnapshot(),
    reversed: meta.effectiveReverseViewport(),
    tableSize: Number(meta.tableSize()),
    rowsIncluded,
    rowsAdded,
    rowsRemoved: rangeOrEmpty(meta.removedRows()),
    shifted: shiftBytes && shiftBytes.length > 0 ? decodeShiftedRanges(shiftBytes) : [],
    effectiveViewport: meta.effectiveViewport() ? decodeCompressedRangeSet(meta.effectiveViewport()!) : null,
  };
}

function copy(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}
