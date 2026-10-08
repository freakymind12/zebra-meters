import {
  double,
  int,
  json,
  mysqlTable,
  index,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'

// ============================================================
// Schema ZebraMeter
// ------------------------------------------------------------
// Desain: 2 tabel (printers -> meter_readings).
//   - `printers`        : daftar printer (di-upsert, tidak diulang tiap POST).
//   - `meter_readings`  : satu baris per POST dari collect-zebra.ps1.
//     * kolom value per meter (split) -> memudahkan query operasional
//     * `rawMeters` (JSON)            -> source of truth payload asli,
//                                        termasuk raw string & field error
//                                        untuk meter yang belum punya kolom.
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
