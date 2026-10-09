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
API_KEY=
```

`API_KEY` boleh kosong di development. Jika diisi, client harus mengirim header `X-API-Key` dengan nilai yang sama.

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
API_KEY=<nilai-acak-panjang-minimal-32-karakter>
```

File `.env.production` di-ignore oleh Git dan tidak boleh di-commit.

### Deploy

```bash
docker compose --env-file .env.production \
  -f docker-compose.prod.yaml up -d --build
```

Cek status dan log:

```bash
docker compose --env-file .env.production \
  -f docker-compose.prod.yaml ps

docker compose --env-file .env.production \
  -f docker-compose.prod.yaml logs -f api
```

Update deployment:

```bash
git pull
docker compose --env-file .env.production \
  -f docker-compose.prod.yaml up -d --build
```

Pada production:

- API dipublikasikan pada `${API_PORT:-3000}` agar collector di jaringan dapat mengirim data.
- MySQL tidak dipublikasikan ke host; hanya dapat diakses oleh service dalam Docker network.
- phpMyAdmin hanya bind ke `127.0.0.1` di VM. Akses dengan SSH tunnel:

```bash
ssh -L 8080:127.0.0.1:8080 user@alamat-vm
```

Kemudian buka http://localhost:8080 pada komputer lokal.

## Environment Validation

Saat `NODE_ENV=production`, API gagal start jika salah satu konfigurasi berikut kosong:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `API_KEY`

Docker Compose juga menolak start bila `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, atau `API_KEY` belum diisi.

## Endpoint

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/` | Info dan daftar endpoint |
| `GET` | `/health` | Health check |
| `POST` | `/api/printer-meter` | Simpan reading printer |
| `GET` | `/api/printer-meter?limit=20` | Baca reading terbaru |

Jika `API_KEY` diaktifkan, sertakan header:

```text
X-API-Key: <nilai API_KEY>
```

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

## Perintah

| Perintah | Fungsi |
|---|---|
| `bun run dev` | Jalankan API development dengan hot reload |
| `bun run start` | Jalankan API tanpa hot reload |
| `bun run start:prod` | Smoke test lokal dengan `.env.production` |
| `bun run typecheck` | Type-check TypeScript |
| `bun run dev:db` | Jalankan MySQL + phpMyAdmin development |
| `bun run dev:db:down` | Stop MySQL + phpMyAdmin development |
| `bun run db:push` | Sinkronkan schema langsung ke database |
| `bun run db:generate` | Generate migration SQL |
| `bun run db:migrate` | Jalankan migration |
| `bun run db:studio` | Buka Drizzle Studio |

## Catatan Keamanan

- Production wajib memakai `API_KEY` yang kuat.
- API saat ini melayani HTTP tanpa TLS. Untuk jaringan yang tidak sepenuhnya dipercaya, gunakan Caddy/nginx sebagai reverse proxy HTTPS di VM.
- Container menjalankan `drizzle-kit push` saat startup. Backup volume MySQL sebelum deploy perubahan schema yang berpotensi destruktif.
- `certs/zscaler-root-ca.crt` hanya dipakai saat build image agar `bun install` bekerja pada jaringan dengan TLS inspection; bukan sertifikat HTTPS API.
