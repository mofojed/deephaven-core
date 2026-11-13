import type { RangeSet } from './RangeSet.js';
import type { Column } from './schema.js';

/** A column, or the name of one. */
export type ColumnOrName = Column | string;

/** One row of a {@link TableData}. */
export interface Row {
  /** The row's position in the table. */
  readonly position: number;
  /** The value of a column in this row. Throws if the column is not part of the data. */
  get(column: ColumnOrName): unknown;
}

/**
 * Rows of a table at one moment: a snapshot, or the contents of a viewport after an update. Values are JS values:
 * `number` for byte, short, int, float and double columns, `bigint` for long, `string` for char and String,
 * `boolean`, {@link DateTime} for Instant and ZonedDateTime, `bigint` for BigInteger, a decimal `string` for
 * BigDecimal, `YYYY-MM-DD` and `HH:MM:SS[.fffffffff]` strings for LocalDate and LocalTime, and arrays for array and
 * vector columns. Nulls are `null`.
 */
export interface TableData {
  /** The columns whose values this data includes. */
  readonly columns: readonly Column[];
  readonly rows: readonly Row[];
  /** The position in the table of each row, in order. */
  readonly positions: RangeSet;
  /** The position of the first row, or -1 if there are no rows. */
  readonly offset: number;
  /** The table's size when this data was read. */
  readonly totalSize: number;
  /** The value of a column at an index into {@link rows}. */
  getData(rowIndex: number, column: ColumnOrName): unknown;
}

/** Resolves a column or name against a table's columns; throws for one that is not there. */
export function resolveColumn(columns: readonly Column[], column: ColumnOrName): Column {
  const name = typeof column === 'string' ? column : column.name;
  const found = columns.find(c => c.name === name);
  if (found == null) {
    throw new Error(`No column named ${name}`);
  }
  return found;
}

export class TableDataImpl implements TableData {
  private rowCache: Row[] | null = null;

  constructor(
    private readonly allColumns: readonly Column[],
    readonly columns: readonly Column[],
    readonly positions: RangeSet,
    private readonly data: ReadonlyMap<number, readonly unknown[]>,
    readonly totalSize: number
  ) {}

  get offset(): number {
    return this.positions.first;
  }

  get rows(): readonly Row[] {
    if (this.rowCache == null) {
      const rows: Row[] = [];
      let i = 0;
      for (const position of this.positions) {
        const index = i++;
        rows.push(Object.freeze({ position, get: (column: ColumnOrName) => this.getData(index, column) }));
      }
      this.rowCache = rows;
    }
    return this.rowCache;
  }

  getData(rowIndex: number, column: ColumnOrName): unknown {
    const resolved = resolveColumn(this.allColumns, column);
    const values = this.data.get(resolved.index);
    if (values == null) {
      throw new Error(`Column ${resolved.name} is not part of this data`);
    }
    if (rowIndex < 0 || rowIndex >= values.length) {
      throw new RangeError(`Row index ${rowIndex} is out of range`);
    }
    return values[rowIndex];
  }
}
