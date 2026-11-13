// Generates TypeScript protobuf bindings into src/gen from the server's .proto files.
//
// The proto files are read from DH_PROTO_DIR, or from web/jsapi2/build/proto, which the Gradle task
// `:web-jsapi2:syncProtos` populates with the Deephaven protos plus Flight.proto and BrowserFlight.proto
// (extracted from the Arrow Flight and Barrage jars the server is built with).
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const coreDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const protoDir = resolve(coreDir, process.env.DH_PROTO_DIR ?? '../build/proto');

for (const required of ['deephaven_core/proto/table.proto', 'Flight.proto', 'BrowserFlight.proto']) {
  if (!existsSync(resolve(protoDir, required))) {
    console.error(
      `Missing ${required} in ${protoDir}.\n` +
        'Run `./gradlew :web-jsapi2:syncProtos` from the repository root, or set DH_PROTO_DIR.'
    );
    process.exit(1);
  }
}

rmSync(resolve(coreDir, 'src/gen'), { recursive: true, force: true });
execFileSync('buf', ['generate', protoDir, '--template', 'buf.gen.yaml'], {
  cwd: coreDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
