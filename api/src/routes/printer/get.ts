import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { meterReadings, printers } from '../../db/schema'
import { createOpenAPIApp } from '@config/api-response'
import logger from '@config/logger'
import { getRoute, type GetQuery } from './schemas'

const app = createOpenAPIApp()

/**
 * Parse & clamp limit query param — lenient: invalid/non-numeric defaults to 20.
 */
function parseLimit(raw: GetQuery['limit']): number {
  if (raw === undefined || raw === '') return 20
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 20
  return Math.min(Math.floor(n), 100)
}

// ============================================================
// GET /api/printer-meter?limit=N — reading terbaru
// ============================================================
app.openapi(getRoute, async (c) => {
  const { limit: limitStr } = c.req.valid('query') as GetQuery
  const limit = parseLimit(limitStr)

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
      // Ambil N reading termuda, lalu tampilkan terbaru di atas.
      .orderBy(desc(meterReadings.measuredAt))
      .limit(limit)

    // Serialize Date -> ISO string agar sesuai schema response.
    const data = rows.map((row) => ({
      ...row,
      measuredAt: row.measuredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }))

    return c.json(
      {
        success: true,
        data: {
          count: data.length,
          data,
        },
      },
      200,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`[GET /api/printer-meter] DB error: ${message}`)
    return c.json(
      { success: false, error: 'Gagal membaca data dari database' },
      500,
    )
  }
})

export { app as getRouteApp }
