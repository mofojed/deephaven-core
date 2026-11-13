// Sets the version of both packages, and the version of @deephaven/jsapi-core that @deephaven/jsapi depends on, so the
// tarballs `npm pack` makes refer to each other. Usage: node scripts/set-version.mjs <version>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/set-version.mjs <version>');
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const pkg of ['core', 'jsapi']) {
  const path = resolve(root, pkg, 'package.json');
  const json = JSON.parse(readFileSync(path, 'utf8'));
  json.version = version;
  if (json.dependencies?.['@deephaven/jsapi-core'] != null) {
    json.dependencies['@deephaven/jsapi-core'] = version;
  }
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}
