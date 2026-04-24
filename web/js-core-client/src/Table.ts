import { BarrageSubscription } from './barrage/BarrageSubscription.js';
import type { OpenApiTransport, SortSpec } from './transport/OpenApiTransport.js';
import type { ViewportOptions, ViewportUpdate } from './viewport/ViewportUpdate.js';

type SelectKind = 'view' | 'updateView' | 'update';

/** A recipe for a derived table. */
type Op =
  | { readonly type: 'where'; readonly filters: readonly string[] }
  | { readonly type: 'sort'; readonly descriptors: readonly SortSpec[] }
  | { readonly type: SelectKind; readonly columnSpecs: readonly string[] };

interface MaterializedTableArgs {
  readonly name: string;
  readonly transport: OpenApiTransport;
  readonly ticket: Uint8Array;
  readonly size: number;
}

interface PendingTableArgs {
  readonly name: string;
  readonly transport: OpenApiTransport;
  readonly source: Table;
  readonly op: Op;
}

/**
 * A server-exported table handle.
 *
 * Tables may be either **materialized** (their export ticket is known from
 * construction — the common case for `CoreClient.getTable`) or **pending**
 * (the result of a derived op like `.where()`; the ticket is not yet known).
 *
 * Derived ops are synchronous and cheap: they just build a new pending
 * Table that remembers its source + the op to apply. The first time
 * anything actually needs the ticket (`setViewport`, `onUpdate`,
 * `onSizeUpdate`, `size`), the Table walks up its chain and issues the
 * required RPCs server-side, caching the resulting ticket and size.
 *
 * Lifecycle:
 *   - `setViewport({...})` / `onUpdate` / `onSizeUpdate` — open a Barrage
 *     subscription after materialization completes.
 *   - `onUpdate(h)` / `onSizeUpdate(h)` return a cleanup `() => void`; when
 *     the last listener of either kind detaches, the subscription closes
 *     and the server-side export is released.
 *   - `copy()` — independent sibling Table; materialized copies share the
 *     server-side ticket, pending copies share the recipe.
 */
export class Table {
  readonly name: string;
  private readonly transport: OpenApiTransport;

  // Exactly one of (ticket/initialSize) or (source/op) is set at construction.
  private _ticket: Uint8Array | null;
  private _initialSize: number;
  private readonly source: Table | null;
  private readonly op: Op | null;

  private materializePromise: Promise<Uint8Array> | null = null;

  private readonly pendingUpdateHandlers = new Set<(u: ViewportUpdate) => void>();
  private readonly pendingSizeHandlers = new Set<(s: number) => void>();
  private pendingViewport: ViewportOptions | null = null;

  private subscription: BarrageSubscription | null = null;
  private subscriptionPromise: Promise<BarrageSubscription> | null = null;

  private closed = false;

  constructor(args: MaterializedTableArgs | PendingTableArgs) {
    this.name = args.name;
    this.transport = args.transport;
    if ('ticket' in args) {
      this._ticket = args.ticket;
      this._initialSize = args.size;
      this.source = null;
      this.op = null;
    } else {
      this._ticket = null;
      this._initialSize = 0;
      this.source = args.source;
      this.op = args.op;
    }
  }

  /**
   * Throws until the Table is materialized. Intended for callers that know
   * a Table was built via `CoreClient.getTable` (always materialized) or
   * have already awaited `.size()` / triggered a subscription.
   */
  get ticket(): Uint8Array {
    if (!this._ticket) {
      throw new Error(
        `Table "${this.name}" is not materialized yet. Call .size() or subscribe first.`,
      );
    }
    return this._ticket;
  }

  /**
   * Apply string filter expression(s) server-side. Synchronous: returns a
   * new pending Table immediately; no RPC is issued until someone subscribes
   * or reads `.size()`. Accepts varargs, a single array, or any mix:
   *
   *     t.where('I > 5');
   *     t.where('I > 5', 'J < 10');
   *     t.where(['I > 5', 'J < 10']);
   *     t.where('I > 5').where('J < 10');   // chain; two server RPCs
   *
   * Filter expressions are the same strings Deephaven's `.where(...)` accepts
   * in Python/Groovy — https://deephaven.io/core/docs/reference/table-operations/filter/where/.
   */
  where(...conditions: (string | readonly string[])[]): Table {
    if (this.closed) throw new Error('Table: already closed');
    const filters: string[] = [];
    for (const c of conditions) {
      if (typeof c === 'string') {
        filters.push(c);
      } else if (Array.isArray(c)) {
        for (const s of c) filters.push(s as string);
      } else {
        throw new Error('where: each argument must be a string or an array of strings');
      }
    }
    for (const f of filters) {
      if (typeof f !== 'string' || f.length === 0) {
        throw new Error('where: filter entries must be non-empty strings');
      }
    }
    if (filters.length === 0) throw new Error('where: at least one filter string is required');

    const rendered = filters.map((f) => JSON.stringify(f)).join(', ');
    return new Table({
      name: `${this.name}.where([${rendered}])`,
      transport: this.transport,
      source: this,
      op: { type: 'where', filters },
    });
  }

  /**
   * Sort the table server-side. Synchronous: returns a pending Table, no
   * RPC issued until someone subscribes or reads `.size()`.
   *
   *     t.sort('Price')             // ascending
   *     t.sort('-Price')            // descending
   *     t.sort('Ticker', '-Price')  // multi-column, mixed direction
   *     t.sort(['Ticker', '-Price'])
   *     t.sort('Ticker').sort('-Price')   // chain, two server RPCs
   *
   * Each entry is a column name; a leading `-` flags descending. Whitespace
   * is trimmed.
   */
  sort(...columns: (string | readonly string[])[]): Table {
    if (this.closed) throw new Error('Table: already closed');
    const raw: string[] = [];
    for (const c of columns) {
      if (typeof c === 'string') {
        raw.push(c);
      } else if (Array.isArray(c)) {
        for (const s of c) raw.push(s as string);
      } else {
        throw new Error('sort: each argument must be a string or an array of strings');
      }
    }
    if (raw.length === 0) throw new Error('sort: at least one column is required');

    const descriptors: SortSpec[] = raw.map((entry) => {
      if (typeof entry !== 'string') {
        throw new Error('sort: column entries must be strings');
      }
      const trimmed = entry.trim();
      if (trimmed.length === 0) throw new Error('sort: column name must not be empty');
      if (trimmed === '-') throw new Error('sort: column name must not be empty');
      if (trimmed.startsWith('-')) {
        const column = trimmed.slice(1).trim();
        if (column.length === 0) throw new Error('sort: column name must not be empty');
        return { column, direction: 'desc' as const };
      }
      return { column: trimmed, direction: 'asc' as const };
    });

    const rendered = descriptors
      .map((d) => (d.direction === 'desc' ? `-${d.column}` : d.column))
      .map((s) => JSON.stringify(s))
      .join(', ');
    return new Table({
      name: `${this.name}.sort([${rendered}])`,
      transport: this.transport,
      source: this,
      op: { type: 'sort', descriptors },
    });
  }

  /**
   * `.view([...])` — pick/derive columns. Formulas can be either plain
   * column names to select, or assignments like `"Total = Price * Qty"`.
   * Lazy on the server side (formulas re-evaluated on read).
   *
   * Accepts varargs, arrays, or a mix, same as `.where()` / `.sort()`.
   */
  view(...specs: (string | readonly string[])[]): Table {
    return this.buildSelect('view', specs);
  }

  /**
   * `.update_view([...])` — add columns without dropping any. Lazy.
   */
  updateView(...specs: (string | readonly string[])[]): Table {
    return this.buildSelect('updateView', specs);
  }

  /**
   * `.update([...])` — add columns and materialize them on the server
   * (eagerly computed, faster reads).
   */
  update(...specs: (string | readonly string[])[]): Table {
    return this.buildSelect('update', specs);
  }

  private buildSelect(kind: SelectKind, specs: (string | readonly string[])[]): Table {
    if (this.closed) throw new Error('Table: already closed');
    const columnSpecs: string[] = [];
    for (const c of specs) {
      if (typeof c === 'string') {
        columnSpecs.push(c);
      } else if (Array.isArray(c)) {
        for (const s of c) columnSpecs.push(s as string);
      } else {
        throw new Error(`${kind}: each argument must be a string or an array of strings`);
      }
    }
    for (const s of columnSpecs) {
      if (typeof s !== 'string' || s.length === 0) {
        throw new Error(`${kind}: column entries must be non-empty strings`);
      }
    }
    if (columnSpecs.length === 0) throw new Error(`${kind}: at least one column spec is required`);

    const rendered = columnSpecs.map((s) => JSON.stringify(s)).join(', ');
    return new Table({
      name: `${this.name}.${kind}([${rendered}])`,
      transport: this.transport,
      source: this,
      op: { type: kind, columnSpecs },
    });
  }

  /** Resolve the current row count. Triggers materialization on first call. */
  async size(): Promise<number> {
    await this.materialize();
    return this._initialSize;
  }

  setViewport(options: ViewportOptions): void {
    if (this.closed) throw new Error('Table: already closed');
    this.pendingViewport = options;
    if (this.subscription) {
      this.subscription.setViewport(options);
    } else {
      this.ensureSubscription();
    }
  }

  onUpdate(handler: (update: ViewportUpdate) => void): () => void {
    if (this.closed) throw new Error('Table: already closed');
    this.pendingUpdateHandlers.add(handler);
    if (this.subscription) {
      this.subscription.updateListeners.add(handler);
      this.subscription.replayTo(handler);
    } else {
      this.ensureSubscription();
    }
    return () => {
      this.pendingUpdateHandlers.delete(handler);
      if (this.subscription) {
        this.subscription.updateListeners.delete(handler);
        this.maybeCloseSubscription();
      }
    };
  }

  onSizeUpdate(handler: (size: number) => void): () => void {
    if (this.closed) throw new Error('Table: already closed');
    this.pendingSizeHandlers.add(handler);
    if (this.subscription) {
      this.subscription.sizeListeners.add(handler);
      this.subscription.replaySizeTo(handler);
    } else {
      this.ensureSubscription();
    }
    return () => {
      this.pendingSizeHandlers.delete(handler);
      if (this.subscription) {
        this.subscription.sizeListeners.delete(handler);
        this.maybeCloseSubscription();
      }
    };
  }

  /** Independent sibling Table — same ticket/recipe, own subscription state. */
  copy(): Table {
    if (this._ticket !== null) {
      return new Table({
        name: this.name,
        transport: this.transport,
        ticket: this._ticket,
        size: this._initialSize,
      });
    }
    return new Table({
      name: this.name,
      transport: this.transport,
      source: this.source!,
      op: this.op!,
    });
  }

  /** Idempotent. Closes any open subscription and drops pending listeners. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.subscription?.close();
    this.subscription = null;
    this.subscriptionPromise = null;
    this.pendingUpdateHandlers.clear();
    this.pendingSizeHandlers.clear();
  }

  private async materialize(): Promise<Uint8Array> {
    if (this._ticket) return this._ticket;
    if (!this.materializePromise) {
      this.materializePromise = (async () => {
        const sourceTicket = await this.source!.materialize();
        const op = this.op!;
        let result;
        if (op.type === 'where') {
          result = await this.transport.filterTable(sourceTicket, op.filters);
        } else if (op.type === 'sort') {
          result = await this.transport.sortTable(sourceTicket, op.descriptors);
        } else {
          result = await this.transport.selectTable(sourceTicket, op.columnSpecs, op.type);
        }
        this._ticket = result.ticket;
        this._initialSize = result.size;
        return result.ticket;
      })();
    }
    return this.materializePromise;
  }

  private ensureSubscription(): void {
    if (this.closed) return;
    if (this.subscription || this.subscriptionPromise) return;

    // Fast path: materialized Tables can open their subscription synchronously
    // so that `setViewport` / `onUpdate` callers can see replayed updates in
    // the same tick. Pending Tables have to wait for the filter RPC chain.
    if (this._ticket !== null) {
      const sub = new BarrageSubscription(this.transport, this._ticket);
      for (const h of this.pendingUpdateHandlers) sub.updateListeners.add(h);
      for (const h of this.pendingSizeHandlers) sub.sizeListeners.add(h);
      this.subscription = sub;
      if (this.pendingViewport) sub.setViewport(this.pendingViewport);
      return;
    }

    this.subscriptionPromise = this.materialize()
      .then((ticket) => {
        if (this.closed) throw new Error('Table: closed during materialization');
        const sub = new BarrageSubscription(this.transport, ticket);
        for (const h of this.pendingUpdateHandlers) sub.updateListeners.add(h);
        for (const h of this.pendingSizeHandlers) sub.sizeListeners.add(h);
        this.subscription = sub;
        if (this.pendingViewport) sub.setViewport(this.pendingViewport);
        return sub;
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error(`Table "${this.name}" materialization failed:`, err);
        throw err;
      });
  }

  private maybeCloseSubscription(): void {
    const sub = this.subscription;
    if (!sub) return;
    if (sub.updateListeners.size === 0 && sub.sizeListeners.size === 0) {
      sub.close();
      this.subscription = null;
      this.subscriptionPromise = null;
    }
  }
}
