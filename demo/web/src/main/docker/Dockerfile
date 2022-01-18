FROM deephaven/web:local-build

# RUN mkdir -p /data/notebooks; \
#     chown www-data:www-data /data/notebooks; \
#     mkdir -p /data/layouts; \
#     chown www-data:www-data /data/layouts; \
#     chown -R nginx:nginx /var/lib/nginx;

COPY --chown=www-data layouts/ /data/layouts

COPY --chown=www-data notebooks/ /data/notebooks