#!/usr/bin/env bash
set -o errexit
set -o pipefail
set -o nounset

mkdir -p /data/notebooks
chown nginx /data/notebooks

mkdir -p /data/layouts
chown nginx /data/layouts

mkdir -p /data/js-plugins
chown nginx /data/js-plugins

# Install node/npm
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y nodejs

# TODO: Then make scripts to install a plugin? E.g. ./install-js-plugin.sh @deephaven/my-plugin
# install-js-plugin.sh then does something like:
# cd /tmp/js-plugins
# npm pack @deephaven/grid
# tar --touch -xf deephaven-grid-0.9.0.tgz
# # Need to move to a directory with the name of the plugin
# mv package /data/js-plugins/@deephaven%2Fgrid