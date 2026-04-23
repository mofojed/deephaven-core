/** Column schema exposed through `ViewportUpdate`. */
export interface Column {
  /** Column name, as defined on the server-side table. */
  readonly name: string;
  /**
   * Arrow type name, roughly matching Deephaven column types. Examples:
   * "Int32", "Int64", "Float64", "Utf8", "Bool". For types this first-slice
   * package does not special-case, the raw Arrow vector type name is used.
   */
  readonly type: string;
}

/** A single row, exposing column access by name or `Column`. */
export interface Row {
  get(column: Column | string): unknown;
}

/**
 * Options accepted by {@link Table.setViewport}. Inclusive bounds; negative
 * values are offsets from the end of the table (e.g. `{ firstRow: -10,
 * lastRow: -1 }` = the last 10 rows).
 */
export interface ViewportOptions {
  firstRow: number;
  lastRow: number;
  /** Column names to include. Omitted = every column. */
  columns?: readonly string[];
}

/** Emitted from `Table.onUpdate`. */
export interface ViewportUpdate {
  /** Absolute first row in the emitted slice, resolved against the current table size. */
  firstRow: number;
  /** Absolute last row (inclusive) in the emitted slice. */
  lastRow: number;
  /** Current total row count of the table. */
  size: number;
  /** True when the request used tail-relative (negative) bounds. */
  reversed: boolean;
  /** Columns present in the emitted rows, in order. */
  columns: readonly Column[];
  /** Rows in order; each row exposes `get(column)`. */
  rows: readonly Row[];
}
