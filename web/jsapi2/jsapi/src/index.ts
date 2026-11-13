/**
 * A TypeScript client for Deephaven Community Core.
 *
 * ```ts
 * import { CoreClient } from '@deephaven/jsapi';
 *
 * const client = new CoreClient('http://localhost:10000/');
 * await client.login({ type: CoreClient.LOGIN_TYPE_ANONYMOUS });
 * const table = await client.getObject({ name: 't' });
 * const sorted = await table.sort('X');
 * const subscription = sorted.createViewportSubscription({ rows: { first: 0, last: 49 } });
 * subscription.addEventListener('updated', data => render(data));
 * ```
 *
 * The client loads the server's protocol bindings (`@deephaven/jsapi-core`) from the server it connects to, at
 * `/jsapi/dh-core2.js`.
 *
 * @packageDocumentation
 */
export { CoreClient } from './CoreClient.js';
export type {
  CoreClientEvents,
  CoreClientOptions,
  LoginCredentials,
  ObjectDefinition,
  TimeTableOptions,
} from './CoreClient.js';
export { ConsoleSession } from './ConsoleSession.js';
export type { CommandResult, VariableChanges, VariableDefinition } from './ConsoleSession.js';
export type { CoreModule } from './core.js';
export { CORE_MODULE_PATH } from './core.js';
export { DateTime } from './data/DateTime.js';
export { RangeSet } from './data/RangeSet.js';
export type { Column } from './data/schema.js';
export type { ColumnOrName, Row, TableData } from './data/TableData.js';
export { CancelError, GrpcCode, GrpcError } from './errors.js';
export type { Listener, RemoverFn } from './events.js';
export { FetchTransport, WebSocketTransport } from './grpc/transports.js';
export type { Transport, TransportCall, TransportHandlers } from './grpc/transports.js';
export type {
  AggByOptions,
  Aggregation,
  ColumnAggregationType,
  NaturalJoinType,
  PendingTable,
  ResolvedTable,
  ResolvedTableEvents,
  ResolveOptions,
  RowRange,
  SnapshotOptions,
  Sort,
  TableOperations,
  TableReference,
} from './table/types.js';
export type {
  ViewportSubscription,
  ViewportSubscriptionEvents,
  ViewportSubscriptionOptions,
} from './table/ViewportSubscription.js';
