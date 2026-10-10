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

## Environment

| Environment | API | Database | File konfigurasi |
|---|---|---|---|
| Development | `bun run dev` (hot reload) | Docker (`bun run dev:db`) | `api/.env` |
| Production | Docker Compose (VM) | Docker Compose | `api/.env.production` |

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
| `GET` | `/api/printer-meter?limit=20` | Baca reading terbaru (untuk testing/verifikasi) |

- Endpoint **tanpa API key** — collector cukup menjangkau API.
- Response memakai envelope global: `{ "success": true, "data": ... }` atau `{ "success": false, "error": ... }`. Sukses POST: `201 { "success": true, "data": { "id": <readingId>, ... } }`.

## Perintah API Berguna

| Perintah | Fungsi |
|---|---|
| `bun run dev` | Jalankan server (hot reload) |
| `bun run typecheck` | Type-check TypeScript |
| `bun run db:push` | Sinkronkan schema → database (dev) |
| `bun run db:generate` | Buat file migration SQL dari perubahan schema |
| `bun run db:migrate` | Jalankan migration |
| `bun run db:studio` | Buka Drizzle Studio (browse data) |

## Database Schema (Drizzle)

Dua tabel di `api/src/db/schema.ts`:

- **`printers`** — daftar printer (`printerId` unik, `model`, `ipAddress`), di-upsert tiap POST.
- **`meter_readings`** — satu baris per pengukuran:
  - kolom split per meter (`totalLabelCount`, `totalPrintLength`, `printheadOdometer`, `headUsage`, `ribbonLength`, `mediaLength`) → memudahkan query operasional;
  - kolom `rawMeters` (JSON) → **source of truth** payload asli dari client, termasuk raw string & error per meter.

> Jika menambah meter baru di `clients/config.json`, tambahkan kolomnya di `schema.ts` lalu jalankan `bun run db:generate` + `bun run db:migrate`. Sampai itu dilakukan, data meter baru tetap aman tersimpan di kolom `rawMeters`.

## Tech Stack

| Bagian | Teknologi |
|---|---|
| API runtime | [Bun](https://bun.sh) |
| Web framework | [Hono](https://hono.dev) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) + `mysql2` |
| Database | MySQL 8 (Docker) + phpMyAdmin |
| Client | Windows PowerShell (tanpa dependency eksternal) |
