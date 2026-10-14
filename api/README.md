# ZebraMeter API

REST API untuk menerima data meter printer Zebra dan menyimpannya ke MySQL.

- Runtime: Bun
- Framework: Hono
- Database: MySQL 8 + Drizzle ORM
- Endpoint utama: `POST /api/printer-meter`

## Environment

Project ini mempunyai dua environment yang terpisah:

| Environment | API | Database | File konfigurasi |
|---|---|---|---|
| Development | Bun native + hot reload | MySQL & phpMyAdmin via Docker | `.env` |
| Production | Docker Compose di VM | MySQL & phpMyAdmin via Docker | `.env.production` |

> Bun otomatis memuat `.env`, lalu `.env.local` sebagai override lokal. File production dimuat eksplisit oleh Docker Compose menggunakan `--env-file .env.production`.

## Development

### Persiapan pertama kali

```powershell
cd api
Copy-Item .env.example .env
bun install
```

### Jalankan database

```powershell
bun run dev:db
```

Perintah tersebut menjalankan service `mysql` dan `phpmyadmin` dari `docker-compose.yaml`. API tidak dijalankan sebagai container agar hot reload Bun tetap cepat.

Tunggu sampai database sehat:

```powershell
docker compose ps
```

Sinkronkan schema saat pertama kali atau setelah schema berubah:

```powershell
bun run db:push
```

### Jalankan API

```powershell
bun run dev
```

Akses:

- API: http://localhost:3000
- Health check: http://localhost:3000/health
- phpMyAdmin: http://localhost:8080

Stop database development:

```powershell
bun run dev:db:down
```

### Konfigurasi development

Nilai default ada di `.env.example`:

```dotenv
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=zebrameter
DB_PASSWORD=zebrameter_secret
DB_NAME=zebrameter_db
```

Semua nilai di atas punya default di `src/config/env.ts` (skema Zod), sehingga `bun run dev` tetap jalan walau `.env` belum diisi.

## Production (VM)

### Persiapan pertama kali

```bash
cd api
cp .env.production.example .env.production
```

Edit `.env.production` dan ganti semua placeholder rahasia:

```dotenv
NODE_ENV=production
API_PORT=3000
PMA_PORT=8080
TZ=Asia/Jakarta
MYSQL_ROOT_PASSWORD=<password-root-kuat>
MYSQL_DATABASE=zebrameter_db
MYSQL_USER=zebrameter
MYSQL_PASSWORD=<password-database-kuat>
```

File `.env.production` di-ignore oleh Git dan tidak boleh di-commit.

### Deploy

```bash
docker compose --env-file .env.production \
  -f docker-compose.yaml up -d --build
```

Cek status dan log:

```bash
docker compose --env-file .env.production \
  -f docker-compose.yaml ps

docker compose --env-file .env.production \
  -f docker-compose.yaml logs -f api
```

Update deployment:

```bash
git pull
docker compose --env-file .env.production \
  -f docker-compose.yaml up -d --build
```

Pada production:

- API dipublikasikan pada `${API_PORT:-3000}` agar collector di jaringan dapat mengirim data.
- MySQL tidak dipublikasikan ke host; hanya dapat diakses oleh service dalam Docker network.
- phpMyAdmin hanya bind ke `127.0.0.1` di VM. Akses dengan SSH tunnel:

```bash
ssh -L 8080:127.0.0.1:8080 user@alamat-vm
```

Kemudian buka http://localhost:8080 pada komputer lokal.

- Compose membuat Docker network `zebrameter-net-prod`. Container Nuxt pada deployment UI mengakses API melalui service `api:3000`; Nginx frontend hanya terhubung ke network internal UI dan menjadi satu-satunya service frontend yang membuka port ke host. Deploy API lebih dahulu pada Docker host yang sama. Panduan image frontend, Nginx, dan pipeline Jenkins ada di [`frontend/README.md`](../frontend/README.md#deployment-dengan-docker).

## Environment Validation

Environment divalidasi dengan **Zod** di `src/config/env.ts` saat modul di-import (fail-fast). Semua field punya default development, sehingga server tetap start tanpa `.env`. Di production, Docker Compose menyuplai `DB_*` langsung ke container.

Field yang dibaca:

- `NODE_ENV` (`development` | `production`, default `development`)
- `PORT` (default `3000`)
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` (opsional)

Docker Compose juga menolak start bila `MYSQL_ROOT_PASSWORD` atau `MYSQL_PASSWORD` belum diisi.

## Endpoint

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/` | Info dan daftar endpoint |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI (interaktif) |
| `GET` | `/openapi.json` | OpenAPI 3.0 document |
| `POST` | `/api/printer-meter` | Simpan reading printer |
| `GET` | `/api/printer-meter?page=1&limit=20` | Baca reading terbaru dengan filter printer/printhead/bulan dan pagination server-side |
| `GET` | `/api/printhead-benchmark` | Baca benchmark count per printhead (filter model, sortir, paginasi server-side) |

Semua response memakai envelope global:

```json
{ "success": true, "data": { ... } }
```

atau saat error:

```json
{ "success": false, "error": "Validation failed", "details": [ ... ] }
```

### Parameter Query Readings

`GET /api/printer-meter` mendukung filter exact-match berikut; parameter filter kosong diabaikan:

| Parameter | Default | Deskripsi |
|---|---|---|
| `page` | `1` | Halaman 1-based; harus bilangan bulat positif. |
| `limit` | `20` | Ukuran halaman (1-100); nilai invalid/non-positif memakai default `20`, nilai di atas `100` dibatasi ke `100`. |
| `printheadId` | omitted | Filter berdasarkan serial printhead. |
| `printheadMissing` | omitted | Kirim `true` untuk hanya menampilkan reading tanpa printhead ID. |
| `ipAddress` | omitted | Filter alamat IP printer. |
| `model` | omitted | Filter model printer. |
| `printerId` | omitted | Filter ID/serial printer. |
| `hostname` | omitted | Filter exact hostname collector (`collectorHostname`). |
| `month` | omitted | Bulan `measuredAt` dalam format `YYYY-MM`, dihitung sebagai bulan kalender Asia/Jakarta. |
| `sort` | `measuredAt` | Kolom yang diurutkan: `measuredAt`, `totalLabelCount`, `totalPrintLength`, `printheadOdometer`, `headUsage`, `ribbonLength`, atau `mediaLength`. |
| `direction` | `desc` | Arah sort: `asc` atau `desc`. |

Contoh kombinasi filter dan halaman:

```bash
curl "http://localhost:3000/api/printer-meter?page=2&limit=20&model=ZT620&month=2026-10&sort=headUsage&direction=asc"
```

Kolom sortable pada UI meliputi `measuredAt` (waktu pengukuran) dan seluruh meter numerik. Header table memakai sorting manual/server-side, sehingga urutan benar untuk semua halaman. Default tanggal terbaru lebih dulu (`measuredAt`, `desc`); ties distabilkan dengan ID reading menurun.

Response data berisi `count` total hasil setelah filter (semua halaman), `data` untuk halaman yang diminta, dan `filters` berisi pilihan unik lengkap (`printheadIds`, `ipAddresses`, `models`, `printerIds`, `hostnames`, serta `hasMissingPrinthead`) yang tidak terpotong oleh halaman/filter aktif.

Contoh POST development:

```bash
curl -X POST http://localhost:3000/api/printer-meter \
  -H 'Content-Type: application/json' \
  -d '{
    "printerId": "ZT620-TEST",
    "model": "ZT620",
    "ipAddress": "192.168.41.254",
    "measuredAt": "2026-10-09T10:00:00+07:00",
    "collectorHostname": "DEV-PC",
    "collectorIp": "192.168.41.10",
    "printheadId": "PH-TEST",
    "meters": { "totalLabelCount": 1234 },
    "rawMeters": {
      "totalLabelCount": { "raw": "1234", "value": 1234 }
    }
  }'
```

## Perintah API Benchmark

```bash
# Baca halaman pertama (50 baris), sortir default head_usage_delta desc.
curl http://localhost:3000/api/printhead-benchmark

# Halaman 2 dengan filter model.
curl "http://localhost:3000/api/printhead-benchmark?page=2&limit=50&model=ZT620"

# Sortir odometer_delta asc, 20 baris per halaman.
curl "http://localhost:3000/api/printhead-benchmark?sort=odometer_delta&direction=asc&limit=20"

# Filter satu printhead (legacy, tetap berjalan).
curl "http://localhost:3000/api/printhead-benchmark?head=PH18D3402A001"
```

### Parameter Query

| Parameter | Default | Deskripsi |
|---|---|---|
| `page` | `1` | Nomor halaman (1-based). Nilai non-integer atau non-positif → **400 Validation Error**. |
| `limit` | `50` | Ukuran halaman. Omitted/invalid/non-positif → default `50`. Nilai `> 100` di-*cap* ke `100`. Maksimum `100`. |
| `model` | omitted | Filter `lastModel` persis. Omitted/empty = semua model. |
| `sort` | `head_usage_delta` | Kunci sortir (whitelist). Nilai di luar whitelist → default. **Hanya kolom numerik** yang diizinkan. |
| `direction` | `desc` | Arah sortir: `asc` \| `desc`. Nilai lain → **400 Validation Error**. |
| `head` | omitted | Filter `printheadId` persis (legacy). |

**Kunci sort yang diizinkan** (semua numerik):

| Kunci | Kolom |
|---|---|
| `reading_count` | `readingCount` |
| `lifespan` | `lifespanMinutes` |
| `head_usage_delta` | `headUsageDelta` |
| `odometer_delta` | `printheadOdometerDelta` |
| `total_label_count_delta` | `totalLabelCountDelta` |
| `total_print_length_delta` | `totalPrintLengthDelta` |
| `ribbon_length_delta` | `ribbonLengthDelta` |
| `media_length_delta` | `mediaLengthDelta` |

### Response Body

```json
{
  "success": true,
  "data": {
    "count": 128,
    "data": [ ... ],
    "models": ["ZT620", "ZT410", "GK420t"]
  }
}
```

- **`count`** — total baris yang cocok dengan filter aktif (`head`, `model`) di **seluruh dataset**, bukan hanya halaman ini.
- **`data`** — hanya baris pada halaman yang diminta.
- **`models`** — semua nilai `lastModel` unik non-null dari seluruh dataset (tidak dipengaruhi filter halaman/model).

### Error 400 (Validation Failed)

```json
{ "success": false, "error": "Validation failed", "details": [{ "path": "page", "message": "page harus bilangan bulat positif" }] }
```


## Perintah

| Perintah | Fungsi |
|---|---|
| `bun run dev` | Jalankan API development dengan hot reload |
| `bun run start` | Jalankan API tanpa hot reload |
| `bun run start:prod` | Smoke test lokal dengan `.env.production` |
| `bun run typecheck` | Type-check TypeScript |
| `bun run dev:db` | Jalankan MySQL + phpMyAdmin development |
| `bun run dev:db:down` | Stop MySQL + phpMyAdmin development |
| `bun run db:push` | Sinkronkan schema langsung ke database (hanya untuk development) |
| `bun run db:generate` | Generate migration SQL ke folder `drizzle/` (commit ke Git!) |
| `bun run db:migrate:dev` | Jalankan migration ke database development (`.env`) |
| `bun run db:migrate:prod` | Jalankan migration dengan koneksi database production (`.env.production`) |
| `bun run db:studio` | Buka Drizzle Studio |

## Migrations (Drizzle Kit)

Folder `drizzle/` berisi migration SQL dan **wajib di-commit ke Git** (tidak di-ignore).

### Development

Iterasi cepat saat development boleh memakai `push` (langsung sinkron tanpa file migration):

```powershell
bun run db:push
```

Namun untuk perubahan yang ingin direkam versinya, gunakan generate + migrate:

```powershell
bun run db:generate          # buat file SQL di drizzle/ dari src/db/schema.ts
bun run db:migrate:dev       # apply migration ke DB development (.env)
```

### Production

Jangan pakai `push` di production. Gunakan migration yang ter-track:

```bash
bun run db:migrate:prod      # apply migration ke DB production (.env.production)
```

Selain itu, container API otomatis menjalankan `drizzle-kit migrate` saat start (lihat `Dockerfile` CMD), sehingga migration yang sudah di-commit akan ter-apply saat deploy.

## Catatan Keamanan

- Endpoint ingest sengaja **tanpa API key** — collector hanya perlu menjangkau API. Batasi akses lewat firewall/segmentasi jaringan.
- API saat ini melayani HTTP tanpa TLS. Untuk jaringan yang tidak sepenuhnya dipercaya, gunakan Caddy/nginx sebagai reverse proxy HTTPS di VM.
- Container menjalankan `drizzle-kit migrate` saat startup — bukan `push`. Migration SQL di folder `drizzle/` ikut ter-commit ke Git dan tersedia di dalam image, sehingga perubahan schema ter-track versinya dan bersifat deterministik. Workflow: ubah `src/db/schema.ts` → `bun run db:generate` → review & commit file SQL di `drizzle/` → deploy (migration dijalankan otomatis saat container start) atau manual dengan `bun run db:migrate:prod`.
- Backup volume MySQL sebelum deploy perubahan schema yang berpotensi destruktif.
- `certs/zscaler-root-ca.crt` hanya dipakai saat build image agar `bun install` bekerja pada jaringan dengan TLS inspection; bukan sertifikat HTTPS API.
