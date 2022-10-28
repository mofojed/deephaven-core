#!/usr/bin/env bash

set -e

# run tsickle on the unmodified .d.ts files
node node_modules/.bin/tsickle --externs=externs.js -- --build

# remove marker, now that the package structure is set up
sed -i '5,10d' externs.js

# prepend missing consts, to be used after we rewrite $s into .s
consts='browserHeaders grpcWeb.transports.http grpcWeb.transports grpcWeb io.deephaven.proto io.deephaven.barrage.flatbuf flatbuffers io.deephaven.barrage io.deephaven io arrow.flight.protocol arrow.flight.flatbuf arrow.flight arrow'
for n in $consts
do
  sed -i "5i/** @const */ dhinternal.$n = {};" externs.js
done
sed -i '5i/** @const */ var dhinternal = {};' externs.js

# rewrite $ in the generated externs to .s instead, removing var as needed

#replace '^var ([a-zA-Z]+\$)' with '$1'
sed -i 's/^var \([a-zA-Z]*\$\)/\1/g' externs.js

#replace '^([a-zA-Z.]+)\$' with '$1.', 3x-ish
sed -i 's/\([a-zA-Z]*\)\$/\1\./g' externs.js

sed -i 's/_improbable_eng\.grpc_web/grpcWeb/g' externs.js
sed -i 's/jspb\.index/jspb/g' externs.js
sed -i 's/grpcWeb\.index/grpcWeb/g' externs.js
sed -i 's/google_protobuf/jspb/g' externs.js
sed -i 's/browserHeaders\.BrowserHeaders/browserHeaders/g' externs.js

# this is in the wrong namespace
sed -i 's/grpcWeb\.Code/grpcWeb.grpc/g' externs.js

# remove typedefs, this leaves some other lines a bit broken, we should iterate and rewrite both.
sed -i '/@typedef/{N;d;}' externs.js

# remove Object<Number, ?> decls
sed -i '/Object<number/{N;d;}' externs.js

# strip browser_headers.BrowserHeaders, just use the subtype for now
sed -i 's/_\.\.\.\.\.node_modules\.browser_headers\.dist\.typings\.BrowserHeaders/dhinternal.browserHeaders.BrowserHeaders/g' externs.js
# fix broken reference to BrowserHeaders
sed -i '/dhinternal.grpcWeb.metadata.Metadata = BrowserHeaders;/{N;d;}' externs.js
# and metadata too, since that confuses tsickle/closure too much
sed -i 's/dhinternal.grpcWeb.metadata.Metadata/dhinternal.browserHeaders.BrowserHeaders/g' externs.js
sed -i 's/grpcWeb.grpc.Metadata/dhinternal.browserHeaders.BrowserHeaders/g' externs.js

sed -i 's/dhinternal.browserHeaders.BrowserHeaders.BrowserHeaders/dhinternal.browserHeaders.BrowserHeaders/g' externs.js

sed -i 's/^flatbuffers./dhinternal.flatbuffers./g' externs.js
sed -i 's/{flatbuffers./{dhinternal.flatbuffers./g' externs.js
sed -i 's/{!flatbuffers./{!dhinternal.flatbuffers./g' externs.js

# This next step will fail, but it will generate nearly-correct java
bazel build //:openapi || true

# Unpack the generated java so we can copy into deephaven/core
rm -rf java
mkdir java
cd java
unzip ../bazel-bin/openapi__internal_src_generated.srcjar
cd -

