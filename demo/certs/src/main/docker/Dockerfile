FROM certbot/dns-google:v1.21.0

COPY ./rx /rx

ENV SECRET=deephaven-app-cert
ENV EMAIL=operations@deephaven.io
ENV DOMAIN=demo.deephaven.app

RUN chmod -R +x /rx && \
    apk --no-cache add curl && \
    python -m pip install --upgrade pip && \
    pip install --upgrade google-api-python-client>=1.6

ENTRYPOINT ["/rx/docker-entrypoint.sh"]