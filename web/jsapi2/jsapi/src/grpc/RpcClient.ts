import type * as Core from '@deephaven/jsapi-core';
import type { CoreModule } from '../core.js';
import { CancelError, GrpcCode, GrpcError } from '../errors.js';
import { encodeFrame, FrameParser } from './frames.js';
import type { Transport } from './transports.js';

type DescMessage = Core.protobuf.DescMessage;
type MessageShape<T extends DescMessage> = Core.protobuf.MessageShape<T>;
type MessageInitShape<T extends DescMessage> = Core.protobuf.MessageInitShape<T>;

/** The parts of a generated method descriptor a call needs. */
export interface RpcMethod<I extends DescMessage = DescMessage, O extends DescMessage = DescMessage> {
  readonly name: string;
  readonly parent: { readonly typeName: string };
  readonly input: I;
  readonly output: O;
}

export type Input<M extends RpcMethod> = MessageInitShape<M['input']>;
export type Output<M extends RpcMethod> = MessageShape<M['output']>;

export interface CallOptions {
  headers?: Record<string, string>;
  /** Aborting the signal cancels the call. */
  signal?: AbortSignal;
}

export interface StreamObserver<O> {
  onHeaders?(headers: Record<string, string>): void;
  onMessage(message: O): void;
  /** Called once, with null when the call completed with status OK. */
  onEnd(error: Error | null): void;
}

/** A call whose requests can be streamed to the server, when the transport supports it. */
export interface ClientStream<I> {
  send(message: I): void;
  end(): void;
  cancel(): void;
}

/** Supplies per-call headers (such as authorization) and sees every call's response metadata. */
export interface RpcInterceptor {
  headers(): Record<string, string>;
  onMetadata(metadata: Record<string, string>): void;
}

function statusFromMetadata(metadata: Record<string, string>): GrpcError | null | undefined {
  const status = metadata['grpc-status'];
  if (status === undefined) {
    return undefined;
  }
  const code = Number(status);
  if (code === GrpcCode.OK) {
    return null;
  }
  let message = metadata['grpc-message'] ?? '';
  try {
    message = decodeURIComponent(message);
  } catch {
    // leave it as sent
  }
  return new GrpcError(code, message, metadata);
}

/** Makes typed gRPC calls over a {@link Transport}, using the protobuf runtime from the core module. */
export class RpcClient {
  constructor(
    private readonly core: CoreModule,
    readonly transport: Transport,
    private readonly baseUrl: URL,
    private readonly interceptor?: RpcInterceptor
  ) {}

  get supportsClientStreaming(): boolean {
    return this.transport.supportsClientStreaming;
  }

  /** Starts a call of any kind. Requests are sent with {@link ClientStream.send}, and the call is half-closed by end(). */
  start<M extends RpcMethod>(
    method: M,
    observer: StreamObserver<Output<M>>,
    options: CallOptions = {}
  ): ClientStream<Input<M>> {
    const { create, toBinary, fromBinary } = this.core.protobuf;
    const url = new URL(`${method.parent.typeName}/${method.name}`, this.baseUrl);
    const parser = new FrameParser();
    let ended = false;
    let status: GrpcError | null | undefined;
    const finish = (error: Error | null) => {
      if (ended) {
        return;
      }
      ended = true;
      options.signal?.removeEventListener('abort', onAbort);
      observer.onEnd(error);
    };
    const onMetadata = (metadata: Record<string, string>) => {
      this.interceptor?.onMetadata(metadata);
      const s = statusFromMetadata(metadata);
      if (s !== undefined) {
        status = s;
      }
    };
    const headers = { ...this.interceptor?.headers(), ...options.headers };
    const call = this.transport.start(url, headers, {
      onHeaders: responseHeaders => {
        onMetadata(responseHeaders);
        observer.onHeaders?.(responseHeaders);
      },
      onChunk: chunk => {
        if (ended) {
          return;
        }
        for (const frame of parser.push(chunk)) {
          if (frame.kind === 'trailers') {
            onMetadata(frame.metadata);
          } else {
            let message: Output<M>;
            try {
              message = fromBinary(method.output, frame.data) as Output<M>;
            } catch (e) {
              call.cancel();
              finish(e instanceof Error ? e : new Error(String(e)));
              return;
            }
            observer.onMessage(message);
            if (ended) {
              return;
            }
          }
        }
      },
      onEnd: error => {
        if (error) {
          finish(new GrpcError(GrpcCode.UNAVAILABLE, error.message));
        } else if (status === undefined) {
          finish(new GrpcError(GrpcCode.INTERNAL, 'Stream closed without a status'));
        } else {
          finish(status);
        }
      },
    });
    const onAbort = () => {
      call.cancel();
      finish(new CancelError());
    };
    if (options.signal?.aborted) {
      queueMicrotask(onAbort);
    } else {
      options.signal?.addEventListener('abort', onAbort);
    }
    return {
      send: message => {
        if (!ended) {
          call.sendMessage(encodeFrame(toBinary(method.input, create(method.input, message))));
        }
      },
      end: () => {
        if (!ended) {
          call.finishSend();
        }
      },
      cancel: () => {
        if (!ended) {
          call.cancel();
          finish(new CancelError());
        }
      },
    };
  }

  /** A server-streaming call: one request, any number of responses. */
  serverStream<M extends RpcMethod>(
    method: M,
    request: Input<M>,
    observer: StreamObserver<Output<M>>,
    options?: CallOptions
  ): { cancel(): void } {
    const call = this.start(method, observer, options);
    call.send(request);
    call.end();
    return call;
  }

  /** A unary call. */
  unary<M extends RpcMethod>(method: M, request: Input<M>, options?: CallOptions): Promise<Output<M>> {
    return new Promise((resolve, reject) => {
      let response: Output<M> | undefined;
      this.serverStream(
        method,
        request,
        {
          onMessage: message => {
            response = message;
          },
          onEnd: error => {
            if (error) {
              reject(error);
            } else if (response === undefined) {
              reject(new GrpcError(GrpcCode.INTERNAL, `No response from ${method.name}`));
            } else {
              resolve(response);
            }
          },
        },
        options
      );
    });
  }
}
