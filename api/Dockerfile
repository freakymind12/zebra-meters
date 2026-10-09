# =============================================================================
# ZebraMeter — API image (Bun + Hono + Drizzle)
# Build : docker build -t zebrameter-api .
# Run   : lebih nyaman lewat docker compose (lihat docker-compose.yaml)
# =============================================================================

FROM oven/bun:1

WORKDIR /app

# --------------------------------------------------
# 0) Root CA tambahan (opsional tapi penting di
#    jaringan dengan SSL inspection / TLS MITM,
#    mis. Zscaler): tanpa ini `bun install` gagal
#    dengan UNABLE_TO_GET_ISSUER_CERT_LOCALLY.
#    File .crt = PEM (export dari Cert:\LocalMachine\Root).
# --------------------------------------------------
COPY certs ./certs
RUN if ls certs/*.crt >/dev/null 2>&1; then \
      cp certs/*.crt /usr/local/share/ca-certificates/ && \
      update-ca-certificates; \
    fi

# --------------------------------------------------
# 1) Dependensi dulu (layer cache — berubah hanya
#    saat package.json / bun.lock berubah)
# --------------------------------------------------
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --------------------------------------------------
# 2) Source code + konfigurasi
#    (.env TIDAK di-copy — lihat .dockerignore;
#     nilai env disuplai oleh docker-compose)
# --------------------------------------------------
COPY src ./src
COPY drizzle.config.ts tsconfig.json ./

# --------------------------------------------------
# 3) Runtime
#    - drizzle-kit push : bikin/sinkronkan tabel (idempoten)
#    - bun src/index.ts : jalankan server Hono (auto-serve)
# --------------------------------------------------
ENV PORT=3000 \
    NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "bunx drizzle-kit push && bun src/index.ts"]
