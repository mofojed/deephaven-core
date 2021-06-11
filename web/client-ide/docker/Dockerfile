FROM deephaven/dhide:local-build as dhide

FROM deephaven/js-out:local-build as js-out

# https://stackoverflow.com/questions/57739560/what-do-i-need-to-change-in-nginx-official-dockers-image-to-have-the-set-misc-n
# Use a multi-stage build to build custom modules we need for nginx
ARG NGINX_VERSION=1.19.7
FROM docker.io/library/nginx:1.19.7 as build

RUN apt-get update && \
    apt-get install -y \
        openssh-client \
        wget \
        libpcre3 \
        libpcre3-dev \
        zlib1g \
        zlib1g-dev \
        openssl \
        libssl-dev \
        libtool \
        automake \
        gcc \
        g++ \
        make && \
    rm -rf /var/cache/apt

RUN wget "http://nginx.org/download/nginx-1.19.7.tar.gz" && \
    tar -C /usr/src -xzvf nginx-1.19.7.tar.gz

WORKDIR /usr/src/nginx-${NGINX_VERSION}
RUN NGINX_ARGS=$(nginx -V 2>&1 | sed -n -e 's/^.*arguments: //p') \
    ./configure --with-http_dav_module --with-http_ssl_module ${NGINX_ARGS} && \
    make modules

# FROM docker.io/library/nginx:1.19.7
COPY --from=dhide /usr/src/app/package/build /usr/share/nginx/html/ide
COPY --from=js-out /usr/src/app/raw-js-openapi/build/js-out /usr/share/nginx/html/jsapi
# COPY --from=build /usr/src/nginx-1.19.7/objs/ngx_http_web_dav_module.so /usr/lib/nginx/modules/

COPY licenses/ /
COPY dhapi /usr/share/nginx/html/jsapi
COPY default.conf /etc/nginx/conf.d