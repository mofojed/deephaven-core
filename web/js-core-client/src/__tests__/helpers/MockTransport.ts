import type {
  FetchTableResult,
  OpenApiTransport,
} from '../../transport/OpenApiTransport.js';

export interface MockTransportOptions {
  authConstants?: Map<string, string>;
  tables?: Map<string, FetchTableResult>;
}

/**
 * In-memory `OpenApiTransport` for unit tests. Records every call and returns
 * configured responses without touching the network.
 */
export class MockTransport implements OpenApiTransport {
  readonly authConstants: Map<string, string>;
  readonly tables: Map<string, FetchTableResult>;

  readonly calls: {
    getAuthenticationConstants: number;
    setAuthorization: Array<{ type: string; value: string }>;
    fetchTableByScopeName: string[];
  } = {
    getAuthenticationConstants: 0,
    setAuthorization: [],
    fetchTableByScopeName: [],
  };

  constructor(options: MockTransportOptions = {}) {
    this.authConstants = options.authConstants ?? new Map([['AuthHandlers', 'Anonymous']]);
    this.tables = options.tables ?? new Map();
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
}
