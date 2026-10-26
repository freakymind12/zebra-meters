# ZebraMeter

**ZebraMeter** adalah monorepo untuk membaca data *meter / odometer* dari printer label **Zebra** (mis. ZT620) melalui jaringan, lalu menyimpannya ke **MySQL** lewat **API** berbasis Hono + Drizzle ORM — siap dikonsumsi sistem MES.

```
Zebra Printer (TCP 9100)
        │
        ▼
clients/collect-zebra.ps1  ──HTTP POST──▶  api/ (Hono + Drizzle ORM)  ──▶  MySQL
```

## Struktur Monorepo

```
ZebraMeter/
│
├── api/                      # REST API — Bun + Hono + Drizzle ORM + MySQL
│   ├── src/
│   │   ├── index.ts          # Entry point (mount route, Swagger UI, global error handler)
│   │   ├── config/
│   │   │   ├── env.ts        # Validasi env (Zod, fail-fast) + dbConfig
│   │   │   ├── api-response.ts # Envelope response global + factory OpenAPIHono
│   │   │   └── logger.ts     # Logger (winston)
│   │   ├── middleware/
│   │   │   ├── logger.ts     # Request logging
│   │   │   └── rate-limit.ts # Rate limiting per IP
│   │   ├── db/
│   │   │   ├── client.ts     # Koneksi MySQL (mysql2 pool + Drizzle)
│   │   │   └── schema.ts     # Schema Drizzle (printers, meter_readings)
│   │   └── routes/
│   │       └── printer/      # Endpoint /api/printer-meter
│   │           ├── schemas.ts # Zod + createRoute (OpenAPI)
│   │           ├── post.ts    # POST /
│   │           ├── get.ts     # GET /
│   │           └── index.ts   # Mount semua endpoint printer
│   ├── drizzle.config.ts     # Konfigurasi Drizzle Kit (kredensial dari config/env.ts)
│   ├── docker-compose.yaml   # PROD: API + MySQL + phpMyAdmin (untuk VM)
│   ├── Dockerfile            # Image API production
│   ├── Jenkinsfile           # Pipeline deploy API
│   ├── dev,docker-compose.yaml # DEV: MySQL 8 + phpMyAdmin (untuk API)
│   ├── .env.example          # Template env development
│   ├── .env.production.example  # Template env production
│   └── README.md             # 📖 Dokumentasi API (development & production)
│
├── clients/                  # Collector — script Windows PowerShell
│   ├── collect-zebra.ps1     # Script utama (baca meter → POST ke API)
│   ├── config.json           # Konfigurasi printer, API, meters, logging
│   ├── create-scheduler.*    # Buat Task Scheduler (interval 15 menit)
│   ├── delete-scheduler.*    # Hapus Task Scheduler
│   └── README.md             # 📖 Dokumentasi lengkap client
│
├── frontend/                 # Dashboard web — Nuxt 4 + Nuxt UI v4
│   ├── Dockerfile            # Multi-stage image Nuxt/Nitro + Nginx production
│   ├── docker-compose.yaml   # Satu container frontend pada network production
│   ├── nginx.conf            # Reverse proxy dan cache asset statis
│   ├── Jenkinsfile           # Pipeline CI/CD frontend
│   ├── app/
│   │   ├── components/       # BenchmarkTable.vue, ReadingsTable.vue, dll.
│   │   ├── composables/      # useZebraApi.ts (client API + formatter)
│   │   ├── pages/            # index.vue (dashboard)
│   │   └── types/            # api.ts (tipe mirror OpenAPI)
│   └── README.md             # 📖 Dokumentasi frontend (setup & kontrol tabel)
│
├── docs/                     # Dokumentasi desain (drawio, dll.)
└── README.md                 # Dokumentasi umum (file ini)
```

## Quick Start (Development)

### 1. Jalankan Database (MySQL + phpMyAdmin)

```powershell
cd api
bun run dev:db    # = docker compose up -d mysql phpmyadmin
```

- **phpMyAdmin**: http://localhost:8080 (user: `zebrameter`, password: `zebrameter_secret`)
- **MySQL**: `localhost:3306`, database `zebrameter_db`

> API tidak dijalankan sebagai container agar hot reload tetap cepat.

### 2. Jalankan API

```powershell
cd api
bun install            # sekali saja
copy .env.example .env # lalu sesuaikan kredensial jika perlu
bun run db:push        # buat tabel dari schema Drizzle
bun run dev            # server di http://localhost:3000
```

### 3. Jalankan Client (collector)

```powershell
cd clients
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\collect-zebra.ps1"
```

> Dokumentasi lengkap client (konfigurasi, exit code, troubleshooting, Task Scheduler) ada di [`clients/README.md`](clients/README.md).

## Quick Start (Production — VM)

Production memakai Docker Compose (`docker-compose.yaml`) dengan env file sendiri (`.env.production`); MySQL tidak dipublikasikan ke host.

```bash
cd api
cp .env.production.example .env.production
# edit .env.production — isi MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD
docker compose --env-file .env.production \
  -f docker-compose.yaml up -d --build
```

Detail lengkap (validasi env, SSH tunnel phpMyAdmin, update deployment) ada di [`api/README.md`](api/README.md).

### Deploy UI Frontend

Deploy API terlebih dahulu agar Docker network `zebrameter-net-prod` tersedia. Kemudian pada Docker host yang sama:

```bash
cd frontend
docker compose -f docker-compose.yaml up -d --build
```

Dashboard default tersedia di `http://localhost:3001` melalui Nginx dalam satu container frontend. Nitro tetap menangani SSR dan mem-proxy API melalui `http://api:3000`. Pipeline Jenkins frontend menggunakan script path `frontend/Jenkinsfile`; persyaratan agent dan konfigurasi deployment dijelaskan di [`frontend/README.md`](frontend/README.md#deployment-dengan-docker).

## Environment

| Environment | API | Database | File konfigurasi |
|---|---|---|---|
| Development | `bun run dev` (hot reload) | Docker (`bun run dev:db`) | `api/.env` |
| Production | Docker Compose (VM) | Docker Compose | `api/.env.production` |
| Frontend production | Docker Compose / Jenkins (VM yang sama dengan API) | API pada network Docker production | environment Compose (`FRONTEND_PORT`, `NUXT_API_BASE`) |

- Environment divalidasi dengan **Zod** di `api/src/config/env.ts` (fail-fast) — semua field punya default development, jadi `bun run dev` tetap jalan tanpa `.env`.
- Production menyuplai `DB_*` lewat Docker Compose (`NODE_ENV=production`).

## Endpoint API

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/` | Info & daftar endpoint |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI (interaktif) |
| `GET` | `/openapi.json` | OpenAPI 3.0 document |
| `POST` | `/api/printer-meter` | Terima data meter dari client (payload: `printerId`, `model`, `ipAddress`, `measuredAt`, `collectorHostname`, `collectorIp`, `printheadId`, `meters`, `rawMeters`) |
| `GET` | `/api/printer-meter?page=1&limit=20` | Baca reading terbaru dengan filter printer/printhead/bulan dan paginasi |
| `GET` | `/api/printhead-benchmark?page=1&limit=50&model=&status=&sort=head_usage_delta&direction=desc` | Benchmark count per printhead (filter model/status, sortir numerik, paginasi server-side) |

- Endpoint **tanpa API key** — collector cukup menjangkau API.
- Response memakai envelope global: `{ "success": true, "data": ... }` atau `{ "success": false, "error": ... }`. Sukses POST: `201 { "success": true, "data": { "id": <readingId>, ... } }`.
- `/api/printhead-benchmark` mengembalikan `{ count, data, models }`: `count` adalah **total baris yang cocok dengan filter (seluruh halaman)**, `data` hanya baris pada halaman yang diminta, dan `models` berisi semua nilai `lastModel` unik untuk mengisi filter. Tiap baris menyertakan `status` (`ACTIVE`/`INACTIVE`) serta `collectorHostname` dari reading terbaru (stasiun terakhir head terpasang). Detail parameter dan contoh ada di [`api/README.md`](api/README.md).
- Dashboard web Nuxt (`frontend/`) menampilkan tabel benchmark ini dengan **filter model** (`lastModel`, termasuk opsi default “Semua Model”) dan **filter status** (Active/Inactive), kolom **Collector Host** dan **Status**, **sortir numerik via header kolom** (Readings, Lifespan, Head Usage Delta, Odometer Delta, Label Delta), serta **paginasi server-side** (default 50 baris; pilihan 20/50/100). Detail ada di [`frontend/README.md`](frontend/README.md).
- Tabel Historical Readings menyediakan filter select untuk printhead, IP address, model, printer ID, dan hostname; pemilih bulan `measuredAt`; pagination server-side; serta sorting header server-side untuk tanggal dan seluruh nilai meter numerik. Endpoint mengembalikan total hasil terfilter dan opsi filter unik. Detail parameter ada di [`api/README.md`](api/README.md).

## Perintah API Berguna

| Perintah | Fungsi |
|---|---|
| `bun run dev` | Jalankan server (hot reload) |
| `bun run typecheck` | Type-check TypeScript |
| `bun run db:push` | Sinkronkan schema → database (dev) |
| `bun run db:generate` | Buat file migration SQL dari perubahan schema |
| `bun run db:migrate:dev` | Jalankan migration ke DB development |
| `bun run db:studio` | Buka Drizzle Studio (browse data) |
| `bun run benchmark:migrate` | Pasang ulang SP benchmark + event scheduler |
| `bun run benchmark:refresh` | Refresh tabel benchmark dari `meter_readings` |

## Database Schema (Drizzle)

Tiga tabel di `api/src/db/schema.ts`:

- **`printers`** — daftar printer (`printerId` unik, `model`, `ipAddress`), di-upsert tiap POST.
- **`meter_readings`** — satu baris per pengukuran:
  - kolom split per meter (`totalLabelCount`, `totalPrintLength`, `printheadOdometer`, `headUsage`, `ribbonLength`, `mediaLength`) → memudahkan query operasional;
  - kolom `rawMeters` (JSON) → **source of truth** payload asli dari client, termasuk raw string & error per meter.
- **`printhead_benchmarks`** — agregat per `printheadId` hasil SP `sp_refresh_printhead_benchmarks`: nilai first/last/delta tiap meter, `readingCount`, `lifespanMinutes`, `status` (`ACTIVE`/`INACTIVE`), serta `collectorHostname` dari reading terbaru (stasiun terakhir head terpasang). Satu baris per printhead (`printhead_id` unik).

> Jika menambah meter baru di `clients/config.json`, tambahkan kolomnya di `schema.ts` lalu jalankan `bun run db:generate` + `bun run db:migrate:dev`. Sampai itu dilakukan, data meter baru tetap aman tersimpan di kolom `rawMeters`.

## Tech Stack

| Bagian | Teknologi |
|---|---|
| API runtime | [Bun](https://bun.sh) |
| Web framework | [Hono](https://hono.dev) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) + `mysql2` |
| Database | MySQL 8 (Docker) + phpMyAdmin |
| Client | Windows PowerShell (tanpa dependency eksternal) |
