FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# Jalankan validasi di dalam Docker sebelum di-build
RUN bun run typecheck
RUN bun run lint
RUN bun run build

FROM node:22-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache bash nginx su-exec

ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1/').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["/usr/local/bin/docker-entrypoint.sh"]