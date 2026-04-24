import { describe, expect, it } from 'vitest';
import { CoreClient } from '../CoreClient.js';
import { MockTransport } from './helpers/MockTransport.js';

async function loggedInWith(opts: ConstructorParameters<typeof MockTransport>[0] = {}): Promise<{
  client: CoreClient;
  transport: MockTransport;
}> {
  const transport = new MockTransport({
    tables: new Map([['t', { ticket: new Uint8Array([0x65, 1, 0, 0, 0]), size: 100 }]]),
    ...opts,
  });
  const client = new CoreClient('http://localhost:10000/', { transport });
  await client.login({ type: 'anonymous' });
  return { client, transport };
}

describe('Table.where', () => {
  it('does not issue a filter RPC until a consumer triggers materialization', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');

    const a = table.where('I > 5');
    const b = table.where('I > 5', 'J < 10');
    const c = table.where(['I > 5', 'J < 10']);
    const d = table.where('I > 5').where('J < 10');
    // Untouched derived tables must not have hit the server.
    expect(transport.calls.filterTable).toEqual([]);

    // Async size() triggers materialization.
    await a.size();
    expect(transport.calls.filterTable).toHaveLength(1);
    expect(transport.calls.filterTable[0]!.filters).toEqual(['I > 5']);

    void b;
    void c;
    void d;
  });

  it('flattens varargs strings and array args to the same filter list', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');

    await table.where('I > 5', 'J < 10').size();
    await table.where(['I > 5', 'J < 10']).size();

    expect(transport.calls.filterTable).toHaveLength(2);
    expect(transport.calls.filterTable[0]!.filters).toEqual(['I > 5', 'J < 10']);
    expect(transport.calls.filterTable[1]!.filters).toEqual(['I > 5', 'J < 10']);
  });

  it('chains: each .where issues its own filter RPC in source order', async () => {
    const sourceTicket = new Uint8Array([0x65, 1, 0, 0, 0]);
    const midTicket = new Uint8Array([0x65, 200, 0, 0, 0]);
    const tailTicket = new Uint8Array([0x65, 201, 0, 0, 0]);

    const calls: Array<{ source: Uint8Array; filters: readonly string[] }> = [];
    const { client } = await loggedInWith({
      tables: new Map([['t', { ticket: sourceTicket, size: 100 }]]),
      onFilter: (source, filters) => {
        calls.push({ source, filters });
        if (calls.length === 1) return { ticket: midTicket, size: 42 };
        return { ticket: tailTicket, size: 7 };
      },
    });
    const table = await client.getTable('t');

    const chained = table.where('I > 5').where('J < 10');
    const chainedSize = await chained.size();

    expect(chainedSize).toBe(7);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.source).toEqual(sourceTicket);
    expect(calls[0]!.filters).toEqual(['I > 5']);
    expect(calls[1]!.source).toEqual(midTicket);
    expect(calls[1]!.filters).toEqual(['J < 10']);
  });

  it('caches materialization — repeated consumer calls only RPC once', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');
    const filtered = table.where('I > 5');

    await filtered.size();
    await filtered.size();
    await filtered.size();

    expect(transport.calls.filterTable).toHaveLength(1);
  });

  it('rejects non-string and empty filter arguments synchronously', async () => {
    const { client } = await loggedInWith();
    const table = await client.getTable('t');

    expect(() => table.where()).toThrow(/at least one/i);
    expect(() => table.where('')).toThrow(/non-empty/i);
    expect(() => table.where(['I > 5', ''])).toThrow(/non-empty/i);
    expect(() => table.where(42 as unknown as string)).toThrow(/must be a string/i);
  });

  it('leaves the parent table usable and independent after creating a child', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');

    const child = table.where('I > 5');
    await child.size();

    // Parent is fine.
    expect(table.ticket).toEqual(new Uint8Array([0x65, 1, 0, 0, 0]));
    await expect(table.size()).resolves.toBe(100);
    // Child's ticket differs from parent.
    expect(child.ticket).not.toEqual(table.ticket);
    expect(transport.calls.filterTable).toHaveLength(1);
  });

  it('propagates transport errors from materialization', async () => {
    const { client } = await loggedInWith({
      onFilter: () => Promise.reject(new Error('where failed: Column not found')),
    });
    const table = await client.getTable('t');
    const filtered = table.where('NotAColumn > 0');

    await expect(filtered.size()).rejects.toThrow(/Column not found/);
  });
});
