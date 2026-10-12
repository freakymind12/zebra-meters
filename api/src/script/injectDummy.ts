/**
 * injectDummy.ts — Suntik data dummy ke tabel `meter_readings`.
 *
 * Tujuan: menyediakan data yang **mirip data asli** dari collect-zebra.ps1
 * untuk keperluan development / prototyping UI.
 *
 * Behavior:
 *   - 3 printer dummy (masing-masing 1 printhead serial) di-upsert ke `printers`.
 *   - Tiap printhead mendapat 10 row di `meter_readings`,
 *     berjarak 15 menit (meniru scheduler asli tiap 15 menit),
 *     row terakhir = waktu sekarang.
 *   - Nilai meter monoton naik (odometer tidak pernah turun),
 *     format `rawMeters` meniru response asli printer Zebra
 *     (mis. "466886 INCHES, 1185892 CENTIMETERS").
 *   - Idempoten: reading lama pada printer dummy ini dihapus dulu,
 *     aman dijalankan berulang.
 *   - 1 row per printhead (index FAIL_ROW_INDEX) sengaja berisi 1 meter
 *     yang gagal dibaca (kolom split = null + `error` di rawMeters)
 *     untuk menguji state null/error di UI.
 *   - Hanya menyentuh printerId yang ada di DUMMY_PRINTERS (data asli aman).
 *
 * Jalankan dari folder `api/`:
 *   bun src/script/injectDummy.ts
 *   (atau: bun run dummy:inject)
 */
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import {
  type MeterName,
  type NewMeterReading,
  type RawMeters,
  METER_NAMES,
  meterReadings,
  printers,
} from '../db/schema'

// ============================================================
// Konfigurasi dummy
// ============================================================

/** Jumlah row per printhead. */
const ROWS_PER_PRINHEAD = 10

/** Jarak antar row (menit) — meniru Task Scheduler collect-zebra.ps1. */
const INTERVAL_MINUTES = 15

/** Identitas PC collector — meniru data asli (lihat clients/README.md). */
const COLLECTOR_HOSTNAME = 'DIID-310'
const COLLECTOR_IP = '192.168.41.250'

/**
 * Index row (0-based) yang berisi 1 meter gagal baca per printhead.
 * 4 = row ke-5. Set di -1 untuk menonaktifkan.
 */
const FAIL_ROW_INDEX = 4

/** Nilai meter = bilangan bulat (unit sesuai printer: label/inches/…). */
type MeterState = Record<MeterName, number>

interface DummyPrinter {
  /** Serial number printer (kunci unik di tabel `printers`). */
  printerId: string
  model: string
  ipAddress: string
  /** Serial printhead — konstan untuk 10 row (head tidak ganti). */
  printheadId: string
  /** Seed RNG deterministik → hasil re-run konsisten. */
  seed: number
  /** Meter yang dibuat gagal di row index FAIL_ROW_INDEX. */
  failMeter: MeterName
  /** Nilai awal (row pertama) tiap meter. */
  base: MeterState
}

const DUMMY_PRINTERS: DummyPrinter[] = [
  {
    printerId: 'DRK-ZT620-001',
    model: 'ZT620',
    ipAddress: '192.168.41.254',
    printheadId: 'PH18D3402A001',
    seed: 1001,
    failMeter: 'mediaLength',
    base: {
      totalLabelCount: 36_894,
      totalPrintLength: 466_886,
      printheadOdometer: 261_332_943,
      headUsage: 466_886,
      ribbonLength: 444_702,
      mediaLength: 498,
    },
  },
  {
    printerId: 'DRK-ZT620-002',
    model: 'ZT620',
    ipAddress: '192.168.41.253',
    printheadId: 'PH18D3402B002',
    seed: 2002,
    failMeter: 'ribbonLength',
    base: {
      totalLabelCount: 128_450,
      totalPrintLength: 1_650_234,
      printheadOdometer: 912_345_678,
      headUsage: 1_650_234,
      ribbonLength: 1_502_110,
      mediaLength: 640,
    },
  },
  {
    printerId: 'DRK-ZT620-003',
    model: 'ZT620',
    ipAddress: '192.168.41.252',
    printheadId: 'PH18D3402C003',
    seed: 3003,
    failMeter: 'headUsage',
    base: {
      totalLabelCount: 9_821,
      totalPrintLength: 121_044,
      printheadOdometer: 69_543_210,
      headUsage: 121_044,
      ribbonLength: 110_980,
      mediaLength: 312,
    },
  },
]


// ============================================================
// Helpers
// ============================================================

/** PRNG deterministik (mulberry32) → data dummy konsisten antar run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Majukan state meter satu step (15 menit) dengan inkrement realistis:
 *   - label & print length naik terus;
 *   - printhead odometer naik per label tercetak;
 *   - mediaLength = sisa media roll → random walk terbatas
 *     (meniru data asli yang berada di rentang ratusan, bukan jutaan).
 */
function advance(state: MeterState, rng: () => number): void {
  const deltaLabels = Math.floor(60 + rng() * 300)
  const deltaPrintInches = Math.round(deltaLabels * (11 + rng() * 4))

  state.totalLabelCount += deltaLabels
  state.totalPrintLength += deltaPrintInches
  state.printheadOdometer += Math.round(deltaLabels * (6000 + rng() * 2500))
  state.headUsage += deltaPrintInches
  state.ribbonLength += Math.round(deltaPrintInches * (0.9 + rng() * 0.2))
  state.mediaLength = clamp(
    state.mediaLength + Math.round(-15 + rng() * 18),
    120,
    720,
  )
}

/**
 * Format raw string persis seperti response asli printer
 * (lihat contoh payload di clients/README.md §10.3).
 */
function formatRaw(name: MeterName, value: number): string {
  switch (name) {
    case 'totalLabelCount':
      // Asli: "\"36894\"" (string ber-quote)
      return `"${value}"`
    case 'printheadOdometer':
      // Asli: "261332943" (angka polos)
      return String(value)
    default:
      // Asli: "466886 INCHES, 1185892 CENTIMETERS"
      return `${value} INCHES, ${Math.round(value * 2.54)} CENTIMETERS`
  }
}

/** Bangun `rawMeters` (source of truth) dari state + opsi 1 meter gagal. */
function buildRawMeters(state: MeterState, failMeter?: MeterName): RawMeters {
  const rawMeters: RawMeters = {}
  for (const name of METER_NAMES) {
    if (name === failMeter) {
      rawMeters[name] = {
        raw: null,
        value: null,
        error: 'Tidak ada response (timeout)',
      }
      continue
    }
    rawMeters[name] = { raw: formatRaw(name, state[name]), value: state[name] }
  }
  return rawMeters
}

/** Susun 1 baris `meter_readings` (kolom split + rawMeters sinkron). */
function buildReading(
  printerRowId: number,
  printheadId: string,
  measuredAt: Date,
  state: MeterState,
  failMeter?: MeterName,
): NewMeterReading {
  const pick = (name: MeterName): number | null =>
    name === failMeter ? null : state[name]

  return {
    printerId: printerRowId,
    measuredAt,
    collectorHostname: COLLECTOR_HOSTNAME,
    collectorIp: COLLECTOR_IP,
    printheadId,
    totalLabelCount: pick('totalLabelCount'),
    totalPrintLength: pick('totalPrintLength'),
    printheadOdometer: pick('printheadOdometer'),
    headUsage: pick('headUsage'),
    ribbonLength: pick('ribbonLength'),
    mediaLength: pick('mediaLength'),
    rawMeters: buildRawMeters(state, failMeter),
    // Selaras dengan measuredAt (di data asli createdAt ≈ waktu insert
    // yang berjarak 15 menit antar run).
    createdAt: measuredAt,
  }
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const now = new Date()
  const summaries: string[] = []

  await db.transaction(async (tx) => {
    for (const cfg of DUMMY_PRINTERS) {
      // --- 1) Upsert printer (pola sama dengan routes/printer/post.ts) ---
      const [existing] = await tx
        .select()
        .from(printers)
        .where(eq(printers.printerId, cfg.printerId))
        .limit(1)

      let printerRow = existing
      if (!printerRow) {
        const [inserted] = await tx
          .insert(printers)
          .values({
            printerId: cfg.printerId,
            model: cfg.model,
            ipAddress: cfg.ipAddress,
          })
          .$returningId()
        printerRow = {
          id: inserted.id,
          printerId: cfg.printerId,
          model: cfg.model,
          ipAddress: cfg.ipAddress,
          createdAt: new Date(),
        }
      } else if (
        printerRow.model !== cfg.model ||
        printerRow.ipAddress !== cfg.ipAddress
      ) {
        await tx
          .update(printers)
          .set({ model: cfg.model, ipAddress: cfg.ipAddress })
          .where(eq(printers.id, printerRow.id))
        printerRow = {
          ...printerRow,
          model: cfg.model,
          ipAddress: cfg.ipAddress,
        }
      }

      // --- 2) Hapus reading dummy lama (idempoten; data asli tidak disentuh) ---
      await tx
        .delete(meterReadings)
        .where(eq(meterReadings.printerId, printerRow.id))

      // --- 3) Bangun 10 row: terbaru = sekarang, mundur tiap 15 menit ---
      const rng = mulberry32(cfg.seed)
      const state: MeterState = { ...cfg.base }
      const rows: NewMeterReading[] = []

      for (let i = 0; i < ROWS_PER_PRINHEAD; i++) {
        if (i > 0) advance(state, rng)

        const measuredAt = new Date(
          now.getTime() -
            (ROWS_PER_PRINHEAD - 1 - i) * INTERVAL_MINUTES * 60_000,
        )
        const failMeter = i === FAIL_ROW_INDEX ? cfg.failMeter : undefined

        rows.push(
          buildReading(
            printerRow.id,
            cfg.printheadId,
            measuredAt,
            state,
            failMeter,
          ),
        )
      }

      await tx.insert(meterReadings).values(rows)

      const first = rows[0]!.measuredAt
      const last = rows[rows.length - 1]!.measuredAt
      summaries.push(
        `  • ${cfg.printheadId} (${cfg.printerId}): ${rows.length} row ` +
          `${first.toISOString()} → ${last.toISOString()}` +
          (FAIL_ROW_INDEX >= 0
            ? ` | 1 row gagal baca (${cfg.failMeter})`
            : ''),
      )
    }
  })

  console.log('✅ Dummy data injected ke `meter_readings`:')
  for (const line of summaries) console.log(line)
  console.log(
    `Total: ${DUMMY_PRINTERS.length * ROWS_PER_PRINHEAD} row ` +
      `(spacing ${INTERVAL_MINUTES} menit).`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ injectDummy gagal:', error)
    process.exit(1)
  })

