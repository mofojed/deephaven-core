// Bundles @deephaven/jsapi into one ES module for pages that load it without a bundler, such as the examples the
// server serves under /jsapi/v2/. The protocol bindings are not included: the client loads them from the server.
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const jsapiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [resolve(jsapiDir, 'src/index.ts')],
  outfile: resolve(jsapiDir, 'dist/browser/deephaven-jsapi.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  external: ['@deephaven/jsapi-core'],
  logLevel: 'info',
});
