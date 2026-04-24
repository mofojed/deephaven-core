/**
 * A narrow seam between the rich API (`CoreClient`, `Table`) and the
 * server-delivered gRPC-web stubs. Every method that touches the wire goes
 * through this interface, so tests can inject a mock and avoid needing a real
 * server.
 */
export interface OpenApiTransport {
  /** Fetch authentication constants. Called pre-login, no authorization needed. */
  getAuthenticationConstants(): Promise<Map<string, string>>;

  /**
   * Set the authorization header to send on all subsequent authenticated
   * requests. Matches the server's expected format: `<type> <value>`, e.g.
   * `Anonymous` or `Basic <base64(user:token)>`.
   */
  setAuthorization(type: string, value: string): void;

  /**
   * Fetch a table by the name of a variable in the server's query scope.
   *
   * Returns the `ExportedTableCreationResponse`-level fields the first slice
   * cares about: the table's own ticket (so future ops can reference it) and
   * the initial row count reported by the server.
   */
  fetchTableByScopeName(name: string): Promise<FetchTableResult>;

  /**
   * Apply unstructured (string-expression) filters on the server and return
   * a new export ticket for the filtered derived table. Equivalent of
   * Deephaven's `.where([...])` operation.
   *
   * @param sourceTicket — the ticket for the table to filter.
   * @param filters — filter expression strings; the server applies them as
   *   a conjunction.
   */
  filterTable(sourceTicket: Uint8Array, filters: readonly string[]): Promise<FetchTableResult>;

  /**
   * Open a Flight.DoExchange bidirectional stream. Used to carry Barrage
   * subscriptions: the client sends `BarrageSubscriptionRequest` wrapped in a
   * FlightData's `app_metadata`, and the server streams back FlightData frames
   * with Arrow IPC payloads and `BarrageUpdateMetadata`.
   */
  openDoExchange(): DoExchangeStream;
}

export interface FetchTableResult {
  /** The ticket identifying the exported table on the server. */
  ticket: Uint8Array;
  /** The initial row count. Negative values mean "uncoalesced, unknown yet". */
  size: number;
}

/** Minimal FlightData-shaped record carried on a `DoExchangeStream`. */
export interface DoExchangeFrame {
  dataHeader: Uint8Array;
  appMetadata: Uint8Array;
  dataBody: Uint8Array;
}

/**
 * Transport-agnostic view of a Flight.DoExchange bidirectional stream.
 * Framing and protobuf encoding/decoding is the transport's responsibility;
 * consumers just deal with raw Barrage/Arrow byte triples.
 */
export interface DoExchangeStream {
  /** Send a FlightData frame to the server. */
  send(frame: DoExchangeFrame): void;
  /** Register an incoming-frame handler. */
  onData(handler: (frame: DoExchangeFrame) => void): void;
  /** Register a stream-end handler. Called exactly once. */
  onEnd(handler: (error?: Error) => void): void;
  /** Cancel the stream from the client side. */
  cancel(): void;
}
