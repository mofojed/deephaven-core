# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build system

Deephaven Core is a multi-language monorepo built with Gradle (~150 subprojects). Root entry points:

- `./gradlew server-jetty-app:run -Panonymous` — **preferred** for local development: build and run the Java server (Python console) with anonymous authentication so no PSK prompt is needed.
- `./gradlew server-jetty-app:run -Panonymous -Pgroovy` — same, with the Groovy console.
- `./gradlew server-jetty-app:run -Panonymous -Pdebug` — also attach a JVM debugger on port 5005. Combine with `-PdevCerts`, `-PdevMTLS`, `-Ppsk=<key>`, `-PgcApplication`, or `-Pquiet` as needed. See `server/jetty-app/README.md` for full flag documentation.
- `./gradlew server-jetty-app:installDist` then `./server/jetty-app/build/install/server-jetty/bin/start` — production-like start script, faster when iterating only on Python (no Java recompile per start).
- `./gradlew spotlessApply` — apply the project-wide styleguide; required before opening PRs (see `style/README.md`).
- `./gradlew smoke` — lifecycle task intended for local "is the build OK" checks (GWT compile, test compile, spotlessCheck, key Docker prepare, web assemble).
- `./gradlew nightly` — aggregates `check`, `testOutOfBand`, `testSerial`, `testParallel` across all projects (mirrors nightly CI).
- Version is computed from `gradle.properties` (`deephavenMajorVersion`, `deephavenMinorVersion`, `deephavenBaseQualifier`); `./gradlew printVersion` echoes it.

### JVM arguments for the dev server

Per `server/jetty-app/README.md`, override JVM args via:

- `START_OPTS="-Xmx12g"` env var (user heap/GC overrides), or
- `JAVA_OPTS="..."` env var (replaces Deephaven's recommended JVM args), or
- Gradle properties `deephaven.startOpts` / `deephaven.javaOpts` (take precedence over env vars). Persist these in `~/.gradle/gradle.properties` for a durable config.

Deephaven properties can be set via `-Dmy.property=my.value` or a `deephaven.prop` file at `~/.config/deephaven/` (Linux) / `~/Library/Application Support/io.Deephaven-Data-Labs.deephaven/` (macOS).

## Testing

Each Java subproject has multiple test task types configured in `buildSrc/src/main/groovy/io.deephaven.java-test-conventions.gradle`:

- `test` — standard JUnit tests, run in parallel up to CPU count.
- `testOutOfBand`, `testSerial`, `testParallel` — additional test categorizations invoked by the `nightly` task.
- Run a single project's tests: `./gradlew :engine-table:test`.
- Run a single test class/method: `./gradlew :engine-table:test --tests 'io.deephaven.engine.table.impl.TestJoin.testNaturalJoin'`.
- `-PforceTest=true` disables up-to-date caching, forcing a re-run.
- `-PshortTests=true` sets `TstUtils.shortTests` system property.
- `-PshowStandardStreams=true` to see stdout/stderr.
- `-PdebugCITests=true` prints before/after per-test messages.

### Python tests

Python unit tests must be run from the repo root via Gradle, not pytest directly:

```sh
./gradlew integrations:test-py-deephaven
```

### Proto regeneration

When `.proto` files under `proto/proto-backplane-grpc/src/main/proto/` change, Java is regenerated automatically by the build, but non-Java clients are manual:

```sh
./gradlew :py-client:updateProtobuf :go:updateProtobuf :cpp-client:updateProtobuf
```

## Python development

See `py/README.md`. Always work from a venv (`python3 -m venv .venv && source .venv/bin/activate`).

- **Editable install** (recommended for frequent Python changes): `DEEPHAVEN_VERSION=0.dev pip install -e "py/server[autocomplete]"`. Changes take effect on Java-server restart.
- **Wheel install** (more production-like): `./gradlew :py-server:assemble` → `pip install --force py/server/build/wheel/deephaven_core-<version>-py3-none-any.whl`. Rebuild/reinstall the wheel on every Python code change. Add `:py-embedded-server:assemble` + install its wheel to use pip-installed Deephaven.

## Repository architecture

Deephaven Core is a real-time, column-oriented analytics engine with a Java server and clients in many languages. The high-level layering:

### Engine (`engine/`)

The core ticking-table engine — columnar data structures, update propagation, and table ops. Key submodules:

- `engine/api` — public interfaces (Table, ColumnSource, etc.).
- `engine/table` — concrete table implementations and operations (joins, selects, aggregations, update-by, etc.); the largest and most active module.
- `engine/rowset` — compressed, sorted row-key sets (the primary addressing abstraction for sparse tables).
- `engine/updategraph` — the dependency graph that drives incremental recomputation on each tick.
- `engine/chunk`, `engine/vector`, `engine/primitive`, `engine/tuple`, `engine/tuplesource` — columnar data movement and batch primitives used by table ops.
- `engine/context` — `ExecutionContext` / `QueryScope` thread-local plumbing.
- `engine/time`, `engine/function`, `engine/stringset`, `engine/sql`, `engine/processor` — supporting services.

Shared foundations outside `engine/`: `Base`, `Util`, `IO`, `DataStructures`, `Configuration`, `log-factory`, `hotspot`, `clock`.

### Query abstractions (`qst/`, `table-api/`)

`table-api` defines the language-neutral `TableOperations` surface; `qst` (Query Syntax Tree) is the serializable AST the gRPC `BatchTableRequest` operates on. Client APIs produce QST nodes that the server materializes into engine Tables.

### Wire protocol (`proto/`)

Source of truth for all client↔server communication:

- `proto/proto-backplane-grpc` — Deephaven's own gRPC service definitions (session, console, table, hierarchicaltable, plugin, etc.).
- `proto/proto-backplane-grpc-flight` — Arrow Flight service bindings.
- `proto/raw-js-openapi` — OpenAPI spec generated for the JS client.

Ticking data is delivered via [Barrage](https://github.com/deephaven/barrage), an Arrow-Flight-based protocol for incremental table updates.

### Server (`server/`)

- `server/src` — common server logic (gRPC service implementations, session management, script sessions for Python/Groovy).
- `server/jetty`, `server/jetty-app` — primary embedded Jetty 12 server + the runnable application. `jetty-app-custom` is the template for custom server builds.
- `server/jetty-11`, `server/jetty-app-11`, `server/jetty-app-custom-11` — Jetty 11 variants for environments that need Java EE 9 compat.
- `server/netty`, `server/netty-app` — alternative Netty-based server.

### Client APIs

- `java-client/` — Java client (`session`, `flight`, `barrage`, Dagger-wired variants, example utilities).
- `py/client` and `py/client-ticking` — Python client (static and ticking).
- `py/server` and `py/embedded-server` — the Python server wrapper (what `deephaven-core` and `deephaven-server` wheels ship).
- `go/` — Go client.
- `cpp-client/` — C++ client (with R bindings in `R/rdeephaven/` on top).
- `web/` — JavaScript / TypeScript client stack: `web/client-api` (JsAPI, compiled from Java-to-JS via GWT → `web-client-api` Gradle project), `web/shared-beans`, `web/client-ide`, `web/client-ui`, `web/client-embed-grid`, `web/jupyter-grid`. The older OpenAPI parser lives in `open-api/`. When the server is running locally, `http://localhost:10000/jsapi/` serves the JS API examples page — useful for ad-hoc JS API debugging against a live server.
- `csharp/` — C# client.

Note: Java server sources live in `server/` and `engine/` modules; `py/`, `go/`, `cpp-client/`, `web/`, `R/`, `java-client/`, and `csharp/` are **clients only** — none of them run the server.

### Extensions & integrations (`extensions/`, `Integrations/`, `plugin/`)

- `extensions/` — pluggable data sources and formats: `arrow`, `barrage`, `parquet`, `iceberg`, `kafka`, `s3`, `jdbc`, `csv`, `json`/`json-jackson`, `protobuf`, `bson-jackson`, `flight-sql`, `trackedfile`, `source-support`.
- `Integrations/` — Python ↔ Java glue (jpy-based), including the Python engine bindings used by the Python server.
- `plugin/` — plugin SPI and built-in plugins (figure, echo, etc.).

### Supporting utilities

- `authentication/`, `authorization/`, `authorization-codegen/` — auth handlers (PSK, anonymous, mTLS) and codegen for authorization wrappers.
- `Plot/` — the plotting API.
- `ModelFarm/`, `BenchmarkSupport/`, `ClientSupport/` — domain-specific helpers.
- `sql/` — SQL support (see `sql/DEVELOPMENT.md`).
- `replication/`, `codegen/`, `Generators/` — code generation used to produce primitive-specialized variants of classes (run via `replication-static`, `replication-reflective`). Always regenerate rather than hand-editing generated files.
- `buildSrc/` — Gradle convention plugins (`io.deephaven.*`). When adding a new subproject, apply the appropriate `io.deephaven.project.*` convention.

### Docker (`docker/`, `containers/`)

- `docker/` — Dockerfiles and image build tasks (`:docker-server-jetty`, `:docker-server-slim`, etc.).
- `containers/` — example `docker-compose.yml` stacks. `prepareCompose` builds local images for `docker-compose.yml` in the repo root.

## Docs workflow (`docs/`)

User-facing product docs live in `docs/{python,groovy}/` as Markdown. The toolchain requires Docker.

- `./docs/start [-p <port>]` — local preview on port 3001.
- `./docs/format` — run `dprint` in Docker (config in `docs/dprint.json`).
- `./docs/validate` — link check and code-block compilation.
- `./docs/updateSnapshots [-t local]` — re-snapshot all fenced `python`/`groovy` code blocks. Use `-t local` against a locally built server when documenting a new feature.
- Every doc page must be registered in `docs/{python,groovy}/sidebar.json` to appear in the sidebar.
- Images go in `docs/{python,groovy}/assets/`; file/folder names are kebab-case.
- Style guide lives in `.windsurf/rules` (sentence-case headings, active voice, no parens after method names in prose, backticks for `methods`/`Classes`/`variables`/`/paths`, em dashes with spaces — like this, proper-noun capitalization for Core+/Enterprise/Persistent Query/etc.). `.github/copilot-instructions/docs.instructions.md` is a narrower subset applied by Copilot.
- Workflow slash commands for docs work (defined in `.windsurf/workflows/`): `/format-docs`, `/create-groovy-version`, `/add-to-sidebar`, `/accuracy-check`.

## Contribution conventions

- Follow the forking workflow (`origin` = your fork, `upstream` = `deephaven/deephaven-core`). See `CONTRIBUTING.md`.
- Every PR needs exactly one of `ReleaseNotesNeeded` / `NoReleaseNotesNeeded` and one of `DocumentationNeeded` / `NoDocumentationNeeded` (enforced in review).
- Run `./gradlew spotlessApply` before committing; the project-wide styleguide is auto-enforced.
- Generated files (replication output, protobuf output, GWT output) are checked in — regenerate with the appropriate task instead of editing by hand.
- Java 11–22 is supported; Gradle uses toolchain auto-provisioning to pick the right JDK. JDK 21 is the typical build target.
- The build writes transient state to `$rootDir/tmp/`, `$rootDir/test/`, and `$rootDir/target/`; these are cleaned by `./gradlew clean`.
