# @deephaven/js-core-client

A TypeScript client for Deephaven Core. Pairs with the thin OpenAPI / gRPC-web
layer that a Deephaven server serves at `/jsapi/dh-internal.js`.

## Status

Scaffold + first two slices. Supports:

- `new CoreClient(serverUrl)` — construct a client.
- `client.login({ type: "anonymous" })` or `{ type: "password", username, token }`.
- `client.getTable(name)` — fetch a scope table by variable name.
- `await table.size()` — resolve to the current row count reported by the
  server's initial `ExportedTableCreationResponse`.
- `table.setViewport({ firstRow, lastRow, columns? })` — configure a viewport.
  Negative bounds are tail-relative (e.g. `{ firstRow: -10, lastRow: -1 }` =
  the last 10 rows, sent to the server as a reverse viewport).
- `table.onUpdate(handler)` / `table.onSizeUpdate(handler)` — subscribe to
  viewport updates and/or size updates. Returns a cleanup function; when the
  last listener detaches the subscription is closed and the server-side export
  is released.
- `table.copy()` — sibling `Table` sharing the server ticket but with an
  independent viewport/listener set.

Filtering, sorting, figures, hierarchical tables, console sessions, and most
of what `@deephaven/jsapi-types` describes are **not yet implemented**.

### Status of ticking

End-to-end live viewports work against `./gradlew server-jetty-app:run -Panonymous`:

- Static tables (`empty_table(...).update_view([...])`) — immediate render.
- Append-only ticking tables (`time_table(...).update_view([...])`) — viewport fills
  as rows arrive.
- Insertion-at-top with shifts (`time_table(...).reverse()`) — new rows appear at
  the top of the viewport and older rows shift down; the oldest drops off the
  bottom once the viewport is full.

Column modifications (`modColumnNodes`) are not yet applied — value updates to
already-visible rows (e.g. `live_max`, stateful aggregations with in-place
changes) won't surface until a follow-up.

## Example

```ts
import { CoreClient } from '@deephaven/js-core-client';

const client = new CoreClient('http://localhost:10000/');
await client.login({ type: 'anonymous' });
const table = await client.getTable('my_table');

const cleanup = table.onUpdate((u) => {
  console.log(`rows ${u.firstRow}..${u.lastRow} of ${u.size}`, u.rows);
});
table.setViewport({ firstRow: 0, lastRow: 9 });

// Later…
cleanup();
```

The runtime dynamically imports the proto / gRPC-web stubs from
`${serverUrl}/jsapi/dh-internal.js`. The version of that file must match the
server you're talking to.
