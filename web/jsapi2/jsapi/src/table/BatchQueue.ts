import type * as Core from '@deephaven/jsapi-core';
import type { Connection } from '../connection/Connection.js';
import { ticketKey } from '../connection/tickets.js';
import { TableState } from './TableState.js';

type OperationInit = Core.protobuf.MessageInitShape<typeof Core.table.BatchTableRequest_OperationSchema>;

interface QueuedOperation {
  state: TableState;
  operation: OperationInit;
  sources: readonly TableState[];
}

/**
 * Operations created during one microtask, sent to the server as a single batch when it ends. Every operation names
 * its result with its own export ticket and its sources by theirs, so operations can chain within a batch and across
 * batches alike.
 */
class BatchQueue {
  private queued: QueuedOperation[] = [];
  private scheduled = false;

  constructor(private readonly connection: Connection) {}

  enqueue(op: QueuedOperation): void {
    this.queued.push(op);
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => this.flush());
    }
  }

  private flush(): void {
    this.scheduled = false;
    const ops = this.queued;
    this.queued = [];
    const outstanding = new Map<string, TableState>();
    const toSend: OperationInit[] = [];
    for (const op of ops) {
      if (!op.state.shouldSend) {
        continue;
      }
      const failedSource = op.sources.find(source => source.isFailed);
      if (failedSource != null) {
        // The server would wait forever on a source that was never created
        op.state.fail(new Error(`Source table failed: ${failedSource.error?.message ?? 'unknown error'}`));
        continue;
      }
      if (this.connection.isClosed) {
        op.state.fail(new Error('Connection is closed'));
        continue;
      }
      op.state.markSent();
      outstanding.set(ticketKey(op.state.ticket), op.state);
      toSend.push(op.operation);
    }
    if (toSend.length === 0) {
      return;
    }
    this.connection.rpc.serverStream(
      this.connection.core.table.TableService.method.batch,
      { ops: toSend },
      {
        onMessage: response => {
          const ref = response.resultId?.ref;
          if (ref?.case !== 'ticket') {
            return;
          }
          const key = ticketKey(ref.value.ticket);
          const state = outstanding.get(key);
          if (state != null) {
            outstanding.delete(key);
            state.applyResponse(response);
          }
        },
        onEnd: error => {
          for (const state of outstanding.values()) {
            state.applyCallFailure(error ?? new Error('The server sent no result for this operation'));
          }
          outstanding.clear();
        },
      }
    );
  }
}

const queues = new WeakMap<Connection, BatchQueue>();

/** Queues an operation creating `state` from `sources`, to be sent when the current microtask ends. */
export function enqueueOperation(
  connection: Connection,
  state: TableState,
  operation: OperationInit,
  sources: readonly TableState[]
): void {
  let queue = queues.get(connection);
  if (queue == null) {
    queue = new BatchQueue(connection);
    queues.set(connection, queue);
  }
  queue.enqueue({ state, operation, sources });
}

export type { OperationInit };
