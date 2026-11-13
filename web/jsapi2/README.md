# TypeScript JS API

A TypeScript client for Deephaven, in two packages:

| Package | Served as | What it is |
| --- | --- | --- |
| [`@deephaven/jsapi-core`](core) | `/jsapi/dh-core2.js` | The server's protocol, and nothing else: protobuf messages and gRPC service descriptors generated from [`proto/`](../../proto) at build time, the Barrage and Arrow flatbuffer bindings, and the runtimes they need. |
| [`@deephaven/jsapi`](jsapi) | npm (and `/jsapi/v2/deephaven-jsapi.js` for the examples) | The client: transports, sessions and authentication, Barrage decoding, and the immutable table API. It loads `dh-core2.js` from the server it connects to, so it always speaks that server's protocol. |

The GWT API at `/jsapi/dh-core.js` is unchanged, so existing clients keep working.

```ts
import { CoreClient } from '@deephaven/jsapi';

const client = new CoreClient('http://localhost:10000/');
await client.login({ type: CoreClient.LOGIN_TYPE_ANONYMOUS });
const table = await client.getObject({ name: 't' });
const sortedTable = await table.sort('X'); // immutable: table is unchanged
const subscription = sortedTable.createViewportSubscription({ rows: { first: 0, last: 49 } });
subscription.addEventListener('updated', data => {
  for (const row of data.rows) console.log(row.position, row.get('X'));
});
// ... later
subscription.close();
sortedTable.close();
table.close();
```

Example pages are in [`examples/`](examples), served at `/jsapi/v2/index.html`.

## Layout

```
web/jsapi2/
  jsapi2.gradle          Gradle project :web-jsapi2 (builds everything below in the node Docker image)
  package.json           npm workspace of core/ and jsapi/
  core/
    flatbuf/*.fbs        vendored Barrage and Arrow schemas
    src/flatbuf/         flatc output, checked in (scripts/generate-flatbuf.sh regenerates it)
    src/gen/             protobuf-es output, generated at build time (not checked in)
    src/index.ts         what dh-core2.js exports
  jsapi/
    src/                 the client; src/index.ts is the public API
    test/unit/           tests of the decoding and data handling
    test/integration/    tests against a running server
  examples/              pages served under /jsapi/v2/
```

## Building

Gradle builds both packages and the examples in the `deephaven/node` Docker image, runs the type checks and unit
tests, and packs the npm tarballs:

```sh
./gradlew :web-jsapi2:assemble
```

The output in `build/jsapi2/` is `js/jsapi/dh-core2.js`, `js/jsapi/v2/*` (both added to the server's web resources by
`:web`, so `./gradlew server-jetty-app:run` serves them) and `npm/*.tgz`.

To work with npm directly (Node 20 or later), gather the .proto files once, then build:

```sh
./gradlew :web-jsapi2:syncProtos   # copies the .proto files into build/proto
cd web/jsapi2
npm ci
npm run build                      # core: generate, compile, bundle; then jsapi: compile, bundle
npm test                           # unit tests
npm run typecheck
```

Run `syncProtos` again after changing a .proto file.

The integration tests need a running server that allows anonymous login:

```sh
docker run --rm -p 10000:10000 \
  -e START_OPTS="-DAuthHandlers=io.deephaven.auth.AnonymousAuthenticationHandler" ghcr.io/deephaven/server:edge
cd web/jsapi2/jsapi
DH_TEST_SERVER=http://localhost:10000/ npm run test:integration
```

They use the websocket transport. To also test grpc-web over fetch, which needs HTTP/2 and so TLS, set
`DH_TEST_HTTPS_SERVER` to the URL of a server with TLS enabled (a self-signed certificate is accepted).

## Design

### Protocol bindings

`dh-core2.js` is generated with [protobuf-es](https://github.com/bufbuild/protobuf-es) from the same .proto files the
server is built from, and bundled with esbuild. It re-exports the protobuf runtime functions (`create`, `toBinary`,
`fromBinary`) so a client uses the runtime its descriptors were built with. `@deephaven/jsapi` only imports its types;
at runtime `CoreClient` loads it from `new URL('jsapi/dh-core2.js', serverUrl)`. Pass `coreModule` to `CoreClient` to
use a bundled copy instead, as the integration tests do.

protobuf-es is pinned to 2.13, the last release that supports Node 20, which the `deephaven/node` image provides.

### Transports

Both are implemented in `jsapi/src/grpc/transports.ts`:

- **Websocket** (default for `http:`): Deephaven's `grpc-websockets-multiplex` protocol, with every call on one
  websocket. It supports client streaming, so Barrage subscriptions use real `DoExchange` streams. Browsers only reach a
  plain-`http:` server over HTTP/1.1, which allows few concurrent fetch streams, hence the default.
- **Fetch** (default for `https:`): grpc-web over `fetch`. The server only accepts grpc-web over HTTP/2. Fetch cannot
  stream requests, so `DoExchange` is emulated with the `BrowserFlightService` (`OpenDoExchange` plus `NextDoExchange`
  calls tied together by an export ticket), as the GWT client does.

### Sessions

`login` sends the credentials in the `Authorization` header of a `GetConfigurationConstants` call. The server answers
with a bearer token, used for every later call and refreshed every half `http.session.durationMs`.

### The immutable table API

Every operation queues a `BatchTableRequest` operation with its own export ticket, and the operations of one microtask
go to the server as one batch, so chains like `t.where(...).sort(...).head(10)` cost one round trip. A `PendingTable` is
a thenable that resolves to a `ResolvedTable`. Tickets are reference counted (`TableState`):

- a pending table holds its export until the end of the task that created it;
- awaiting or resolving it hands a reference to the `ResolvedTable`, which the caller closes;
- an operation holds each table it reads until it has its own result;
- a ticket is released once nothing holds it, but only after the server has answered for it.

As in the GWT API, a pending table may only be used in the task that created it, and a later use rejects. `copy()`
gives another handle on a resolved table, with its own lifetime.

### Data

Snapshots (`BarrageSnapshotRequest`) and viewport subscriptions (`BarrageSubscriptionRequest`) are read by
`BarrageMessageReader`, which decodes the Arrow record batches into JS values (`data/arrow.ts`), including the
dictionary and run-end encodings the server picks for repetitive columns. Viewport updates are in position space, so a
viewport's data is a flat array per column (`data/ViewportState.ts`).

Values are `number` for byte, short, int, float and double; `bigint` for long and BigInteger; `string` for char,
String and BigDecimal (in decimal notation); `boolean`; `DateTime` (epoch nanoseconds as a `bigint`, with `toDate()`
and an ISO `toString()`) for Instant and ZonedDateTime; `YYYY-MM-DD` and `HH:MM:SS[.fffffffff]` strings for LocalDate
and LocalTime; arrays for array and vector columns; and `null` for nulls.

### Not yet supported

This first version covers the core of the immutable table API. Not yet implemented: full (non-viewport) subscriptions,
structured filters (`where` takes query-language strings, which the server parses and validates), as-of and range
joins, `updateBy`, rollups and tree tables, partitioned tables, input tables, and fetching objects other than tables.
