import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  type MeterName,
  type RawMeters,
  meterReadings,
  printers,
} from '../../db/schema'
import { createOpenAPIApp } from '@config/api-response'
import logger from '@config/logger'
import { postRoute, type PostBody } from './schemas'

const app = createOpenAPIApp()

/**
 * Ambil nilai numerik untuk kolom split dari payload `meters`.
 * Hasil: number (jika valid) atau null (gagal dibaca / tidak ada).
 *
 * PowerShell bisa mengirim angka atau string desimal — terima keduanya.
 */
function pickMeterValue(
  meters: Record<string, unknown>,
  name: MeterName,
): number | null {
  const raw = meters[name]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

// ============================================================
// POST /api/printer-meter
// ============================================================
app.openapi(postRoute, async (c) => {
  const body = c.req.valid('json') as PostBody

  const measuredAt = new Date(body.measuredAt)
  const meters = body.meters as Record<string, unknown>
  const rawMeters: RawMeters = body.rawMeters

  // Serial printhead (opsional — kompatibel dengan client lama).
  const printheadId =
    typeof body.printheadId === 'string' && body.printheadId.trim() !== ''
      ? body.printheadId.trim()
      : null

  const collectorHostname =
    typeof body.collectorHostname === 'string' && body.collectorHostname !== ''
      ? body.collectorHostname
      : null
  const collectorIp =
    typeof body.collectorIp === 'string' && body.collectorIp !== ''
      ? body.collectorIp
      : null

  // ----------------------------------------------------------
  // Simpan dalam 1 transaction: upsert printer -> insert reading
  // ----------------------------------------------------------
  try {
    const result = await db.transaction(async (tx) => {
      // Upsert printer
      const [existing] = await tx
        .select()
        .from(printers)
        .where(eq(printers.printerId, body.printerId))
        .limit(1)

      let printerRow = existing
      if (!printerRow) {
        const [inserted] = await tx
          .insert(printers)
          .values({
            printerId: body.printerId,
            model: body.model,
            ipAddress: body.ipAddress,
          })
          .$returningId()
        printerRow = {
          id: inserted.id,
          printerId: body.printerId,
          model: body.model,
          ipAddress: body.ipAddress,
          createdAt: new Date(),
        }
      } else if (
        printerRow.model !== body.model ||
        printerRow.ipAddress !== body.ipAddress
      ) {
        // Printer sudah ada tapi model/IP berubah → sinkronkan.
        await tx
          .update(printers)
          .set({ model: body.model, ipAddress: body.ipAddress })
          .where(eq(printers.id, printerRow.id))
        printerRow = {
          ...printerRow,
          model: body.model,
          ipAddress: body.ipAddress,
        }
      }

      // Insert reading dengan kolom split + rawMeters (source of truth)
      const [insertedReading] = await tx
        .insert(meterReadings)
        .values({
          printerId: printerRow.id,
          measuredAt,
          collectorHostname,
          collectorIp,
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
        printerRowId: printerRow.id,
      }
    })

    return c.json(
      {
        success: true,
        data: {
          id: result.readingId,
          printerRowId: result.printerRowId,
          message: 'Meter reading tersimpan',
        },
      },
      201,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`[POST /api/printer-meter] DB error: ${message}`)
    return c.json(
      { success: false, error: 'Gagal menyimpan data ke database' },
      500,
    )
  }
})

export { app as postRouteApp }

