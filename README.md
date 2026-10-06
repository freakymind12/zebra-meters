# ZebraMeter — Panduan Lengkap

**ZebraMeter** adalah utilitas berbasis **Windows PowerShell** untuk membaca data *meter / odometer* dari printer label **Zebra** (misal: **ZT620**) melalui jaringan, lalu — secara opsional — mengirimkannya ke sistem **MES** (*Manufacturing Execution System*) melalui HTTP POST.

> Tool ini **tidak membutuhkan** Node.js, Python, atau library eksternal apa pun. Cukup Windows PowerShell bawaan sistem.

| | |
|---|---|
| **Lokasi project** | `D:\Rian\PROJECT\ZebraMeter` |
| **Script utama** | `collect-zebra.ps1` |
| **Konfigurasi** | `config.json` |
| **Printer (contoh)** | Zebra ZT620 @ `192.168.41.254:9100` |
| **Endpoint API (contoh)** | `http://192.168.10.100:3000/api/printer-meter` |
| **File log (contoh)** | `C:\MES\ZebraMeter\logs\zebra-meter.log` |

## Daftar Isi

1. [Gambaran Umum](#1-gambaran-umum)
2. [Cara Kerja (Alur Data)](#2-cara-kerja-alur-data)
3. [Persyaratan](#3-persyaratan)
4. [Struktur Project](#4-struktur-project)
5. [Konfigurasi (config.json)](#5-konfigurasi-configjson)
6. [Cara Menjalankan](#6-cara-menjalankan)
7. [Kode Keluaran (Exit Code)](#7-kode-keluaran-exit-code)
8. [Log](#8-log)
9. [Daftar Meter](#9-daftar-meter)
10. [Integrasi ke MES API](#10-integrasi-ke-mes-api)
11. [Menjadwalkan Otomatis (Task Scheduler)](#11-menjadwalkan-otomatis-task-scheduler)
12. [Troubleshooting](#12-troubleshooting)
13. [Batasan & Catatan Penting](#13-batasan--catatan-penting)
14. [Referensi](#14-referensi)

## 1. Gambaran Umum

Fitur utama:

- Membaca **6 meter bawaan** (dapat ditambah) dari printer Zebra lewat koneksi **TCP port 9100** (raw socket).
- Menggunakan perintah Link-OS **`! U1 getvar "<nama_variabel>"`** — perintah standar printer Zebra yang mendukung Link-OS.
- Semua detail jaringan, timeout, daftar meter, API, dan logging **dikendalikan lewat `config.json`** (tanpa mengubah script).
- **Parsing otomatis** nilai numerik dari response printer (mis. `"466886 INCHES, 1185892 CENTIMETERS"` → `466886`).
- **Logging** ke konsol dan ke file (append), dengan timestamp dan level (`INFO` / `ERROR`).
- **Pengiriman ke MES API** (HTTP POST JSON, opsional dengan header `X-API-Key`) — *saat ini dinonaktifkan secara default, lihat [bagian 10](#10-integrasi-ke-mes-api).*
- **Exit code terstruktur** sehingga mudah dipantau oleh sistem lain (Task Scheduler, monitoring, dsb.).

## 2. Cara Kerja (Alur Data)

```
   Zebra Printer (ZT620)
           │
           │  TCP port 9100 (raw socket)
           │  kirim: ! U1 getvar "odometer.total_label_count"
           │  terima: "36894"
           ▼
   collect-zebra.ps1 (Windows PowerShell)
       1. Baca config.json (sefolder dengan script)
       2. Validasi konfigurasi (field wajib harus terisi)
       3. Test koneksi TCP ke printer
       4. Untuk TIAP meter: buka koneksi TCP baru → kirim perintah getvar → baca response
       5. Parse response menjadi angka (raw + value)
       6. (Opsional) Kirim hasil sebagai JSON POST ke MES API   ← saat ini NONAKTIF
       7. Tulis semua aktivitas ke log
           │
           │  HTTP POST (application/json)
           ▼
   MES API → http://192.168.10.100:3000/api/printer-meter
```

Catatan penting tentang alur:

- **Satu koneksi TCP dibuka per meter** (6 meter = 6 koneksi), bukan satu koneksi untuk semua.
- Setiap pembacaan meter **selalu menunggu sampai `responseTimeoutMs` tercapai**, jadi total durasi sekali jalan **≈ (jumlah meter) × `responseTimeoutMs`**. Dengan konfigurasi default (6 meter × 2000 ms), total ≈ 12–14 detik — sesuai contoh log (08:32:06 → 08:32:20).
- Jika satu meter gagal dibaca, script **tetap melanjutkan** ke meter berikutnya (hasil meter yang gagal dicatat sebagai `null` + pesan error di log).

## 3. Persyaratan

| Kebutuhan | Keterangan |
|---|---|
| **Sistem Operasi** | Windows dengan Windows PowerShell (disarankan PowerShell 5.1 — bawaan Windows 10/11 & Server 2016+) |
| **Software tambahan** | **Tidak ada** — tanpa Node.js, tanpa Python, tanpa library eksternal |
| **Jaringan** | PC harus menjangkau IP printer di **port 9100**; jika API diaktifkan, harus menjangkau juga URL API MES |
| **Printer** | Printer Zebra yang mendukung perintah Link-OS `! U1 getvar` (contoh: **ZT620**). Pastikan printer sudah punya IP yang benar (lihat panduan jaringan di `ZEBRA-ZT620-USER-GUIDE.pdf`) |
| **Hak akses** | Tidak perlu admin, asal menggunakan flag `-ExecutionPolicy Bypass` saat menjalankan script |

## 4. Struktur Project

```
D:\Rian\PROJECT\ZebraMeter\
│
├── collect-zebra.ps1            # Script utama — seluruh logika collector
├── create-scheduler.ps1         # Buat Task Scheduler otomatis (interval 15 menit)
├── delete-scheduler.ps1         # Hapus Task Scheduler (pembersihan saat PC dipindahtangankan)
├── config.json                  # Semua konfigurasi (printer, api, meters, logging)
├── README.md                    # Dokumentasi ini
├── ZEBRA-ZT620-USER-GUIDE.pdf   # Panduan resmi printer Zebra ZT620 (~54 MB)
│
└── (log disimpan di lokasi dari config.logging.directory,
     default: C:\MES\ZebraMeter\logs\zebra-meter.log)
```

> **Penting:** `config.json` harus berada **sefolder** dengan `collect-zebra.ps1`, karena script mencarinya relatif terhadap lokasi script (bukan folder kerja Anda saat menjalankan).

## 5. Konfigurasi (config.json)

Seluruh perilaku diatur dari `config.json`. Berikut penjelasan **setiap field**:

### 5.1 `printer` — Identitas & koneksi printer

| Field | Tipe | Wajib | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ✅ | `"TESTING-PRINTER"` | ID printer yang dikirim ke MES API (field `printerId`). Gunakan nama/label unik sesuai sistem Anda. |
| `model` | string | ✅ | `"ZT620"` | Model printer (field `model` di payload API). |
| `ip` | string | ✅ | `"192.168.41.254"` | IP address printer di jaringan. Harus bisa dijangkau dari PC ini. |
| `port` | number | ✅ | `9100` | Port raw TCP printer. **`9100` adalah port standar** Zebra untuk menerima data/command via jaringan — ubah hanya jika printer Anda dikonfigurasi khusus. |
| `connectionTimeoutMs` | number | ❌ | `5000` | Batas waktu (ms) untuk **membuka koneksi TCP** ke printer. Jika koneksi tidak terbuka dalam waktu ini → dianggap printer tidak terjangkau (exit code 2). |
| `responseTimeoutMs` | number | ❌ | `2000` | Batas waktu (ms) untuk **menunggu response** tiap perintah meter. Naikkan jika response printer lambat/truncated; turunkan (mis. `1000`) agar proses lebih cepat. |

> ⚠️ **Semua field wajib (`id`, `model`, `ip`, `port`, `api.url`) tidak boleh kosong.** Jika ada yang kosong, script berhenti dengan pesan `"Configuration contains empty required value."` dan **exit code 1** — *meskipun fitur API sedang nonaktif.*

### 5.2 `api` — Endpoint MES API

| Field | Tipe | Contoh | Keterangan |
|---|---|---|---|
| `url` | string | `"http://192.168.10.100:3000/api/printer-meter"` | Endpoint penerima data meter. **Wajib diisi** (dicek saat validasi) meski pengiriman API sedang nonaktif. |
| `method` | string | `"POST"` | Metode HTTP yang dipakai `Invoke-RestMethod`. |
| `timeoutSeconds` | number | `10` | Batas waktu (detik) request HTTP ke API. |
| `apiKey` | string | `""` | API key opsional. **Jika kosong**, header tidak dikirim. **Jika diisi**, script mengirim header tambahan `X-API-Key: <nilai>` — sesuaikan dengan requirement API Anda. |

### 5.3 `meters` — Daftar meter yang dibaca

Array dari objek `{ name, command }`:

| Field | Keterangan |
|---|---|
| `name` | Nama meter. Dipakai sebagai **key** di log dan di payload API (`meters` & `rawMeters`). Gunakan `camelCase`. |
| `command` | Perintah Link-OS yang dikirim ke printer, format: `! U1 getvar "<variabel>"` |

Contoh — menambah 1 meter baru (mis. versi firmware):

```json
{
  "name": "firmwareVersion",
  "command": "! U1 getvar \"device.firmware_version\""
}
```

> Daftar lengkap variabel `getvar` ada di dokumentasi Link-OS Zebra / `ZEBRA-ZT620-USER-GUIDE.pdf`.

### 5.4 `logging` — File log

| Field | Tipe | Contoh | Keterangan |
|---|---|---|---|
| `enabled` | boolean | `true` | `true` = tulis log ke file **dan** konsol; `false` = hanya konsol. |
| `directory` | string | `"C:\\MES\\ZebraMeter\\logs"` | Folder penyimpanan log. **Dibuat otomatis** jika belum ada. *Perhatikan escape backslash (`\\`) di JSON.* |
| `fileName` | string | `"zebra-meter.log"` | Nama file log. Setiap run **di-append** (tidak menimpa isi lama). |
| `keepDays` | number | `30` | **Saat ini RESERVED / belum diimplementasikan oleh script** — tidak ada proses rotasi/pembersihan otomatis berdasarkan field ini. Pantau ukuran file log secara manual bila diperlukan. |

### 5.5 Contoh `config.json` lengkap

```json
{
  "printer": {
    "id": "TESTING-PRINTER",
    "model": "ZT620",
    "ip": "192.168.41.254",
    "port": 9100,
    "connectionTimeoutMs": 5000,
    "responseTimeoutMs": 2000
  },

  "api": {
    "url": "http://192.168.10.100:3000/api/printer-meter",
    "method": "POST",
    "timeoutSeconds": 10,
    "apiKey": ""
  },

  "meters": [
    { "name": "totalLabelCount",   "command": "! U1 getvar \"odometer.total_label_count\"" },
    { "name": "totalPrintLength",  "command": "! U1 getvar \"odometer.total_print_length\"" },
    { "name": "printheadOdometer", "command": "! U1 getvar \"device.printhead.odometer\"" },
    { "name": "headUsage",         "command": "! U1 getvar \"odometer.headnew\"" },
    { "name": "ribbonLength",      "command": "! U1 getvar \"odometer.net_ribbon_length\"" },
    { "name": "mediaLength",       "command": "! U1 getvar \"odometer.net_media_length\"" }
  ],

  "logging": {
    "enabled": true,
    "directory": "C:\\MES\\ZebraMeter\\logs",
    "fileName": "zebra-meter.log",
    "keepDays": 30
  }
}
```

> **Tips:** JSON tidak boleh memiliki komentar, trailing comma, atau quote tunggal. Jika ragu, validasi dulu dengan:
> ```powershell
> Get-Content .\config.json -Raw | ConvertFrom-Json
> ```
> Jika tidak ada error, JSON valid.

## 6. Cara Menjalankan

### 6.1 Cek koneksi printer dulu (disarankan)

Sebelum menjalankan script, pastikan printer terjangkau dari PC:

```powershell
Test-NetConnection 192.168.41.254 -Port 9100
```

Harus menghasilkan `TcpTestSucceeded : True`. Jika `False`, periksa: IP printer benar? Printer menyala? Kabel/jaringan terpasang? Firewall memblokir port 9100?

### 6.2 Menjalankan script (perintah utama)

Buka **PowerShell**, masuk ke folder project, lalu jalankan:

```powershell
cd D:\Rian\PROJECT\ZebraMeter
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\collect-zebra.ps1"
```

Atau langsung dari terminal di folder project:

```powershell
.\collect-zebra.ps1
```

Keterangan flag:

| Flag | Fungsi |
|---|---|
| `-NoProfile` | Tidak memuat PowerShell profile (hasil konsisten di semua mesin — **disarankan untuk otomasi**) |
| `-ExecutionPolicy Bypass` | Melewati ExecutionPolicy agar script bisa jalan tanpa perlu signing/unblocking |
| `-File ".\collect-zebra.ps1"` | Menjalankan script file |

> **Prasyarat kecil:** pastikan `config.json` ada di folder yang sama dengan script (lihat [bagian 4](#4-struktur-project)).

### 6.3 Contoh output (sukses)

```
[2026-10-06 08:32:06] [INFO] ============================================================
[2026-10-06 08:32:06] [INFO] Zebra Printer Meter Collector started.
[2026-10-06 08:32:06] [INFO] ============================================================
[2026-10-06 08:32:06] [INFO] Printer ID    : TESTING-PRINTER
[2026-10-06 08:32:06] [INFO] Printer Model : ZT620
[2026-10-06 08:32:06] [INFO] Printer IP    : 192.168.41.254
[2026-10-06 08:32:06] [INFO] Printer Port  : 9100
[2026-10-06 08:32:06] [INFO] Testing connection to 192.168.41.254:9100
[2026-10-06 08:32:06] [INFO] Printer connection successful.
[2026-10-06 08:32:06] [INFO] Collector Hostname : DIID-310
[2026-10-06 08:32:06] [INFO] Collector IP       : 192.168.41.250
[2026-10-06 08:32:06] [INFO] Reading meter: totalLabelCount
[2026-10-06 08:32:09] [INFO] totalLabelCount = "36894"
[2026-10-06 08:32:09] [INFO] Reading meter: totalPrintLength
[2026-10-06 08:32:11] [INFO] totalPrintLength = "466886 INCHES, 1185892 CENTIMETERS"
[2026-10-06 08:32:11] [INFO] Reading meter: printheadOdometer
[2026-10-06 08:32:14] [INFO] printheadOdometer = "261332943"
[2026-10-06 08:32:14] [INFO] Reading meter: headUsage
[2026-10-06 08:32:16] [INFO] headUsage = "466886 INCHES, 1185892 CENTIMETERS"
[2026-10-06 08:32:16] [INFO] Reading meter: ribbonLength
[2026-10-06 08:32:18] [INFO] ribbonLength = "444702 INCHES, 1129545 CENTIMETERS"
[2026-10-06 08:32:18] [INFO] Reading meter: mediaLength
[2026-10-06 08:32:20] [INFO] mediaLength = "498 INCHES, 1265 CENTIMETERS"
[2026-10-06 08:32:20] [INFO] Meter collection completed successfully.
[2026-10-06 08:32:20] [INFO] Zebra Printer Meter Collector finished.
[2026-10-06 08:32:20] [INFO] ============================================================
```

### 6.4 Cara membaca output

- Format baris: `[timestamp] [LEVEL] pesan`.
- `Reading meter: <nama>` → script sedang mengirim perintah getvar untuk meter tersebut.
- `Collector Hostname : ...` / `Collector IP : ...` → identitas komputer (PC collector) yang menjalankan pengambilan. **IP** = alamat lokal yang benar-benar dipakai menjangkau printer (akurat untuk PC multi-NIC) — berguna untuk tahu node mana yang mengirim data ke MES.
- `<nama> = <response mentah dari printer>` → **raw value** apa adanya.
- `Meter collection completed successfully.` → semua proses selesai tanpa error fatal (exit code 0).
- **Response dua-satuan** seperti `"466886 INCHES, 1185892 CENTIMETERS"`: parser mengambil **angka pertama** → nilai numerik yang dipakai = **`466886` (INCHES)**.
- Setelah selesai, cek `$LASTEXITCODE` (atau `echo $LASTEXITCODE` di PowerShell) untuk memastikan exit code = `0`.

## 7. Kode Keluaran (Exit Code)

| Exit Code | Arti | Penyebab / Solusi |
|---|---|---|
| `0` | ✅ Sukses | Meter terbaca semua; proses selesai normal. |
| `1` | ❌ Konfigurasi bermasalah | `config.json` tidak ditemukan, JSON gagal di-parse, atau ada field wajib yang kosong. Periksa [bagian 5](#5-konfigurasi-configjson). |
| `2` | ❌ Printer tidak terjangkau | Koneksi TCP timeout / gagal. Cek IP, port, jaringan, dan firewall (lihat [bagian 6.1](#61-cek-koneksi-printer-dulu-disarankan)). |
| `3` | ❌ Koleksi sukses, pengiriman API gagal | Hanya muncul **jika fitur API diaktifkan** ([bagian 10](#10-integrasi-ke-mes-api)). Cek URL API, server MES, dan `apiKey`. |
| `99` | ❌ Error tak terduga | Ada exception yang tidak tertangani — baca pesan error di log. |

> Exit code ini bisa dipakai oleh Task Scheduler / monitoring: mis. kirim alert hanya jika exit code ≠ 0.

## 8. Log

- **Lokasi:** `logging.directory` + `logging.fileName` → default `C:\MES\ZebraMeter\logs\zebra-meter.log`.
- Folder dibuat **otomatis** jika belum ada.
- Log **di-append** — riwayat semua run tetap tersimpan (format sama dengan output konsol).
- Menonaktifkan tulis ke file: set `"logging": { "enabled": false }` (output tetap tampil di konsol).
- **Rotasi/pembersihan otomatis berdasarkan `keepDays` belum diimplementasikan** — bersihkan manual bila file sudah besar.

Contoh baris log ERROR:

```
[2026-10-06 08:35:12] [ERROR] Connection timeout to printer 192.168.41.254:9100
[2026-10-06 08:35:12] [ERROR] Printer is unreachable. Process stopped.
```

## 9. Daftar Meter

6 meter yang dikonfigurasi saat ini di `config.json`:

| # | `name` | Perintah Zebra (`getvar`) | Keterangan | Contoh response |
|---|---|---|---|---|
| 1 | `totalLabelCount` | `! U1 getvar "odometer.total_label_count"` | Total jumlah label yang pernah dicetak printer | `"36894"` |
| 2 | `totalPrintLength` | `! U1 getvar "odometer.total_print_length"` | Total panjang media yang pernah tercetak | `"466886 INCHES, 1185892 CENTIMETERS"` |
| 3 | `printheadOdometer` | `! U1 getvar "device.printhead.odometer"` | Akumulasi odometer printhead (indikator umur head) | `"261332943"` |
| 4 | `headUsage` | `! U1 getvar "odometer.headnew"` | Pemakaian printhead (sejak head terakhir dipasang) | `"466886 INCHES, 1185892 CENTIMETERS"` |
| 5 | `ribbonLength` | `! U1 getvar "odometer.net_ribbon_length"` | Panjang pita (ribbon) yang terpakai | `"444702 INCHES, 1129545 CENTIMETERS"` |
| 6 | `mediaLength` | `! U1 getvar "odometer.net_media_length"` | Panjang media (kertas label) yang terpakai | `"498 INCHES, 1265 CENTIMETERS"` |

Keterangan pembacaan:

- **Raw value** = string apa adanya dari printer (termasuk satuan).
- **Parsed value** = angka pertama yang diekstrak parser → untuk response `"466886 INCHES, ..."` hasilnya **`466886`** (satuan pertama = INCHES).
- Satuan mengikuti konfigurasi printer; untuk angka murni seperti `totalLabelCount`, hasilnya sudah berupa count.

### 9.1 Menambah / mengubah / menghapus meter

Semua dilakukan dari `config.json` — **tidak perlu mengubah script**.

**Tambah meter baru** — tambahkan objek baru ke array `meters`:

```json
"meters": [
  { "name": "totalLabelCount",  "command": "! U1 getvar \"odometer.total_label_count\"" },
  { "name": "powerOnCount",     "command": "! U1 getvar \"power.on_count\"" }
]
```

**Hapus meter** — hapus objeknya dari array.

**Ubah nama** — ubah field `name` (yang tampil di log & jadi key payload API). Field `command` tetap sesuai variabel printer.

Langkah verifikasi setelah mengubah `meters`:

1. Validasi JSON: `Get-Content .\config.json -Raw | ConvertFrom-Json`
2. Jalankan script: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\collect-zebra.ps1"`
3. Pastikan meter baru muncul di log dengan response yang masuk akal (bukan error/`null`).

> **Tips:** nama variabel `getvar` harus **persis** seperti didukung firmware printer. Jika salah, printer akan membalas error dan log akan menampilkan `Failed to read <nama> : ...`. Cek variabel yang didukung lewat manual printer (`ZEBRA-ZT620-USER-GUIDE.pdf`) atau dokumentasi Link-OS Zebra.

## 10. Integrasi ke MES API

### 10.1 Status saat ini: NONAKTIF (dikomentari)

Pada bagian **MAIN** script (`collect-zebra.ps1`, ± baris 565–575), pemanggilan fungsi `Send-ToApi` **sedang dikomentari**:

```powershell
    # $ApiOK = Send-ToApi `
    #     -MeterResults $MeterResults

    # if (-not $ApiOK) {

    #     Write-Log `
    #         -Message "Meter collection completed but API delivery failed." `
    #         -Level "ERROR"

    #     exit 3
    # }
```

Artinya: saat ini script **hanya membaca meter dan mencatatnya ke log** — data **belum dikirim** ke MES API.

> 📌 Field `collectorHostname` & `collectorIp` **sudah disiapkan** di dalam payload `Send-ToApi` (lihat [bagian 10.3](#103-format-payload-yang-dikirim)) — akan ikut terkirim otomatis begitu blok di atas diaktifkan.

### 10.2 Cara mengaktifkan pengiriman ke API

1. Buka `collect-zebra.ps1` dengan editor teks (VS Code, Notepad, dsb.).
2. Cari blok kode di atas (± baris 565–575, tepat sebelum `Write-Log "Meter collection completed successfully."`).
3. **Hapus prefix `# ` (koma-tik + spasi)** pada setiap baris sehingga menjadi:

```powershell
    $ApiOK = Send-ToApi `
        -MeterResults $MeterResults

    if (-not $ApiOK) {

        Write-Log `
            -Message "Meter collection completed but API delivery failed." `
            -Level "ERROR"

        exit 3
    }
```

4. Pastikan `config.json` → `api.url` (dan `method`, `timeoutSeconds`, opsional `apiKey`) sudah benar.
5. Simpan, lalu jalankan ulang script. Log akan menampilkan `"Sending meter data to API:"` diikuti payload JSON, lalu `"API request successful."` atau `"API request failed: ..."`.

### 10.3 Format payload yang dikirim

- **Metode:** `POST` (sesuai `api.method`)
- **Content-Type:** `application/json`
- **Headers:** `Accept: application/json`, dan `X-API-Key: <apiKey>` **hanya jika** `apiKey` tidak kosong
- **Body:**

```json
{
  "printerId": "TESTING-PRINTER",
  "model": "ZT620",
  "ipAddress": "192.168.41.254",
  "measuredAt": "2026-10-06T08:32:20.0000000+07:00",
  "collectorHostname": "DIID-310",
  "collectorIp": "192.168.41.250",
  "meters": {
    "totalLabelCount": 36894,
    "totalPrintLength": 466886,
    "printheadOdometer": 261332943,
    "headUsage": 466886,
    "ribbonLength": 444702,
    "mediaLength": 498
  },
  "rawMeters": {
    "totalLabelCount": { "raw": "\"36894\"", "value": 36894 },
    "totalPrintLength": { "raw": "466886 INCHES, 1185892 CENTIMETERS", "value": 466886 },
    "printheadOdometer": { "raw": "261332943", "value": 261332943 },
    "headUsage": { "raw": "466886 INCHES, 1185892 CENTIMETERS", "value": 466886 },
    "ribbonLength": { "raw": "444702 INCHES, 1129545 CENTIMETERS", "value": 444702 },
    "mediaLength": { "raw": "498 INCHES, 1265 CENTIMETERS", "value": 498 }
  }
}
```

Keterangan field:

| Field | Isi |
|---|---|
| `printerId` | Dari `printer.id` |
| `model` | Dari `printer.model` |
| `ipAddress` | Dari `printer.ip` |
| `measuredAt` | Waktu pengukuran, format ISO 8601 |
| `collectorHostname` | Hostname komputer (PC collector) yang menjalankan script — via `MachineName` |
| `collectorIp` | IP lokal komputer collector yang dipakai menjangkau printer (diambil dari socket koneksi; fallback: IPv4 NIC aktif pertama) |
| `meters` | Hanya **nilai numerik hasil parse** per meter |
| `rawMeters` | Nilai **mentah** + nilai parse + `error` (jika pembacaan gagal) per meter |

> Catatan: urutan key JSON bisa berbeda-beda (PowerShell hashtable tidak menjamin urutan) — tidak mempengaruhi fungsi API.

### 10.4 Menguji endpoint API secara terpisah

Sebelum mengaktifkan fitur di script, bisa ditest dulu dengan:

```powershell
Invoke-RestMethod `
  -Uri "http://192.168.10.100:3000/api/printer-meter" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{ "X-API-Key" = "key-anda" } `
  -Body '{"printerId":"TESTING-PRINTER","model":"ZT620","meters":{"totalLabelCount":1}}' `
  -TimeoutSec 10
```

Jika test ini sukses tapi script exit code 3, periksa kembali `api.url` / `api.method` / `apiKey` di `config.json` dan log detail errornya.

## 11. Menjadwalkan Otomatis (Task Scheduler)

Agar meter dibaca berkala **setiap 15 menit** tanpa menjalankan manual, project ini menyediakan 2 script siap pakai:

| Script | Fungsi |
|---|---|
| `create-scheduler.ps1` | Membuat task scheduler (interval 15 menit) |
| `delete-scheduler.ps1` | Menghapus task — untuk pembersihan saat PC tidak dipakai lagi sebagai PC mesin printer |

> ⚠️ Kedua script **harus dijalankan sebagai Administrator** (klik kanan → *Run as administrator*), karena task dibuat dengan akun **SYSTEM**.

### 11.1 Membuat task — `create-scheduler.ps1` (disarankan)

```powershell
cd D:\Rian\PROJECT\ZebraMeter
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\create-scheduler.ps1"
```

Konfigurasi yang dibuat otomatis:

| Item | Nilai |
|---|---|
| Task name | `ZebraMeter Collector` |
| Interval | **Setiap 15 menit** — run pertama diselaraskan ke kelipatan :00 / :15 / :30 / :45 |
| Action | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "...\collect-zebra.ps1"` |
| Run as | **SYSTEM** (Highest) — tetap jalan walau tidak ada user login |
| Settings | StartWhenAvailable · boleh di baterai · tidak dieksekusi dobel jika masih jalan · limit 10 menit |
| Idempoten | Task sudah ada → dibuat ulang (overwrite otomatis) |

Contoh output (diambil dari run nyata):

```
[2026-10-06 10:24:59] [INFO] Task created successfully.
[2026-10-06 10:24:59] [INFO] Task Name    : ZebraMeter Collector
[2026-10-06 10:24:59] [INFO] Schedule     : every 15 minutes
[2026-10-06 10:24:59] [INFO] First Run    : 10/06/2026 10:30:00
[2026-10-06 10:24:59] [INFO] Next Run     : 10/06/2026 10:30:00
[2026-10-06 10:24:59] [INFO] Script       : D:\Rian\PROJECT\ZebraMeter\collect-zebra.ps1
[2026-10-06 10:24:59] [INFO] Run As       : SYSTEM (Highest privileges)
```

Exit code: `0` sukses · `1` bukan admin · `2` `collect-zebra.ps1` tidak ditemukan · `99` error tak terduga.

> **Catatan akses:** task dengan principal SYSTEM **tidak terbaca oleh akun biasa** — `Get-ScheduledTask` / `schtasks` dari token non-admin akan mengembalikan *Access is denied* (bukan "tidak ada"). Untuk melihat/mengelola task, buka *Task Scheduler* via Run as administrator.

### 11.2 Menghapus task — `delete-scheduler.ps1`

Untuk pembersihan ketika PC ini sudah tidak dipakai sebagai PC mesin printer:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\delete-scheduler.ps1"
```

- **Wajib Administrator** — cek admin dijalankan paling awal supaya tidak ada laporan "tidak ada" yang salah (*false negative*) saat token biasa tidak bisa membaca task.
- Task ada → dihentikan dulu (jika sedang jalan) → dihapus → diverifikasi (`Task deleted successfully`).
- Task tidak ada → `Task not found. Nothing to delete` (**exit 0**) — aman dijalankan berulang.

Exit code: `0` sukses / tidak ada task · `1` bukan admin · `3` task masih ada setelah percobaan hapus · `99` error tak terduga.

### 11.3 Opsi manual A — Wrapper `.cmd` + Task Scheduler

Buat file `run-zebra-meter.cmd` di folder project:

```bat
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Rian\PROJECT\ZebraMeter\collect-zebra.ps1"
exit /b %ERRORLEVEL%
```

Lalu di **Task Scheduler**:

1. Buka *Task Scheduler* → **Create Basic Task…**
2. **Name:** `ZebraMeter Collector` → Next.
3. **Trigger:** pilih *Daily* / *Weekly* / *When the computer starts* sesuai kebutuhan → Next.
4. **Action:** *Start a program* → Next.
5. **Program/script:** `D:\Rian\PROJECT\ZebraMeter\run-zebra-meter.cmd`
6. *(Opsional)* tab **Settings**: centang *Run task as soon as possible after a scheduled start is missed*, dan *If the task fails, restart every…*

### 11.4 Opsi manual B — Langsung tanpa wrapper

Pada langkah 5 di atas, isi:

| Kolom | Nilai |
|---|---|
| **Program/script** | `powershell.exe` |
| **Add arguments** | `-NoProfile -ExecutionPolicy Bypass -File "D:\Rian\PROJECT\ZebraMeter\collect-zebra.ps1"` |
| **Start in (opsional)** | `D:\Rian\PROJECT\ZebraMeter` |

### 11.5 Hal yang perlu diperhatikan untuk otomasi

- **Akses jaringan:** dengan script `create-scheduler.ps1`, task berjalan sebagai **SYSTEM** dan terbukti bisa menjangkau printer (run E2E tervalidasi di PC ini). Untuk setup manual, pastikan akun yang dipilih punya akses jaringan ke printer (dan ke MES API bila diaktifkan).
- **Cek exit code** untuk monitoring: `0` = sukses, selain itu = gagal (lihat [bagian 7](#7-kode-keluaran-exit-code)).
- Set `logging.enabled = true` agar semua run tercatat di file log untuk audit.
- Interval 15 menit sangat aman — satu run hanya butuh ≈ 12–14 detik dengan konfigurasi default.

## 12. Troubleshooting

### 12.1 Tabel masalah umum

| Gejala | Kemungkinan Penyebab | Solusi |
|---|---|---|
| `ERROR: config.json not found: ...` (exit 1) | File `config.json` tidak ada / tidak sefolder dengan script | Pastikan `config.json` ada di folder yang sama dengan `collect-zebra.ps1` |
| `ERROR: Failed to parse config.json` (exit 1) | JSON tidak valid (trailing comma, komentar, quote salah) | Validasi: `Get-Content .\config.json -Raw \| ConvertFrom-Json` |
| `Configuration contains empty required value.` (exit 1) | `printer.id` / `model` / `ip` / `port` / `api.url` kosong | Isi semua field wajib — termasuk `api.url` meski API nonaktif |
| `Connection timeout to printer ...` / `Printer is unreachable.` (exit 2) | IP salah, printer mati, port salah, kabel/Jaringan putus, firewall blokir 9100 | `Test-NetConnection <ip> -Port 9100`; cek panel printer & firewall |
| `Failed to read <meter> : ...` (per meter, proses tetap lanjut) | Nama variabel `getvar` tidak didukung firmware, atau printer lambat | Cek nama variabel; naikkan `printer.responseTimeoutMs` |
| Response meter kosong / nilai aneh | Response terpotong (timeout terlalu kecil) | Naikkan `responseTimeoutMs` (mis. `2000` → `5000`) |
| Proses terasa lama (~14 dtk) | Wajar — tiap meter menunggu hingga `responseTimeoutMs` | Turunkan `responseTimeoutMs` jika printer merespons cepat |
| `API request failed: ...` (exit 3) | Server MES mati, URL salah, API key salah | Test endpoint manual ([bagian 10.4](#104-menguji-endpoint-api-secara-terpisah)); cek log detail |
| Log file tidak muncul | Folder tidak bisa ditulis / `logging.enabled = false` | Cek permission `C:\MES\ZebraMeter\logs`; set `enabled: true` |
| `... cannot be loaded because running scripts is disabled...` | Dijalankan tanpa `-ExecutionPolicy Bypass` | Gunakan perintah lengkap di [bagian 6.2](#62-menjalankan-script-perintah-utama) |
| Output berbeda dengan contoh (model/IP beda) | Config memang berbeda | Normal — bandingkan dengan `printer` di `config.json` Anda |

### 12.2 Debug manual — query SATU meter langsung dari PowerShell

Berguna untuk menguji nama variabel/koneksi tanpa menjalankan script penuh:

```powershell
$PrinterIP   = "192.168.41.254"
$PrinterPort = 9100
$Command     = '! U1 getvar "odometer.total_label_count"'

$TcpClient = New-Object System.Net.Sockets.TcpClient
$TcpClient.Connect($PrinterIP, $PrinterPort)
$Stream = $TcpClient.GetStream()
$Stream.ReadTimeout = 3000

$Bytes = [System.Text.Encoding]::ASCII.GetBytes($Command + "`r`n")
$Stream.Write($Bytes, 0, $Bytes.Length)
$Stream.Flush()

Start-Sleep -Milliseconds 500
$Buffer = New-Object byte[] 4096
$Read   = $Stream.Read($Buffer, 0, $Buffer.Length)
[System.Text.Encoding]::ASCII.GetString($Buffer, 0, $Read)

$Stream.Close()
$TcpClient.Close()
```

Jika snippet di atas mengembalikan nilai (mis. `"36894"`), koneksi & variabel benar.

### 12.3 Checklist cepat saat gagal

1. `Test-NetConnection <ip-printer> -Port 9100` → `TcpTestSucceeded` harus `True`.
2. Validasi `config.json` (`ConvertFrom-Json`).
3. Baca **file log** (`C:\MES\ZebraMeter\logs\zebra-meter.log`) — pesan `[ERROR]` menjelaskan titik gagal.
4. Cek **exit code** (`$LASTEXITCODE`) → cocokkan dengan [bagian 7](#7-kode-keluaran-exit-code).
5. Masih gagal → jalankan debug manual [bagian 12.2](#122-debug-manual--query-satu-meter-langsung-dari-powershell).

## 13. Batasan & Catatan Penting

1. **Pengiriman ke MES API dinonaktifkan secara default** (blok `Send-ToApi` dikomentari) — saat ini script hanya membaca & mencatat log. Cara mengaktifkan: [bagian 10](#10-integrasi-ke-mes-api).
2. **`logging.keepDays` belum diimplementasikan** — tidak ada rotasi/pembersihan otomatis log; file log akan terus bertambah (append).
3. **`api.url` tetap wajib** meski API nonaktif, karena ikut divalidasi `Test-Configuration`.
4. **Satu `config.json` = satu printer.** Untuk banyak printer, salin folder project dan sesuaikan IP/ID tiap instance.
5. **Parser mengambil angka pertama** dari response — untuk response dua-satuan hasilnya selalu satuan pertama (INCHES pada contoh default).
6. **Tidak ada mekanisme retry** — jika koneksi/API gagal, script langsung berhenti dengan exit code terkait.
7. **Satu koneksi TCP per meter** (bukan koneksi keep-alive) — durasi total ≈ jumlah meter × `responseTimeoutMs`.
8. **Tidak ada mode dry-run** — setiap run akan benar-benar membaca printer (membaca odometer bersifat non-destruktif / aman).
9. Data **raw + parsed** disimpan berdampingan di payload (`rawMeters` vs `meters`), sehingga MES bisa memakai nilai numerik sekaligus audit nilai asli.

## 14. Referensi

| Sumber | Keterangan |
|---|---|
| `ZEBRA-ZT620-USER-GUIDE.pdf` | Panduan resmi printer Zebra ZT620 (setup, jaringan, perawatan) — ada di folder project |
| Dokumentasi **Zebra Link-OS** | Referensi perintah `! U1 getvar "<variable>"` dan daftar variabel printer |
| Dokumentasi **Zebra Communication & Print** | Protokol port 9100 (raw TCP) Zebra |
| `collect-zebra.ps1` | Sumber kebenaran perilaku script — komentar di dalam script menjelaskan tiap fungsi (`Write-Log`, `Test-Configuration`, `Test-PrinterConnection`, `Get-ZebraValue`, `Parse-NumericValue`, `Collect-Meters`, `Send-ToApi`) |

---

**Quick start singkat:**

```powershell
cd D:\Rian\PROJECT\ZebraMeter
Test-NetConnection 192.168.41.254 -Port 9100          # 1. cek koneksi printer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\collect-zebra.ps1"   # 2. jalankan
Get-Content C:\MES\ZebraMeter\logs\zebra-meter.log -Tail 20                    # 3. cek log
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\create-scheduler.ps1"   # 4. (opsional) jadwalkan tiap 15 menit - jalankan sebagai Admin
```



