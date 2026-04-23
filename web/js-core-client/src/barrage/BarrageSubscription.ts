import { Builder } from 'flatbuffers';
import type { Table as ArrowTable } from 'apache-arrow';
import type { DoExchangeStream, OpenApiTransport } from '../transport/OpenApiTransport.js';
import type { Column, Row, ViewportOptions, ViewportUpdate } from '../viewport/ViewportUpdate.js';
import { BarrageMessageReader, type ParsedBarrageMessage } from './BarrageMessageReader.js';
import { BarrageMessageWrapper } from './flatbuf/BarrageMessageWrapper.js';
import { BarrageSubscriptionOptions } from './flatbuf/BarrageSubscriptionOptions.js';
import { BarrageSubscriptionRequest } from './flatbuf/BarrageSubscriptionRequest.js';
import { BARRAGE_MAGIC, BarrageMessageType } from './flatbuf/BarrageMessageType.js';
import { encodeCompressedRangeSet } from './CompressedRangeSet.js';
import { RangeSet } from './RangeSet.js';

/**
 * One live Barrage viewport subscription for a single `Table`.
 *
 * Owns a Flight.DoExchange stream, sends the initial
 * `BarrageSubscriptionRequest`, drives a `BarrageMessageReader`, and fans out
 * parsed messages as `ViewportUpdate` + size-update events to multiple
 * listeners.
 *
 * Phase-(a) scope: static tables + append-only ticking. Each parsed message
 * fully replaces the stored Arrow batches — fine for snapshots and for
 * viewports whose server-side row identities don't shift. Proper
 * delta-application (rowsRemoved / shiftData / modColumnNodes) lands in phase
 * (b).
 */
export class BarrageSubscription {
  private readonly transport: OpenApiTransport;
  private readonly ticket: Uint8Array;
  private readonly reader = new BarrageMessageReader();

  private stream: DoExchangeStream | null = null;
  private closed = false;

  private viewport: ViewportOptions | null = null;
  private columnFilter: ReadonlySet<string> | null = null;

  private latestTable: ArrowTable | null = null;
  private latestMetadata: ParsedBarrageMessage['metadata'] | null = null;
  private tableSize = 0;

  readonly updateListeners = new Set<(u: ViewportUpdate) => void>();
  readonly sizeListeners = new Set<(s: number) => void>();

  constructor(transport: OpenApiTransport, ticket: Uint8Array) {
    this.transport = transport;
    this.ticket = ticket;
  }

  setViewport(viewport: ViewportOptions): void {
    if (this.closed) throw new Error('BarrageSubscription: already closed');
    this.viewport = viewport;
    this.columnFilter = viewport.columns ? new Set(viewport.columns) : null;
    this.reopenStream();
  }

  /** Called by Table once this sub has no more listeners. Releases server-side state. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stream?.cancel();
    this.stream = null;
  }

  /** Re-emit the latest ViewportUpdate to a just-attached listener. */
  replayTo(listener: (u: ViewportUpdate) => void): void {
    if (!this.latestTable) return;
    const update = this.buildUpdate();
    if (update) listener(update);
  }

  replaySizeTo(listener: (s: number) => void): void {
    if (this.latestMetadata) listener(this.tableSize);
  }

  private reopenStream(): void {
    this.stream?.cancel();
    const stream = this.transport.openDoExchange();
    this.stream = stream;
    stream.onData((frame) => {
      if (this.closed) return;
      try {
        const parsed = this.reader.feed(frame);
        if (parsed) this.onMessage(parsed);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('BarrageSubscription: reader feed failed', err);
      }
    });
    stream.onEnd((err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error('BarrageSubscription: stream ended with error', err);
      }
    });

    stream.send({
      dataHeader: new Uint8Array(0),
      appMetadata: buildSubscriptionRequestWrapper(this.ticket, this.viewport),
      dataBody: new Uint8Array(0),
    });
  }

  private onMessage(parsed: ParsedBarrageMessage): void {
    this.latestMetadata = parsed.metadata;
    this.latestTable = parsed.batches;
    const newSize = parsed.metadata.tableSize;
    const sizeChanged = newSize !== this.tableSize;
    this.tableSize = newSize;

    if (sizeChanged) {
      for (const l of this.sizeListeners) l(newSize);
    }
    const update = this.buildUpdate();
    if (update) {
      for (const l of this.updateListeners) l(update);
    }
  }

  private buildUpdate(): ViewportUpdate | null {
    if (!this.latestTable || !this.latestMetadata || !this.viewport) return null;
    const table = this.latestTable;
    const schema = table.schema;

    const allColumns: Column[] = schema.fields.map((f) => ({ name: f.name, type: f.type.toString() }));
    const filteredIdxs = this.columnFilter
      ? allColumns.map((c, i) => (this.columnFilter!.has(c.name) ? i : -1)).filter((i) => i >= 0)
      : allColumns.map((_, i) => i);
    const columns = filteredIdxs.map((i) => allColumns[i]!);

    // Resolve negative bounds against the current size.
    const { resolvedFirst, resolvedLast, reversed } = resolveBounds(this.viewport, this.tableSize);

    // Materialize rows from the Arrow table. `rowsIncluded` tells us which
    // absolute row keys map to `table.get(i)` — for a head-of-table snapshot
    // that's the contiguous range `[rowsIncluded.first, rowsIncluded.last]`.
    const rowIds = this.latestMetadata.rowsIncluded.toArray();
    const rowIdToBatchIdx = new Map<number, number>();
    for (let i = 0; i < rowIds.length; i++) rowIdToBatchIdx.set(rowIds[i]!, i);

    const rows: Row[] = [];
    for (let r = resolvedFirst; r <= resolvedLast; r++) {
      const batchIdx = rowIdToBatchIdx.get(r);
      if (batchIdx === undefined) continue; // server didn't deliver this row
      rows.push(makeRow(table, batchIdx, filteredIdxs, allColumns));
    }

    return {
      firstRow: resolvedFirst,
      lastRow: resolvedLast,
      size: this.tableSize,
      reversed,
      columns,
      rows,
    };
  }
}

function resolveBounds(
  viewport: ViewportOptions,
  size: number,
): { resolvedFirst: number; resolvedLast: number; reversed: boolean } {
  const reversed = viewport.firstRow < 0 || viewport.lastRow < 0;
  const first = viewport.firstRow < 0 ? size + viewport.firstRow : viewport.firstRow;
  const last = viewport.lastRow < 0 ? size + viewport.lastRow : viewport.lastRow;
  return {
    resolvedFirst: Math.max(0, Math.min(first, size - 1)),
    resolvedLast: Math.max(0, Math.min(last, size - 1)),
    reversed,
  };
}

function makeRow(
  table: ArrowTable,
  batchIdx: number,
  filteredIdxs: number[],
  allColumns: Column[],
): Row {
  return {
    get(column: Column | string): unknown {
      const name = typeof column === 'string' ? column : column.name;
      const colIdx = allColumns.findIndex((c) => c.name === name);
      if (colIdx === -1 || !filteredIdxs.includes(colIdx)) return undefined;
      const vec = table.getChildAt(colIdx);
      return vec?.get(batchIdx);
    },
  };
}

/**
 * Encode a full BarrageMessageWrapper wrapping a BarrageSubscriptionRequest,
 * ready to be attached as `app_metadata` on the initial FlightData frame.
 */
function buildSubscriptionRequestWrapper(
  ticket: Uint8Array,
  viewport: ViewportOptions | null,
): Uint8Array {
  const inner = buildSubscriptionRequest(ticket, viewport);

  const builder = new Builder(256);
  const payloadOffset = builder.createByteVector(inner);
  BarrageMessageWrapper.startBarrageMessageWrapper(builder);
  BarrageMessageWrapper.addMagic(builder, BARRAGE_MAGIC);
  BarrageMessageWrapper.addMsgType(builder, BarrageMessageType.BarrageSubscriptionRequest);
  BarrageMessageWrapper.addMsgPayload(builder, payloadOffset);
  const wrapperOffset = BarrageMessageWrapper.endBarrageMessageWrapper(builder);
  builder.finish(wrapperOffset);
  return builder.asUint8Array();
}

function buildSubscriptionRequest(ticket: Uint8Array, viewport: ViewportOptions | null): Uint8Array {
  const builder = new Builder(256);

  // Options. Defaults here mirror what AbstractTableSubscription.java uses.
  BarrageSubscriptionOptions.startBarrageSubscriptionOptions(builder);
  BarrageSubscriptionOptions.addUseDeephavenNulls(builder, true);
  BarrageSubscriptionOptions.addBatchSize(builder, 4096);
  BarrageSubscriptionOptions.addMaxMessageSize(builder, 10 * 1024 * 1024);
  BarrageSubscriptionOptions.addMinUpdateIntervalMs(builder, 0);
  const optionsOffset = BarrageSubscriptionOptions.endBarrageSubscriptionOptions(builder);

  // Ticket vector.
  const ticketOffset = builder.createByteVector(ticket);

  // Columns bitset — empty means "all columns" per the proto doc, but the
  // Java client always writes something, so we do too (an empty vector).
  const columnsOffset = builder.createByteVector(new Uint8Array(0));

  // Viewport (compressed range set).
  let viewportOffset = 0;
  let reverse = false;
  if (viewport) {
    reverse = viewport.firstRow < 0 || viewport.lastRow < 0;
    const first = reverse ? Math.abs(viewport.lastRow) - 1 : viewport.firstRow;
    const last = reverse ? Math.abs(viewport.firstRow) - 1 : viewport.lastRow;
    const encoded = encodeCompressedRangeSet(RangeSet.ofRange(first, last));
    viewportOffset = builder.createByteVector(encoded);
  }

  BarrageSubscriptionRequest.startBarrageSubscriptionRequest(builder);
  BarrageSubscriptionRequest.addTicket(builder, ticketOffset);
  BarrageSubscriptionRequest.addColumns(builder, columnsOffset);
  if (viewportOffset) BarrageSubscriptionRequest.addViewport(builder, viewportOffset);
  BarrageSubscriptionRequest.addSubscriptionOptions(builder, optionsOffset);
  BarrageSubscriptionRequest.addReverseViewport(builder, reverse);
  const reqOffset = BarrageSubscriptionRequest.endBarrageSubscriptionRequest(builder);
  builder.finish(reqOffset);
  return builder.asUint8Array();
}
