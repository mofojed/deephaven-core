import type { BarrageMessage } from './barrage.js';
import { RangeSet } from './RangeSet.js';
import type { Column } from './schema.js';
import { TableDataImpl } from './TableData.js';

/**
 * Rebuilds a column after a viewport update. Positions are within the viewport's rows: `removed` before the update,
 * `added` after it, with `addedValues` holding the added rows' values in order.
 */
export function applyPositionalUpdate(
  values: readonly unknown[],
  addedValues: readonly unknown[],
  added: RangeSet,
  removed: RangeSet
): unknown[] {
  const retained = removed.isEmpty ? values : values.filter((_, i) => !removed.has(i));
  if (added.isEmpty) {
    return retained === values ? values.slice() : (retained as unknown[]);
  }
  const length = retained.length + added.size;
  const result = new Array<unknown>(length);
  let retainedIndex = 0;
  let addedIndex = 0;
  let next = 0;
  for (const [first, last] of added.rangeIterator()) {
    for (; next < first && next < length; next++) {
      result[next] = retained[retainedIndex++];
    }
    for (; next <= last && next < length; next++) {
      result[next] = addedValues[addedIndex++];
    }
  }
  for (; next < length; next++) {
    result[next] = retained[retainedIndex++];
  }
  return result;
}

/**
 * The client's copy of a viewport subscription's data. Barrage sends a viewport's updates in position space: added,
 * removed and modified rows are positions within the rows of the viewport the server is sending, so the data is a
 * flat array per column. This holds for blink tables too, whose updates remove the previous cycle's rows.
 */
export class ViewportState {
  tableSize = 0;
  /** The rows the server is sending, as positions in the table; may extend past the end of the table. */
  serverViewport = RangeSet.EMPTY;
  /** The columns the server is sending, or null for all. */
  serverColumns: readonly boolean[] | null = null;
  private columnData: unknown[][];
  private dataLength = 0;

  constructor(private readonly columnCount: number) {
    this.columnData = Array.from({ length: columnCount }, () => []);
  }

  isSubscribed(column: number): boolean {
    return this.serverColumns == null || this.serverColumns[column] === true;
  }

  apply(msg: BarrageMessage): void {
    const prevColumns = this.serverColumns;
    this.tableSize = msg.tableSize;
    if (msg.isSnapshot) {
      this.serverViewport = msg.snapshotRowSet ?? RangeSet.ofRange(0, Math.max(0, msg.tableSize) - 1);
      const columns = msg.snapshotColumns;
      this.serverColumns =
        columns == null || Array.from({ length: this.columnCount }, (_, i) => columns[i] === true).every(Boolean)
          ? null
          : columns;
    }

    const prevLength = this.dataLength;
    const newLength = prevLength - msg.rowsRemoved.size + msg.rowsAdded.size;
    for (let i = 0; i < this.columnCount; i++) {
      const wasSubscribed = prevColumns == null || prevColumns[i] === true;
      const isSubscribed = this.isSubscribed(i);
      if (!isSubscribed) {
        if (wasSubscribed) {
          this.columnData[i] = [];
        }
        continue;
      }
      if (!msg.rowsAdded.isEmpty || !msg.rowsRemoved.isEmpty) {
        this.columnData[i] = applyPositionalUpdate(
          this.columnData[i],
          msg.addColumnData[i] ?? [],
          msg.rowsAdded,
          // A newly subscribed column held no rows to remove
          wasSubscribed ? msg.rowsRemoved : RangeSet.EMPTY
        );
      }
    }
    for (let i = 0; i < msg.modColumnData.length && i < this.columnCount; i++) {
      const { rowsModified, data } = msg.modColumnData[i];
      if (rowsModified.isEmpty || !this.isSubscribed(i)) {
        continue;
      }
      const column = this.columnData[i];
      let k = 0;
      for (const position of rowsModified) {
        column[position] = data[k++];
      }
    }
    this.dataLength = newLength;
  }

  /** The rows the client holds, as positions in the table. */
  get positions(): RangeSet {
    return this.serverViewport.intersect(RangeSet.ofRange(0, this.tableSize - 1));
  }

  /** An immutable copy of the current data. */
  toTableData(columns: readonly Column[]): TableDataImpl {
    const data = new Map<number, readonly unknown[]>();
    const included: Column[] = [];
    for (const column of columns) {
      if (this.isSubscribed(column.index)) {
        included.push(column);
        data.set(column.index, this.columnData[column.index].slice(0, this.dataLength));
      }
    }
    let positions = this.positions;
    if (positions.size > this.dataLength) {
      positions = positions.intersect(RangeSet.ofRange(positions.first, positions.get(this.dataLength - 1)));
    }
    return new TableDataImpl(columns, included, positions, data, this.tableSize);
  }
}
