import {
  boolean,
  double,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  index,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'

// ============================================================
// Schema ZebraMeter
// ------------------------------------------------------------
// Desain: 3 tabel (printers -> meter_readings -> printhead_benchmarks).
//   - `printers`              : daftar printer (di-upsert, tidak diulang tiap POST).
//   - `meter_readings`        : satu baris per POST dari collect-zebra.ps1.
//     * kolom value per meter (split) -> memudahkan query operasional
//     * `rawMeters` (JSON)            -> source of truth payload asli,
//                                        termasuk raw string & field error
//                                        untuk meter yang belum punya kolom.
//   - `printhead_benchmarks`  : SATU baris per printhead_id (agregat olahan
//                               dari `meter_readings` untuk benchmark count).
//     * dihitung via STORED PROCEDURE `sp_refresh_printhead_benchmarks`
//       (lihat api/src/db/procedures/sp_refresh_printhead_benchmarks.sql).
//     * JANGAN ditulis langsung dari API — hanya via SP agar first/last/
//       delta konsisten (berbasis `measured_at`, bukan `id`).
// ============================================================

// Daftar meter yang punya kolom split — HARUS sinkron dengan
// `meters[].name` di clients/config.json. Meter baru di config.json
// yang belum ada di daftar ini tetap tersimpan di rawMeters (tidak hilang),
// lalu tambahkan kolom + migration untuk men-query-nya.
export const METER_NAMES = [
  'totalLabelCount',
  'totalPrintLength',
  'printheadOdometer',
  'headUsage',
  'ribbonLength',
  'mediaLength',
] as const

export type MeterName = (typeof METER_NAMES)[number]

// ------------------------------------------------------------
// rawMeters — bentuk payload dari Send-ToApi (collect-zebra.ps1)
// ------------------------------------------------------------
export interface RawMeterEntry {
  raw: string | null
  value: number | null
  error?: string
}

export type RawMeters = Record<string, RawMeterEntry>

// ============================================================
// printers
// ============================================================
export const printers = mysqlTable(
  'printers',
  {
    id: int('id').autoincrement().primaryKey(),
    printerId: varchar('printer_id', { length: 100 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('printer_id_uq').on(table.printerId)],
)

export type Printer = typeof printers.$inferSelect
export type NewPrinter = typeof printers.$inferInsert

// ============================================================
// meter_readings
// ============================================================
export const meterReadings = mysqlTable(
  'meter_readings',
  {
    id: int('id').autoincrement().primaryKey(),
    printerId: int('printer_id')
      .notNull()
      .references(() => printers.id, { onDelete: 'cascade' }),

    measuredAt: timestamp('measured_at').notNull(),
    collectorHostname: varchar('collector_hostname', { length: 255 }),
    collectorIp: varchar('collector_ip', { length: 45 }),

    // Serial printhead saat ini — dibaca dari printer via Link-OS getvar
    // (! U1 getvar "device.serial_numbers.printhead").
    // null = tidak tersedia / gagal dibaca / baris lama (sebelum kolom ini ada).
    printheadId: varchar('printhead_id', { length: 100 }),

    // --- split value per meter (nullable: null = gagal dibaca / tidak ada) ---
    totalLabelCount: double('total_label_count'),
    totalPrintLength: double('total_print_length'),
    printheadOdometer: double('printhead_odometer'),
    headUsage: double('head_usage'),
    ribbonLength: double('ribbon_length'),
    mediaLength: double('media_length'),

    // --- source of truth: payload rawMeters asli dari client ---
    rawMeters: json('raw_meters').$type<RawMeters>().notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('meter_readings_measured_at_idx').on(table.measuredAt),
    index('meter_readings_printer_id_idx').on(table.printerId),
  ],
)

export type MeterReading = typeof meterReadings.$inferSelect
export type NewMeterReading = typeof meterReadings.$inferInsert

// ============================================================
// printhead_benchmarks — agregat olahan per printhead
// ------------------------------------------------------------
// Satu baris per `printhead_id` (serial head dari Link-OS getvar
// "device.serial_numbers.printhead").
//
// Sumber : `meter_readings` (hanya row dengan printhead_id NOT NULL).
// Penulis: STORED PROCEDURE `sp_refresh_printhead_benchmarks` —
//          JANGAN insert/update dari API agar konsisten.
//
// Pola per meter (6 meter x 5 kolom = 30 kolom):
//   <meter>_first    : nilai pada reading TERLAMA (MIN measured_at)
//   <meter>_first_at : measured_at reading tersebut
//   <meter>_last     : nilai pada reading TERBARU (MAX measured_at)
//   <meter>_last_at  : measured_at reading tersebut
//   <meter>_delta    : last - first (NULL bila salah satu NULL,
//                      NEGATIF bila counter reset / head reuse).
//   CATATAN: `mediaLength` adalah sisa roll (random walk, bukan odometer)
//   sehingga delta negatif di meter tsb adalah NORMAL. Acuan utama
//   benchmark/count head = `head_usage_delta` + `printhead_odometer_delta`.
//
// Catatan first/last diambil dari BARIS MIN/MAX(measured_at) — bukan
// MIN/MAX(nilai) — sehingga timestamp & nilai selalu satu paket.
// Tiebreak bila 2 reading punya measured_at sama: id terkecil/m terbesar.
// ============================================================
export const printheadBenchmarks = mysqlTable(
  'printhead_benchmarks',
  {
    id: int('id').autoincrement().primaryKey(),

    // Natural key — serial printhead (unik global, 1 head = 1 baris).
    printheadId: varchar('printhead_id', { length: 100 }).notNull(),

    // Printer pertama/terakhir tempat head terpantau
    // (deteksi head pindah printer; NULL bila printer terhapus).
    firstPrinterId: int('first_printer_id').references(() => printers.id, {
      onDelete: 'set null',
    }),
    lastPrinterId: int('last_printer_id').references(() => printers.id, {
      onDelete: 'set null',
    }),
    firstModel: varchar('first_model', { length: 100 }),
    lastModel: varchar('last_model', { length: 100 }),

    firstSeenAt: timestamp('first_seen_at').notNull(),
    lastSeenAt: timestamp('last_seen_at').notNull(),

    // Jumlah row meter_readings valid untuk head ini.
    readingCount: int('reading_count').notNull(),
    // Umur terpantau dalam menit (TIMESTAMPDIFF first->last).
    lifespanMinutes: int('lifespan_minutes'),

    // --- totalLabelCount ---
    totalLabelCountFirst: double('total_label_count_first'),
    totalLabelCountFirstAt: timestamp('total_label_count_first_at'),
    totalLabelCountLast: double('total_label_count_last'),
    totalLabelCountLastAt: timestamp('total_label_count_last_at'),
    totalLabelCountDelta: double('total_label_count_delta'),

    // --- totalPrintLength ---
    totalPrintLengthFirst: double('total_print_length_first'),
    totalPrintLengthFirstAt: timestamp('total_print_length_first_at'),
    totalPrintLengthLast: double('total_print_length_last'),
    totalPrintLengthLastAt: timestamp('total_print_length_last_at'),
    totalPrintLengthDelta: double('total_print_length_delta'),

    // --- printheadOdometer (acuan utama count head) ---
    printheadOdometerFirst: double('printhead_odometer_first'),
    printheadOdometerFirstAt: timestamp('printhead_odometer_first_at'),
    printheadOdometerLast: double('printhead_odometer_last'),
    printheadOdometerLastAt: timestamp('printhead_odometer_last_at'),
    printheadOdometerDelta: double('printhead_odometer_delta'),

    // --- headUsage (acuan utama count head) ---
    headUsageFirst: double('head_usage_first'),
    headUsageFirstAt: timestamp('head_usage_first_at'),
    headUsageLast: double('head_usage_last'),
    headUsageLastAt: timestamp('head_usage_last_at'),
    headUsageDelta: double('head_usage_delta'),

    // --- ribbonLength ---
    ribbonLengthFirst: double('ribbon_length_first'),
    ribbonLengthFirstAt: timestamp('ribbon_length_first_at'),
    ribbonLengthLast: double('ribbon_length_last'),
    ribbonLengthLastAt: timestamp('ribbon_length_last_at'),
    ribbonLengthDelta: double('ribbon_length_delta'),

    // --- mediaLength ---
    mediaLengthFirst: double('media_length_first'),
    mediaLengthFirstAt: timestamp('media_length_first_at'),
    mediaLengthLast: double('media_length_last'),
    mediaLengthLastAt: timestamp('media_length_last_at'),
    mediaLengthDelta: double('media_length_delta'),

    // Flag kualitas data: 1 = ada delta < 0
    // (counter reset / odometer head di-nol-kan / serial dipakai ulang).
    hasNegativeDelta: boolean('has_negative_delta').notNull().default(false),

    // Status pemeliharaan head — dihitung oleh SP `sp_flag_printhead_status`
    // dari selisih `last_seen_at` vs waktu saat ini (bukan ditulis manual):
    //   ACTIVE   : head masih terpantau baru-baru ini (selisih < 3 hari,
    //              buffer 3-7 hari pun tetap ACTIVE),
    //   INACTIVE : head sudah lama tidak muncul (selisih > 7 hari).
    status: mysqlEnum('status', ['ACTIVE', 'INACTIVE'])
      .notNull()
      .default('ACTIVE'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex('printhead_id_uq').on(table.printheadId),
    index('printhead_bm_last_seen_idx').on(table.lastSeenAt),
    index('printhead_bm_last_printer_idx').on(table.lastPrinterId),
    index('printhead_bm_updated_idx').on(table.updatedAt),
    index('printhead_bm_status_idx').on(table.status),
  ],
)

export type PrintheadBenchmark = typeof printheadBenchmarks.$inferSelect
export type NewPrintheadBenchmark = typeof printheadBenchmarks.$inferInsert
