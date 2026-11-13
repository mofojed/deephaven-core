import type * as Core from '@deephaven/jsapi-core';
import type { Connection } from '../connection/Connection.js';
import type { Column } from '../data/schema.js';
import { type ColumnOrName, resolveColumn, type TableData } from '../data/TableData.js';
import { CancelError } from '../errors.js';
import { EventEmitter, type RemoverFn } from '../events.js';
import { enqueueOperation, type OperationInit } from './BatchQueue.js';
import { atTaskEnd, currentTask } from './tasks.js';
import { TableState } from './TableState.js';
import type {
  AggByOptions,
  Aggregation,
  NaturalJoinType,
  PendingTable,
  ResolvedTable,
  ResolvedTableEvents,
  ResolveOptions,
  SnapshotOptions,
  Sort,
  TableOperations,
  TableReference,
} from './types.js';
import {
  readSnapshot,
  type ViewportSubscription,
  ViewportSubscriptionImpl,
  type ViewportSubscriptionOptions,
} from './ViewportSubscription.js';

type TicketInit = { ticket: Uint8Array };
type TableReferenceInit = { ref: { case: 'ticket'; value: TicketInit } };
type AggSpecInit = Core.protobuf.MessageInitShape<typeof Core.table.AggSpecSchema>;
type AggregationInit = Core.protobuf.MessageInitShape<typeof Core.table.AggregationSchema>;

/** Builds an operation, given the ticket for its result and a reference to its source. */
type OperationBuilder = (resultId: TicketInit, sourceId: TableReferenceInit) => OperationInit;

const getState = Symbol('getState');

function tableRef(state: TableState): TableReferenceInit {
  return { ref: { case: 'ticket', value: { ticket: state.ticket } } };
}

function checkStrings(name: string, values: readonly unknown[] | undefined, allowEmpty = true): string[] {
  if (values == null) {
    return [];
  }
  if (!Array.isArray(values)) {
    throw new TypeError(`${name} must be an array`);
  }
  for (const v of values) {
    if (typeof v !== 'string' || v.trim() === '') {
      throw new TypeError(`${name} must contain only non-empty strings`);
    }
  }
  if (!allowEmpty && values.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
  return [...(values as string[])];
}

function checkRowCount(name: string, rows: number): string {
  if (!Number.isInteger(rows) || rows < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
  return String(rows);
}

const columnAggregations: Record<string, (agg: Extract<Aggregation, { columns: readonly string[] }>) => AggSpecInit> = {
  Sum: () => ({ type: { case: 'sum', value: {} } }),
  AbsSum: () => ({ type: { case: 'absSum', value: {} } }),
  Avg: () => ({ type: { case: 'avg', value: {} } }),
  Min: () => ({ type: { case: 'min', value: {} } }),
  Max: () => ({ type: { case: 'max', value: {} } }),
  First: () => ({ type: { case: 'first', value: {} } }),
  Last: () => ({ type: { case: 'last', value: {} } }),
  Median: () => ({ type: { case: 'median', value: { averageEvenlyDivided: true } } }),
  Std: () => ({ type: { case: 'std', value: {} } }),
  Var: () => ({ type: { case: 'var', value: {} } }),
  Group: () => ({ type: { case: 'group', value: {} } }),
  CountDistinct: agg => ({
    type: { case: 'countDistinct', value: { countNulls: 'includeNulls' in agg && agg.includeNulls === true } },
  }),
  Distinct: agg => ({
    type: { case: 'distinct', value: { includeNulls: 'includeNulls' in agg && agg.includeNulls === true } },
  }),
  WAvg: agg => ({ type: { case: 'weightedAvg', value: { weightColumn: (agg as { weightColumn: string }).weightColumn } } }),
  WSum: agg => ({ type: { case: 'weightedSum', value: { weightColumn: (agg as { weightColumn: string }).weightColumn } } }),
};

function aggregation(agg: Aggregation): AggregationInit {
  if (agg == null || typeof agg !== 'object') {
    throw new TypeError('Each aggregation must be an object');
  }
  if (agg.type === 'Count') {
    if (typeof agg.column !== 'string' || agg.column === '') {
      throw new TypeError('A Count aggregation needs a column name');
    }
    return { type: { case: 'count', value: { columnName: agg.column } } };
  }
  const spec = columnAggregations[agg.type];
  if (spec == null) {
    throw new TypeError(`Unknown aggregation type ${String(agg.type)}`);
  }
  if ((agg.type === 'WAvg' || agg.type === 'WSum') && typeof agg.weightColumn !== 'string') {
    throw new TypeError(`A ${agg.type} aggregation needs a weightColumn`);
  }
  return {
    type: {
      case: 'columns',
      value: { spec: spec(agg as never), matchPairs: checkStrings(`${agg.type} columns`, agg.columns, false) },
    },
  };
}

/** The operations every table supports, implemented by queueing batch operations on the connection. */
abstract class TableOperationsBase implements TableOperations {
  constructor(readonly connection: Connection) {}

  /** The state the operations read from; throws if this table can no longer be used. */
  abstract [getState](): TableState;

  abstract resolve(options?: ResolveOptions): Promise<ResolvedTable>;

  /** Queues an operation on this table and, optionally, other tables it reads. */
  protected chain(description: string, build: OperationBuilder, operands: readonly TableReference[] = []): PendingTable {
    let sources: TableState[];
    try {
      sources = [this[getState](), ...operands.map(operand => stateOf(operand, this.connection))];
    } catch (e) {
      return new PendingTableImpl(
        this.connection,
        TableState.failed(this.connection, e instanceof Error ? e : new Error(String(e)), description)
      );
    }
    return createOperation(this.connection, description, sources, resultId => build(resultId, tableRef(sources[0])));
  }

  head(rows: number): PendingTable {
    const numRows = checkRowCount('rows', rows);
    return this.chain('head', (resultId, sourceId) => ({ op: { case: 'head', value: { resultId, sourceId, numRows } } }));
  }

  tail(rows: number): PendingTable {
    const numRows = checkRowCount('rows', rows);
    return this.chain('tail', (resultId, sourceId) => ({ op: { case: 'tail', value: { resultId, sourceId, numRows } } }));
  }

  reverse(): PendingTable {
    const { SortDescriptor_SortDirection } = this.connection.core.table;
    return this.chain('reverse', (resultId, sourceId) => ({
      op: { case: 'sort', value: { resultId, sourceId, sorts: [{ direction: SortDescriptor_SortDirection.REVERSE }] } },
    }));
  }

  flatten(): PendingTable {
    return this.chain('flatten', (resultId, sourceId) => ({ op: { case: 'flatten', value: { resultId, sourceId } } }));
  }

  sort(sorts: Sort | readonly Sort[]): PendingTable {
    const { SortDescriptor_SortDirection } = this.connection.core.table;
    const list = (Array.isArray(sorts) ? sorts : [sorts]) as readonly Sort[];
    if (list.length === 0) {
      throw new TypeError('sort needs at least one column');
    }
    const descriptors = list.map(sort => {
      if (typeof sort === 'string') {
        return { columnName: sort, direction: SortDescriptor_SortDirection.ASCENDING };
      }
      if (sort == null || sort.column == null) {
        throw new TypeError('Each sort must be a column name or an object with a column');
      }
      if (sort.direction != null && sort.direction !== 'ASC' && sort.direction !== 'DESC') {
        throw new TypeError(`Unknown sort direction ${String(sort.direction)}`);
      }
      return {
        columnName: typeof sort.column === 'string' ? sort.column : sort.column.name,
        isAbsolute: sort.abs === true,
        direction:
          sort.direction === 'DESC' ? SortDescriptor_SortDirection.DESCENDING : SortDescriptor_SortDirection.ASCENDING,
      };
    });
    return this.chain('sort', (resultId, sourceId) => ({
      op: { case: 'sort', value: { resultId, sourceId, sorts: descriptors } },
    }));
  }

  where(filters: string | readonly string[]): PendingTable {
    const list = checkStrings('filters', typeof filters === 'string' ? [filters] : filters);
    return this.chain('where', (resultId, sourceId) => ({
      op: { case: 'unstructuredFilter', value: { resultId, sourceId, filters: list } },
    }));
  }

  private whereInImpl(rightTable: TableReference, columnsToMatch: readonly string[], inverted: boolean): PendingTable {
    const columns = checkStrings('columnsToMatch', columnsToMatch, false);
    return this.chain(
      inverted ? 'whereNotIn' : 'whereIn',
      (resultId, leftId) => ({
        op: {
          case: 'whereIn',
          value: { resultId, leftId, rightId: tableRef(stateOf(rightTable, this.connection)), inverted, columnsToMatch: columns },
        },
      }),
      [rightTable]
    );
  }

  whereIn(rightTable: TableReference, columnsToMatch: readonly string[]): PendingTable {
    return this.whereInImpl(rightTable, columnsToMatch, false);
  }

  whereNotIn(rightTable: TableReference, columnsToMatch: readonly string[]): PendingTable {
    return this.whereInImpl(rightTable, columnsToMatch, true);
  }

  private selectOrUpdate(
    kind: 'view' | 'updateView' | 'update' | 'lazyUpdate' | 'select',
    columns: readonly string[] | undefined,
    allowEmpty: boolean
  ): PendingTable {
    const columnSpecs = checkStrings('columns', columns, allowEmpty);
    return this.chain(kind, (resultId, sourceId) => ({ op: { case: kind, value: { resultId, sourceId, columnSpecs } } }));
  }

  view(columns: readonly string[]): PendingTable {
    return this.selectOrUpdate('view', columns, false);
  }

  updateView(columns: readonly string[]): PendingTable {
    return this.selectOrUpdate('updateView', columns, false);
  }

  update(columns: readonly string[]): PendingTable {
    return this.selectOrUpdate('update', columns, false);
  }

  lazyUpdate(columns: readonly string[]): PendingTable {
    return this.selectOrUpdate('lazyUpdate', columns, false);
  }

  select(columns?: readonly string[]): PendingTable {
    return this.selectOrUpdate('select', columns, true);
  }

  dropColumns(columns: readonly ColumnOrName[]): PendingTable {
    const columnNames = checkStrings(
      'columns',
      (columns ?? []).map(c => (typeof c === 'string' ? c : c?.name)),
      false
    );
    return this.chain('dropColumns', (resultId, sourceId) => ({
      op: { case: 'dropColumns', value: { resultId, sourceId, columnNames } },
    }));
  }

  selectDistinct(columns: readonly string[]): PendingTable {
    const columnNames = checkStrings('columns', columns);
    return this.chain('selectDistinct', (resultId, sourceId) => ({
      op: { case: 'selectDistinct', value: { resultId, sourceId, columnNames } },
    }));
  }

  naturalJoin(
    rightTable: TableReference,
    columnsToMatch: readonly string[],
    columnsToAdd?: readonly string[],
    joinType?: NaturalJoinType
  ): PendingTable {
    const match = checkStrings('columnsToMatch', columnsToMatch);
    const add = checkStrings('columnsToAdd', columnsToAdd);
    const { NaturalJoinTablesRequest_JoinType: JoinType } = this.connection.core.table;
    let type: number = JoinType.JOIN_TYPE_NOT_SPECIFIED;
    if (joinType != null) {
      type = JoinType[joinType as keyof typeof JoinType] as number;
      if (type == null || joinType === ('JOIN_TYPE_NOT_SPECIFIED' as string)) {
        throw new TypeError(`Unknown natural join type ${String(joinType)}`);
      }
    }
    return this.chain(
      'naturalJoin',
      (resultId, leftId) => ({
        op: {
          case: 'naturalJoin',
          value: {
            resultId,
            leftId,
            rightId: tableRef(stateOf(rightTable, this.connection)),
            columnsToMatch: match,
            columnsToAdd: add,
            joinType: type,
          },
        },
      }),
      [rightTable]
    );
  }

  exactJoin(rightTable: TableReference, columnsToMatch: readonly string[], columnsToAdd?: readonly string[]): PendingTable {
    const match = checkStrings('columnsToMatch', columnsToMatch);
    const add = checkStrings('columnsToAdd', columnsToAdd);
    return this.chain(
      'exactJoin',
      (resultId, leftId) => ({
        op: {
          case: 'exactJoin',
          value: {
            resultId,
            leftId,
            rightId: tableRef(stateOf(rightTable, this.connection)),
            columnsToMatch: match,
            columnsToAdd: add,
          },
        },
      }),
      [rightTable]
    );
  }

  join(
    rightTable: TableReference,
    columnsToMatch?: readonly string[],
    columnsToAdd?: readonly string[],
    reserveBits?: number
  ): PendingTable {
    const match = checkStrings('columnsToMatch', columnsToMatch);
    const add = checkStrings('columnsToAdd', columnsToAdd);
    if (reserveBits != null && (!Number.isInteger(reserveBits) || reserveBits < 0)) {
      throw new RangeError('reserveBits must be a non-negative integer');
    }
    return this.chain(
      'join',
      (resultId, leftId) => ({
        op: {
          case: 'crossJoin',
          value: {
            resultId,
            leftId,
            rightId: tableRef(stateOf(rightTable, this.connection)),
            columnsToMatch: match,
            columnsToAdd: add,
            reserveBits: reserveBits ?? 0,
          },
        },
      }),
      [rightTable]
    );
  }

  aggBy(options: AggByOptions): PendingTable {
    if (options == null || !Array.isArray(options.aggregations) || options.aggregations.length === 0) {
      throw new TypeError('aggBy needs at least one aggregation');
    }
    const aggregations = options.aggregations.map(aggregation);
    const groupByColumns = checkStrings('groupByColumns', options.groupByColumns);
    return this.chain('aggBy', (resultId, sourceId) => ({
      op: { case: 'aggregate', value: { resultId, sourceId, aggregations, groupByColumns } },
    }));
  }

  private aggAllBy(description: string, spec: AggSpecInit, groupByColumns: readonly string[] | undefined): PendingTable {
    const groupBy = checkStrings('groupByColumns', groupByColumns);
    return this.chain(description, (resultId, sourceId) => ({
      op: { case: 'aggregateAll', value: { resultId, sourceId, spec, groupByColumns: groupBy } },
    }));
  }

  groupBy(groupByColumns?: readonly string[]): PendingTable {
    return this.aggAllBy('groupBy', { type: { case: 'group', value: {} } }, groupByColumns);
  }

  ungroup(columns?: readonly string[], nullFill = false): PendingTable {
    const columnsToUngroup = checkStrings('columns', columns);
    return this.chain('ungroup', (resultId, sourceId) => ({
      op: { case: 'ungroup', value: { resultId, sourceId, columnsToUngroup, nullFill } },
    }));
  }

  countBy(countColumn: string, groupByColumns?: readonly string[]): PendingTable {
    return this.aggBy({ aggregations: [{ type: 'Count', column: countColumn }], groupByColumns });
  }

  firstBy(groupByColumns?: readonly string[]): PendingTable {
    return this.aggAllBy('firstBy', columnAggregations.First(null as never), groupByColumns);
  }

  lastBy(groupByColumns?: readonly string[]): PendingTable {
    return this.aggAllBy('lastBy', columnAggregations.Last(null as never), groupByColumns);
  }

  minBy(groupByColumns?: readonly string[]): PendingTable {
    return this.aggAllBy('minBy', columnAggregations.Min(null as never), groupByColumns);
  }

  maxBy(groupByColumns?: readonly string[]): PendingTable {
    return this.aggAllBy('maxBy', columnAggregations.Max(null as never), groupByColumns);
  }

  sumBy(groupByColumns?: readonly string[]): PendingTable {
    return this.aggAllBy('sumBy', columnAggregations.Sum(null as never), groupByColumns);
  }

  absSumBy(groupByColumns?: readonly string[]): PendingTable {
    return this.aggAllBy('absSumBy', columnAggregations.AbsSum(null as never), groupByColumns);
  }

  avgBy(groupByColumns?: readonly string[]): PendingTable {
    return this.aggAllBy('avgBy', columnAggregations.Avg(null as never), groupByColumns);
  }

  medianBy(groupByColumns?: readonly string[]): PendingTable {
    return this.aggAllBy('medianBy', columnAggregations.Median(null as never), groupByColumns);
  }

  stdBy(groupByColumns?: readonly string[]): PendingTable {
    return this.aggAllBy('stdBy', columnAggregations.Std(null as never), groupByColumns);
  }

  varBy(groupByColumns?: readonly string[]): PendingTable {
    return this.aggAllBy('varBy', columnAggregations.Var(null as never), groupByColumns);
  }
}

/** The state of another table passed to an operation; throws if it is not a usable table of this connection. */
function stateOf(table: TableReference, connection: Connection): TableState {
  if (!(table instanceof TableOperationsBase)) {
    throw new TypeError('Expected a table from this client');
  }
  if (table.connection !== connection) {
    throw new Error('Cannot use a table from a different client');
  }
  return table[getState]();
}

/**
 * Creates a table on the server with one operation: queues it, and returns the pending table standing for it. The
 * new table holds each of its sources until it is ready or has failed.
 */
export function createOperation(
  connection: Connection,
  description: string,
  sources: readonly TableState[],
  build: (resultId: TicketInit) => OperationInit
): PendingTable {
  const state = new TableState(connection, connection.newExportTicket(), description);
  for (const source of sources) {
    source.retainUntil(state.settled);
  }
  enqueueOperation(connection, state, build({ ticket: state.ticket }), sources);
  return new PendingTableImpl(connection, state);
}

/** The rows of every table, in order. */
export function mergeTables(connection: Connection, tables: readonly TableReference[]): PendingTable {
  let sources: TableState[];
  try {
    sources = tables.map(table => stateOf(table, connection));
  } catch (e) {
    return new PendingTableImpl(connection, TableState.failed(connection, e instanceof Error ? e : new Error(String(e)), 'merge'));
  }
  return createOperation(connection, 'merge', sources, resultId => ({
    op: { case: 'merge', value: { resultId, sourceIds: sources.map(tableRef) } },
  }));
}

class PendingTableImpl extends TableOperationsBase implements PendingTable {
  private readonly createdInTask = currentTask();
  private readonly created = new Error('Pending table created here');
  private result: Promise<ResolvedTable> | null = null;
  private delivered: ResolvedTableImpl | null = null;
  private canceled = false;

  constructor(
    connection: Connection,
    private readonly state: TableState
  ) {
    super(connection);
    if (!state.isFailed) {
      // Held until the end of the task: whatever uses it in this task retains it for longer
      state.retain();
      atTaskEnd(() => state.release());
    }
  }

  private lateUseError(): Error | null {
    if (currentTask() === this.createdInTask) {
      return null;
    }
    const error = new Error(`A pending ${this.state.description} table was used after the task that created it`);
    console.warn(error.message, this.created.stack);
    return error;
  }

  [getState](): TableState {
    if (this.canceled) {
      throw new CancelError(`Cannot use source table: canceled`);
    }
    const late = this.lateUseError();
    if (late != null) {
      throw late;
    }
    return this.state;
  }

  resolve(options?: ResolveOptions): Promise<ResolvedTable> {
    if (this.result == null) {
      const late = this.lateUseError();
      if (this.canceled) {
        this.result = Promise.reject(new CancelError());
      } else if (late != null) {
        this.result = Promise.reject(late);
      } else if (this.state.isFailed) {
        this.result = Promise.reject(this.state.error);
      } else {
        const { state } = this;
        state.retain();
        this.result = state.settled.then(
          () => {
            if (this.canceled) {
              state.release();
              throw new CancelError();
            }
            this.delivered = new ResolvedTableImpl(this.connection, state);
            return this.delivered;
          },
          error => {
            state.release();
            throw error;
          }
        );
      }
    }
    const signal = options?.signal;
    if (signal != null) {
      if (signal.aborted) {
        this.cancelIfPending();
      } else {
        const onAbort = () => this.cancelIfPending();
        signal.addEventListener('abort', onAbort, { once: true });
        this.result.then(
          () => signal.removeEventListener('abort', onAbort),
          () => signal.removeEventListener('abort', onAbort)
        );
      }
    }
    return this.result;
  }

  then<TResult1 = ResolvedTable, TResult2 = never>(
    onfulfilled?: ((value: ResolvedTable) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.resolve().then(onfulfilled, onrejected);
  }

  private cancelIfPending(): void {
    if (this.delivered == null) {
      this.cancel();
    }
  }

  cancel(): void {
    if (this.canceled) {
      return;
    }
    this.canceled = true;
    if (this.delivered != null) {
      this.delivered.close();
    } else {
      this.state.fail(new CancelError());
    }
  }
}

class ResolvedTableImpl extends TableOperationsBase implements ResolvedTable {
  private closed = false;
  private readonly events = new (class extends EventEmitter<ResolvedTableEvents> {
    fire<K extends keyof ResolvedTableEvents>(type: K, event: ResolvedTableEvents[K]) {
      this.emit(type, event);
    }
  })();
  private readonly stopSize: () => void;

  /** Takes over a reference the caller already holds on `state`. */
  constructor(
    connection: Connection,
    private readonly state: TableState
  ) {
    super(connection);
    this.stopSize = state.onSizeChanged(size => this.events.fire('sizechanged', { size }));
  }

  [getState](): TableState {
    if (this.closed) {
      throw new Error('Table is closed');
    }
    return this.state;
  }

  resolve(): Promise<ResolvedTable> {
    return this.closed ? Promise.reject(new Error('Table is closed')) : Promise.resolve(this);
  }

  get columns(): readonly Column[] {
    return this.state.definition!.columns;
  }

  get size(): number {
    return this.state.size;
  }

  get isRefreshing(): boolean {
    return this.state.isRefreshing;
  }

  get isBlink(): boolean {
    return this.state.definition!.isBlink;
  }

  get attributes(): Readonly<Record<string, string>> {
    return this.state.definition!.attributes;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  findColumn(name: string): Column {
    return resolveColumn(this.columns, name);
  }

  findColumns(names: readonly string[]): Column[] {
    return names.map(name => this.findColumn(name));
  }

  createSnapshot(options?: SnapshotOptions): Promise<TableData> {
    return readSnapshot(this[getState](), options);
  }

  createViewportSubscription(options: ViewportSubscriptionOptions): ViewportSubscription {
    return new ViewportSubscriptionImpl(this[getState](), options);
  }

  copy(): ResolvedTable {
    const state = this[getState]();
    state.retain();
    return new ResolvedTableImpl(this.connection, state);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stopSize();
    this.state.release();
  }

  addEventListener<K extends keyof ResolvedTableEvents>(
    type: K,
    listener: (event: ResolvedTableEvents[K]) => void
  ): RemoverFn {
    return this.events.addEventListener(type, listener);
  }

  removeEventListener<K extends keyof ResolvedTableEvents>(
    type: K,
    listener: (event: ResolvedTableEvents[K]) => void
  ): void {
    this.events.removeEventListener(type, listener);
  }
}

export type { ColumnOrName };
