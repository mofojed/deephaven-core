#!/usr/bin/env bash
# Regenerates the checked-in flatbuffer bindings in src/flatbuf from the vendored schemas in flatbuf/.
# Requires flatc 25.2.10 (matching the pinned `flatbuffers` runtime) on the PATH, or FLATC set:
# https://github.com/google/flatbuffers/releases/tag/v25.2.10
#
# flatbuf/Barrage.fbs is from https://github.com/deephaven/barrage (format/Barrage.fbs), matching the
# barrage-format version the server uses; Message.fbs, Schema.fbs, SparseTensor.fbs and Tensor.fbs are from
# https://github.com/apache/arrow/tree/apache-arrow-19.0.0/format.
set -euo pipefail
cd "$(dirname "$0")/../flatbuf"
FLATC="${FLATC:-flatc}"
rm -rf ../src/flatbuf
"$FLATC" --ts --gen-all -o ../src/flatbuf/arrow Message.fbs
"$FLATC" --ts -o ../src/flatbuf/barrage Barrage.fbs

# flatc writes the namespace index files with import paths relative to the wrong directory; point them at the
# generated files next to them.
sed -i.bak "s#from './apache/arrow/flatbuf/#from './flatbuf/#" ../src/flatbuf/arrow/org/apache/arrow/flatbuf.ts
sed -i.bak "s#from './deephaven/barrage/flatbuf/#from './flatbuf/#" ../src/flatbuf/barrage/io/deephaven/barrage/flatbuf.ts
rm ../src/flatbuf/arrow/org/apache/arrow/flatbuf.ts.bak ../src/flatbuf/barrage/io/deephaven/barrage/flatbuf.ts.bak
