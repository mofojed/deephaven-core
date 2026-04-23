import type {
  AuthenticationConstantsResponse,
  ConfigServiceClient,
  DhInternal,
  DhInternalModule,
  ExportedTableCreationResponse,
  TableServiceClient,
  Ticket,
  UnaryCallback,
} from './openapi-types.js';
import type { FetchTableResult, OpenApiTransport } from './OpenApiTransport.js';

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
    return this.dh;
  }
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
