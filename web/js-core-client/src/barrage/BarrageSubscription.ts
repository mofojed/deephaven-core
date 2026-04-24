import { Builder } from 'flatbuffers';
import type { Table as ArrowTable, Field } from 'apache-arrow';
import type { DoExchangeStream, OpenApiTransport } from '../transport/OpenApiTransport.js';
import type { Column, Row, ViewportOptions, ViewportUpdate } from '../viewport/ViewportUpdate.js';
import { BarrageMessageReader, type ParsedBarrageMessage, type ParsedMetadata } from './BarrageMessageReader.js';
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

  private schemaFields: Field[] | null = null;
  /**
   * Viewport subscriptions store rows **positionally** inside the current
   * viewport, not by server row key. The server's `rowsAdded` / `rowsRemoved`
   * on a viewport subscription are positions (post-update for added, pre-update
   * for removed) — see `web/client-api/.../WebColumnData.applyUpdate` in the
   * legacy client for the shape we're matching.
   */
  private viewportRows: unknown[][] = [];
  private latestMetadata: ParsedMetadata | null = null;
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
    if (!this.schemaFields) return;
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
    const newSize = parsed.metadata.tableSize;
    const sizeChanged = newSize !== this.tableSize;
    this.tableSize = newSize;
    this.latestMetadata = parsed.metadata;
    this.schemaFields = parsed.batches.schema.fields as unknown as Field[];

    // Snapshots clear the viewport; subsequent deltas apply on top.
    if (parsed.metadata.isSnapshot) {
      this.viewportRows = [];
    }
    this.applyViewportUpdate(parsed);

    if (sizeChanged) {
      for (const l of this.sizeListeners) l(newSize);
    }
    const update = this.buildUpdate();
    if (update) {
      for (const l of this.updateListeners) l(update);
    }
  }

  /**
   * Apply a Barrage viewport-subscription update to `viewportRows` using
   * position-space semantics:
   *   - `rowsRemoved` are PRE-UPDATE positions to drop.
   *   - `rowsAdded` are POST-UPDATE positions to fill from the batch.
   *   - Everything else retains from the old array, shifting as needed.
   *
   * This is a direct port of `WebColumnData.applyUpdate` in
   * `web/client-api/.../barrage/data/WebColumnData.java`, rotated from
   * per-column to per-row storage. The server uses these fields
   * *positionally* (not as absolute row keys) for viewport subscriptions,
   * which is why reversed tables render correctly: a reverse() tick sends
   * `rowsAdded=[0]` ("insert at front") and—once the viewport is full—
   * `rowsRemoved=[last]` ("drop the tail").
   */
  private applyViewportUpdate(parsed: ParsedBarrageMessage): void {
    const added = [...parsed.metadata.rowsAdded.indexIterator()];
    const removed = [...parsed.metadata.rowsRemoved.indexIterator()];
    const included = [...parsed.metadata.rowsIncluded.indexIterator()];
    const batch = parsed.batches;
    const ncols = batch.schema.fields.length;

    const prev = this.viewportRows;
    const newLength = prev.length - removed.length + added.length;
    const next: unknown[][] = new Array(newLength);

    const addedSet = new Set(added);
    const removedSet = new Set(removed);

    // Map "post-update position where we're adding a row" → "index into the
    // batch for that row's data". Included rows are keyed by server row keys,
    // but the batch rows arrive in the same order we iterate `added`.
    const addedToBatchIdx = new Map<number, number>();
    for (let i = 0; i < added.length; i++) {
      // The batch has one row of data per entry in `rowsIncluded`, which may
      // or may not equal `rowsAdded` in general. For viewport subscriptions,
      // rowsIncluded tracks addedRows 1:1, so indexing by position is safe.
      addedToBatchIdx.set(added[i]!, Math.min(i, included.length - 1));
    }

    let retainOffset = 0;
    let destOffset = 0;
    while (destOffset < newLength) {
      if (removedSet.has(retainOffset)) {
        retainOffset++;
        continue;
      }
      if (addedSet.has(destOffset)) {
        const batchIdx = addedToBatchIdx.get(destOffset) ?? 0;
        const values: unknown[] = new Array(ncols);
        for (let c = 0; c < ncols; c++) {
          values[c] = batch.getChildAt(c)?.get(batchIdx);
        }
        next[destOffset++] = values;
        continue;
      }
      // Retain: copy a previous row into the new array.
      next[destOffset++] = prev[retainOffset++] ?? new Array(ncols);
    }

    this.viewportRows = next;
  }

  private buildUpdate(): ViewportUpdate | null {
    if (!this.schemaFields || !this.viewport) return null;

    const allColumns: Column[] = this.schemaFields.map((f) => ({
      name: f.name,
      type: f.type.toString(),
    }));
    const filteredIdxs = this.columnFilter
      ? allColumns.map((c, i) => (this.columnFilter!.has(c.name) ? i : -1)).filter((i) => i >= 0)
      : allColumns.map((_, i) => i);
    const columns = filteredIdxs.map((i) => allColumns[i]!);

    const { resolvedFirst, resolvedLast, reversed } = resolveBounds(this.viewport, this.tableSize);

    // The stored rows are positional (0 = top of the visible viewport).
    const rows: Row[] = [];
    const sliceEnd = Math.min(this.viewportRows.length, resolvedLast - resolvedFirst + 1);
    for (let i = 0; i < sliceEnd; i++) {
      const values = this.viewportRows[i];
      if (!values) continue;
      rows.push(makeRowFromValues(values, filteredIdxs, allColumns));
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

function makeRowFromValues(
  values: unknown[],
  filteredIdxs: number[],
  allColumns: Column[],
): Row {
  return {
    get(column: Column | string): unknown {
      const name = typeof column === 'string' ? column : column.name;
      const colIdx = allColumns.findIndex((c) => c.name === name);
      if (colIdx === -1 || !filteredIdxs.includes(colIdx)) return undefined;
      return values[colIdx];
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

  // Note: omit the `columns` field entirely. Per the server's
  // `BarrageRequestHelpers.getColumns`, `columnsVector() == null` means "all
  // columns"; an empty byte vector is treated as "zero columns subscribed"
  // and causes the server to stay silent.
  BarrageSubscriptionRequest.startBarrageSubscriptionRequest(builder);
  BarrageSubscriptionRequest.addTicket(builder, ticketOffset);
  if (viewportOffset) BarrageSubscriptionRequest.addViewport(builder, viewportOffset);
  BarrageSubscriptionRequest.addSubscriptionOptions(builder, optionsOffset);
  BarrageSubscriptionRequest.addReverseViewport(builder, reverse);
  const reqOffset = BarrageSubscriptionRequest.endBarrageSubscriptionRequest(builder);
  builder.finish(reqOffset);
  return builder.asUint8Array();
}
