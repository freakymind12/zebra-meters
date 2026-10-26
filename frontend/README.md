# ZebraMeter Frontend

Dashboard web untuk memantau reading meter printer Zebra dan benchmark printhead dari [API ZebraMeter](../api/README.md).

Dibangun dengan **Nuxt 4** + **Nuxt UI v4** (Tailwind CSS v4). Package manager & perintah proyek memakai **Bun**.

## Prasyarat

- [Bun](https://bun.sh) terpasang.
- API ZebraMeter berjalan (default `http://localhost:3000`).

## Setup

```powershell
cd frontend
bun install
```

## Development

```powershell
bun run dev
```

Buka http://localhost:3000. Secara default request frontend diproksi ke API lewat Nitro (runtimeConfig `public.apiBase` kosong berarti request relatif ke origin Nuxt). Untuk menembak API secara langsung dari browser:

```powershell
$env:NUXT_PUBLIC_API_BASE="http://localhost:3000"
bun run dev
```

Untuk mengganti target API proxy server-side Nitro, gunakan `NUXT_API_BASE`.

## Skrip

| Perintah | Fungsi |
|---|---|
| `bun run dev` | Jalankan dev server (hot reload) |
| `bun run build` | Build untuk production |
| `bun run preview` | Preview hasil build production |
| `bun run typecheck` | Type-check TypeScript (`nuxt typecheck`) |
| `bun run lint` | Lint dengan ESLint (`@nuxt/eslint` + `better-tailwindcss`) |

## Halaman

`app/pages/index.vue` menampilkan chart contoh, benchmark printhead, dan historical readings:

1. **Chart examples** — pie, bar/line satu sumbu Y, dan bar/line dua sumbu Y dengan komponen ECharts reusable.
2. **Printhead Benchmark** — `BenchmarkTable.vue`
3. **Historical Readings** — `ReadingsTable.vue`

## Kontrol Tabel Historical Readings

`app/components/ReadingsTable.vue` mengambil data dari `GET /api/printer-meter` dan menyediakan:

- **Filter select** untuk printhead, IP address, model, printer ID, dan hostname collector. Opsi unik berasal dari metadata filter endpoint; filter printhead juga mendukung reading tanpa printhead ID.
- **Month picker** Nuxt UI `UCalendar` (`type="month"`) di dalam `UPopover` untuk memfilter `measuredAt` berdasarkan bulan kalender Asia/Jakarta. Tombol hapus mengembalikan filter ke semua bulan.
- **Pagination server-side** melalui `UPagination`; default 20 baris dengan pilihan 10 / 20 / 50 / 100. `count` dari API adalah jumlah total setelah filter.
- **Sorting server-side** lewat header `Measured At` dan semua kolom meter numerik (Labels, Print Length, Odometer, Head Usage, Ribbon, Media). Default tanggal terbaru lebih dulu.
- Filter, sorting, atau ukuran halaman berubah akan memuat ulang dari halaman pertama. Refresh dan auto-refresh mempertahankan filter/sort/halaman yang sedang aktif.

## Kontrol Tabel Benchmark

`app/components/BenchmarkTable.vue` mengambil data dari `GET /api/printhead-benchmark` (lihat [kontrak API](../api/README.md)) dan menyediakan:

- **Filter model** — `USelect` berisi opsi **“Semua Model”** (default) plus semua nilai `lastModel` unik dari seluruh dataset (field `models` pada response). Memilih model memuat ulang data dan mengembalikan ke halaman 1.
- **Filter status** — `USelect` **“Semua Status”** (default) / **Active** / **Inactive**, diteruskan sebagai query `status=ACTIVE|INACTIVE` sehingga filter, `count`, dan pagination dihitung di server.
- **Kolom Collector Host** — hostname collector dari reading terbaru printhead (lokasi/stasiun terakhir head terpasang), atau `-` bila tidak tersedia.
- **Kolom Status** — badge `Active` (hijau) / `Inactive` (netral) dari kolom `status` benchmark.
- **Sortir lewat header kolom** — klik header kolom numerik (Readings, Lifespan, Head Usage Delta, Odometer Delta, Label Delta) untuk mengurutkan. Sortir dijalankan **di server** (`sort` + `direction`), tidak hanya pada halaman yang sedang tampil. Default: `head_usage_delta` menurun (desc).
- **Paginasi server-side** — `UPagination` memakai total `count` dari API. Ukuran halaman default **50** dengan pilihan **20 / 50 / 100**. Mengubah ukuran halaman, model, status, atau sortir mengembalikan ke halaman 1.
- **Refresh** — memuat ulang halaman/kueri yang sedang aktif.
- **Status** — alert saat gagal memuat, indikator loading, dan empty state saat tidak ada data.

Semua label antarmuka memakai Bahasa Indonesia agar konsisten dengan aplikasi.

## Tema & Logo

Header memakai komponen `app/components/ZebraLogo.vue`, yaitu SVG **inline** (bukan `<img>`) sehingga bisa mewarisi token Nuxt UI secara langsung:

- ikon dan kata “Meter” memakai `var(--ui-primary)` — otomatis mengikuti preset primary dan berubah light/dark;
- kata “Zebra” memakai `var(--ui-text-highlighted)`.

Karena warnanya bersumber dari token, tidak perlu file logo terpisah per color mode. Mengganti preset warna (mis. lewat `ui.colors.primary` di `app.config.ts`) ikut mengubah logo tanpa menyentuh SVG.

## Deployment dengan Docker

Nuxt SSR tetap dijalankan oleh Nitro/Node.js; Nginx berjalan sebagai reverse proxy di dalam image dan container yang sama. Hanya port Nginx yang dipublikasikan ke host. Nginx meneruskan request SSR/API ke Nitro di `127.0.0.1:3000` dan menetapkan cache panjang untuk asset ber-hash pada `/_nuxt/`. Image dibuat multi-stage: dependency dan build memakai Bun, sedangkan runtime membawa `.output`, Node.js, dan Nginx. Health check HTTP memeriksa aplikasi melalui Nginx.

Compose frontend menggunakan external Docker network `zebrameter-net-prod` yang dibuat oleh deployment API (`api/docker-compose.yaml`). Deploy API lebih dahulu pada Docker host yang sama agar frontend dapat meneruskan request server-side ke service API bernama `api`.

### Deploy manual

```bash
cd frontend
docker compose -f docker-compose.yaml up -d --build
docker compose -f docker-compose.yaml ps
docker compose -f docker-compose.yaml logs -f frontend
```

Dashboard tersedia melalui Nginx di `http://localhost:3001`. Atur nilai berikut di environment shell sebelum menjalankan Compose untuk mengubah default:

| Variable | Default | Keterangan |
|---|---|---|
| `FRONTEND_PORT` | `3001` | Port host yang dipetakan ke port `80` Nginx di container frontend. |
| `NUXT_API_BASE` | `http://api:3000` | Alamat API yang dapat dijangkau dari container frontend melalui Docker network. |
| `TZ` | `Asia/Jakarta` | Zona waktu container. |

Contoh:

```bash
FRONTEND_PORT=8081 NUXT_API_BASE=http://api:3000 \
  docker compose -f docker-compose.yaml up -d --build
```

Compose hanya membuat satu container `zebrameter-frontend` yang berisi Nuxt/Nitro dan Nginx. Keduanya berkomunikasi melalui loopback container; container frontend bergabung ke external network `zebrameter-net-prod` agar Nitro dapat mencapai API `api:3000`. Jangan mengubah `NUXT_API_BASE` menjadi alamat `localhost`: alamat itu menunjuk ke container frontend, bukan container API. Untuk TLS, letakkan ingress/reverse proxy eksternal di depan port host Nginx atau konfigurasi terminasi TLS pada lapisan deployment Anda.

### Jenkins pipeline

Job Jenkins menggunakan **Pipeline script from SCM** dengan script path `frontend/Jenkinsfile`. Atur SCM branch job ke branch production yang disetujui; pipeline melakukan checkout, build image (install dependency Bun terkunci, typecheck, lint, dan build dijalankan dalam tahap build Docker), deploy satu container frontend via Compose, menunggu health check HTTP melalui Nginx, lalu melakukan smoke test HTTP.

Jenkins agent harus memiliki Docker Engine dengan Compose v2, `curl`, akses ke repository, dan memakai Docker host yang sama dengan API deployment. Bun tidak perlu dipasang di agent karena digunakan pada tahap build image. Docker network `zebrameter-net-prod` harus sudah ada. Tidak ada secret aplikasi yang diperlukan oleh pipeline frontend.

Pipeline memakai port host `3001` dan API `http://api:3000` secara default. Bila perlu nilai berbeda, ubah environment `FRONTEND_PORT`/`NUXT_API_BASE` di `frontend/Jenkinsfile` agar konsisten dengan Compose. Compose manual juga menerima kedua nilai tersebut dari environment.

## Struktur

```
app/
├── components/    BenchmarkTable.vue, ReadingsTable.vue, ReadingDetailModal.vue, ZebraLogo.vue
├── composables/   useZebraApi.ts (client API + formatter id-ID)
├── pages/         index.vue (dashboard)
└── types/         api.ts (tipe mirror schema OpenAPI API)

Dockerfile, docker-compose.yaml, nginx.conf, Jenkinsfile
```
