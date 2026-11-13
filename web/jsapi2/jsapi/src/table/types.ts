import type { ColumnOrName, TableData } from '../data/TableData.js';
import type { Column } from '../data/schema.js';
import type { RemoverFn } from '../events.js';
import type { ViewportSubscription, ViewportSubscriptionOptions } from './ViewportSubscription.js';

/** A row range, inclusive at both ends. */
export interface RowRange {
  readonly first: number;
  readonly last: number;
}

/** A sort on one column: a column name sorts ascending. */
export type Sort =
  | string
  | {
      readonly column: ColumnOrName;
      /** Defaults to `'ASC'`. */
      readonly direction?: 'ASC' | 'DESC';
      /** Sort by absolute value. */
      readonly abs?: boolean;
    };

/** Aggregations that apply one operation to each of a list of columns. */
export type ColumnAggregationType =
  | 'Sum'
  | 'AbsSum'
  | 'Avg'
  | 'Min'
  | 'Max'
  | 'First'
  | 'Last'
  | 'Median'
  | 'Std'
  | 'Var'
  | 'Group'
  | 'CountDistinct'
  | 'Distinct';

/**
 * One aggregation for {@link TableOperations.aggBy}. `columns` are match pairs: `"X"` aggregates X into a column of the
 * same name, `"SumX = X"` into a new column.
 */
export type Aggregation =
  | {
      readonly type: ColumnAggregationType;
      readonly columns: readonly string[];
      /** For CountDistinct, whether null counts as a value; for Distinct, whether to include it. */
      readonly includeNulls?: boolean;
    }
  | { readonly type: 'WAvg' | 'WSum'; readonly weightColumn: string; readonly columns: readonly string[] }
  /** The number of rows in each group, in a column named `column`. */
  | { readonly type: 'Count'; readonly column: string };

export interface AggByOptions {
  readonly aggregations: readonly Aggregation[];
  /** The key columns; none aggregates the whole table into one row. */
  readonly groupByColumns?: readonly string[];
}

/** How {@link TableOperations.naturalJoin} handles more than one matching right row. */
export type NaturalJoinType = 'ERROR_ON_DUPLICATE' | 'FIRST_MATCH' | 'LAST_MATCH' | 'EXACTLY_ONE_MATCH';

export interface ResolveOptions {
  /** Aborting before the table is ready cancels it. */
  readonly signal?: AbortSignal;
}

/** Another table an operation reads: a pending or resolved table from the same client. */
export type TableReference = TableOperations;

export interface SnapshotOptions {
  /** Which rows to read, by position; defaults to every row. */
  readonly rows?: RowRange;
  /** Which columns to read; defaults to every column. */
  readonly columns?: readonly ColumnOrName[];
}

/**
 * Operations that create a new table from this one. Tables are immutable: each operation leaves this table as it is
 * and returns a new {@link PendingTable}, which can be chained on further or awaited. Operations made in one task are
 * sent to the server together, in one batch.
 *
 * Each table holds resources on the server until it is closed. Awaiting a pending table gives a
 * {@link ResolvedTable}, which the awaiting code owns and must close. A pending table that nobody awaits is released
 * automatically once nothing chained on it needs it.
 *
 * Arguments are checked when a method is called, which throws for invalid ones; a failure on the server rejects the
 * pending table instead.
 */
export interface TableOperations {
  /**
   * The table these operations stand for, ready to read. On a pending table, the same as awaiting it; on a resolved
   * table, that table itself.
   */
  resolve(options?: ResolveOptions): Promise<ResolvedTable>;

  /** The first `rows` rows. */
  head(rows: number): PendingTable;
  /** The last `rows` rows. */
  tail(rows: number): PendingTable;
  /** The rows in reverse order. */
  reverse(): PendingTable;
  /** The same rows, renumbered so that row keys are contiguous. */
  flatten(): PendingTable;
  /** Sorted by the given columns, the first being the most significant. */
  sort(sorts: Sort | readonly Sort[]): PendingTable;
  /** The rows matching every filter, written as query language expressions such as `"X > 5"`. */
  where(filters: string | readonly string[]): PendingTable;
  /** The rows whose `columnsToMatch` values appear in `rightTable`. Matches are `"Col"` or `"LeftCol = RightCol"`. */
  whereIn(rightTable: TableReference, columnsToMatch: readonly string[]): PendingTable;
  /** The rows whose `columnsToMatch` values do not appear in `rightTable`. */
  whereNotIn(rightTable: TableReference, columnsToMatch: readonly string[]): PendingTable;
  /** Only the given columns, as names or formulas such as `"Y = X * 2"`, computed when read. */
  view(columns: readonly string[]): PendingTable;
  /** Every column, plus the given formula columns, computed when read. */
  updateView(columns: readonly string[]): PendingTable;
  /** Every column, plus the given formula columns, computed and stored. */
  update(columns: readonly string[]): PendingTable;
  /** Every column, plus the given formula columns, computed once per distinct input. */
  lazyUpdate(columns: readonly string[]): PendingTable;
  /** Only the given columns, computed and stored; with no columns, every column. */
  select(columns?: readonly string[]): PendingTable;
  /** Every column except these. */
  dropColumns(columns: readonly ColumnOrName[]): PendingTable;
  /** The distinct combinations of values of these columns. */
  selectDistinct(columns: readonly string[]): PendingTable;

  /**
   * Adds `columnsToAdd` (all of the right table's other columns by default) from the right row matching each left row
   * on `columnsToMatch`. Matches are `"Col"` or `"LeftCol = RightCol"`; added columns may be renamed `"New = Old"`.
   */
  naturalJoin(
    rightTable: TableReference,
    columnsToMatch: readonly string[],
    columnsToAdd?: readonly string[],
    joinType?: NaturalJoinType
  ): PendingTable;
  /** As {@link naturalJoin}, but every left row must have exactly one match. */
  exactJoin(rightTable: TableReference, columnsToMatch: readonly string[], columnsToAdd?: readonly string[]): PendingTable;
  /** One row for each pair of a left row and a matching right row; with no columns to match, every pair. */
  join(
    rightTable: TableReference,
    columnsToMatch?: readonly string[],
    columnsToAdd?: readonly string[],
    reserveBits?: number
  ): PendingTable;

  /** Groups by the key columns and applies the aggregations to each group. */
  aggBy(options: AggByOptions): PendingTable;
  /** Groups by the key columns, and makes each other column an array of the group's values. */
  groupBy(groupByColumns?: readonly string[]): PendingTable;
  /** Expands array columns into one row per element; by default every array column. */
  ungroup(columns?: readonly string[], nullFill?: boolean): PendingTable;
  /** The number of rows in each group, in a column named `countColumn`. */
  countBy(countColumn: string, groupByColumns?: readonly string[]): PendingTable;
  firstBy(groupByColumns?: readonly string[]): PendingTable;
  lastBy(groupByColumns?: readonly string[]): PendingTable;
  minBy(groupByColumns?: readonly string[]): PendingTable;
  maxBy(groupByColumns?: readonly string[]): PendingTable;
  sumBy(groupByColumns?: readonly string[]): PendingTable;
  absSumBy(groupByColumns?: readonly string[]): PendingTable;
  avgBy(groupByColumns?: readonly string[]): PendingTable;
  medianBy(groupByColumns?: readonly string[]): PendingTable;
  stdBy(groupByColumns?: readonly string[]): PendingTable;
  varBy(groupByColumns?: readonly string[]): PendingTable;
}

/**
 * A table being created on the server. Await it (or call {@link resolve}) for the {@link ResolvedTable}, which the
 * caller then owns, or chain more operations on it.
 *
 * A pending table may only be used in the task that created it: awaited, resolved, chained on or passed to another
 * operation before control returns to the event loop. Awaiting it again gives the same table. Awaiting two pending
 * tables one after the other (`await a; await b;`) uses `b` in a later task, so it rejects: await both with
 * `Promise.all([a, b])` instead.
 */
export interface PendingTable<T = ResolvedTable> extends TableOperations, PromiseLike<T> {
  /**
   * Abandons this table. If it is not ready yet, awaiting it rejects with "Operation canceled", and operations chained
   * on it fail; if it was already delivered to awaiters, that table is closed.
   */
  cancel(): void;
}

export interface ResolvedTableEvents extends Record<string, unknown> {
  /** The number of rows in a refreshing table changed. */
  sizechanged: { size: number };
}

/**
 * A table that exists on the server, with its columns and size known, from which data can be read. The code that
 * awaited or resolved it owns it, and must {@link close} it when done.
 */
export interface ResolvedTable extends TableOperations {
  readonly columns: readonly Column[];
  /** The number of rows; kept up to date for a refreshing table. */
  readonly size: number;
  /** Whether the table can change, such as a time table or anything derived from one. */
  readonly isRefreshing: boolean;
  /** Whether the table is a blink table, holding only the rows added in the latest update. */
  readonly isBlink: boolean;
  /** The table's attributes on the server, by name. */
  readonly attributes: Readonly<Record<string, string>>;
  readonly isClosed: boolean;

  /** The column with this name; throws if there is none. */
  findColumn(name: string): Column;
  findColumns(names: readonly string[]): Column[];

  /** Reads rows of the table once. */
  createSnapshot(options?: SnapshotOptions): Promise<TableData>;
  /** Subscribes to a range of rows, kept up to date as the table changes. */
  createViewportSubscription(options: ViewportSubscriptionOptions): ViewportSubscription;

  /** Another handle on the same table, with its own lifetime: closing either leaves the other open. */
  copy(): ResolvedTable;
  /** Releases this handle; once every handle is closed, the server frees the table. */
  close(): void;

  addEventListener<K extends keyof ResolvedTableEvents>(
    type: K,
    listener: (event: ResolvedTableEvents[K]) => void
  ): RemoverFn;
  removeEventListener<K extends keyof ResolvedTableEvents>(
    type: K,
    listener: (event: ResolvedTableEvents[K]) => void
  ): void;
}
