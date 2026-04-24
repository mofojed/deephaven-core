import type {
  DoExchangeFrame,
  DoExchangeStream,
  FetchTableResult,
  OpenApiTransport,
  SortSpec,
} from '../../transport/OpenApiTransport.js';

export interface MockTransportOptions {
  authConstants?: Map<string, string>;
  tables?: Map<string, FetchTableResult>;
  /**
   * Called once per `openDoExchange()`. Receives a synthetic server-side
   * controller that tests use to emit incoming frames or close the stream.
   * The controller is also exposed via `MockTransport.exchanges`.
   */
  onDoExchange?: (controller: MockExchangeController) => void;
  /**
   * Called once per `filterTable()`. If omitted, the mock synthesizes a
   * fresh ticket from a running counter and returns size 0.
   */
  onFilter?: (
    sourceTicket: Uint8Array,
    filters: readonly string[],
  ) => FetchTableResult | Promise<FetchTableResult>;
  /**
   * Called once per `sortTable()`. Same default as `onFilter` if omitted.
   */
  onSort?: (
    sourceTicket: Uint8Array,
    descriptors: readonly SortSpec[],
  ) => FetchTableResult | Promise<FetchTableResult>;
}

export interface MockExchangeController {
  /** Frames the test sent from the "client" side. */
  readonly sent: DoExchangeFrame[];
  /** Emit a frame from the synthetic server to the client. */
  emit(frame: DoExchangeFrame): void;
  /** Close the stream. `error` = undefined for clean end. */
  end(error?: Error): void;
  /** True once the client has called `cancel()`. */
  readonly cancelled: boolean;
}

/**
 * In-memory `OpenApiTransport` for unit tests. Records every call and returns
 * configured responses without touching the network.
 */
export class MockTransport implements OpenApiTransport {
  readonly authConstants: Map<string, string>;
  readonly tables: Map<string, FetchTableResult>;
  readonly exchanges: MockExchangeController[] = [];
  private readonly onDoExchange?: (c: MockExchangeController) => void;
  private readonly onFilter?: MockTransportOptions['onFilter'];
  private readonly onSort?: MockTransportOptions['onSort'];
  private nextMockTicketId = 100;

  readonly calls: {
    getAuthenticationConstants: number;
    setAuthorization: Array<{ type: string; value: string }>;
    fetchTableByScopeName: string[];
    filterTable: Array<{ sourceTicket: Uint8Array; filters: readonly string[] }>;
    sortTable: Array<{ sourceTicket: Uint8Array; descriptors: readonly SortSpec[] }>;
  } = {
    getAuthenticationConstants: 0,
    setAuthorization: [],
    fetchTableByScopeName: [],
    filterTable: [],
    sortTable: [],
  };

  constructor(options: MockTransportOptions = {}) {
    this.authConstants = options.authConstants ?? new Map([['AuthHandlers', 'Anonymous']]);
    this.tables = options.tables ?? new Map();
    this.onDoExchange = options.onDoExchange;
    this.onFilter = options.onFilter;
    this.onSort = options.onSort;
  }

  async filterTable(
    sourceTicket: Uint8Array,
    filters: readonly string[],
  ): Promise<FetchTableResult> {
    this.calls.filterTable.push({ sourceTicket, filters });
    if (this.onFilter) return this.onFilter(sourceTicket, filters);
    return {
      ticket: new Uint8Array([0x65, this.nextMockTicketId++, 0, 0, 0]),
      size: 0,
    };
  }

  async sortTable(
    sourceTicket: Uint8Array,
    descriptors: readonly SortSpec[],
  ): Promise<FetchTableResult> {
    this.calls.sortTable.push({ sourceTicket, descriptors });
    if (this.onSort) return this.onSort(sourceTicket, descriptors);
    return {
      ticket: new Uint8Array([0x65, this.nextMockTicketId++, 0, 0, 0]),
      size: 0,
    };
  }

  async getAuthenticationConstants(): Promise<Map<string, string>> {
    this.calls.getAuthenticationConstants++;
    return this.authConstants;
  }

  setAuthorization(type: string, value: string): void {
    this.calls.setAuthorization.push({ type, value });
  }

  async fetchTableByScopeName(name: string): Promise<FetchTableResult> {
    this.calls.fetchTableByScopeName.push(name);
    const result = this.tables.get(name);
    if (!result) {
      throw new Error(`MockTransport: no table configured for "${name}"`);
    }
    return result;
  }

  get lastAuthorization(): { type: string; value: string } | undefined {
    return this.calls.setAuthorization[this.calls.setAuthorization.length - 1];
  }

  openDoExchange(): DoExchangeStream {
    const sent: DoExchangeFrame[] = [];
    const dataHandlers: Array<(frame: DoExchangeFrame) => void> = [];
    const endHandlers: Array<(error?: Error) => void> = [];
    // Frames emitted before the consumer registered `onData` are queued and
    // delivered as soon as the first handler attaches — mirrors how a real
    // grpc-web bidi stream buffers in-flight server messages.
    const pendingFrames: DoExchangeFrame[] = [];
    let pendingEnd: { error?: Error } | null = null;
    let cancelled = false;
    let ended = false;

    const fireEnd = (error?: Error): void => {
      if (ended) return;
      ended = true;
      if (endHandlers.length === 0) {
        pendingEnd = { error };
        return;
      }
      for (const h of endHandlers) h(error);
    };

    const controller: MockExchangeController = {
      sent,
      emit(frame: DoExchangeFrame): void {
        if (dataHandlers.length === 0) {
          pendingFrames.push(frame);
          return;
        }
        for (const h of dataHandlers) h(frame);
      },
      end(error?: Error): void {
        fireEnd(error);
      },
      get cancelled() {
        return cancelled;
      },
    };
    this.exchanges.push(controller);
    this.onDoExchange?.(controller);

    return {
      send(frame: DoExchangeFrame): void {
        sent.push(frame);
      },
      onData(handler): void {
        dataHandlers.push(handler);
        if (dataHandlers.length === 1 && pendingFrames.length > 0) {
          const drain = pendingFrames.splice(0, pendingFrames.length);
          for (const f of drain) handler(f);
        }
      },
      onEnd(handler): void {
        endHandlers.push(handler);
        if (pendingEnd) {
          const p = pendingEnd;
          pendingEnd = null;
          handler(p.error);
        }
      },
      cancel(): void {
        cancelled = true;
        fireEnd();
      },
    };
  }
}
