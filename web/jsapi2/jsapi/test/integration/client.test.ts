// Integration tests against a running Deephaven server that allows anonymous login. Set DH_TEST_SERVER to its URL
// (default http://localhost:10000/), for example a server started with
//   docker run --rm -p 10000:10000 -e START_OPTS="-DAuthHandlers=io.deephaven.auth.AnonymousAuthenticationHandler" \
//     ghcr.io/deephaven/server:edge
import * as core from '@deephaven/jsapi-core';
import { Agent, fetch as undiciFetch } from 'undici';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CoreClient, DateTime, FetchTransport, type ResolvedTable, type TableData, type Transport } from '../../src/index.js';

const serverUrl = process.env.DH_TEST_SERVER ?? 'http://localhost:10000/';
// grpc-web over fetch needs HTTP/2, which in practice means TLS; set DH_TEST_HTTPS_SERVER to an https URL to test it
const httpsServerUrl = process.env.DH_TEST_HTTPS_SERVER;

const configurations: [string, () => 'websocket' | Transport, string][] = [['websocket', () => 'websocket', serverUrl]];
if (httpsServerUrl != null) {
  // Node's fetch only uses HTTP/2 when asked to; the test server's certificate is self-signed
  const agent = new Agent({ allowH2: true, connect: { rejectUnauthorized: false } });
  const http2Fetch = ((url: string, init: RequestInit) =>
    undiciFetch(url, { ...(init as object), dispatcher: agent })) as unknown as typeof fetch;
  configurations.push(['fetch', () => new FetchTransport(http2Fetch), httpsServerUrl]);
}

function values(data: TableData, column: string): unknown[] {
  return data.rows.map(row => row.get(column));
}

describe.each(configurations)('CoreClient over %s', (_name, transport, url) => {
  let client: CoreClient;

  beforeAll(async () => {
    client = new CoreClient(url, { transport: transport(), coreModule: core });
    await client.login({ type: CoreClient.LOGIN_TYPE_ANONYMOUS });
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it('creates and reads a static table', async () => {
    const t = await client.emptyTable(5).update(['I = i', 'L = (long) i * 10', 'S = `s` + i', 'B = i % 2 == 0']);
    try {
      expect(t.size).toBe(5);
      expect(t.isRefreshing).toBe(false);
      expect(t.columns.map(c => [c.name, c.type])).toEqual([
        ['I', 'int'],
        ['L', 'long'],
        ['S', 'java.lang.String'],
        ['B', 'java.lang.Boolean'],
      ]);
      const data = await t.createSnapshot();
      expect(values(data, 'I')).toEqual([0, 1, 2, 3, 4]);
      expect(values(data, 'L')).toEqual([0n, 10n, 20n, 30n, 40n]);
      expect(values(data, 'S')).toEqual(['s0', 's1', 's2', 's3', 's4']);
      expect(values(data, 'B')).toEqual([true, false, true, false, true]);
    } finally {
      t.close();
    }
  });

  it('chains operations and reads a snapshot of some rows and columns', async () => {
    const t = await client
      .emptyTable(100)
      .update(['X = i', 'Y = X % 7'])
      .where('Y > 2')
      .sort([{ column: 'X', direction: 'DESC' }])
      .head(10);
    try {
      expect(t.size).toBe(10);
      const data = await t.createSnapshot({ rows: { first: 2, last: 4 }, columns: ['X'] });
      expect(data.columns.map(c => c.name)).toEqual(['X']);
      expect(data.offset).toBe(2);
      // X % 7 > 2, descending: 97, 96, 95, 94, 90, ...
      expect(values(data, 'X')).toEqual([95, 94, 90]);
      expect(() => data.getData(0, 'Y')).toThrow();
    } finally {
      t.close();
    }
  });

  it('converts nulls, chars, doubles, instants and arrays', async () => {
    const t = await client
      .emptyTable(2)
      .update([
        'N = i == 0 ? null : (int) i',
        'C = (char) (65 + i)',
        'D = i / 2.0',
        'T = \'2024-01-02T03:04:05.123456789 UTC\' + i * SECOND',
        'A = new int[] {i, i + 1}',
        'BD = java.math.BigDecimal.valueOf(i * 125 + 1, 3)',
      ]);
    try {
      const data = await t.createSnapshot();
      expect(values(data, 'N')).toEqual([null, 1]);
      expect(values(data, 'C')).toEqual(['A', 'B']);
      expect(values(data, 'D')).toEqual([0, 0.5]);
      const times = values(data, 'T') as DateTime[];
      expect(times[0]).toBeInstanceOf(DateTime);
      expect(times[0].toString()).toBe('2024-01-02T03:04:05.123456789Z');
      expect(times[1].epochNanos - times[0].epochNanos).toBe(1_000_000_000n);
      expect(values(data, 'A')).toEqual([
        [0, 1],
        [1, 2],
      ]);
      expect(values(data, 'BD')).toEqual(['0.001', '0.126']);
    } finally {
      t.close();
    }
  });

  it('aggregates and joins', async () => {
    const left = client.emptyTable(6).update(['Key = i % 3', 'X = i']);
    const right = client.emptyTable(3).update(['Key = i', 'Name = `k` + i']);
    const [sums, joined, counts] = await Promise.all([
      left.aggBy({
        aggregations: [
          { type: 'Sum', columns: ['SumX = X'] },
          { type: 'Count', column: 'N' },
        ],
        groupByColumns: ['Key'],
      }),
      left.naturalJoin(right, ['Key'], ['Name']),
      left.countBy('Count', ['Key']),
    ]);
    try {
      const sumData = await sums.createSnapshot();
      expect(values(sumData, 'Key')).toEqual([0, 1, 2]);
      expect(values(sumData, 'SumX')).toEqual([3n, 5n, 7n]);
      expect(values(sumData, 'N')).toEqual([2n, 2n, 2n]);
      const joinData = await joined.createSnapshot();
      expect(values(joinData, 'Name')).toEqual(['k0', 'k1', 'k2', 'k0', 'k1', 'k2']);
      expect(counts.size).toBe(3);
    } finally {
      sums.close();
      joined.close();
      counts.close();
    }
  });

  it('rejects a failed operation and anything chained on it', async () => {
    const bad = client.emptyTable(1).update(['X = NoSuchColumn']);
    const chained = bad.head(1);
    await expect(Promise.all([bad, chained])).rejects.toThrow();
    await expect(Promise.resolve(chained)).rejects.toThrow();
  });

  it('rejects a pending table used after the task that created it', async () => {
    const a = client.emptyTable(1);
    const b = client.emptyTable(1);
    const ra = await a;
    ra.close();
    await expect(Promise.resolve(b)).rejects.toThrow(/after the task/);
  });

  it('cancels a pending table', async () => {
    const t = client.emptyTable(1);
    t.cancel();
    await expect(Promise.resolve(t)).rejects.toThrow(/canceled/);
  });

  it('fetches a variable a script created', async () => {
    const types = await client.getConsoleTypes();
    const session = await client.startSession(types.includes('python') ? 'python' : 'groovy');
    try {
      const result = await session.runCode(
        session.type === 'python'
          ? 'from deephaven import empty_table\njsapi2_t = empty_table(3).update(["X = 3 - i"])'
          : 'jsapi2_t = emptyTable(3).update("X = 3 - i")'
      );
      expect(result.error).toBeNull();
      expect(result.changes.created.map(v => v.name)).toContain('jsapi2_t');
      const table = await client.getObject({ name: 'jsapi2_t' });
      const sorted = await table.sort('X');
      try {
        expect(values(await sorted.createSnapshot(), 'X')).toEqual([1, 2, 3]);
      } finally {
        sorted.close();
        table.close();
      }
    } finally {
      session.close();
    }
  });

  it('keeps a viewport subscription of a ticking table up to date', async () => {
    const t: ResolvedTable = await client.timeTable(100_000_000).update(['X = ii']);
    const sorted = await t.sort([{ column: 'X', direction: 'DESC' }]);
    try {
      expect(sorted.isRefreshing).toBe(true);
      const subscription = sorted.createViewportSubscription({ rows: { first: 0, last: 4 }, updateIntervalMs: 100 });
      const seen: bigint[] = [];
      await new Promise<void>((resolve, reject) => {
        subscription.addEventListener('error', ({ error }) => reject(error));
        const remove = subscription.addEventListener('updated', data => {
          if (data.rows.length > 0) {
            const top = data.rows[0].get('X') as bigint;
            if (seen[seen.length - 1] !== top) {
              seen.push(top);
            }
            const xs = values(data, 'X') as bigint[];
            // Sorted descending, and contiguous
            for (let i = 1; i < xs.length; i++) {
              expect(xs[i]).toBe(xs[i - 1] - 1n);
            }
          }
          if (seen.length >= 3 && data.rows.length === 5) {
            remove();
            resolve();
          }
        });
      });
      expect(seen[1]).toBeGreaterThan(seen[0]);
      expect(subscription.size).toBeGreaterThanOrEqual(5);

      subscription.setViewport({ first: 2, last: 3 }, ['Timestamp']);
      const data = await subscription.getViewportData();
      expect(data.offset).toBe(2);
      expect(data.rows.length).toBe(2);
      expect(data.columns.map(c => c.name)).toEqual(['Timestamp']);
      expect(data.rows[0].get('Timestamp')).toBeInstanceOf(DateTime);
      subscription.close();
      expect(subscription.isClosed).toBe(true);
    } finally {
      sorted.close();
      t.close();
    }
  });

  it('decodes the dictionary and run-end encodings the server chooses for repetitive columns', async () => {
    // Low-cardinality strings are dictionary encoded, and the sorted columns' runs are run-end encoded
    const t = await client
      .emptyTable(1000)
      .update([
        'Sym = i % 3 == 0 ? `AAA` : i % 3 == 1 ? `BBB` : null',
        'Run = (int) (i / 100)',
        'RunS = `r` + (int) (i / 250)',
        'C = (char) (65 + (i / 500))',
      ])
      .sort('Run');
    try {
      const expected = Array.from({ length: 10 }, (_, k) => {
        const i = 95 + k;
        return [[`AAA`, `BBB`, null][i % 3], Math.floor(i / 100), `r${Math.floor(i / 250)}`, 'A'];
      });
      const read = (data: TableData) => data.rows.map(r => ['Sym', 'Run', 'RunS', 'C'].map(c => r.get(c)));
      expect(read(await t.createSnapshot({ rows: { first: 95, last: 104 } }))).toEqual(expected);
      const subscription = t.createViewportSubscription({ rows: { first: 95, last: 104 } });
      try {
        expect(read(await subscription.getViewportData())).toEqual(expected);
      } finally {
        subscription.close();
      }
    } finally {
      t.close();
    }
  });

  it('keeps dictionary encoded columns of a ticking table correct as values are added', async () => {
    const t = await client
      .timeTable(20_000_000)
      .update(['X = ii', 'Sym = X % 4 == 0 ? `A` : X % 4 == 1 ? `B` : X % 4 == 2 ? `C` : `D` + (long) (X / 40)'])
      .sort([{ column: 'X', direction: 'DESC' }]);
    const subscription = t.createViewportSubscription({ rows: { first: 0, last: 19 }, updateIntervalMs: 50 });
    try {
      let checked = 0;
      await new Promise<void>((resolve, reject) => {
        subscription.addEventListener('error', ({ error }) => reject(error));
        const remove = subscription.addEventListener('updated', data => {
          for (const row of data.rows) {
            const x = row.get('X') as bigint;
            const sym = ['A', 'B', 'C', `D${x / 40n}`][Number(x % 4n)];
            if (row.get('Sym') !== sym) {
              remove();
              reject(new Error(`Row ${x} has Sym ${String(row.get('Sym'))}, expected ${sym}`));
              return;
            }
          }
          if (data.rows.length === 20 && ++checked >= 5) {
            remove();
            resolve();
          }
        });
      });
    } finally {
      subscription.close();
      t.close();
    }
  });

  it('supports the other table operations', async () => {
    const t = client.emptyTable(6).update(['Key = i % 3', 'X = i']);
    const keys = client.emptyTable(2).update(['Key = i']);
    const names = client.emptyTable(3).update(['Key = i', 'Name = `k` + i']);
    const results = await Promise.allSettled([
      t.tail(2), // 0
      t.reverse(), // 1
      t.where('X % 2 == 0').flatten(), // 2
      t.updateView(['Y = X * 2']).select(['Y']), // 3
      t.lazyUpdate(['Z = Key * 10']).view(['Z']).dropColumns(['Z']).update(['W = 1']), // 4
      t.selectDistinct(['Key']), // 5
      t.groupBy(['Key']).ungroup(), // 6
      t.sumBy(['Key']), // 7
      t.minBy(['Key']), // 8
      t.maxBy(['Key']), // 9
      t.firstBy(['Key']), // 10
      t.lastBy(['Key']), // 11
      t.avgBy(['Key']), // 12
      t.whereIn(keys, ['Key']), // 13
      t.whereNotIn(keys, ['Key']), // 14
      t.exactJoin(names, ['Key'], ['Name']), // 15
      t.join(keys, [], ['K2 = Key']), // 16
      client.mergeTables([t, t.head(1)]), // 17
      client.timeTable('PT1s', { startTime: new Date('2024-01-01T00:00:00Z') }).head(1), // 18
      t.aggBy({
        aggregations: [
          { type: 'Max', columns: ['MaxX = X'] },
          { type: 'CountDistinct', columns: ['Distinct = Key'] },
          { type: 'Group', columns: ['Xs = X'] },
        ],
      }), // 19
    ]);
    const tables = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []));
    try {
      const failures = results.flatMap((r, i) => (r.status === 'rejected' ? [`${i}: ${r.reason}`] : []));
      expect(failures).toEqual([]);
      const column = async (i: number, name: string) => values(await tables[i].createSnapshot(), name);
      expect(await column(0, 'X')).toEqual([4, 5]);
      expect(await column(1, 'X')).toEqual([5, 4, 3, 2, 1, 0]);
      expect(await column(2, 'X')).toEqual([0, 2, 4]);
      expect(tables[3].columns.map(c => c.name)).toEqual(['Y']);
      expect(await column(3, 'Y')).toEqual([0, 2, 4, 6, 8, 10]);
      expect(tables[4].columns.map(c => c.name)).toEqual(['W']);
      expect(await column(5, 'Key')).toEqual([0, 1, 2]);
      expect(tables[6].size).toBe(6);
      expect(await column(7, 'X')).toEqual([3n, 5n, 7n]);
      expect(await column(8, 'X')).toEqual([0, 1, 2]);
      expect(await column(9, 'X')).toEqual([3, 4, 5]);
      expect(await column(10, 'X')).toEqual([0, 1, 2]);
      expect(await column(11, 'X')).toEqual([3, 4, 5]);
      expect(await column(12, 'X')).toEqual([1.5, 2.5, 3.5]);
      expect(await column(13, 'X')).toEqual([0, 1, 3, 4]);
      expect(await column(14, 'X')).toEqual([2, 5]);
      expect(await column(15, 'Name')).toEqual(['k0', 'k1', 'k2', 'k0', 'k1', 'k2']);
      expect(tables[16].size).toBe(12);
      expect(await column(17, 'X')).toEqual([0, 1, 2, 3, 4, 5, 0]);
      expect(((await column(18, 'Timestamp'))[0] as DateTime).toString()).toBe('2024-01-01T00:00:00.000000000Z');
      const agg = await tables[19].createSnapshot();
      expect([agg.getData(0, 'MaxX'), agg.getData(0, 'Distinct'), agg.getData(0, 'Xs')]).toEqual([5, 3n, [0, 1, 2, 3, 4, 5]]);
    } finally {
      tables.forEach(table => table.close());
    }
  });

  it('checks arguments when an operation is called', async () => {
    const t = await client.emptyTable(1);
    try {
      expect(() => t.head(-1)).toThrow(RangeError);
      expect(() => t.sort([])).toThrow(TypeError);
      expect(() => t.aggBy({ aggregations: [{ type: 'Nope' as 'Sum', columns: ['X'] }] })).toThrow(/Unknown aggregation/);
      expect(() => t.naturalJoin(t, ['X'], [], 'SOMETIMES' as 'FIRST_MATCH')).toThrow(/Unknown natural join type/);
      expect(() => t.findColumn('Missing')).toThrow(/No column named Missing/);
    } finally {
      t.close();
    }
    await expect(t.head(1).resolve()).rejects.toThrow(/closed/);
  });

  it('subscribes to a viewport of a blink table', async () => {
    const t = await client.timeTable(10_000_000, { blink: true });
    expect(t.isBlink).toBe(true);
    const subscription = t.createViewportSubscription({ rows: { first: 0, last: 999 }, updateIntervalMs: 100 });
    try {
      const updates: bigint[][] = [];
      await new Promise<void>((resolve, reject) => {
        subscription.addEventListener('error', ({ error }) => reject(error));
        const remove = subscription.addEventListener('updated', data => {
          const times = (values(data, 'Timestamp') as DateTime[]).map(time => time.epochNanos);
          if (times.length > 0) {
            updates.push(times);
          }
          if (updates.length >= 3) {
            remove();
            resolve();
          }
        });
      });
      // Each update holds only the rows added in its cycle, in order, all after the previous update's rows
      for (let u = 0; u < updates.length; u++) {
        const times = updates[u];
        times.forEach((time, i) => i > 0 && expect(time).toBeGreaterThan(times[i - 1]));
        if (u > 0) {
          expect(times[0]).toBeGreaterThan(updates[u - 1][updates[u - 1].length - 1]);
        }
      }
    } finally {
      subscription.close();
      t.close();
    }
  });

  it('reports size changes of a refreshing table', async () => {
    const t = await client.timeTable(50_000_000);
    try {
      const size = await new Promise<number>(resolve => {
        const remove = t.addEventListener('sizechanged', ({ size }) => {
          if (size >= 3) {
            remove();
            resolve(size);
          }
        });
      });
      expect(t.size).toBe(size);
    } finally {
      t.close();
    }
  });
});
