import { Connection } from './connection/Connection.js';
import { scopeTicket } from './connection/tickets.js';
import { ConsoleSession } from './ConsoleSession.js';
import { type CoreModule, loadCoreModule } from './core.js';
import { DateTime } from './data/DateTime.js';
import { EventEmitter } from './events.js';
import { FetchTransport, type Transport, WebSocketTransport } from './grpc/transports.js';
import { createOperation, mergeTables } from './table/tables.js';
import type { PendingTable, TableReference } from './table/types.js';

/** Credentials for {@link CoreClient.login}. */
export interface LoginCredentials {
  /**
   * The kind of login: {@link CoreClient.LOGIN_TYPE_ANONYMOUS}, {@link CoreClient.LOGIN_TYPE_PASSWORD},
   * {@link CoreClient.LOGIN_TYPE_PSK}, or the name of another authentication handler on the server.
   */
  readonly type: string;
  /** The user name, for password login. */
  readonly username?: string;
  /** The password, pre-shared key or other token. */
  readonly token?: string;
}

export interface CoreClientOptions {
  /** Headers to add to every call to the server. */
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * How to reach the server: `'websocket'` multiplexes every call over one websocket, and `'fetch'` uses grpc-web
   * over HTTP. Defaults to websockets for an `http:` server, where a browser's HTTP/1.1 connection limit would cap how
   * many tables can be subscribed to at once over fetch, and to fetch for `https:`.
   */
  readonly transport?: 'websocket' | 'fetch' | Transport;
  /**
   * The protocol bindings to use. By default they are loaded from the server, from `/jsapi/dh-core2.js`, so the
   * client speaks the protocol of the server it connects to. Pass `@deephaven/jsapi-core` here to use a bundled
   * copy instead, such as where loading modules from the server is not possible.
   */
  readonly coreModule?: CoreModule | Promise<CoreModule>;
}

export interface CoreClientEvents extends Record<string, unknown> {
  /** The session ended: it could not be refreshed, or the server shut down. */
  disconnect: { reason: string };
}

/** The name of a variable to fetch with {@link CoreClient.getObject}. */
export interface ObjectDefinition {
  readonly name: string;
  /** The type of object; only tables (`'Table'`, the default) are supported. */
  readonly type?: string;
}

export interface TimeTableOptions {
  /** When the first row is, rather than now. */
  readonly startTime?: DateTime | Date | string;
  /** Make a blink table, holding only the rows added in each update. */
  readonly blink?: boolean;
}

/**
 * A client for a Deephaven server. Log in, then fetch, create and transform tables:
 *
 * ```ts
 * const client = new CoreClient('http://localhost:10000/');
 * await client.login({ type: CoreClient.LOGIN_TYPE_ANONYMOUS });
 * const table = await client.getObject({ name: 't' });
 * const sorted = await table.sort('X');
 * table.close();
 * ```
 */
export class CoreClient extends EventEmitter<CoreClientEvents> {
  static readonly LOGIN_TYPE_ANONYMOUS = 'anonymous';
  static readonly LOGIN_TYPE_PASSWORD = 'password';
  static readonly LOGIN_TYPE_PSK = 'io.deephaven.authentication.psk.PskAuthenticationHandler';

  readonly serverUrl: string;
  private readonly url: URL;
  private readonly options: CoreClientOptions;
  private corePromise: Promise<CoreModule> | null = null;
  private connection: Connection | null = null;

  constructor(serverUrl: string, options: CoreClientOptions = {}) {
    super();
    this.url = new URL(serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`);
    this.serverUrl = this.url.href;
    this.options = options;
  }

  /** The protocol bindings this client uses, loading them from the server the first time. */
  loadCore(): Promise<CoreModule> {
    if (this.corePromise == null) {
      this.corePromise = Promise.resolve(this.options.coreModule ?? loadCoreModule(this.url));
      this.corePromise.catch(() => {
        this.corePromise = null;
      });
    }
    return this.corePromise;
  }

  private createTransport(): Transport {
    const option = this.options.transport;
    if (option != null && typeof option === 'object') {
      return option;
    }
    const kind = option ?? (this.url.protocol === 'http:' ? 'websocket' : 'fetch');
    return kind === 'websocket' ? new WebSocketTransport() : new FetchTransport();
  }

  /** Whether the client has logged in, and the session has not ended. */
  get isConnected(): boolean {
    return this.connection != null && !this.connection.isClosed;
  }

  /** The server's authentication settings, available before logging in. */
  async getAuthConfigValues(): Promise<[string, string][]> {
    const core = await this.loadCore();
    const connection = new Connection(core, this.url, this.createTransport(), { ...this.options.headers });
    try {
      const response = await connection.rpc.unary(core.config.ConfigService.method.getAuthenticationConstants, {});
      return Object.entries(response.configValues).map(([key, value]) => [
        key,
        value.kind.case === 'stringValue' ? value.kind.value : '',
      ]);
    } finally {
      await connection.close();
    }
  }

  /** Logs in, starting a session. */
  async login(credentials: LoginCredentials): Promise<void> {
    if (credentials == null || typeof credentials.type !== 'string') {
      throw new TypeError('Credentials must have a type');
    }
    let authorization: string;
    if (credentials.type === CoreClient.LOGIN_TYPE_ANONYMOUS) {
      authorization = 'Anonymous';
    } else if (credentials.type === CoreClient.LOGIN_TYPE_PASSWORD) {
      if (credentials.username == null || credentials.token == null) {
        throw new TypeError('Password login needs a username and a token');
      }
      authorization = `Basic ${btoa(`${credentials.username}:${credentials.token}`)}`;
    } else {
      authorization = `${credentials.type} ${credentials.token ?? ''}`.trim();
    }
    if (this.connection != null) {
      await this.connection.close();
      this.connection = null;
    }
    const core = await this.loadCore();
    const connection = new Connection(core, this.url, this.createTransport(), { ...this.options.headers });
    try {
      await connection.login(authorization);
    } catch (e) {
      await connection.close();
      throw e;
    }
    connection.addEventListener('disconnect', event => {
      if (this.connection === connection) {
        this.connection = null;
      }
      this.emit('disconnect', event);
    });
    this.connection = connection;
  }

  private requireConnection(): Connection {
    if (this.connection == null || this.connection.isClosed) {
      throw new Error('Not connected: call login() first');
    }
    return this.connection;
  }

  /** The server's configuration values, as of the latest session refresh. */
  getServerConfigValues(): [string, string][] {
    return [...this.requireConnection().serverConfigValues];
  }

  /** Fetches a table from the server's query scope by name, such as a variable a script created. */
  getObject(definition: ObjectDefinition | string): PendingTable {
    const connection = this.requireConnection();
    const { name, type } = typeof definition === 'string' ? { name: definition, type: undefined } : definition;
    if (typeof name !== 'string' || name === '') {
      throw new TypeError('getObject needs the name of a variable');
    }
    if (type != null && type !== 'Table') {
      throw new Error(`Objects of type ${type} are not supported yet; only tables can be fetched`);
    }
    return createOperation(connection, `fetch ${name}`, [], resultId => ({
      op: {
        case: 'fetchTable',
        value: { resultId, sourceId: { ref: { case: 'ticket', value: { ticket: scopeTicket(name) } } } },
      },
    }));
  }

  /** A table of `size` rows with no columns, to add columns to with {@link TableOperations.update}. */
  emptyTable(size: number): PendingTable {
    const connection = this.requireConnection();
    if (!Number.isInteger(size) || size < 0) {
      throw new RangeError('size must be a non-negative integer');
    }
    return createOperation(connection, 'emptyTable', [], resultId => ({
      op: { case: 'emptyTable', value: { resultId, size: String(size) } },
    }));
  }

  /**
   * A refreshing table with a `Timestamp` column that gains a row every `period`: a number of nanoseconds, or an
   * ISO-8601 duration such as `"PT1s"`.
   */
  timeTable(period: number | string, options: TimeTableOptions = {}): PendingTable {
    const connection = this.requireConnection();
    let periodInit;
    if (typeof period === 'number') {
      if (!Number.isFinite(period) || period <= 0) {
        throw new RangeError('period must be a positive number of nanoseconds');
      }
      periodInit = { case: 'periodNanos' as const, value: String(Math.round(period)) };
    } else if (typeof period === 'string' && period !== '') {
      periodInit = { case: 'periodString' as const, value: period };
    } else {
      throw new TypeError('period must be a number of nanoseconds or a duration string');
    }
    const { startTime } = options;
    let startInit: { case: 'startTimeNanos' | 'startTimeString'; value: string } | undefined;
    if (startTime instanceof DateTime) {
      startInit = { case: 'startTimeNanos', value: startTime.epochNanos.toString() };
    } else if (startTime instanceof Date) {
      startInit = { case: 'startTimeNanos', value: DateTime.fromDate(startTime).epochNanos.toString() };
    } else if (typeof startTime === 'string') {
      startInit = { case: 'startTimeString', value: startTime };
    }
    return createOperation(connection, 'timeTable', [], resultId => ({
      op: {
        case: 'timeTable',
        value: {
          resultId,
          period: periodInit,
          ...(startInit != null ? { startTime: startInit } : {}),
          blinkTable: options.blink === true,
        },
      },
    }));
  }

  /** The rows of every table, in order. The tables must have the same columns. */
  mergeTables(tables: readonly TableReference[]): PendingTable {
    const connection = this.requireConnection();
    if (!Array.isArray(tables) || tables.length === 0) {
      throw new TypeError('mergeTables needs at least one table');
    }
    return mergeTables(connection, tables);
  }

  /** The script languages the server supports, such as `python` or `groovy`. */
  async getConsoleTypes(): Promise<string[]> {
    const connection = this.requireConnection();
    const response = await connection.rpc.unary(connection.core.console.ConsoleService.method.getConsoleTypes, {});
    return [...response.consoleTypes];
  }

  /** Starts a script session in the given language. */
  async startSession(type: string): Promise<ConsoleSession> {
    const connection = this.requireConnection();
    const ticket = connection.newExportTicket();
    await connection.rpc.unary(connection.core.console.ConsoleService.method.startConsole, {
      resultId: { ticket },
      sessionType: type,
    });
    return new ConsoleSession(connection, ticket, type);
  }

  /** Ends the session. Tables from this client can no longer be used. */
  async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    await connection?.close();
  }
}
