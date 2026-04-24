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

describe('Table.view / updateView / update', () => {
  it.each([
    ['view'],
    ['updateView'],
    ['update'],
  ] as const)('%s: does not issue an RPC until materialization is triggered', async (op) => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');

    const derived = (table[op] as (...args: string[]) => ReturnType<typeof table.view>)(
      'A = I * 2',
      'B = S',
    );
    expect(transport.calls.selectTable).toEqual([]);

    await derived.size();

    expect(transport.calls.selectTable).toHaveLength(1);
    expect(transport.calls.selectTable[0]!.op).toBe(op);
    expect(transport.calls.selectTable[0]!.columnSpecs).toEqual(['A = I * 2', 'B = S']);
  });

  it('flattens varargs and array forms identically', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');

    await table.view('A = I', 'B = J').size();
    await table.view(['A = I', 'B = J']).size();

    expect(transport.calls.selectTable).toHaveLength(2);
    expect(transport.calls.selectTable[0]!.columnSpecs).toEqual(['A = I', 'B = J']);
    expect(transport.calls.selectTable[1]!.columnSpecs).toEqual(['A = I', 'B = J']);
    expect(transport.calls.selectTable[0]!.op).toBe('view');
    expect(transport.calls.selectTable[1]!.op).toBe('view');
  });

  it('chains across ops: each link issues its own RPC in source order', async () => {
    const sourceTicket = new Uint8Array([0x65, 1, 0, 0, 0]);
    const tickets = [
      new Uint8Array([0x65, 200, 0, 0, 0]),
      new Uint8Array([0x65, 201, 0, 0, 0]),
      new Uint8Array([0x65, 202, 0, 0, 0]),
    ];
    const events: Array<{ kind: string; source: Uint8Array; spec: readonly string[] }> = [];
    const { client } = await loggedInWith({
      tables: new Map([['t', { ticket: sourceTicket, size: 100 }]]),
      onSelect: (source, columnSpecs, op) => {
        events.push({ kind: op, source, spec: columnSpecs });
        return { ticket: tickets[events.length - 1]!, size: 100 };
      },
    });
    const table = await client.getTable('t');

    const chained = table.view('A = I').updateView('B = A * 2').update('C = B + 1');
    await chained.size();

    expect(events).toHaveLength(3);
    expect(events[0]!.kind).toBe('view');
    expect(events[0]!.source).toEqual(sourceTicket);
    expect(events[1]!.kind).toBe('updateView');
    expect(events[1]!.source).toEqual(tickets[0]!);
    expect(events[2]!.kind).toBe('update');
    expect(events[2]!.source).toEqual(tickets[1]!);
  });

  it('caches materialization — repeated reads = one RPC', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');
    const derived = table.updateView('A = I * 2');

    await derived.size();
    await derived.size();
    await derived.size();

    expect(transport.calls.selectTable).toHaveLength(1);
  });

  it('rejects empty / non-string args synchronously', async () => {
    const { client } = await loggedInWith();
    const table = await client.getTable('t');

    expect(() => table.view()).toThrow(/at least one/i);
    expect(() => table.view('')).toThrow(/non-empty/i);
    expect(() => table.view(['A = I', ''])).toThrow(/non-empty/i);
    expect(() => table.view(42 as unknown as string)).toThrow(/string/i);

    // Same rules apply to updateView / update.
    expect(() => table.updateView('')).toThrow(/non-empty/i);
    expect(() => table.update()).toThrow(/at least one/i);
  });

  it('propagates transport errors from materialization', async () => {
    const { client } = await loggedInWith({
      onSelect: () => Promise.reject(new Error('view failed: Could not parse formula')),
    });
    const table = await client.getTable('t');
    const derived = table.view('A = Bad Formula (((');

    await expect(derived.size()).rejects.toThrow(/Could not parse formula/);
  });

  it('composes with where and sort in a chain', async () => {
    const { client, transport } = await loggedInWith();
    const table = await client.getTable('t');

    await table.where('I > 10').view('I', 'A = I * 2').sort('-A').size();

    expect(transport.calls.filterTable).toHaveLength(1);
    expect(transport.calls.selectTable).toHaveLength(1);
    expect(transport.calls.sortTable).toHaveLength(1);
    expect(transport.calls.selectTable[0]!.op).toBe('view');
    expect(transport.calls.selectTable[0]!.columnSpecs).toEqual(['I', 'A = I * 2']);
    expect(transport.calls.sortTable[0]!.descriptors).toEqual([{ column: 'A', direction: 'desc' }]);
  });
});
