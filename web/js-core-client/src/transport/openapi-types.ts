/**
 * A minimal shape of the `dhinternal` ES module exported by the server at
 * `/jsapi/dh-internal.js`. This covers only the subset of proto messages and
 * grpc-web service clients used by the first slice of this package (login +
 * fetch a scope table). It is duck-typed against the real `dhinternal` — if
 * the server is older/newer, a field mismatch surfaces as a runtime error,
 * not a compile error.
 *
 * Full shape lives in `proto/raw-js-openapi/src/index.js`.
 */

export interface Metadata {
  new (init?: Record<string, string>): Metadata;
  set(key: string, value: string): void;
}

export interface ServiceError {
  message: string;
  code: number;
}

export interface UnaryCallback<T> {
  (error: ServiceError | null, response: T | null): void;
}

export interface Ticket {
  getTicket(): Uint8Array | string;
  getTicket_asU8(): Uint8Array;
  setTicket(value: Uint8Array | string): void;
}

export interface TicketCtor {
  new (): Ticket;
}

export interface TableReference {
  setTicket(value: Ticket): void;
}

export interface TableReferenceCtor {
  new (): TableReference;
}

export interface FetchTableRequest {
  setSourceId(value: TableReference): void;
  setResultId(value: Ticket): void;
}

export interface FetchTableRequestCtor {
  new (): FetchTableRequest;
}

export interface ExportedTableCreationResponse {
  getSuccess(): boolean;
  getErrorInfo(): string;
  /** `jstype=JS_STRING` on the proto, so the JS bindings expose size as a string. */
  getSize(): string;
}

export interface AuthenticationConstantsRequest {
  // empty
}

export interface AuthenticationConstantsRequestCtor {
  new (): AuthenticationConstantsRequest;
}

export interface ConfigValue {
  getStringValue(): string;
}

export interface AuthenticationConstantsResponse {
  getConfigValuesMap(): Map<string, ConfigValue>;
}

export interface ConfigServiceClient {
  getAuthenticationConstants(
    request: AuthenticationConstantsRequest,
    callback: UnaryCallback<AuthenticationConstantsResponse>,
  ): unknown;
}

/**
 * grpc-web's TransportFactory shape. Opaque here — we never construct one by
 * hand, only pass the factory returned by FetchReadableStreamTransport.
 */
export type TransportFactory = unknown;

export interface RpcOptions {
  transport?: TransportFactory;
}

export interface ConfigServiceClientCtor {
  new (serviceHost: string, options?: RpcOptions): ConfigServiceClient;
}

export interface TableServiceClient {
  fetchTable(
    request: FetchTableRequest,
    metadata: Record<string, string>,
    callback: UnaryCallback<ExportedTableCreationResponse>,
  ): unknown;
}

export interface TableServiceClientCtor {
  new (serviceHost: string, options?: RpcOptions): TableServiceClient;
}

export interface FetchTransportFactory {
  (init: Record<string, unknown>): TransportFactory;
}

/**
 * The `dhinternal` object exported by `/jsapi/dh-internal.js`.
 * Only the fields this package uses are typed; everything else is `unknown`.
 */
export interface DhInternal {
  io: {
    deephaven_core: {
      proto: {
        ticket_pb: { Ticket: TicketCtor };
        table_pb: {
          TableReference: TableReferenceCtor;
          FetchTableRequest: FetchTableRequestCtor;
        };
        config_pb: {
          AuthenticationConstantsRequest: AuthenticationConstantsRequestCtor;
        };
        config_pb_service: { ConfigServiceClient: ConfigServiceClientCtor };
        table_pb_service: { TableServiceClient: TableServiceClientCtor };
      };
    };
  };
  grpcWeb: {
    grpc: {
      /**
       * Fetch-based streaming transport. Works over HTTP/2; the Deephaven
       * server rejects HTTP/1.1 grpc calls by default (GrpcFilter, `http.requireHttp2=true`).
       */
      FetchReadableStreamTransport: FetchTransportFactory;
      /**
       * WebSocket transport. This is what `dh-core.js` uses, and it sidesteps
       * the HTTP/2 requirement entirely because it speaks a different protocol
       * from the initial handshake onward.
       */
      WebsocketTransport: () => TransportFactory;
    };
  };
}

export interface DhInternalModule {
  dhinternal: DhInternal;
}
