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

Buka http://localhost:3000. Secara default request frontend diproksi ke API lewat Nitro (runtimeConfig `public.apiBase` kosong berarti request relatif ke origin Nuxt). Untuk menembak API secara langsung:

```powershell
$env:NUXT_PUBLIC_API_BASE="http://localhost:3000"
bun run dev
```

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

- **Filter select** untuk printhead, IP address, model, dan printer ID. Opsi unik berasal dari metadata filter endpoint; filter printhead juga mendukung reading tanpa printhead ID.
- **Month picker** Nuxt UI `UCalendar` (`type="month"`) di dalam `UPopover` untuk memfilter `measuredAt` berdasarkan bulan kalender Asia/Jakarta. Tombol hapus mengembalikan filter ke semua bulan.
- **Pagination server-side** melalui `UPagination`; default 20 baris dengan pilihan 10 / 20 / 50 / 100. `count` dari API adalah jumlah total setelah filter.
- **Sorting server-side** lewat header `Measured At` dan semua kolom meter numerik (Labels, Print Length, Odometer, Head Usage, Ribbon, Media). Default tanggal terbaru lebih dulu.
- Filter, sorting, atau ukuran halaman berubah akan memuat ulang dari halaman pertama. Refresh dan auto-refresh mempertahankan filter/sort/halaman yang sedang aktif.

## Kontrol Tabel Benchmark

`app/components/BenchmarkTable.vue` mengambil data dari `GET /api/printhead-benchmark` (lihat [kontrak API](../api/README.md)) dan menyediakan:

- **Filter model** — `USelect` berisi opsi **“Semua Model”** (default) plus semua nilai `lastModel` unik dari seluruh dataset (field `models` pada response). Memilih model memuat ulang data dan mengembalikan ke halaman 1.
- **Sortir lewat header kolom** — klik header kolom numerik (Readings, Lifespan, Head Usage Delta, Odometer Delta, Label Delta) untuk mengurutkan. Sortir dijalankan **di server** (`sort` + `direction`), tidak hanya pada halaman yang sedang tampil. Default: `head_usage_delta` menurun (desc).
- **Paginasi server-side** — `UPagination` memakai total `count` dari API. Ukuran halaman default **50** dengan pilihan **20 / 50 / 100**. Mengubah ukuran halaman, model, atau sortir mengembalikan ke halaman 1.
- **Refresh** — memuat ulang halaman/kueri yang sedang aktif.
- **Status** — alert saat gagal memuat, indikator loading, dan empty state saat tidak ada data.

Semua label antarmuka memakai Bahasa Indonesia agar konsisten dengan aplikasi.

## Struktur

```
app/
├── components/    BenchmarkTable.vue, ReadingsTable.vue, ReadingDetailModal.vue
├── composables/   useZebraApi.ts (client API + formatter id-ID)
├── pages/         index.vue (dashboard)
└── types/         api.ts (tipe mirror schema OpenAPI API)
```
