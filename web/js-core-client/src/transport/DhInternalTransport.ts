import type {
  AuthenticationConstantsResponse,
  ConfigServiceClient,
  DhInternal,
  DhInternalModule,
  ExportedTableCreationResponse,
  FlightServiceClient,
  TableServiceClient,
  Ticket,
  UnaryCallback,
} from './openapi-types.js';
import type {
  DoExchangeFrame,
  DoExchangeStream,
  FetchTableResult,
  OpenApiTransport,
} from './OpenApiTransport.js';

const SCOPE_PREFIX = 's'.charCodeAt(0);
const EXPORT_PREFIX = 'e'.charCodeAt(0);
const TICKET_DELIMITER = '/'.charCodeAt(0);

/**
 * Real transport. Dynamically imports `${serverUrl}/jsapi/dh-internal.js` on
 * first use, then speaks grpc-web to the server.
 */
export class DhInternalTransport implements OpenApiTransport {
  private readonly serviceHost: string;
  private dhInternalPromise?: Promise<DhInternal>;
  private configClient?: ConfigServiceClient;
  private tableClient?: TableServiceClient;
  private flightClient?: FlightServiceClient;
  private dh?: DhInternal;
  private authorization = '';
  private nextExportId = 1;

  constructor(serverUrl: string) {
    this.serviceHost = stripTrailingSlash(serverUrl);
  }

  async getAuthenticationConstants(): Promise<Map<string, string>> {
    const dh = await this.ensureLoaded();
    const req = new dh.io.deephaven_core.proto.config_pb.AuthenticationConstantsRequest();
    const response = await unary<AuthenticationConstantsResponse>((cb) =>
      this.configClient!.getAuthenticationConstants(req, cb),
    );
    const values = new Map<string, string>();
    response.getConfigValuesMap().forEach((value, key) => {
      values.set(key, value.getStringValue());
    });
    return values;
  }

  setAuthorization(type: string, value: string): void {
    this.authorization = value === '' ? type : `${type} ${value}`;
  }

  async fetchTableByScopeName(name: string): Promise<FetchTableResult> {
    const dh = await this.ensureLoaded();
    const proto = dh.io.deephaven_core.proto;

    const sourceTicket = new proto.ticket_pb.Ticket();
    sourceTicket.setTicket(scopeTicketBytes(name));
    const sourceRef = new proto.table_pb.TableReference();
    sourceRef.setTicket(sourceTicket);

    const resultTicket = new proto.ticket_pb.Ticket();
    resultTicket.setTicket(this.newExportTicketBytes());

    const req = new proto.table_pb.FetchTableRequest();
    req.setSourceId(sourceRef);
    req.setResultId(resultTicket);

    const metadata = this.buildMetadata();
    const response = await unary<ExportedTableCreationResponse>((cb) =>
      this.tableClient!.fetchTable(req, metadata, cb),
    );

    if (!response.getSuccess() && response.getErrorInfo()) {
      throw new Error(`FetchTable failed: ${response.getErrorInfo()}`);
    }
    return {
      ticket: asUint8(resultTicket),
      size: Number(response.getSize()),
    };
  }

  openDoExchange(): DoExchangeStream {
    if (!this.dh || !this.flightClient) {
      throw new Error('openDoExchange: call login() first so the transport is loaded');
    }
    const dh = this.dh;
    const stream = this.flightClient.doExchange(this.buildMetadata());
    const dataHandlers: Array<(frame: DoExchangeFrame) => void> = [];
    const endHandlers: Array<(error?: Error) => void> = [];

    stream.on('data', (msg) => {
      const frame: DoExchangeFrame = {
        dataHeader: msg.getDataHeader_asU8(),
        appMetadata: msg.getAppMetadata_asU8(),
        dataBody: msg.getDataBody_asU8(),
      };
      for (const h of dataHandlers) h(frame);
    });
    stream.on('end', (status) => {
      const err = toStreamError(status);
      for (const h of endHandlers) h(err);
    });
    stream.on('status', (status) => {
      const err = toStreamError(status);
      if (err) for (const h of endHandlers) h(err);
    });

    return {
      send(frame: DoExchangeFrame): void {
        const msg = new dh.arrow.flight.protocol.Flight_pb.FlightData();
        msg.setDataHeader(frame.dataHeader);
        msg.setAppMetadata(frame.appMetadata);
        msg.setDataBody(frame.dataBody);
        stream.write(msg);
      },
      onData(handler): void {
        dataHandlers.push(handler);
      },
      onEnd(handler): void {
        endHandlers.push(handler);
      },
      cancel(): void {
        stream.cancel();
      },
    };
  }

  private buildMetadata(): Record<string, string> {
    return this.authorization ? { authorization: this.authorization } : {};
  }

  private newExportTicketBytes(): Uint8Array {
    const id = this.nextExportId++;
    const bytes = new Uint8Array(5);
    bytes[0] = EXPORT_PREFIX;
    bytes[1] = id & 0xff;
    bytes[2] = (id >>> 8) & 0xff;
    bytes[3] = (id >>> 16) & 0xff;
    bytes[4] = (id >>> 24) & 0xff;
    return bytes;
  }

  private ensureLoaded(): Promise<DhInternal> {
    if (!this.dhInternalPromise) {
      this.dhInternalPromise = this.loadDhInternal();
    }
    return this.dhInternalPromise;
  }

  private async loadDhInternal(): Promise<DhInternal> {
    const url = `${this.serviceHost}/jsapi/dh-internal.js`;
    // Dynamic import using a template string so bundlers don't try to resolve
    // it at build time.
    const mod = (await import(/* @vite-ignore */ url)) as DhInternalModule;
    this.dh = mod.dhinternal;
    // Use the WebSocket transport, matching what dh-core.js does. The default
    // Jetty config sets `http.requireHttp2=true`, so HTTP/1.1 grpc calls get
    // rejected server-side with code 13. WebSockets side-step that entirely.
    const rpcOptions = {
      transport: this.dh.grpcWeb.grpc.WebsocketTransport(),
    };
    this.configClient = new this.dh.io.deephaven_core.proto.config_pb_service.ConfigServiceClient(this.serviceHost, rpcOptions);
    this.tableClient = new this.dh.io.deephaven_core.proto.table_pb_service.TableServiceClient(this.serviceHost, rpcOptions);
    this.flightClient = new this.dh.arrow.flight.protocol.Flight_pb_service.FlightServiceClient(this.serviceHost, rpcOptions);
    return this.dh;
  }
}

function toStreamError(status: unknown): Error | undefined {
  if (!status || typeof status !== 'object') return undefined;
  const s = status as { code?: number; details?: string; message?: string };
  if (s.code === undefined || s.code === 0) return undefined;
  return new Error(`gRPC ${s.code}: ${s.details ?? s.message ?? 'stream error'}`);
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function scopeTicketBytes(name: string): Uint8Array {
  const encoded = new TextEncoder().encode(name);
  const bytes = new Uint8Array(encoded.length + 2);
  bytes[0] = SCOPE_PREFIX;
  bytes[1] = TICKET_DELIMITER;
  bytes.set(encoded, 2);
  return bytes;
}

function asUint8(ticket: Ticket): Uint8Array {
  return ticket.getTicket_asU8();
}

function unary<T>(invoke: (callback: UnaryCallback<T>) => unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    invoke((error, response) => {
      if (error) {
        reject(new Error(`gRPC ${error.code}: ${error.message}`));
      } else if (!response) {
        reject(new Error('empty response'));
      } else {
        resolve(response);
      }
    });
  });
}
