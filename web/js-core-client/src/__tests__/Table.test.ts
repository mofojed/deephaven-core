import { describe, expect, it } from 'vitest';
import { CoreClient } from '../CoreClient.js';
import { MockTransport } from './helpers/MockTransport.js';

describe('CoreClient.getTable', () => {
  it('returns a Table with the server-reported size', async () => {
    const transport = new MockTransport({
      tables: new Map([
        ['my_table', { ticket: new Uint8Array([1, 2, 3]), size: 42 }],
      ]),
    });
    const client = new CoreClient('http://localhost:10000/', { transport });
    await client.login({ type: 'anonymous' });

    const table = await client.getTable('my_table');

    expect(table.name).toBe('my_table');
    expect(table.ticket).toEqual(new Uint8Array([1, 2, 3]));
    await expect(table.size()).resolves.toBe(42);
    expect(transport.calls.fetchTableByScopeName).toEqual(['my_table']);
  });

  it('propagates transport errors', async () => {
    const transport = new MockTransport();
    const client = new CoreClient('http://localhost:10000/', { transport });
    await client.login({ type: 'anonymous' });

    await expect(client.getTable('missing_table')).rejects.toThrow(/missing_table/);
  });
});
