import type * as Core from '@deephaven/jsapi-core';
import type { CoreModule } from '../core.js';
import { DateTime } from './DateTime.js';

type Field = Core.arrow.Field;
type RecordBatch = Core.arrow.RecordBatch;

/** Walks the field nodes and buffers of one Arrow record batch, in the order the columns' readers consume them. */
export class BatchContext {
  private nodeIndex = 0;
  private bufferIndex = 0;

  constructor(
    private readonly batch: RecordBatch,
    private readonly body: Uint8Array
  ) {}

  nextNode(): { length: number; nullCount: number } {
    const node = this.batch.nodes(this.nodeIndex++);
    if (node == null) {
      throw new Error('Record batch has fewer field nodes than its columns need');
    }
    return { length: Number(node.length()), nullCount: Number(node.nullCount()) };
  }

  nextBuffer(): Uint8Array {
    const buffer = this.batch.buffers(this.bufferIndex++);
    if (buffer == null) {
      throw new Error('Record batch has fewer buffers than its columns need');
    }
    const offset = Number(buffer.offset());
    return this.body.subarray(offset, offset + Number(buffer.length()));
  }
}

/** Reads one column's values for the next field node of a batch. */
export type ColumnReader = (ctx: BatchContext) => unknown[];

/**
 * The dictionaries of one stream. The server dictionary-encodes columns with few distinct values: the stream's
 * DictionaryBatch messages carry each dictionary's values (replacing it, or appending a delta), and record batches carry
 * indexes into it.
 */
export class DictionaryRegistry {
  private readonly readers = new Map<string, ColumnReader>();
  private readonly dictionaries = new Map<string, unknown[]>();

  register(id: bigint, valuesReader: ColumnReader): void {
    this.readers.set(String(id), valuesReader);
  }

  values(id: bigint): readonly unknown[] {
    return this.dictionaries.get(String(id)) ?? [];
  }

  apply(batch: Core.arrow.DictionaryBatch, body: Uint8Array): void {
    const key = String(batch.id());
    const reader = this.readers.get(key);
    const data = batch.data();
    if (reader == null || data == null) {
      throw new Error(`Dictionary batch for unknown dictionary ${key}`);
    }
    if (data.compression() != null) {
      throw new Error('Compressed dictionary batches are not supported');
    }
    const values = reader(new BatchContext(data, body));
    const existing = this.dictionaries.get(key);
    if (batch.isDelta() && existing != null) {
      for (const v of values) {
        existing.push(v);
      }
    } else {
      this.dictionaries.set(key, values);
    }
  }
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function isValid(validity: Uint8Array, nullCount: number, i: number): boolean {
  return nullCount === 0 || validity.byteLength === 0 || (validity[i >> 3] & (1 << (i & 7))) !== 0;
}

/** Reads a fixed-width column, with a validity buffer and a data buffer. */
function fixedWidth(read: (data: DataView, i: number) => unknown): ColumnReader {
  return ctx => {
    const { length, nullCount } = ctx.nextNode();
    const validity = ctx.nextBuffer();
    const data = view(ctx.nextBuffer());
    const values = new Array<unknown>(length);
    for (let i = 0; i < length; i++) {
      values[i] = isValid(validity, nullCount, i) ? read(data, i) : null;
    }
    return values;
  };
}

/** Reads a variable-width column of byte runs: validity, offsets and data buffers. */
function variableWidth(large: boolean, read: (bytes: Uint8Array) => unknown): ColumnReader {
  return ctx => {
    const { length, nullCount } = ctx.nextNode();
    const validity = ctx.nextBuffer();
    const offsets = view(ctx.nextBuffer());
    const data = ctx.nextBuffer();
    const offsetAt = large
      ? (i: number) => Number(offsets.getBigInt64(i * 8, true))
      : (i: number) => offsets.getInt32(i * 4, true);
    const values = new Array<unknown>(length);
    for (let i = 0; i < length; i++) {
      values[i] = isValid(validity, nullCount, i) ? read(data.subarray(offsetAt(i), offsetAt(i + 1))) : null;
    }
    return values;
  };
}

const textDecoder = new TextDecoder();

/** A big-endian two's complement integer. */
function readBigInteger(bytes: Uint8Array): bigint {
  if (bytes.byteLength === 0) {
    return 0n;
  }
  let value = 0n;
  for (const b of bytes) {
    value = (value << 8n) | BigInt(b);
  }
  if (bytes[0] & 0x80) {
    value -= 1n << BigInt(bytes.byteLength * 8);
  }
  return value;
}

/** Deephaven sends a BigDecimal as a little-endian int32 scale, then the unscaled value as a big-endian integer. */
function readBigDecimal(bytes: Uint8Array): string {
  const scale = view(bytes).getInt32(0, true);
  const unscaled = readBigInteger(bytes.subarray(4));
  const negative = unscaled < 0n;
  let digits = (negative ? -unscaled : unscaled).toString();
  if (scale > 0) {
    digits = digits.padStart(scale + 1, '0');
    digits = `${digits.substring(0, digits.length - scale)}.${digits.substring(digits.length - scale)}`;
  } else if (scale < 0) {
    digits += '0'.repeat(-scale);
  }
  return negative ? `-${digits}` : digits;
}

function pad(n: number | bigint, width: number): string {
  return n.toString().padStart(width, '0');
}

function formatLocalDate(epochDay: number): string {
  return new Date(epochDay * 86_400_000).toISOString().substring(0, 10);
}

function formatLocalTime(nanosOfDay: bigint): string {
  const seconds = nanosOfDay / 1_000_000_000n;
  const nanos = nanosOfDay % 1_000_000_000n;
  const text = `${pad(seconds / 3600n, 2)}:${pad((seconds / 60n) % 60n, 2)}:${pad(seconds % 60n, 2)}`;
  return nanos === 0n ? text : `${text}.${pad(nanos, 9).replace(/0+$/, '')}`;
}

function halfToNumber(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) {
    return sign * 2 ** -14 * (fraction / 1024);
  }
  if (exponent === 0x1f) {
    return fraction ? NaN : sign * Infinity;
  }
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

/** The `deephaven:` metadata on an Arrow field, keyed without the prefix. */
export function fieldMetadata(field: Field): Map<string, string> {
  const result = new Map<string, string>();
  for (let i = 0; i < field.customMetadataLength(); i++) {
    const kv = field.customMetadata(i);
    const key = kv?.key();
    const value = kv?.value();
    if (typeof key === 'string' && typeof value === 'string' && key.startsWith('deephaven:')) {
      result.set(key.substring('deephaven:'.length), value);
    }
  }
  return result;
}

/**
 * Consumes the field nodes and buffers a column of a type this client cannot read occupies in a record batch, and
 * reads it as nulls.
 */
function skipReader(core: CoreModule, field: Field): ColumnReader {
  const { Type, UnionMode } = core.arrow;
  const children: ColumnReader[] = [];
  for (let i = 0; i < field.childrenLength(); i++) {
    children.push(skipReader(core, field.children(i)!));
  }
  let buffers: number;
  if (field.dictionary() != null) {
    buffers = 2;
  } else {
    switch (field.typeType()) {
      case Type.Null:
      case Type.RunEndEncoded:
        buffers = 0;
        break;
      case Type.Struct_:
      case Type.FixedSizeList:
        buffers = 1;
        break;
      case Type.Union:
        buffers = field.type(new core.arrow.Union())?.mode() === UnionMode.Dense ? 2 : 1;
        break;
      case Type.Binary:
      case Type.Utf8:
      case Type.LargeBinary:
      case Type.LargeUtf8:
      case Type.ListView:
      case Type.LargeListView:
        buffers = 3;
        break;
      case Type.BinaryView:
      case Type.Utf8View:
        throw new Error(`Unsupported Arrow type ${Type[field.typeType()]} in column ${field.name()}`);
      default:
        // Fixed-width types, List, LargeList and Map: validity plus one buffer
        buffers = 2;
    }
  }
  return ctx => {
    const { length } = ctx.nextNode();
    for (let i = 0; i < buffers; i++) {
      ctx.nextBuffer();
    }
    for (const child of children) {
      child(ctx);
    }
    return new Array<unknown>(length).fill(null);
  };
}

/** Reads an integer at index `i` of a buffer of `bitWidth`-bit integers, as a number. */
function intReader(bitWidth: number, signed: boolean): (d: DataView, i: number) => number {
  switch (bitWidth) {
    case 8:
      return signed ? (d, i) => d.getInt8(i) : (d, i) => d.getUint8(i);
    case 16:
      return signed ? (d, i) => d.getInt16(i * 2, true) : (d, i) => d.getUint16(i * 2, true);
    case 64:
      return signed ? (d, i) => Number(d.getBigInt64(i * 8, true)) : (d, i) => Number(d.getBigUint64(i * 8, true));
    default:
      return signed ? (d, i) => d.getInt32(i * 4, true) : (d, i) => d.getUint32(i * 4, true);
  }
}

/** A dictionary-encoded column: its batches hold indexes into the stream's dictionary for the field. */
function dictionaryReader(core: CoreModule, field: Field, dictionaries: DictionaryRegistry, javaType: string): ColumnReader {
  const encoding = field.dictionary()!;
  const id = encoding.id();
  dictionaries.register(id, valueReader(core, field, dictionaries, javaType));
  const indexType = encoding.indexType();
  const readIndex = intReader(indexType?.bitWidth() ?? 32, indexType?.isSigned() ?? true);
  return ctx => {
    const { length, nullCount } = ctx.nextNode();
    const validity = ctx.nextBuffer();
    const indexes = view(ctx.nextBuffer());
    const dictionary = dictionaries.values(id);
    const values = new Array<unknown>(length);
    for (let i = 0; i < length; i++) {
      values[i] = isValid(validity, nullCount, i) ? (dictionary[readIndex(indexes, i)] ?? null) : null;
    }
    return values;
  };
}

/** A run-end encoded column: a run_ends child of cumulative run lengths, and a values child with one value per run. */
function runEndReader(core: CoreModule, field: Field, dictionaries: DictionaryRegistry, javaType: string): ColumnReader {
  const runEnds = columnReader(core, field.children(0)!, dictionaries);
  const runValues = columnReader(core, field.children(1)!, dictionaries, javaType);
  return ctx => {
    const { length } = ctx.nextNode();
    const ends = runEnds(ctx);
    const values = runValues(ctx);
    const result = new Array<unknown>(length);
    let run = 0;
    for (let i = 0; i < length; i++) {
      while (run < ends.length - 1 && i >= Number(ends[run])) {
        run++;
      }
      result[i] = values[run];
    }
    return result;
  };
}

function listReader(
  core: CoreModule,
  field: Field,
  dictionaries: DictionaryRegistry,
  mode: 'variable' | 'large' | 'fixed' | 'view' | 'largeView'
): ColumnReader {
  const child = columnReader(core, field.children(0)!, dictionaries);
  const listSize = mode === 'fixed' ? field.type(new core.arrow.FixedSizeList()).listSize() : 0;
  return ctx => {
    const { length, nullCount } = ctx.nextNode();
    const validity = ctx.nextBuffer();
    let start: (i: number) => number;
    let end: (i: number) => number;
    if (mode === 'fixed') {
      start = i => i * listSize;
      end = i => (i + 1) * listSize;
    } else {
      const offsets = view(ctx.nextBuffer());
      const width = mode === 'large' || mode === 'largeView' ? 8 : 4;
      const read = (dv: DataView, i: number) =>
        width === 8 ? Number(dv.getBigInt64(i * 8, true)) : dv.getInt32(i * 4, true);
      start = i => read(offsets, i);
      if (mode === 'view' || mode === 'largeView') {
        const sizes = view(ctx.nextBuffer());
        end = i => read(offsets, i) + read(sizes, i);
      } else {
        end = i => read(offsets, i + 1);
      }
    }
    const items = child(ctx);
    const values = new Array<unknown>(length);
    for (let i = 0; i < length; i++) {
      values[i] = isValid(validity, nullCount, i) ? items.slice(start(i), end(i)) : null;
    }
    return values;
  };
}

/**
 * Builds a reader for a column, converting Arrow values to the JS values the API hands out. `inheritedJavaType` is the
 * Java type of an encoded column's parent, for a child field that carries no metadata of its own.
 */
export function columnReader(
  core: CoreModule,
  field: Field,
  dictionaries: DictionaryRegistry,
  inheritedJavaType = ''
): ColumnReader {
  const javaType = fieldMetadata(field).get('type') ?? inheritedJavaType;
  if (field.dictionary() != null) {
    return dictionaryReader(core, field, dictionaries, javaType);
  }
  return valueReader(core, field, dictionaries, javaType);
}

/** A reader for the values of a field's own type, ignoring any dictionary encoding of it. */
function valueReader(core: CoreModule, field: Field, dictionaries: DictionaryRegistry, javaType: string): ColumnReader {
  const { Type, Precision, DateUnit } = core.arrow;
  switch (field.typeType()) {
    case Type.Int: {
      const t = field.type(new core.arrow.Int()) as Core.arrow.Int;
      const signed = t.isSigned();
      switch (t.bitWidth()) {
        case 8:
          return fixedWidth(signed ? (d, i) => d.getInt8(i) : (d, i) => d.getUint8(i));
        case 16:
          if (javaType === 'char' || javaType === 'java.lang.Character') {
            return fixedWidth((d, i) => String.fromCharCode(d.getUint16(i * 2, true)));
          }
          return fixedWidth(signed ? (d, i) => d.getInt16(i * 2, true) : (d, i) => d.getUint16(i * 2, true));
        case 32:
          return fixedWidth(signed ? (d, i) => d.getInt32(i * 4, true) : (d, i) => d.getUint32(i * 4, true));
        case 64:
          return fixedWidth(signed ? (d, i) => d.getBigInt64(i * 8, true) : (d, i) => d.getBigUint64(i * 8, true));
        default:
          return skipReader(core, field);
      }
    }
    case Type.FloatingPoint: {
      const precision = (field.type(new core.arrow.FloatingPoint()) as Core.arrow.FloatingPoint).precision();
      if (precision === Precision.DOUBLE) {
        return fixedWidth((d, i) => d.getFloat64(i * 8, true));
      }
      if (precision === Precision.SINGLE) {
        return fixedWidth((d, i) => d.getFloat32(i * 4, true));
      }
      return fixedWidth((d, i) => halfToNumber(d.getUint16(i * 2, true)));
    }
    case Type.Bool:
      return ctx => {
        const { length, nullCount } = ctx.nextNode();
        const validity = ctx.nextBuffer();
        const data = ctx.nextBuffer();
        const values = new Array<unknown>(length);
        for (let i = 0; i < length; i++) {
          values[i] = isValid(validity, nullCount, i) ? (data[i >> 3] & (1 << (i & 7))) !== 0 : null;
        }
        return values;
      };
    case Type.Utf8:
    case Type.LargeUtf8:
      return variableWidth(field.typeType() === Type.LargeUtf8, bytes => textDecoder.decode(bytes));
    case Type.Binary:
    case Type.LargeBinary: {
      const large = field.typeType() === Type.LargeBinary;
      if (javaType === 'java.math.BigDecimal') {
        return variableWidth(large, readBigDecimal);
      }
      if (javaType === 'java.math.BigInteger') {
        return variableWidth(large, readBigInteger);
      }
      return variableWidth(large, bytes => bytes.slice());
    }
    case Type.Timestamp: {
      const unit = (field.type(new core.arrow.Timestamp()) as Core.arrow.Timestamp).unit();
      const scale = [1_000_000_000n, 1_000_000n, 1_000n, 1n][unit] ?? 1n;
      return fixedWidth((d, i) => new DateTime(d.getBigInt64(i * 8, true) * scale));
    }
    case Type.Date: {
      const unit = (field.type(new core.arrow.Date()) as Core.arrow.Date).unit();
      if (unit === DateUnit.DAY) {
        return fixedWidth((d, i) => formatLocalDate(d.getInt32(i * 4, true)));
      }
      return fixedWidth((d, i) => formatLocalDate(Math.floor(Number(d.getBigInt64(i * 8, true)) / 86_400_000)));
    }
    case Type.Time: {
      const t = field.type(new core.arrow.Time()) as Core.arrow.Time;
      const scale = [1_000_000_000n, 1_000_000n, 1_000n, 1n][t.unit()] ?? 1n;
      if (t.bitWidth() === 32) {
        return fixedWidth((d, i) => formatLocalTime(BigInt(d.getInt32(i * 4, true)) * scale));
      }
      return fixedWidth((d, i) => formatLocalTime(d.getBigInt64(i * 8, true) * scale));
    }
    case Type.Duration: {
      const unit = (field.type(new core.arrow.Duration()) as Core.arrow.Duration).unit();
      const scale = [1_000_000_000n, 1_000_000n, 1_000n, 1n][unit] ?? 1n;
      return fixedWidth((d, i) => d.getBigInt64(i * 8, true) * scale);
    }
    case Type.List:
      return listReader(core, field, dictionaries, 'variable');
    case Type.LargeList:
      return listReader(core, field, dictionaries, 'large');
    case Type.FixedSizeList:
      return listReader(core, field, dictionaries, 'fixed');
    case Type.ListView:
      return listReader(core, field, dictionaries, 'view');
    case Type.LargeListView:
      return listReader(core, field, dictionaries, 'largeView');
    case Type.RunEndEncoded:
      return runEndReader(core, field, dictionaries, javaType);
    default:
      return skipReader(core, field);
  }
}
