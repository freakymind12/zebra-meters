import { Hono } from 'hono'
import { desc, eq } from 'drizzle-orm'
import { resolveApiKey } from '../config'
import { db } from '../db/client'
import {
  type MeterName,
  type RawMeterEntry,
  type RawMeters,
  meterReadings,
  printers,
} from '../db/schema'

// ============================================================
// Endpoint untuk collect-zebra.ps1 (Send-ToApi)
// ------------------------------------------------------------
// POST /api/printer-meter  — payload lihat clients/README.md §10.3
// GET  /api/printer-meter  — baca reading terbaru (untuk testing)
// ============================================================

const routes = new Hono()

// ------------------------------------------------------------
// Payload types (bentuk JSON dari ConvertTo-Json di PowerShell)
// ------------------------------------------------------------
interface PostPayload {
  printerId?: unknown
  model?: unknown
  ipAddress?: unknown
  measuredAt?: unknown
  collectorHostname?: unknown
  collectorIp?: unknown
  printheadId?: unknown
  meters?: unknown
  rawMeters?: unknown
}

// ------------------------------------------------------------
// Helpers validasi (tanpa dependency tambahan)
// ------------------------------------------------------------
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Ambil nilai numerik untuk kolom split dari payload `meters`.
 * Hasil: number (jika valid) atau null (gagal dibaca / tidak ada).
 */
function pickMeterValue(
  meters: Record<string, unknown>,
  name: MeterName,
): number | null {
  const raw = meters[name]
  if (isFiniteNumber(raw)) return raw
  // PowerShell bisa mengirim decimal sebagai string angka — terima juga.
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * Validasi struktur `rawMeters`. Dipakai apa adanya sebagai source of truth —
 * hanya dipastikan tiap entry punya bentuk { raw, value, error? }.
 */
function sanitizeRawMeters(
  value: unknown,
): { ok: true; data: RawMeters } | { ok: false; reason: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'rawMeters harus berupa object' }
  }

  const result: RawMeters = {}

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        ok: false,
        reason: `rawMeters.${key} harus berupa object { raw, value, error? }`,
      }
    }

    const e = entry as Record<string, unknown>
    const sanitized: RawMeterEntry = {
      raw: typeof e.raw === 'string' ? e.raw : null,
      value: isFiniteNumber(e.value) ? e.value : null,
    }
    if (typeof e.error === 'string') sanitized.error = e.error

    result[key] = sanitized
  }

  return { ok: true, data: result }
}

// ============================================================
// POST /api/printer-meter
// ============================================================
routes.post('/', async (c) => {
  // --------------------------------------------------------
  // API key (opsional) — aktif hanya jika env API_KEY di-set
  // --------------------------------------------------------
  const expectedApiKey = resolveApiKey()
  if (expectedApiKey) {
    const providedApiKey = c.req.header('X-API-Key') ?? ''
    if (providedApiKey !== expectedApiKey) {
      return c.json({ ok: false, error: 'Invalid or missing X-API-Key' }, 401)
    }
  }

  // --------------------------------------------------------
  // Parse body
  // --------------------------------------------------------
  let body: PostPayload
  try {
    body = await c.req.json<PostPayload>()
  } catch {
    return c.json({ ok: false, error: 'Body harus berupa JSON valid' }, 400)
  }

  if (body === null || typeof body !== 'object') {
    return c.json({ ok: false, error: 'Body harus berupa object JSON' }, 400)
  }

  // --------------------------------------------------------
  // Validasi field wajib
  // --------------------------------------------------------
  if (!isNonEmptyString(body.printerId)) {
    return c.json({ ok: false, error: 'printerId wajib diisi' }, 400)
  }
  if (!isNonEmptyString(body.model)) {
    return c.json({ ok: false, error: 'model wajib diisi' }, 400)
  }
  if (!isNonEmptyString(body.ipAddress)) {
    return c.json({ ok: false, error: 'ipAddress wajib diisi' }, 400)
  }
  if (!isNonEmptyString(body.measuredAt)) {
    return c.json({ ok: false, error: 'measuredAt wajib diisi (ISO 8601)' }, 400)
  }

  const measuredAt = new Date(body.measuredAt)
  if (Number.isNaN(measuredAt.getTime())) {
    return c.json(
      { ok: false, error: `measuredAt bukan tanggal valid: ${body.measuredAt}` },
      400,
    )
  }

  if (
    body.meters === null ||
    typeof body.meters !== 'object' ||
    Array.isArray(body.meters)
  ) {
    return c.json({ ok: false, error: 'meters harus berupa object' }, 400)
  }

  const rawMetersResult = sanitizeRawMeters(body.rawMeters)
  if (!rawMetersResult.ok) {
    return c.json({ ok: false, error: rawMetersResult.reason }, 400)
  }

  const meters = body.meters as Record<string, unknown>
  const rawMeters = rawMetersResult.data

  // Serial printhead (opsional — kompatibel dengan client lama).
  const printheadId = isNonEmptyString(body.printheadId)
    ? body.printheadId.trim()
    : null

  // --------------------------------------------------------
  // Simpan dalam 1 transaction: upsert printer -> insert reading
  // --------------------------------------------------------
  try {
    const result = await db.transaction(async (tx) => {
      // Upsert printer
      const [existing] = await tx
        .select()
        .from(printers)
        .where(eq(printers.printerId, body.printerId as string))
        .limit(1)

      let printerRow = existing
      if (!printerRow) {
        const [inserted] = await tx
          .insert(printers)
          .values({
            printerId: body.printerId as string,
            model: body.model as string,
            ipAddress: body.ipAddress as string,
          })
          .$returningId()
        printerRow = {
          id: inserted.id,
          printerId: body.printerId as string,
          model: body.model as string,
          ipAddress: body.ipAddress as string,
          createdAt: new Date(),
        }
      } else if (
        printerRow.model !== body.model ||
        printerRow.ipAddress !== body.ipAddress
      ) {
        // Printer sudah ada tapi model/IP berubah (config.json di-update) → sinkronkan.
        await tx
          .update(printers)
          .set({ model: body.model as string, ipAddress: body.ipAddress as string })
          .where(eq(printers.id, printerRow.id))
        printerRow = {
          ...printerRow,
          model: body.model as string,
          ipAddress: body.ipAddress as string,
        }
      }

      // Insert reading dengan kolom split + rawMeters (source of truth)
      const [insertedReading] = await tx
        .insert(meterReadings)
        .values({
        printerId: printerRow.id,
        measuredAt,
        collectorHostname:
          typeof body.collectorHostname === 'string' && body.collectorHostname !== ''
            ? body.collectorHostname
            : null,
        collectorIp:
          typeof body.collectorIp === 'string' && body.collectorIp !== ''
            ? body.collectorIp
            : null,
        printheadId,
        totalLabelCount: pickMeterValue(meters, 'totalLabelCount'),
        totalPrintLength: pickMeterValue(meters, 'totalPrintLength'),
        printheadOdometer: pickMeterValue(meters, 'printheadOdometer'),
        headUsage: pickMeterValue(meters, 'headUsage'),
        ribbonLength: pickMeterValue(meters, 'ribbonLength'),
        mediaLength: pickMeterValue(meters, 'mediaLength'),
        rawMeters,
        })
        .$returningId()

      return {
        readingId: insertedReading.id,
        printerId: printerRow.id,
      }
    })

    return c.json(
      {
        ok: true,
        id: result.readingId,
        printerRowId: result.printerId,
        message: 'Meter reading tersimpan',
      },
      201,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/printer-meter] DB error:', message)
    return c.json({ ok: false, error: 'Gagal menyimpan data ke database' }, 500)
  }
})

// ============================================================
// GET /api/printer-meter?limit=N — reading terbaru (untuk testing)
// ============================================================
routes.get('/', async (c) => {
  const limitRaw = Number(c.req.query('limit') ?? '20')
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 20

  try {
    const rows = await db
      .select({
        id: meterReadings.id,
        printerId: printers.printerId,
        model: printers.model,
        ipAddress: printers.ipAddress,
        measuredAt: meterReadings.measuredAt,
        collectorHostname: meterReadings.collectorHostname,
        collectorIp: meterReadings.collectorIp,
        printheadId: meterReadings.printheadId,
        totalLabelCount: meterReadings.totalLabelCount,
        totalPrintLength: meterReadings.totalPrintLength,
        printheadOdometer: meterReadings.printheadOdometer,
        headUsage: meterReadings.headUsage,
        ribbonLength: meterReadings.ribbonLength,
        mediaLength: meterReadings.mediaLength,
        rawMeters: meterReadings.rawMeters,
        createdAt: meterReadings.createdAt,
      })
      .from(meterReadings)
      .innerJoin(printers, eq(meterReadings.printerId, printers.id))
      // Ambil N reading termuda (index desc) lalu tampilkan terbaru di atas.
      .orderBy(desc(meterReadings.measuredAt))
      .limit(limit)

    return c.json({ ok: true, count: rows.length, data: rows })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/printer-meter] DB error:', message)
    return c.json({ ok: false, error: 'Gagal membaca data dari database' }, 500)
  }
})

export { routes as printerMeterRoutes }


