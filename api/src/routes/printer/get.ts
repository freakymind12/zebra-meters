import { and, asc, count, desc, eq, gte, isNull, lt } from 'drizzle-orm'
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

function getJakartaMonthRange(month: string): { start: Date, end: Date } {
  const [year, monthNumber] = month.split('-').map(Number)
  const jakartaOffsetMs = 7 * 60 * 60 * 1000
  const start = new Date(0)
  start.setUTCFullYear(year, monthNumber - 1, 1)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)

  return {
    start: new Date(start.getTime() - jakartaOffsetMs),
    end: new Date(end.getTime() - jakartaOffsetMs)
  }
}

// ============================================================
// GET /api/printer-meter — filtered and paginated readings
// ============================================================
app.openapi(getRoute, async (c) => {
  const query = c.req.valid('query') as GetQuery
  const { limit: limitStr } = query
  const limit = parseLimit(limitStr)
  const page = query.page ? Number(query.page) : 1
  const month = query.month?.trim()
  const sortKey = query.sort ?? 'measuredAt'
  const direction = query.direction ?? 'desc'
  const filters = []
  const sortColumns = {
    measuredAt: meterReadings.measuredAt,
    totalLabelCount: meterReadings.totalLabelCount,
    totalPrintLength: meterReadings.totalPrintLength,
    printheadOdometer: meterReadings.printheadOdometer,
    headUsage: meterReadings.headUsage,
    ribbonLength: meterReadings.ribbonLength,
    mediaLength: meterReadings.mediaLength
  } as const
  const sortColumn = sortColumns[sortKey]
  const orderBy = direction === 'asc' ? asc(sortColumn) : desc(sortColumn)

  if (query.printheadMissing === 'true') {
    filters.push(isNull(meterReadings.printheadId))
  } else if (query.printheadId?.trim()) {
    filters.push(eq(meterReadings.printheadId, query.printheadId.trim()))
  }
  if (query.ipAddress?.trim()) filters.push(eq(printers.ipAddress, query.ipAddress.trim()))
  if (query.model?.trim()) filters.push(eq(printers.model, query.model.trim()))
  if (query.printerId?.trim()) filters.push(eq(printers.printerId, query.printerId.trim()))
  if (month) {
    const range = getJakartaMonthRange(month)
    filters.push(gte(meterReadings.measuredAt, range.start), lt(meterReadings.measuredAt, range.end))
  }
  const where = and(...filters)

  try {
    const [rows, [{ value: total }], printheadRows, ipRows, modelRows, printerRows] = await Promise.all([
      db
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
        .where(where)
        .orderBy(orderBy, desc(meterReadings.id))
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({ value: count() })
        .from(meterReadings)
        .innerJoin(printers, eq(meterReadings.printerId, printers.id))
        .where(where),
      db.selectDistinct({ value: meterReadings.printheadId })
        .from(meterReadings),
      db.selectDistinct({ value: printers.ipAddress })
        .from(meterReadings)
        .innerJoin(printers, eq(meterReadings.printerId, printers.id)),
      db.selectDistinct({ value: printers.model })
        .from(meterReadings)
        .innerJoin(printers, eq(meterReadings.printerId, printers.id)),
      db.selectDistinct({ value: printers.printerId })
        .from(meterReadings)
        .innerJoin(printers, eq(meterReadings.printerId, printers.id)),
    ])

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
          count: total,
          data,
          filters: {
            printheadIds: printheadRows.flatMap((row) => row.value ? [row.value] : []).sort(),
            hasMissingPrinthead: printheadRows.some((row) => row.value === null),
            ipAddresses: ipRows.map((row) => row.value).sort(),
            models: modelRows.map((row) => row.value).sort(),
            printerIds: printerRows.map((row) => row.value).sort(),
          },
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
