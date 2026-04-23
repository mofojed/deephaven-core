FROM deephaven/node:local-build
WORKDIR /usr/src/app
ENV CI=true
COPY . .

# --unsafe-perm so npm can run node-gyp etc. as root
RUN set -eux; \
    npm install --unsafe-perm

RUN set -eux; \
    npx vitest run; \
    npx tsc -p tsconfig.build.json

# Stage the files we want to serve at /jsapi/js-core-client/
RUN set -eux; \
    mkdir -p /out/js-core-client; \
    cp -R dist/. /out/js-core-client/; \
    cp -R examples/. /out/js-core-client/
