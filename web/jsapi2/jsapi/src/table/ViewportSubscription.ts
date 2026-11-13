import type * as Core from '@deephaven/jsapi-core';
import { BarrageMessageReader } from '../data/barrage.js';
import { snapshotRequest, subscriptionRequest } from '../data/barrageRequests.js';
import { RangeSet } from '../data/RangeSet.js';
import type { Column } from '../data/schema.js';
import { type ColumnOrName, resolveColumn, type TableData, TableDataImpl } from '../data/TableData.js';
import { ViewportState } from '../data/ViewportState.js';
import { CancelError } from '../errors.js';
import { EventEmitter } from '../events.js';
import type { ClientStream } from '../grpc/RpcClient.js';
import type { TableState } from './TableState.js';
import type { RowRange, SnapshotOptions } from './types.js';

function columnIndexes(all: readonly Column[], columns: readonly ColumnOrName[] | undefined): number[] {
  if (columns == null) {
    return all.map(c => c.index);
  }
  return [...new Set(columns.map(c => resolveColumn(all, c).index))].sort((a, b) => a - b);
}

function rowRange(rows: RowRange): RangeSet {
  const { first, last } = rows;
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first) {
    throw new RangeError(`Invalid row range ${first}..${last}`);
  }
  return RangeSet.ofRange(first, last);
}

/** Reads rows of a table once, with a Barrage snapshot. */
export function readSnapshot(state: TableState, options: SnapshotOptions = {}): Promise<TableData> {
  const definition = state.definition!;
  const columns = columnIndexes(definition.columns, options.columns);
  const viewport = options.rows != null ? rowRange(options.rows) : null;
  const { connection } = state;
  const reader = new BarrageMessageReader(connection.core);
  const data = new Map<number, unknown[]>(columns.map(c => [c, []]));
  let rowsReceived = 0;
  let tableSize = state.size;

  const result = new Promise<TableData>((resolve, reject) => {
    let settled = false;
    const stream = connection.doExchange({
      onMessage: flightData => {
        if (settled) {
          return;
        }
        let msg;
        try {
          msg = reader.parse(flightData);
        } catch (e) {
          // Settle first: canceling the stream ends it, which must not report a cancellation instead of this error
          settled = true;
          reject(e);
          stream.cancel();
          return;
        }
        if (msg == null) {
          return;
        }
        tableSize = msg.tableSize || tableSize;
        for (const c of columns) {
          const values = data.get(c)!;
          for (const v of msg.addColumnData[c] ?? []) {
            values.push(v);
          }
        }
        rowsReceived += msg.rowsIncluded.size;
      },
      onEnd: error => {
        if (settled) {
          return;
        }
        settled = true;
        if (error != null) {
          reject(error);
          return;
        }
        const requested = viewport ?? RangeSet.ofRange(0, rowsReceived - 1);
        const positions =
          rowsReceived === 0 ? RangeSet.EMPTY : requested.intersect(RangeSet.ofRange(0, requested.get(rowsReceived - 1)));
        const included = definition.columns.filter(c => data.has(c.index));
        resolve(new TableDataImpl(definition.columns, included, positions, data, tableSize));
      },
    });
    stream.send({ appMetadata: snapshotRequest(connection.core, { ticket: state.ticket, columns, viewport }) });
    stream.end();
  });
  state.retainUntil(result);
  return result;
}

export interface ViewportSubscriptionOptions {
  /** The rows to subscribe to, by position. */
  readonly rows: RowRange;
  /** The columns to subscribe to; defaults to every column. */
  readonly columns?: readonly ColumnOrName[];
  /** The least time between updates, in milliseconds; defaults to the server's setting. */
  readonly updateIntervalMs?: number;
}

export interface ViewportSubscriptionEvents extends Record<string, unknown> {
  /** The viewport's data changed, or the server started sending a new viewport. */
  updated: TableData;
  /** The subscription failed; it is closed. */
  error: { error: Error };
}

/** A subscription to a range of a table's rows, which the server keeps up to date as the table changes. */
export interface ViewportSubscription {
  readonly isClosed: boolean;
  /** The table's size, as of the latest update. */
  readonly size: number;
  /** Changes the rows and, optionally, the columns and update interval of the subscription. */
  setViewport(rows: RowRange, columns?: readonly ColumnOrName[], updateIntervalMs?: number): void;
  /** The data of the current viewport: at once if the server is sending it, or once it starts to. */
  getViewportData(): Promise<TableData>;
  /** Ends the subscription. */
  close(): void;
  addEventListener<K extends keyof ViewportSubscriptionEvents>(
    type: K,
    listener: (event: ViewportSubscriptionEvents[K]) => void
  ): () => void;
  removeEventListener<K extends keyof ViewportSubscriptionEvents>(
    type: K,
    listener: (event: ViewportSubscriptionEvents[K]) => void
  ): void;
}

export class ViewportSubscriptionImpl
  extends EventEmitter<ViewportSubscriptionEvents>
  implements ViewportSubscription
{
  private readonly reader: BarrageMessageReader;
  private readonly viewport: ViewportState;
  private readonly stream: ClientStream<Core.protobuf.MessageInitShape<typeof Core.flight.FlightDataSchema>>;
  private requestedViewport: RangeSet;
  private requestedColumns: number[];
  private updateIntervalMs: number;
  private latest: TableData | null = null;
  private waiters: { resolve(data: TableData): void; reject(error: Error): void }[] = [];
  private closed = false;

  constructor(
    private readonly state: TableState,
    options: ViewportSubscriptionOptions
  ) {
    super();
    const definition = state.definition!;
    this.requestedViewport = rowRange(options.rows);
    this.requestedColumns = columnIndexes(definition.columns, options.columns);
    this.updateIntervalMs = options.updateIntervalMs ?? 0;
    state.retain();
    this.reader = new BarrageMessageReader(state.connection.core);
    this.viewport = new ViewportState(definition.columns.length);
    this.stream = state.connection.doExchange({
      onMessage: flightData => this.onFlightData(flightData),
      onEnd: error => this.onEnd(error),
    });
    this.sendRequest();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get size(): number {
    return this.viewport.tableSize;
  }

  private sendRequest(): void {
    this.stream.send({
      appMetadata: subscriptionRequest(this.state.connection.core, {
        ticket: this.state.ticket,
        columns: this.requestedColumns,
        viewport: this.requestedViewport,
        updateIntervalMs: this.updateIntervalMs,
      }),
    });
  }

  setViewport(rows: RowRange, columns?: readonly ColumnOrName[], updateIntervalMs?: number): void {
    if (this.closed) {
      throw new Error('Subscription is closed');
    }
    this.requestedViewport = rowRange(rows);
    if (columns != null) {
      this.requestedColumns = columnIndexes(this.state.definition!.columns, columns);
    }
    if (updateIntervalMs != null) {
      this.updateIntervalMs = updateIntervalMs;
    }
    this.sendRequest();
  }

  /** Whether the server is sending the viewport and columns most recently asked for. */
  private get isCurrent(): boolean {
    if (!this.viewport.serverViewport.equals(this.requestedViewport)) {
      return false;
    }
    const columnCount = this.state.definition!.columns.length;
    for (let i = 0; i < columnCount; i++) {
      if (this.viewport.isSubscribed(i) !== this.requestedColumns.includes(i)) {
        return false;
      }
    }
    return true;
  }

  getViewportData(): Promise<TableData> {
    if (this.closed) {
      return Promise.reject(new Error('Subscription is closed'));
    }
    if (this.latest != null && this.isCurrent) {
      return Promise.resolve(this.latest);
    }
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  private onFlightData(flightData: Core.flight.FlightData): void {
    if (this.closed) {
      return;
    }
    let msg;
    try {
      msg = this.reader.parse(flightData);
      if (msg == null) {
        return;
      }
      this.viewport.apply(msg);
    } catch (e) {
      this.fail(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const data = this.viewport.toTableData(this.state.definition!.columns);
    this.latest = data;
    if (this.isCurrent && this.waiters.length > 0) {
      for (const waiter of this.waiters.splice(0)) {
        waiter.resolve(data);
      }
    }
    this.emit('updated', data);
  }

  private onEnd(error: Error | null): void {
    if (this.closed) {
      return;
    }
    this.fail(error ?? new Error('The server ended the subscription'));
  }

  private fail(error: Error): void {
    this.shutdown(error);
    this.emit('error', { error });
    this.removeAllListeners();
  }

  private shutdown(error: Error): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stream.cancel();
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error);
    }
    this.state.release();
  }

  close(): void {
    this.shutdown(new CancelError('Subscription closed'));
    this.removeAllListeners();
  }
}
