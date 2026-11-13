/**
 * Protocol bindings for a Deephaven server: the protobuf messages and gRPC service descriptors generated from the
 * server's .proto files, the Barrage and Arrow flatbuffer bindings, and the runtimes they need.
 *
 * The server serves this module as `/jsapi/dh-core2.js`, built from the same sources as the server itself, so a
 * client that loads it from the server it connects to always speaks that server's protocol. It holds no client logic;
 * `@deephaven/jsapi` builds the client API on top of it.
 *
 * @packageDocumentation
 */

/** Functions to create, serialize and parse the protobuf messages below. */
export * as protobuf from './protobuf.js';

/** The flatbuffers runtime that the Barrage and Arrow bindings below read and build with. */
export * as flatbuffers from 'flatbuffers';

/** Arrow IPC flatbuffers: Message, Schema, RecordBatch and friends. */
export * as arrow from './flatbuf/arrow/org/apache/arrow/flatbuf.js';

/** Barrage flatbuffers: subscription and snapshot requests, and update metadata. */
export * as barrage from './flatbuf/barrage/io/deephaven/barrage/flatbuf.js';

export * as application from './gen/deephaven_core/proto/application_pb.js';
export * as config from './gen/deephaven_core/proto/config_pb.js';
export * as console from './gen/deephaven_core/proto/console_pb.js';
export * as hierarchicaltable from './gen/deephaven_core/proto/hierarchicaltable_pb.js';
export * as inputtable from './gen/deephaven_core/proto/inputtable_pb.js';
export * as object from './gen/deephaven_core/proto/object_pb.js';
export * as partitionedtable from './gen/deephaven_core/proto/partitionedtable_pb.js';
export * as session from './gen/deephaven_core/proto/session_pb.js';
export * as storage from './gen/deephaven_core/proto/storage_pb.js';
export * as table from './gen/deephaven_core/proto/table_pb.js';
export * as ticket from './gen/deephaven_core/proto/ticket_pb.js';

/** Arrow Flight messages and the FlightService descriptor. */
export * as flight from './gen/Flight_pb.js';

/** Deephaven's browser-compatible Flight extensions, which emulate bidirectional streams over unary calls. */
export * as browserFlight from './gen/BrowserFlight_pb.js';

/**
 * The magic number at the start of every Barrage message wrapper, `"dphn"` read as a little-endian int.
 */
export const BARRAGE_MAGIC = 0x6e687064;
