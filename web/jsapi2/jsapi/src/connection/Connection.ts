import type * as Core from '@deephaven/jsapi-core';
import type { CoreModule } from '../core.js';
import { GrpcCode, GrpcError } from '../errors.js';
import { EventEmitter } from '../events.js';
import { type ClientStream, RpcClient, type StreamObserver } from '../grpc/RpcClient.js';
import type { Transport } from '../grpc/transports.js';
import { exportTicket, ticketKey } from './tickets.js';

type FlightData = Core.flight.FlightData;
type FlightDataInit = Core.protobuf.MessageInitShape<typeof Core.flight.FlightDataSchema>;

const STREAM_TICKET_HEADER = 'x-deephaven-stream-ticket';
const STREAM_SEQUENCE_HEADER = 'x-deephaven-stream-sequence';
const STREAM_HALF_CLOSE_HEADER = 'x-deephaven-stream-halfclose';

const DEFAULT_SESSION_TIMEOUT_MS = 5 * 60 * 1000;

export interface ConnectionEvents extends Record<string, unknown> {
  /** The session could not be refreshed, or the server shut down; the connection is no longer usable. */
  disconnect: { reason: string };
}

/**
 * One authenticated session with a server: carries every call, refreshes the session token, and hands out export
 * tickets. Internal; {@link CoreClient} is the public face of it.
 */
export class Connection extends EventEmitter<ConnectionEvents> {
  readonly rpc: RpcClient;
  private authorization: string | null = null;
  private nextExportId = 1;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** Set once close() starts: the session's end releases everything, so nothing else is sent. */
  private closing = false;
  private sizeListeners = new Map<string, Set<(size: number, failure: string) => void>>();
  private exportUpdates: { cancel(): void } | null = null;
  private terminationStream: { cancel(): void } | null = null;
  private configValues = new Map<string, string>();

  constructor(
    readonly core: CoreModule,
    readonly serverUrl: URL,
    transport: Transport,
    private readonly extraHeaders: Record<string, string> = {}
  ) {
    super();
    this.rpc = new RpcClient(core, transport, serverUrl, {
      headers: () => ({
        ...this.extraHeaders,
        ...(this.authorization != null ? { authorization: this.authorization } : {}),
      }),
      onMetadata: metadata => {
        const auth = metadata['authorization'];
        if (auth != null && auth.startsWith('Bearer ')) {
          this.authorization = auth;
        }
      },
    });
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get serverConfigValues(): ReadonlyMap<string, string> {
    return this.configValues;
  }

  /**
   * Authenticates with the given `Authorization` header value, by making the first call of the session. The server
   * answers with a bearer token, used for every later call.
   */
  async login(authorization: string): Promise<void> {
    this.authorization = authorization;
    await this.refresh();
    if (this.authorization === authorization) {
      throw new Error('The server did not return a session token');
    }
    this.watchForTermination();
  }

  /** Keeps the session alive, and picks up the server's configuration values. */
  private async refresh(): Promise<void> {
    if (this.refreshTimer != null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    const { config } = this.core;
    const response = await this.rpc.unary(config.ConfigService.method.getConfigurationConstants, {});
    this.configValues = new Map(
      Object.entries(response.configValues).map(([key, value]) => [
        key,
        value.kind.case === 'stringValue' ? value.kind.value : '',
      ])
    );
    const duration = Number(this.configValues.get('http.session.durationMs'));
    const timeout = Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_SESSION_TIMEOUT_MS;
    if (!this.closed) {
      this.refreshTimer = setTimeout(() => {
        this.refresh().catch(error => {
          this.disconnect(
            error instanceof GrpcError && error.code === GrpcCode.UNAUTHENTICATED
              ? 'Authentication failed, session expired'
              : `Session refresh failed: ${error instanceof Error ? error.message : String(error)}`
          );
        });
      }, timeout / 2);
    }
  }

  private watchForTermination(): void {
    this.terminationStream = this.rpc.serverStream(
      this.core.session.SessionService.method.terminationNotification,
      {},
      {
        onMessage: message => {
          this.disconnect(`Server shut down${message.reason ? `: ${message.reason}` : ''}`);
        },
        onEnd: () => {
          // A stream that ends without a notification is not news; the refresh notices a dead session
        },
      }
    );
  }

  private disconnect(reason: string): void {
    if (this.closed) {
      return;
    }
    this.shutdown();
    // Nothing can use the connection again, so drop the transport too, with any streams still open on it
    this.rpc.transport.close();
    this.emit('disconnect', { reason });
  }

  /** Allocates a new export id; its ticket is {@link exportTicket}(id). */
  newExportId(): number {
    if (this.nextExportId >= 0x7fffffff) {
      throw new Error('Ran out of export tickets');
    }
    return this.nextExportId++;
  }

  newExportTicket(): Uint8Array {
    return exportTicket(this.newExportId());
  }

  /** Releases a ticket on the server. Failures are logged, not thrown: there is nothing the caller could do. */
  releaseTicket(ticket: Uint8Array): void {
    if (this.closed || this.closing) {
      return;
    }
    this.rpc.unary(this.core.session.SessionService.method.release, { id: { ticket } }).catch(error => {
      if (!this.closed && !this.closing) {
        console.warn('Failed to release ticket', error);
      }
    });
  }

  /**
   * Notifies the listener of every change to the size of the exported table with this ticket, as long as the export
   * exists. Returns a function to stop listening.
   */
  listenForSize(ticket: Uint8Array, listener: (size: number, failure: string) => void): () => void {
    const key = ticketKey(ticket);
    let set = this.sizeListeners.get(key);
    if (set == null) {
      set = new Set();
      this.sizeListeners.set(key, set);
    }
    set.add(listener);
    this.ensureExportUpdates();
    return () => {
      const current = this.sizeListeners.get(key);
      current?.delete(listener);
      if (current?.size === 0) {
        this.sizeListeners.delete(key);
      }
    };
  }

  private ensureExportUpdates(): void {
    if (this.exportUpdates != null || this.closed) {
      return;
    }
    this.exportUpdates = this.rpc.serverStream(
      this.core.table.TableService.method.exportedTableUpdates,
      {},
      {
        onMessage: message => {
          const ticket = message.exportId?.ticket;
          if (ticket == null) {
            return;
          }
          const listeners = this.sizeListeners.get(ticketKey(ticket));
          if (listeners != null) {
            const size = Number(message.size);
            for (const listener of [...listeners]) {
              listener(size, message.updateFailureMessage);
            }
          }
        },
        onEnd: () => {
          this.exportUpdates = null;
          if (!this.closed && this.sizeListeners.size > 0) {
            // Restart after a short delay; the session refresh decides whether the session is gone
            setTimeout(() => this.ensureExportUpdates(), 1000);
          }
        },
      }
    );
  }

  /**
   * Opens a Flight DoExchange stream. Over a transport without client streaming, the stream is emulated with the
   * BrowserFlightService: the first message opens a server stream, and later messages are sent as unary calls that
   * the server routes to it by an export ticket.
   */
  doExchange(observer: StreamObserver<FlightData>): ClientStream<FlightDataInit> {
    if (this.rpc.supportsClientStreaming) {
      return this.rpc.start(this.core.flight.FlightService.method.doExchange, observer);
    }
    const { browserFlight } = this.core;
    const streamTicket = String(this.newExportId());
    let sequence = 0;
    let open: { cancel(): void } | null = null;
    let ended = false;
    const headers = (halfClose = false) => ({
      [STREAM_TICKET_HEADER]: streamTicket,
      [STREAM_SEQUENCE_HEADER]: String(sequence++),
      ...(halfClose ? { [STREAM_HALF_CLOSE_HEADER]: 'true' } : {}),
    });
    const next = (message: FlightDataInit, halfClose = false) => {
      this.rpc
        .unary(browserFlight.BrowserFlightService.method.nextDoExchange, message, { headers: headers(halfClose) })
        .catch(error => {
          if (!ended) {
            console.warn('Failed to send to emulated stream', error);
          }
        });
    };
    return {
      send: message => {
        if (ended) {
          return;
        }
        if (open == null) {
          open = this.rpc.serverStream(
            browserFlight.BrowserFlightService.method.openDoExchange,
            message,
            {
              onMessage: m => observer.onMessage(m),
              onHeaders: h => observer.onHeaders?.(h),
              onEnd: error => {
                ended = true;
                observer.onEnd(error);
              },
            },
            { headers: headers() }
          );
        } else {
          next(message);
        }
      },
      end: () => {
        if (open != null && !ended) {
          next({}, true);
        }
      },
      cancel: () => {
        if (!ended) {
          ended = true;
          open?.cancel();
          if (open == null) {
            observer.onEnd(null);
          }
        }
      },
    };
  }

  private shutdown(): void {
    this.closed = true;
    if (this.refreshTimer != null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.exportUpdates?.cancel();
    this.exportUpdates = null;
    this.terminationStream?.cancel();
    this.terminationStream = null;
    this.sizeListeners.clear();
  }

  /** Ends the session on the server and stops all background calls. */
  async close(): Promise<void> {
    if (this.closed || this.closing) {
      return;
    }
    this.closing = true;
    const hadSession = this.authorization != null;
    this.terminationStream?.cancel();
    this.terminationStream = null;
    try {
      if (hadSession) {
        await this.rpc.unary(this.core.session.SessionService.method.closeSession, {});
      }
    } catch {
      // The session may already be gone
    } finally {
      this.shutdown();
      this.rpc.transport.close();
      this.removeAllListeners();
    }
  }
}
