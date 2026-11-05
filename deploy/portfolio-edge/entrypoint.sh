#!/bin/sh
set -eu
# A restart intentionally waits for local secret reinjection; never start unauthenticated.
while [ ! -s /run/secrets/portfolio-gateway-key ]; do sleep 1; done
exec node /gateway/gateway.mjs
