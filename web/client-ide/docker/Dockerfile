FROM deephaven/dhide:local-build as dhide

FROM deephaven/js-out:local-build as js-out

# Use a multi-stage build to build custom modules we need for nginx
ARG NGINX_VERSION=1.19.7
FROM nginx:${NGINX_VERSION} as BUILD

RUN wget "http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" && \
    tar -C /usr/src -xzvf nginx-${NGINX_VERSION}.tar.gz

WORKDIR /usr/src/nginx-${NGINX_VERSION}
RUN NGINX_ARGS=$(nginx -V 2>&1 | sed -n -e 's/^.*arguments: //p') \
    ./configure --with ${NGINX_ARGS} && \
    make modules

FROM nginx:${NGINX_VERSION}
COPY --from=dhide /usr/src/app/package/build /usr/share/nginx/html/ide
COPY --from=js-out /usr/src/app/raw-js-openapi/build/js-out /usr/share/nginx/html/jsapi
COPY --from=build /usr/src/nginx-${NGINX_VERSION}/objs/ngx_http_web_dav_module.so /usr/lib/nginx/modules/

COPY licenses/ /
COPY dhapi /usr/share/nginx/html/jsapi
COPY default.conf /etc/nginx/conf.d