
# Overview

A Docker Compose deployment for [Deephaven](https://deephaven.io).

## Features

- [Deephaven](https://deephaven.io)
- [Groovy](https://groovy-lang.org/) scripting

## Launch Deephaven

For launch instructions, see the [README](https://github.com/deephaven/deephaven-core/#launch-groovy--java).  For full instructions to work with Deephaven, see the [Quick start](https://deephaven.io/core/docs/tutorials/quickstart).

To launch Deephaven, execute the following in your deployment directory:

```bash
compose_file=https://raw.githubusercontent.com/deephaven/deephaven-core/main/containers/groovy/docker-compose.yml
curl  -O "${compose_file}"

docker-compose pull
docker-compose up -d
```
