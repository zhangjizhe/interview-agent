FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
WORKDIR /gateway
COPY --chown=node:node gateway.mjs entrypoint.sh ./
USER node
ENTRYPOINT ["/bin/sh", "/gateway/entrypoint.sh"]
