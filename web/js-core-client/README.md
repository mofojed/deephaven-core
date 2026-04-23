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

### Known limitation (follow-up work)

The `Flight.DoExchange` round trip against Deephaven's default non-multiplex
`grpc-websockets` endpoint does not yet yield snapshot data end-to-end. The
request is sent and accepted by the server (status=0), but no `FlightData`
response frames are returned to the client. Unit tests against a synthetic
mock transport pass, so the Barrage pipeline (flatbuffer encode/decode,
RangeSet, column store, viewport slicing) is exercised and correct. The issue
is localized to the WebSocket / bidi-stream handshake with Deephaven's server
handler; the legacy `dh-core.js` side-steps this by using the
`grpc-websockets-multiplex` subprotocol (not supported by the upstream
`@improbable-eng/grpc-web` we rely on).

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
