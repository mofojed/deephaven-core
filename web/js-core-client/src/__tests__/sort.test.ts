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

describe('Table.sort', () => {
  it('does not issue a sort RPC until a consumer triggers materialization', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');

    const a = table.sort('Price');
    const b = table.sort('-Price');
    const c = table.sort('Ticker', '-Price');
    const d = table.sort(['Ticker', '-Price']);
    expect(transport.calls.sortTable).toEqual([]);

    await a.size();
    expect(transport.calls.sortTable).toHaveLength(1);
    expect(transport.calls.sortTable[0]!.descriptors).toEqual([{ column: 'Price', direction: 'asc' }]);

    void b;
    void c;
    void d;
  });

  it('parses `-` prefix as descending and bare names as ascending', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');

    await table.sort('Price').size();
    await table.sort('-Price').size();
    await table.sort('Ticker', '-Price').size();

    expect(transport.calls.sortTable).toHaveLength(3);
    expect(transport.calls.sortTable[0]!.descriptors).toEqual([
      { column: 'Price', direction: 'asc' },
    ]);
    expect(transport.calls.sortTable[1]!.descriptors).toEqual([
      { column: 'Price', direction: 'desc' },
    ]);
    expect(transport.calls.sortTable[2]!.descriptors).toEqual([
      { column: 'Ticker', direction: 'asc' },
      { column: 'Price', direction: 'desc' },
    ]);
  });

  it('flattens varargs and array forms identically', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');

    await table.sort('Ticker', '-Price').size();
    await table.sort(['Ticker', '-Price']).size();

    expect(transport.calls.sortTable[0]!.descriptors).toEqual(transport.calls.sortTable[1]!.descriptors);
  });

  it('chains: each .sort issues its own sort RPC in source order', async () => {
    const sourceTicket = new Uint8Array([0x65, 1, 0, 0, 0]);
    const midTicket = new Uint8Array([0x65, 200, 0, 0, 0]);
    const tailTicket = new Uint8Array([0x65, 201, 0, 0, 0]);

    const calls: Array<{ source: Uint8Array; desc: ReadonlyArray<{ column: string; direction: 'asc' | 'desc' }> }> = [];
    const { client } = await loggedInWith({
      tables: new Map([['t', { ticket: sourceTicket, size: 100 }]]),
      onSort: (source, descriptors) => {
        calls.push({ source, desc: descriptors });
        if (calls.length === 1) return { ticket: midTicket, size: 100 };
        return { ticket: tailTicket, size: 100 };
      },
    });
    const table = await client.getTable('t');

    const chained = table.sort('Ticker').sort('-Price');
    await chained.size();

    expect(calls).toHaveLength(2);
    expect(calls[0]!.source).toEqual(sourceTicket);
    expect(calls[0]!.desc).toEqual([{ column: 'Ticker', direction: 'asc' }]);
    expect(calls[1]!.source).toEqual(midTicket);
    expect(calls[1]!.desc).toEqual([{ column: 'Price', direction: 'desc' }]);
  });

  it('caches materialization — repeated consumer calls only RPC once', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');
    const sorted = table.sort('-Price');

    await sorted.size();
    await sorted.size();
    await sorted.size();

    expect(transport.calls.sortTable).toHaveLength(1);
  });

  it('rejects empty / `-` only / non-string args synchronously', async () => {
    const { client } = await loggedInWith();
    const table = await client.getTable('t');

    expect(() => table.sort()).toThrow(/at least one/i);
    expect(() => table.sort('')).toThrow(/empty/i);
    expect(() => table.sort('-')).toThrow(/empty/i);
    expect(() => table.sort(['Ticker', ''])).toThrow(/empty/i);
    expect(() => table.sort(42 as unknown as string)).toThrow(/string/i);
  });

  it('propagates transport errors from materialization', async () => {
    const { client } = await loggedInWith({
      onSort: () => Promise.reject(new Error('sort failed: Could not resolve column NotAColumn')),
    });
    const table = await client.getTable('t');
    const sorted = table.sort('-NotAColumn');

    await expect(sorted.size()).rejects.toThrow(/NotAColumn/);
  });

  it('composes with where in a chain', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');

    await table.where('I > 50').sort('-J').size();

    expect(transport.calls.filterTable).toHaveLength(1);
    expect(transport.calls.filterTable[0]!.filters).toEqual(['I > 50']);
    expect(transport.calls.sortTable).toHaveLength(1);
    expect(transport.calls.sortTable[0]!.descriptors).toEqual([{ column: 'J', direction: 'desc' }]);
    // Sort's source ticket must be the filter's result ticket.
    expect(transport.calls.sortTable[0]!.sourceTicket).toEqual(transport.calls.filterTable[0]!.sourceTicket.length === 5 ? new Uint8Array([0x65, 100, 0, 0, 0]) : transport.calls.sortTable[0]!.sourceTicket);
  });
});
