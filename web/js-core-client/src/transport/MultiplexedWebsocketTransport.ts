/**
 * Custom `@improbable-eng/grpc-web` TransportFactory that speaks the
 * `grpc-websockets-multiplex` subprotocol the Deephaven server prefers.
 *
 * Wire format (see `grpc-servlet-websocket-jakarta/.../MultiplexedWebSocketServerStream.java`):
 *
 *   Client → Server (one binary frame per message, on a shared WS):
 *     - 4 bytes: int32 BE streamId. MSB set = "this is my final frame for this stream".
 *     - If this is the first frame for this streamId: the rest is ASCII HTTP-style
 *       "key: value\r\n" headers. One of them MUST be
 *       `grpc-websockets-path: <serviceName>/<methodName>`.
 *     - Subsequent frames: 1 byte control flow (0=data, 1=end-of-send),
 *       then (for control=0) a standard grpc-web framed message: [flag, length(4 BE), payload].
 *
 *   Server → Client:
 *     - 4 bytes: int32 BE streamId. MSB set = final message on this stream.
 *     - Either a grpc-web data frame or a trailer frame (first byte 0x80 + 4-byte length + ASCII trailers).
 *
 *   Special: streamId Integer.MAX_VALUE with MSB set = server GO_AWAY. We ACK by
 *   echoing the same bytes back and refuse any further streams on this socket.
 *
 * The same WebSocket is shared across all grpc calls to the same host, so
 * we keep a single `MultiplexedWebsocketConnection` instance per host and
 * route incoming frames back to the originating Transport by streamId.
 */

// Minimal duck-typed mirrors of `@improbable-eng/grpc-web`'s internal
// TransportFactory/TransportOptions contract. We intentionally don't depend on
// that package at compile time.

interface GrpcMetadata {
  /** improbable-eng's BrowserHeaders forEach: `(key, values) => void`. */
  forEach(cb: (key: string, values: string[]) => void): void;
  /** BrowserHeaders exposes `get(key): string[]` for case-insensitive lookup. */
  get?(key: string): string[];
}

interface TransportOptions {
  url: string;
  onHeaders: (metadata: GrpcMetadata, status: number) => void;
  onChunk: (chunk: Uint8Array) => void;
  onEnd: (err?: Error) => void;
}

interface Transport {
  start(metadata: GrpcMetadata): void;
  sendMessage(msg: Uint8Array): void;
  finishSend(): void;
  cancel(): void;
}

type TransportFactory = (options: TransportOptions) => Transport;

const GO_AWAY_STREAM_ID = 0x7fffffff; // Integer.MAX_VALUE

/**
 * Minimal `BrowserHeaders`-shaped object. improbable-eng's ClientImpl calls
 * `.get(...)` on the value we pass to `onHeaders`, so a plain `{}` crashes.
 */
class SimpleHeaders {
  private map = new Map<string, string[]>();

  get(key: string): string[] {
    return this.map.get(key.toLowerCase()) ?? [];
  }

  set(key: string, value: string): void {
    this.map.set(key.toLowerCase(), [value]);
  }

  forEach(cb: (key: string, values: string[]) => void): void {
    this.map.forEach((v, k) => cb(k, v));
  }
}

/** One outstanding grpc call (stream) over a shared multiplexed WS. */
interface StreamContext {
  readonly streamId: number;
  readonly options: TransportOptions;
  headersDelivered: boolean;
  finished: boolean;
}

class MultiplexedWebsocketConnection {
  private ws: WebSocket | null = null;
  private openPromise: Promise<void> | null = null;
  private sendQueue: ArrayBuffer[] = [];
  private nextStreamId = 1;
  private readonly streams = new Map<number, StreamContext>();
  /**
   * Server-issued `Bearer <uuid>` session token, refreshed from every
   * response's `authorization` metadata. Without this, each grpc call would
   * land in a fresh anonymous session and wouldn't see exports created by
   * earlier calls on the same WS.
   */
  private sessionAuthorization: string | null = null;

  constructor(
    private readonly host: string, // `http(s)://host:port`
  ) {}

  getSessionAuthorization(): string | null {
    return this.sessionAuthorization;
  }

  allocateStreamId(): number {
    return this.nextStreamId++;
  }

  registerStream(ctx: StreamContext): void {
    this.streams.set(ctx.streamId, ctx);
  }

  unregisterStream(streamId: number): void {
    this.streams.delete(streamId);
  }

  /**
   * Open the shared WS (if not already). The `wsPath` should be a valid
   * `/{service}/{method}` path, because the Jetty endpoint for the multiplex
   * subprotocol is registered at `/{service}/{method}`. The path is only used
   * to complete the WS handshake — every grpc call over this WS carries its
   * own `grpc-websockets-path` header to tell the server what to route to.
   */
  async ensureOpen(wsPath: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (!this.openPromise) {
      const wsUrl = httpToWs(this.host) + wsPath;
      this.openPromise = new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl, ['grpc-websockets-multiplex']);
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => {
          this.ws = ws;
          for (const frame of this.sendQueue) ws.send(frame);
          this.sendQueue = [];
          resolve();
        };
        ws.onmessage = (e) => this.handleIncoming(e.data as ArrayBuffer);
        ws.onclose = () => this.onWsClose();
        ws.onerror = () => reject(new Error('multiplex websocket error'));
      });
    }
    return this.openPromise;
  }

  send(frame: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(frame);
    } else {
      this.sendQueue.push(frame);
    }
  }

  private onWsClose(): void {
    const err = new Error('multiplex websocket closed');
    for (const ctx of this.streams.values()) {
      if (!ctx.finished) ctx.options.onEnd(err);
    }
    this.streams.clear();
    this.ws = null;
    this.openPromise = null;
  }

  private handleIncoming(data: ArrayBuffer): void {
    const view = new DataView(data);
    if (data.byteLength < 4) return;
    const rawId = view.getInt32(0, false);
    const closeBit = (rawId & (1 << 31)) !== 0;
    const streamId = closeBit ? rawId ^ (1 << 31) : rawId;

    if (streamId === GO_AWAY_STREAM_ID) {
      const ack = new ArrayBuffer(4);
      new DataView(ack).setInt32(0, GO_AWAY_STREAM_ID | (1 << 31), false);
      this.send(ack);
      return;
    }

    const ctx = this.streams.get(streamId);
    if (!ctx) return;

    const body = new Uint8Array(data, 4);
    if (body.length > 0) {
      this.sniffAuthorization(body);
      ctx.options.onChunk(body);
    }
    if (closeBit && !ctx.finished) {
      ctx.finished = true;
      ctx.options.onEnd();
      this.streams.delete(streamId);
    }
  }

  /**
   * Server replies may carry an `authorization: Bearer <uuid>\r\n` line in
   * their header/trailer frames. Extract it so we can keep using the same
   * session for every subsequent grpc call on this WS.
   */
  private sniffAuthorization(frame: Uint8Array): void {
    // Frames that begin with 0x80 (or 0x81 compressed) are trailer/metadata
    // frames whose body is ASCII "key: value\r\n" lines. Otherwise it's a
    // data frame we shouldn't interpret.
    if (frame.length < 5) return;
    if ((frame[0]! & 0x80) === 0) return;
    const length = new DataView(frame.buffer, frame.byteOffset + 1, 4).getUint32(0, false);
    if (5 + length > frame.length) return;
    const text = new TextDecoder().decode(frame.subarray(5, 5 + length));
    const match = text.match(/^authorization:\s*(.*?)\r\n/im);
    if (match) {
      this.sessionAuthorization = match[1]!.trim();
    }
  }
}

const connections = new Map<string, MultiplexedWebsocketConnection>();

function connectionFor(host: string): MultiplexedWebsocketConnection {
  let conn = connections.get(host);
  if (!conn) {
    conn = new MultiplexedWebsocketConnection(host);
    connections.set(host, conn);
  }
  return conn;
}

function httpToWs(url: string): string {
  if (url.startsWith('https://')) return 'wss://' + url.slice(8);
  if (url.startsWith('http://')) return 'ws://' + url.slice(7);
  throw new Error('multiplex transport requires http(s):// host');
}

function headersToAscii(
  metadata: GrpcMetadata,
  grpcPath: string,
  overrideAuth: string | null,
): Uint8Array {
  let s = `grpc-websockets-path: ${grpcPath}\r\n`;
  let wroteAuth = false;
  metadata.forEach((key, values) => {
    if (key.toLowerCase() === 'authorization' && overrideAuth) {
      // The server rotates the session token on every response. Prefer the
      // most recently observed token over whatever the caller passed.
      s += `authorization: ${overrideAuth}\r\n`;
      wroteAuth = true;
    } else {
      s += `${key}: ${values.join(', ')}\r\n`;
    }
  });
  if (!wroteAuth && overrideAuth) {
    s += `authorization: ${overrideAuth}\r\n`;
  }
  return new TextEncoder().encode(s);
}

/**
 * Returns a TransportFactory suitable for passing into any grpc-web service
 * client constructor's `options.transport`.
 */
export function createMultiplexedWebsocketTransport(host: string): TransportFactory {
  const conn = connectionFor(host);
  return (options: TransportOptions) => {
    const streamId = conn.allocateStreamId();
    const ctx: StreamContext = {
      streamId,
      options,
      headersDelivered: false,
      finished: false,
    };

    // TransportOptions.url is `${host}/${service.serviceName}/${method.methodName}`.
    // Extract the path portion; it's used both as the `grpc-websockets-path`
    // header (per-stream routing) and, on the first call for this host, as
    // the WS handshake URL.
    const path = extractPath(options.url, host);

    const sendHeaderFrame = (metadata: GrpcMetadata) => {
      conn.registerStream(ctx);
      const headers = headersToAscii(metadata, path, conn.getSessionAuthorization());
      const frame = new ArrayBuffer(4 + headers.length);
      const view = new DataView(frame);
      view.setInt32(0, streamId, false);
      new Uint8Array(frame, 4).set(headers);
      conn.send(frame);

      // grpc-web's ChunkParser treats the first trailer frame as
      // "response headers" if we never delivered any. Feed it a synthetic
      // 200-OK so status-from-trailers works correctly.
      if (!ctx.headersDelivered) {
        ctx.headersDelivered = true;
        try {
          options.onHeaders(new SimpleHeaders(), 200);
        } catch {
          /* ignore */
        }
      }
    };

    const sendDataFrame = (payload: Uint8Array) => {
      const frame = new ArrayBuffer(4 + 1 + payload.length);
      const view = new DataView(frame);
      view.setInt32(0, streamId, false);
      new Uint8Array(frame, 4, 1)[0] = 0; // control flow: 0 = data
      new Uint8Array(frame, 5).set(payload);
      conn.send(frame);
    };

    const sendFinishMarker = () => {
      const frame = new ArrayBuffer(4 + 1);
      const view = new DataView(frame);
      view.setInt32(0, streamId | (1 << 31), false);
      new Uint8Array(frame, 4, 1)[0] = 1; // control flow: 1 = end of send
      conn.send(frame);
    };

    return {
      start(metadata) {
        void conn.ensureOpen('/' + path);
        sendHeaderFrame(metadata);
      },
      sendMessage(bytes) {
        sendDataFrame(bytes);
      },
      finishSend() {
        sendFinishMarker();
      },
      cancel() {
        if (!ctx.finished) {
          ctx.finished = true;
          sendFinishMarker();
          conn.unregisterStream(streamId);
        }
      },
    };
  };
}

function extractPath(url: string, host: string): string {
  if (url.startsWith(host)) return url.slice(host.length).replace(/^\/+/, '');
  return url.replace(/^https?:\/\/[^/]+\//, '');
}
