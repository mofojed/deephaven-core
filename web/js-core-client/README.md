# @deephaven/js-core-client

A TypeScript client for Deephaven Core. Pairs with the thin OpenAPI / gRPC-web
layer that a Deephaven server serves at `/jsapi/dh-internal.js`.

## Status

Scaffold / first slice. Only supports:

- `new CoreClient(serverUrl)` — construct a client.
- `client.login({ type: "anonymous" })` or `{ type: "password", username, token }`.
- `client.getTable(name)` — fetch a scope table by variable name.
- `await table.size()` — resolve to the current row count reported by the
  server's initial `ExportedTableCreationResponse`.

Filtering, sorting, viewports, subscriptions, figures, hierarchical tables, and
most of what `@deephaven/jsapi-types` describes are **not yet implemented**.

## Example

```ts
import { CoreClient } from '@deephaven/js-core-client';

const client = new CoreClient('http://localhost:10000/');
await client.login({ type: 'anonymous' });
const table = await client.getTable('my_table');
console.log(await table.size());
```

The runtime dynamically imports the proto / gRPC-web stubs from
`${serverUrl}/jsapi/dh-internal.js`. The version of that file must match the
server you're talking to.
