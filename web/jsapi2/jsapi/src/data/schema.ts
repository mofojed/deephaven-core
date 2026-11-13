import type * as Core from '@deephaven/jsapi-core';
import type { CoreModule } from '../core.js';
import { fieldMetadata } from './arrow.js';

/** A column of a table. */
export interface Column {
  /** The column's name. */
  readonly name: string;
  /** The column's Java type on the server, such as `int`, `java.lang.String` or `java.time.Instant`. */
  readonly type: string;
  /** For an array or vector column, the type of its elements. */
  readonly componentType: string | null;
  /** The column's position in the table. */
  readonly index: number;
  /** The description set on the server, if any. */
  readonly description: string | null;
  readonly isPartitionColumn: boolean;
}

/** The columns and attributes of a table, as described by its Arrow schema. */
export interface TableDefinition {
  readonly columns: readonly Column[];
  readonly attributes: Readonly<Record<string, string>>;
  readonly isBlink: boolean;
}

/** Reads an Arrow IPC message, optionally preceded by the IPC continuation token and length. */
export function readMessage(core: CoreModule, bytes: Uint8Array): Core.arrow.Message {
  let body = bytes;
  if (bytes.byteLength >= 8 && new DataView(bytes.buffer, bytes.byteOffset, 4).getInt32(0, true) === -1) {
    body = bytes.subarray(8);
  }
  return core.arrow.Message.getRootAsMessage(new core.flatbuffers.ByteBuffer(body));
}

/** Reads the Arrow schema a server sends to describe a table, such as an ExportedTableCreationResponse's header. */
export function readSchema(core: CoreModule, bytes: Uint8Array): Core.arrow.Schema {
  const message = readMessage(core, bytes);
  if (message.headerType() !== core.arrow.MessageHeader.Schema) {
    throw new Error(`Expected a schema message, got ${core.arrow.MessageHeader[message.headerType()]}`);
  }
  return message.header(new core.arrow.Schema()) as Core.arrow.Schema;
}

export function tableDefinition(schema: Core.arrow.Schema): TableDefinition {
  const columns: Column[] = [];
  for (let i = 0; i < schema.fieldsLength(); i++) {
    const field = schema.fields(i)!;
    const metadata = fieldMetadata(field);
    columns.push(
      Object.freeze({
        name: String(field.name()),
        type: metadata.get('type') ?? 'java.lang.Object',
        componentType: metadata.get('componentType') ?? null,
        index: i,
        description: metadata.get('description') ?? null,
        isPartitionColumn: metadata.get('isPartitioning') === 'true',
      })
    );
  }
  const attributes: Record<string, string> = {};
  for (let i = 0; i < schema.customMetadataLength(); i++) {
    const kv = schema.customMetadata(i);
    const key = kv?.key();
    const value = kv?.value();
    if (typeof key === 'string' && typeof value === 'string' && key.startsWith('deephaven:attribute.')) {
      attributes[key.substring('deephaven:attribute.'.length)] = value;
    }
  }
  return Object.freeze({
    columns: Object.freeze(columns),
    attributes: Object.freeze(attributes),
    isBlink: attributes['BlinkTable'] === 'true',
  });
}
