import { describe, expect, it } from 'vitest';
import { CoreClient } from '../CoreClient.js';
import type { ViewportUpdate } from '../viewport/ViewportUpdate.js';
import { makeSnapshotFrames } from './helpers/barrageFrames.js';
import { MockTransport, type MockExchangeController } from './helpers/MockTransport.js';

async function connect(opts: {
  rows: Record<string, ArrayLike<unknown>>;
  tableSize?: number;
}): Promise<{
  client: CoreClient;
  transport: MockTransport;
  exchange: MockExchangeController;
}> {
  let exchangeRef: MockExchangeController | undefined;
  const transport = new MockTransport({
    tables: new Map([
      ['t', { ticket: new Uint8Array([1, 2, 3]), size: opts.tableSize ?? 0 }],
    ]),
    onDoExchange: (controller) => {
      exchangeRef = controller;
      for (const frame of makeSnapshotFrames(opts.rows, { tableSize: opts.tableSize })) {
        controller.emit(frame);
      }
    },
  });
  const client = new CoreClient('http://localhost:10000/', { transport });
  await client.login({ type: 'anonymous' });
  return { client, transport, exchange: exchangeRef! };
}

describe('Table.setViewport + onUpdate (snapshot path)', () => {
  it('emits rows for a static snapshot', async () => {
    const { client } = await connect({
      rows: {
        I: new Int32Array([0, 1, 2, 3, 4]),
        S: ['a', 'b', 'c', 'd', 'e'],
      },
      tableSize: 5,
    });
    const table = await client.getTable('t');

    const updates: ViewportUpdate[] = [];
    table.onUpdate((u) => updates.push(u));
    table.setViewport({ firstRow: 0, lastRow: 4 });

    expect(updates).toHaveLength(1);
    const u = updates[0]!;
    expect(u.firstRow).toBe(0);
    expect(u.lastRow).toBe(4);
    expect(u.size).toBe(5);
    expect(u.reversed).toBe(false);
    expect(u.columns.map((c) => c.name)).toEqual(['I', 'S']);
    expect(u.rows.map((r) => r.get('I'))).toEqual([0, 1, 2, 3, 4]);
    expect(u.rows.map((r) => r.get('S'))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('fan-outs to multiple onUpdate listeners and ref-counts cleanup', async () => {
    const { transport } = await connect({
      rows: { I: new Int32Array([10, 11, 12]) },
      tableSize: 3,
    });
    const client = new CoreClient('http://localhost:10000/', { transport });
    await client.login({ type: 'anonymous' });
    const table = await client.getTable('t');

    const aUpdates: ViewportUpdate[] = [];
    const bUpdates: ViewportUpdate[] = [];
    const cleanA = table.onUpdate((u) => aUpdates.push(u));
    const cleanB = table.onUpdate((u) => bUpdates.push(u));
    table.setViewport({ firstRow: 0, lastRow: 2 });

    expect(aUpdates).toHaveLength(1);
    expect(bUpdates).toHaveLength(1);

    // First cleanup doesn't close the stream — B still attached.
    cleanA();
    const stillOpen = transport.exchanges[transport.exchanges.length - 1];
    expect(stillOpen?.cancelled).toBeFalsy();

    // Last cleanup closes the subscription.
    cleanB();
    expect(stillOpen?.cancelled).toBe(true);
  });

  it('filters columns client-side via the `columns` option', async () => {
    const { client } = await connect({
      rows: {
        I: new Int32Array([0, 1, 2]),
        J: new Int32Array([10, 11, 12]),
        S: ['x', 'y', 'z'],
      },
      tableSize: 3,
    });
    const table = await client.getTable('t');
    const updates: ViewportUpdate[] = [];
    table.onUpdate((u) => updates.push(u));
    table.setViewport({ firstRow: 0, lastRow: 2, columns: ['J', 'S'] });

    expect(updates[0]!.columns.map((c) => c.name)).toEqual(['J', 'S']);
    expect(updates[0]!.rows[0]!.get('I')).toBeUndefined();
    expect(updates[0]!.rows[0]!.get('J')).toBe(10);
    expect(updates[0]!.rows[1]!.get('S')).toBe('y');
  });

  it('onSizeUpdate fires without a viewport being set', async () => {
    const { client } = await connect({
      rows: { I: new Int32Array([1, 2, 3]) },
      tableSize: 3,
    });
    const table = await client.getTable('t');

    const sizes: number[] = [];
    table.onSizeUpdate((s) => sizes.push(s));
    // onSizeUpdate alone — no setViewport. The subscription opens, receives
    // the snapshot metadata, and fires the size listener.
    table.setViewport({ firstRow: 0, lastRow: 0 });

    expect(sizes).toEqual([3]);
  });

  it('copy() produces an independent subscription', async () => {
    let exchangeCount = 0;
    const transport = new MockTransport({
      tables: new Map([['t', { ticket: new Uint8Array([1]), size: 2 }]]),
      onDoExchange: (ctrl) => {
        exchangeCount++;
        for (const frame of makeSnapshotFrames({ I: new Int32Array([9, 8]) }, { tableSize: 2 })) {
          ctrl.emit(frame);
        }
      },
    });
    const client = new CoreClient('http://localhost:10000/', { transport });
    await client.login({ type: 'anonymous' });
    const a = await client.getTable('t');
    const b = a.copy();

    const aUpdates: ViewportUpdate[] = [];
    const bUpdates: ViewportUpdate[] = [];
    a.onUpdate((u) => aUpdates.push(u));
    a.setViewport({ firstRow: 0, lastRow: 1 });
    b.onUpdate((u) => bUpdates.push(u));
    b.setViewport({ firstRow: 0, lastRow: 0 });

    expect(exchangeCount).toBe(2);
    expect(aUpdates[0]!.rows).toHaveLength(2);
    expect(bUpdates[0]!.rows).toHaveLength(1);
  });

  it('resolves negative bounds as offsets from the end', async () => {
    const { client } = await connect({
      rows: { I: new Int32Array([10, 20, 30, 40, 50]) },
      tableSize: 5,
    });
    const table = await client.getTable('t');
    const updates: ViewportUpdate[] = [];
    table.onUpdate((u) => updates.push(u));
    // Request "last 2 rows". Our mock happens to return the full 5 rows for
    // any request, so the emitted slice is the actual last 2.
    table.setViewport({ firstRow: -2, lastRow: -1 });

    expect(updates[0]!.reversed).toBe(true);
    expect(updates[0]!.firstRow).toBe(3);
    expect(updates[0]!.lastRow).toBe(4);
    expect(updates[0]!.rows.map((r) => r.get('I'))).toEqual([40, 50]);
  });
});
