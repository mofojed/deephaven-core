import { decodeAscii, encodeAscii, parseHeaderBlock } from './frames.js';

/** Callbacks a transport delivers a call's response through. */
export interface TransportHandlers {
  /** The response headers, keyed by lower-case name. */
  onHeaders(headers: Record<string, string>): void;
  /** Response bytes: a sequence of gRPC frames, possibly split or joined arbitrarily across chunks. */
  onChunk(chunk: Uint8Array): void;
  /** The response has ended, with an error if the transport itself failed. */
  onEnd(error?: Error): void;
}

/** One gRPC call on a transport. Messages passed to {@link sendMessage} are already framed. */
export interface TransportCall {
  sendMessage(framed: Uint8Array): void;
  finishSend(): void;
  cancel(): void;
}

/**
 * Carries gRPC calls to the server. A transport that does not support client streaming can still send a single
 * request message per call, so bidirectional streams are emulated over it.
 */
export interface Transport {
  readonly supportsClientStreaming: boolean;
  start(url: URL, headers: Record<string, string>, handlers: TransportHandlers): TransportCall;
  /** Releases any connection the transport holds. */
  close(): void;
}

/** grpc-web over fetch. Supports unary and server-streaming calls; requests are sent once the call is half-closed. */
export class FetchTransport implements Transport {
  readonly supportsClientStreaming = false;
  /** Cancels each call in flight, for close(). */
  private readonly active = new Set<() => void>();

  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  start(url: URL, headers: Record<string, string>, handlers: TransportHandlers): TransportCall {
    const messages: Uint8Array[] = [];
    const abort = new AbortController();
    let ended = false;
    const cancel = () => {
      ended = true;
      this.active.delete(cancel);
      abort.abort();
    };
    const end = (error?: Error) => {
      this.active.delete(cancel);
      if (!ended) {
        ended = true;
        handlers.onEnd(error);
      }
    };
    const fetchImpl = this.fetchImpl;

    const run = async () => {
      let length = 0;
      for (const m of messages) {
        length += m.byteLength;
      }
      const body = new Uint8Array(length);
      let offset = 0;
      for (const m of messages) {
        body.set(m, offset);
        offset += m.byteLength;
      }
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/grpc-web+proto',
          'x-grpc-web': '1',
        },
        body,
        signal: abort.signal,
      });
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        responseHeaders[name.toLowerCase()] = value;
      });
      handlers.onHeaders(responseHeaders);
      if (response.status !== 200) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      if (response.body == null) {
        // A trailers-only response carries its status in the headers
        return;
      }
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        if (ended) {
          await reader.cancel();
          return;
        }
        handlers.onChunk(value);
      }
    };

    return {
      sendMessage: framed => messages.push(framed),
      finishSend: () => {
        this.active.add(cancel);
        run().then(
          () => end(),
          error => end(abort.signal.aborted ? undefined : error instanceof Error ? error : new Error(String(error)))
        );
      },
      cancel,
    };
  }

  close(): void {
    for (const cancel of [...this.active]) {
      cancel();
    }
  }
}

const MULTIPLEX_PROTOCOL = 'grpc-websockets-multiplex';
const GO_AWAY_STREAM_ID = 0x7fffffff;
const CLOSED_BIT = 0x80000000;

interface StreamEntry {
  sawHeaders: boolean;
  handlers: TransportHandlers;
}

/** One websocket shared by every call; replaced when the server asks the client to go away, or it closes. */
class MultiplexedSocket {
  readonly ws: WebSocket;
  readonly streams = new Map<number, StreamEntry>();
  private readonly queue: Uint8Array[] = [];
  closing = false;

  constructor(
    url: URL,
    private readonly onRetire: (socket: MultiplexedSocket) => void
  ) {
    const wsUrl = new URL(url);
    wsUrl.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(wsUrl, [MULTIPLEX_PROTOCOL]);
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('open', () => {
      if (this.ws.protocol !== MULTIPLEX_PROTOCOL) {
        this.fail(new Error(`Server does not support ${MULTIPLEX_PROTOCOL}, only "${this.ws.protocol}"`));
        this.ws.close();
        return;
      }
      for (const payload of this.queue) {
        this.ws.send(payload);
      }
      this.queue.length = 0;
    });
    this.ws.addEventListener('message', event => this.onMessage(event as MessageEvent<ArrayBuffer>));
    this.ws.addEventListener('close', event => {
      this.onRetire(this);
      this.fail(new Error(`Websocket closed${event.reason ? `: ${event.reason}` : ''}`));
    });
  }

  send(payload: Uint8Array): void {
    if (this.ws.readyState === WebSocket.CONNECTING) {
      this.queue.push(payload);
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    }
  }

  release(streamId: number): void {
    this.streams.delete(streamId);
    if (this.closing && this.streams.size === 0) {
      this.ws.close();
    }
  }

  private fail(error: Error): void {
    const streams = [...this.streams.values()];
    this.streams.clear();
    for (const stream of streams) {
      stream.handlers.onEnd(error);
    }
  }

  private onMessage(event: MessageEvent<ArrayBuffer>): void {
    const data = event.data;
    let streamId = new DataView(data, 0, 4).getInt32(0, false);
    if (streamId === GO_AWAY_STREAM_ID) {
      // Acknowledge, and finish the streams in flight before closing
      const ack = new Uint8Array(5);
      new DataView(ack.buffer).setUint32(0, (GO_AWAY_STREAM_ID | CLOSED_BIT) >>> 0, false);
      ack[4] = 1;
      this.send(ack);
      this.closing = true;
      this.onRetire(this);
      if (this.streams.size === 0) {
        this.ws.close();
      }
      return;
    }
    let closed = false;
    if (streamId < 0) {
      streamId = (streamId ^ CLOSED_BIT) >>> 0;
      closed = true;
    }
    const stream = this.streams.get(streamId);
    if (stream == null) {
      return;
    }
    const chunk = new Uint8Array(data, 4);
    if (!stream.sawHeaders) {
      stream.sawHeaders = true;
      // Headers arrive framed like trailers: a 0x80 flag, a length, then the header block
      stream.handlers.onHeaders(parseHeaderBlock(decodeAscii(chunk.subarray(5))));
    } else if (chunk.byteLength > 0) {
      stream.handlers.onChunk(chunk);
    }
    if (closed) {
      this.release(streamId);
      stream.handlers.onEnd();
    }
  }
}

/**
 * Deephaven's multiplexed gRPC-over-websocket transport: every call shares one websocket, and calls may stream in both
 * directions. Browsers only reach a plain `http:` server over HTTP/1.1, which limits how many fetch streams can be
 * open at once, so this is the default there.
 */
export class WebSocketTransport implements Transport {
  readonly supportsClientStreaming = true;
  private socket: MultiplexedSocket | null = null;
  private nextStreamId = 1;

  start(url: URL, headers: Record<string, string>, handlers: TransportHandlers): TransportCall {
    if (this.socket == null) {
      this.socket = new MultiplexedSocket(url, retired => {
        if (this.socket === retired) {
          this.socket = null;
        }
      });
    }
    const socket = this.socket;
    const streamId = this.nextStreamId++;
    socket.streams.set(streamId, { sawHeaders: false, handlers });

    const framedId = (id: number) => {
      const bytes = new Uint8Array(4);
      new DataView(bytes.buffer).setUint32(0, id >>> 0, false);
      return bytes;
    };

    const headerText = Object.entries({ ...headers, 'grpc-websockets-path': url.pathname.substring(1) })
      .map(([name, value]) => `${name}: ${value}\r\n`)
      .join('');
    const headerBytes = encodeAscii(headerText);
    const headerPayload = new Uint8Array(4 + headerBytes.byteLength);
    headerPayload.set(framedId(streamId));
    headerPayload.set(headerBytes, 4);
    socket.send(headerPayload);

    let finished = false;
    return {
      sendMessage: framed => {
        const payload = new Uint8Array(5 + framed.byteLength);
        payload.set(framedId(streamId));
        payload[4] = 0;
        payload.set(framed, 5);
        socket.send(payload);
      },
      finishSend: () => {
        if (finished) {
          return;
        }
        finished = true;
        const payload = new Uint8Array(5);
        payload.set(framedId((streamId | CLOSED_BIT) >>> 0));
        payload[4] = 1;
        socket.send(payload);
      },
      cancel: () => {
        if (socket.streams.has(streamId)) {
          // The protocol has no per-stream cancel; half-closing lets the server end the stream
          if (!finished) {
            finished = true;
            const payload = new Uint8Array(5);
            payload.set(framedId((streamId | CLOSED_BIT) >>> 0));
            payload[4] = 1;
            socket.send(payload);
          }
          socket.release(streamId);
        }
      },
    };
  }

  close(): void {
    this.socket?.ws.close();
    this.socket = null;
  }
}
