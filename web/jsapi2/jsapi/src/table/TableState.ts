import type * as Core from '@deephaven/jsapi-core';
import type { Connection } from '../connection/Connection.js';
import { readSchema, type TableDefinition, tableDefinition } from '../data/schema.js';

type ExportedTableCreationResponse = Core.table.ExportedTableCreationResponse;

/**
 * The client's view of one exported table on the server, shared by the pending and resolved tables that stand for it.
 * Reference counted: whoever needs the export retains it, and the ticket is released on the server once nobody does.
 * A ticket is only released once the server has answered for it, so a release never races its creation.
 */
export class TableState {
  private refs = 0;
  private sent = false;
  private answered = false;
  private wantRelease = false;
  private released = false;
  private outcome: 'pending' | 'ready' | 'failed' = 'pending';
  private resolveSettled!: () => void;
  private rejectSettled!: (error: Error) => void;
  private stopSizeListener: (() => void) | null = null;
  private readonly sizeListeners = new Set<(size: number) => void>();

  /** Resolves once the table exists on the server; rejects if it failed or was canceled first. */
  readonly settled: Promise<void>;
  definition: TableDefinition | null = null;
  size = 0;
  isRefreshing = false;
  error: Error | null = null;

  constructor(
    readonly connection: Connection,
    readonly ticket: Uint8Array,
    readonly description: string
  ) {
    this.settled = new Promise<void>((resolve, reject) => {
      this.resolveSettled = resolve;
      this.rejectSettled = reject;
    });
    // Rejections are reported to whoever awaits the table, not as unhandled
    this.settled.catch(() => {});
  }

  /** A state that failed before anything was sent. */
  static failed(connection: Connection, error: Error, description = 'failed table'): TableState {
    const state = new TableState(connection, new Uint8Array(0), description);
    state.fail(error);
    return state;
  }

  get isReady(): boolean {
    return this.outcome === 'ready' && !this.released;
  }

  get isFailed(): boolean {
    return this.outcome === 'failed';
  }

  get isReleased(): boolean {
    return this.released || this.wantRelease;
  }

  /** Whether the operation that creates this table should still be sent. */
  get shouldSend(): boolean {
    return !this.sent && this.outcome === 'pending' && !this.wantRelease;
  }

  retain(): void {
    if (this.wantRelease) {
      throw new Error(`Table was already released (${this.description})`);
    }
    this.refs++;
  }

  release(): void {
    if (this.refs <= 0) {
      return;
    }
    this.refs--;
    if (this.refs === 0) {
      this.wantRelease = true;
      if (this.outcome === 'pending') {
        this.fail(new Error('Table was released before it was ready'));
      }
      this.maybeReleaseTicket();
    }
  }

  /** Holds this table until `until` settles. */
  retainUntil(until: Promise<unknown>): void {
    this.retain();
    until.then(
      () => this.release(),
      () => this.release()
    );
  }

  markSent(): void {
    this.sent = true;
  }

  /** The server's answer to the operation that creates this table. */
  applyResponse(response: ExportedTableCreationResponse): void {
    this.answered = true;
    if (this.outcome === 'pending') {
      if (response.success) {
        try {
          this.definition = tableDefinition(readSchema(this.connection.core, response.schemaHeader));
          this.size = Number(response.size);
          this.isRefreshing = !response.isStatic;
          this.outcome = 'ready';
          if (this.isRefreshing && !this.wantRelease) {
            this.stopSizeListener = this.connection.listenForSize(this.ticket, size => {
              this.size = size;
              for (const listener of [...this.sizeListeners]) {
                listener(size);
              }
            });
          }
          this.resolveSettled();
        } catch (e) {
          this.fail(e instanceof Error ? e : new Error(String(e)));
        }
      } else {
        this.fail(new Error(`${this.description} failed: ${response.errorInfo || 'unknown error'}`));
      }
    }
    this.maybeReleaseTicket();
  }

  /** The operation will not be answered, because its call failed. */
  applyCallFailure(error: Error): void {
    this.answered = true;
    this.fail(error);
    this.maybeReleaseTicket();
  }

  /** Fails this table for the client, whatever the server does with it. */
  fail(error: Error): void {
    if (this.outcome !== 'pending') {
      return;
    }
    this.outcome = 'failed';
    this.error = error;
    this.rejectSettled(error);
  }

  onSizeChanged(listener: (size: number) => void): () => void {
    this.sizeListeners.add(listener);
    return () => this.sizeListeners.delete(listener);
  }

  private maybeReleaseTicket(): void {
    if (!this.wantRelease || this.released) {
      return;
    }
    if (this.sent && !this.answered) {
      // Released once the server answers
      return;
    }
    this.released = true;
    this.stopSizeListener?.();
    this.stopSizeListener = null;
    this.sizeListeners.clear();
    if (this.sent) {
      this.connection.releaseTicket(this.ticket);
    }
  }
}
