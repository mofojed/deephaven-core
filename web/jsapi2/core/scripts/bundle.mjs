// Bundles the protocol bindings, with their protobuf and flatbuffers runtimes, into the single
// ES module the server serves as /jsapi/dh-core2.js.
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const coreDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [resolve(coreDir, 'src/index.ts')],
  outfile: resolve(coreDir, 'dist/dh-core2.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  target: 'es2022',
  minify: true,
  sourcemap: true,
  legalComments: 'linked',
  logLevel: 'info',
});
