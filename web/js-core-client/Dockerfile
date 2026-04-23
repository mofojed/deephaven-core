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

RUN set -eux; \
    npx esbuild dist/index.js --bundle --format=esm --outfile=dist-browser/index.js --platform=browser --legal-comments=none

# Stage the files we want to serve at /jsapi/js-core-client/. The browser
# bundle is the single entry point; demos import from ./index.js.
RUN set -eux; \
    mkdir -p /out/js-core-client; \
    cp dist-browser/index.js /out/js-core-client/index.js; \
    cp -R examples/. /out/js-core-client/
