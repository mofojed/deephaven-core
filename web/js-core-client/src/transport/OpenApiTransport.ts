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
}

export interface FetchTableResult {
  /** The ticket identifying the exported table on the server. */
  ticket: Uint8Array;
  /** The initial row count. Negative values mean "uncoalesced, unknown yet". */
  size: number;
}
