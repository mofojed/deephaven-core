# @deephaven/jsapi

A TypeScript client for [Deephaven](https://deephaven.io/) Community Core: log in to a server, then fetch, create and
transform tables with the immutable table API, and read their data.

```ts
import { CoreClient } from '@deephaven/jsapi';

const client = new CoreClient('http://localhost:10000/');
await client.login({ type: CoreClient.LOGIN_TYPE_ANONYMOUS });

// Fetch a table a script created; operations return new tables and leave the original as it was
const table = await client.getObject({ name: 't' });
const sortedTable = await table.where('X > 5').sort([{ column: 'X', direction: 'DESC' }]);

// Read rows once...
const data = await sortedTable.createSnapshot({ rows: { first: 0, last: 9 } });
console.log(data.rows.map(row => row.get('X')));

// ...or subscribe to a range of rows that the server keeps up to date
const subscription = sortedTable.createViewportSubscription({ rows: { first: 0, last: 49 } });
subscription.addEventListener('updated', viewport => render(viewport));

// Every table awaited is owned by the caller, and must be closed
subscription.close();
sortedTable.close();
table.close();
await client.disconnect();
```

Operations made in the same task are sent to the server in one batch. A `PendingTable` may only be awaited or chained on
in the task that created it; to wait for several, use `Promise.all` (or `Promise.allSettled`, closing those that
arrived if any failed).

The client loads the server's protocol bindings, [`@deephaven/jsapi-core`](https://www.npmjs.com/package/@deephaven/jsapi-core),
from the server it connects to (`/jsapi/dh-core2.js`), so it always matches the server's version. Where that is not
possible, import them and pass them in: `new CoreClient(url, { coreModule: await import('@deephaven/jsapi-core') })`.

See [web/jsapi2](https://github.com/deephaven/deephaven-core/tree/main/web/jsapi2) for the design, and the example
pages a server serves at `/jsapi/v2/`.
