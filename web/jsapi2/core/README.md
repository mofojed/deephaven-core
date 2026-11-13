# @deephaven/jsapi-core

The protocol of a [Deephaven](https://deephaven.io/) server: protobuf messages and gRPC service descriptors generated
from the server's .proto files, the Barrage and Arrow flatbuffer bindings, and the protobuf and flatbuffers runtimes.
It contains no client logic.

Every Deephaven server serves the build of this package that matches it as `/jsapi/dh-core2.js`.
[`@deephaven/jsapi`](https://www.npmjs.com/package/@deephaven/jsapi) loads it from there, and depends on this package
only for its types. Install it directly to bundle a copy, or to work with the protocol yourself:

```ts
import * as core from '@deephaven/jsapi-core';

const request = core.protobuf.create(core.table.EmptyTableRequestSchema, { size: '10' });
const bytes = core.protobuf.toBinary(core.table.EmptyTableRequestSchema, request);
console.log(core.table.TableService.method.emptyTable.name); // "EmptyTable"
```
