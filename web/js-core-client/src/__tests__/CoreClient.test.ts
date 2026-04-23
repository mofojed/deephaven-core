import { describe, expect, it } from 'vitest';
import { CoreClient } from '../CoreClient.js';
import { MockTransport } from './helpers/MockTransport.js';

describe('CoreClient.login', () => {
  it('fetches auth constants and sets Anonymous authorization', async () => {
    const transport = new MockTransport();
    const client = new CoreClient('http://localhost:10000/', { transport });

    await client.login({ type: 'anonymous' });

    expect(transport.calls.getAuthenticationConstants).toBe(1);
    expect(transport.lastAuthorization).toEqual({ type: 'Anonymous', value: '' });
  });

  it('base64-encodes username:token for password login', async () => {
    const transport = new MockTransport();
    const client = new CoreClient('http://localhost:10000/', { transport });

    await client.login({ type: 'password', username: 'alice', token: 's3cret' });

    const encoded = Buffer.from('alice:s3cret').toString('base64');
    expect(transport.lastAuthorization).toEqual({ type: 'Basic', value: encoded });
  });

  it('passes through custom auth types verbatim', async () => {
    const transport = new MockTransport();
    const client = new CoreClient('http://localhost:10000/', { transport });

    await client.login({ type: 'io.deephaven.authentication.psk.PskAuthenticationHandler', token: 'my-psk' });

    expect(transport.lastAuthorization).toEqual({
      type: 'io.deephaven.authentication.psk.PskAuthenticationHandler',
      value: 'my-psk',
    });
  });

  it('rejects password login without required fields', async () => {
    const transport = new MockTransport();
    const client = new CoreClient('http://localhost:10000/', { transport });

    await expect(client.login({ type: 'password' } as { type: 'password'; username: string; token: string }))
      .rejects.toThrow(/username and token/);
  });
});
