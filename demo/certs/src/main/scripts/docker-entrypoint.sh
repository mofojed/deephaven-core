#!/bin/sh

echo Beginning wildcard cert generation

set -x


curl "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/deephaven-oss.svc.id.goog/" -H "Metadata-Flavor: Google"

curl "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/" -H "Metadata-Flavor: Google"

pip list

ls -la /var/run/secrets/kubernetes.io/serviceaccount/

[ -n "$DOMAIN" ] &&
  DOMAINS="${DOMAINS:-$DOMAIN,*.$DOMAIN}"

if [ -z "$EMAIL" ] || [ -z "$DOMAINS" ] || [ -z "$SECRET" ]; then
	echo "EMAIL, DOMAINS, SECRET env vars required"
	env
	exit 1
fi



NAMESPACE=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace) 2> /dev/null ||
  NAMESPACE=

cd $HOME
#certbot certonly --webroot -w $HOME -n --agree-tos --email ${EMAIL} --no-self-upgrade -d ${DOMAINS}
certbot certonly \
  --dns-google \
  --dns-google-propagation-seconds 60 \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --debug \
  --noninteractive \
  -d "$DOMAINS"
#  -d "demo.deephaven.app"
# We need a google-svc.json to be able to run locally, but kubernetes should have service account provide access
#  --dns-google-credentials /google-svc.json
#chmod 600 /google-svc.json


CERTPATH=/etc/letsencrypt/live/$(echo "${DOMAINS//\*./}" | cut -f1 -d',')

ls $CERTPATH || exit 1

cat /rx/secret-patch-template.json | \
	sed "s/NAMESPACE/${NAMESPACE}/" | \
	sed "s/NAME/${SECRET}/" | \
	sed "s/TLSCERT/$(cat ${CERTPATH}/fullchain.pem | base64 | tr -d '\n')/" | \
	sed "s/TLSKEY/$(cat ${CERTPATH}/privkey.pem |  base64 | tr -d '\n')/" \
	> /tmp/secret-patch.json

ls /tmp/secret-patch.json || exit 1

# update secret
curl -v --cacert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt -H "Authorization: Bearer $(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" -k -v -XPATCH  -H "Accept: application/json, */*" -H "Content-Type: application/strategic-merge-patch+json" -d @/tmp/secret-patch.json https://kubernetes/api/v1/namespaces/${NAMESPACE}/secrets/${SECRET}