import { BarrageSubscription } from './barrage/BarrageSubscription.js';
import type { OpenApiTransport } from './transport/OpenApiTransport.js';
import type { ViewportOptions, ViewportUpdate } from './viewport/ViewportUpdate.js';

/**
 * A server-exported table handle.
 *
 * Viewport lifecycle:
 *   - `setViewport(...)` configures which rows/columns this table should stream.
 *   - `onUpdate(fn)` and `onSizeUpdate(fn)` register listeners; both return a
 *     cleanup function. The subscription opens the first time a listener
 *     registers, and closes again (releasing the server-side export) once the
 *     last listener detaches.
 *   - `copy()` returns a sibling `Table` sharing the server ticket but with
 *     its own viewport + listener set. Useful for rendering the same table
 *     in multiple places with different viewports.
 */
export class Table {
  readonly name: string;
  readonly ticket: Uint8Array;
  private readonly transport: OpenApiTransport;
  private readonly initialSize: number;

  private subscription: BarrageSubscription | null = null;
  private viewport: ViewportOptions | null = null;
  private closed = false;

  constructor(args: {
    name: string;
    ticket: Uint8Array;
    size: number;
    transport: OpenApiTransport;
  }) {
    this.name = args.name;
    this.ticket = args.ticket;
    this.initialSize = args.size;
    this.transport = args.transport;
  }

  /**
   * Resolve to the current row count of the table.
   *
   * Fast path: returns the size the server reported on FetchTable. If a
   * subscription is active, honors the most recently received size instead.
   */
  async size(): Promise<number> {
    if (this.subscription && (this.subscription as unknown as { tableSize: number }).tableSize > 0) {
      return (this.subscription as unknown as { tableSize: number }).tableSize;
    }
    return this.initialSize;
  }

  setViewport(options: ViewportOptions): void {
    if (this.closed) throw new Error('Table: already closed');
    this.viewport = options;
    if (this.subscription) {
      this.subscription.setViewport(options);
    }
  }

  onUpdate(handler: (update: ViewportUpdate) => void): () => void {
    if (this.closed) throw new Error('Table: already closed');
    const sub = this.ensureSubscription();
    sub.updateListeners.add(handler);
    sub.replayTo(handler);
    return () => {
      sub.updateListeners.delete(handler);
      this.maybeCloseSubscription();
    };
  }

  onSizeUpdate(handler: (size: number) => void): () => void {
    if (this.closed) throw new Error('Table: already closed');
    const sub = this.ensureSubscription();
    sub.sizeListeners.add(handler);
    sub.replaySizeTo(handler);
    return () => {
      sub.sizeListeners.delete(handler);
      this.maybeCloseSubscription();
    };
  }

  /**
   * New sibling `Table` sharing this table's ticket but with an independent
   * subscription/listener set. Call `close()` on it when done.
   */
  copy(): Table {
    return new Table({
      name: this.name,
      ticket: this.ticket,
      size: this.initialSize,
      transport: this.transport,
    });
  }

  /** Explicitly close the table. Idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.subscription?.close();
    this.subscription = null;
  }

  private ensureSubscription(): BarrageSubscription {
    if (!this.subscription) {
      this.subscription = new BarrageSubscription(this.transport, this.ticket);
      if (this.viewport) this.subscription.setViewport(this.viewport);
    }
    return this.subscription;
  }

  private maybeCloseSubscription(): void {
    const sub = this.subscription;
    if (!sub) return;
    if (sub.updateListeners.size === 0 && sub.sizeListeners.size === 0) {
      sub.close();
      this.subscription = null;
    }
  }
}
