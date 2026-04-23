import { Table } from './Table.js';
import { DhInternalTransport } from './transport/DhInternalTransport.js';
import type { OpenApiTransport } from './transport/OpenApiTransport.js';

/**
 * Credentials passed to `CoreClient.login`. The shape mirrors the legacy Java
 * `LoginCredentials`: a free-form `type` string plus optional `username` /
 * `token`. Known types get special treatment:
 * - `"anonymous"`: no username or token required.
 * - `"password"`: username + token are base64-encoded as HTTP Basic.
 * - anything else: passed through as `<type> <token>` on the wire.
 */
export interface LoginCredentials {
  type: string;
  username?: string;
  token?: string;
}

export interface CoreClientOptions {
  /**
   * Inject a custom transport. Used by tests to mock out the wire layer.
   * If omitted, a real `DhInternalTransport` is created that dynamically
   * imports `/jsapi/dh-internal.js` from `serverUrl`.
   */
  transport?: OpenApiTransport;
}

/**
 * Entry point to talk to a Deephaven Core server from TypeScript/JS.
 *
 * Shape is a deliberate subset of the legacy `dh.CoreClient` class compiled
 * into `dh-core.js` today — only enough to fetch a table by name and read its
 * initial size.
 */
export class CoreClient {
  private readonly transport: OpenApiTransport;

  constructor(serverUrl: string, options: CoreClientOptions = {}) {
    this.transport = options.transport ?? new DhInternalTransport(serverUrl);
  }

  async login(credentials: LoginCredentials): Promise<void> {
    if (!credentials?.type) {
      throw new Error('login: credentials.type must be specified');
    }
    // Touch auth constants so pre-auth reachability surfaces as a login
    // failure rather than surprising the first table fetch.
    await this.transport.getAuthenticationConstants();

    if (credentials.type === 'password') {
      if (!credentials.username || !credentials.token) {
        throw new Error('login: password type requires username and token');
      }
      this.transport.setAuthorization('Basic', base64Utf8(`${credentials.username}:${credentials.token}`));
    } else if (credentials.type === 'anonymous') {
      this.transport.setAuthorization('Anonymous', '');
    } else {
      this.transport.setAuthorization(credentials.type, credentials.token ?? '');
    }
  }

  async getTable(name: string): Promise<Table> {
    const result = await this.transport.fetchTableByScopeName(name);
    return new Table({
      name,
      ticket: result.ticket,
      size: result.size,
      transport: this.transport,
    });
  }
}

/** Base64-encode a UTF-8 string. Works in browsers and in Node 16+ (which ships `btoa`). */
function base64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}
