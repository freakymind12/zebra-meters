import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { printheadBenchmarks } from '../../db/schema'
import { createOpenAPIApp } from '@config/api-response'
import logger from '@config/logger'
import { benchmarkRoute, type BenchmarkQuery } from './schemas'

const app = createOpenAPIApp()

function parseLimit(raw: BenchmarkQuery['limit']): number {
  if (raw === undefined || raw === '') return 50
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 50
  return Math.min(Math.floor(n), 100)
}

// ============================================================
// GET /api/printhead-benchmark?head=&sort=&limit=
// ============================================================
app.openapi(benchmarkRoute, async (c) => {
  const query = c.req.valid('query') as BenchmarkQuery
  const limit = parseLimit(query.limit)
  const head = typeof query.head === 'string' && query.head.trim() !== '' ? query.head.trim() : null
  const sort = (query.sort ?? 'head_usage_delta').trim().toLowerCase()

  try {
    const orderBy =
      sort === 'odometer_delta'
        ? desc(printheadBenchmarks.printheadOdometerDelta)
        : sort === 'lifespan'
          ? desc(printheadBenchmarks.lifespanMinutes)
          : sort === 'last_seen'
            ? desc(printheadBenchmarks.lastSeenAt)
            : desc(printheadBenchmarks.headUsageDelta)

    const base = db
      .select()
      .from(printheadBenchmarks)
      .orderBy(orderBy)
      .limit(limit)

    const rows = head
      ? await db
          .select()
          .from(printheadBenchmarks)
          .where(eq(printheadBenchmarks.printheadId, head))
          .orderBy(orderBy)
          .limit(limit)
      : await base

    const data = rows.map((r) => ({
      id: r.id,
      printheadId: r.printheadId,
      firstPrinterId: r.firstPrinterId,
      lastPrinterId: r.lastPrinterId,
      firstModel: r.firstModel,
      lastModel: r.lastModel,
      firstSeenAt: r.firstSeenAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      readingCount: r.readingCount,
      lifespanMinutes: r.lifespanMinutes,
      totalLabelCountFirst: r.totalLabelCountFirst,
      totalLabelCountLast: r.totalLabelCountLast,
      totalLabelCountDelta: r.totalLabelCountDelta,
      totalPrintLengthFirst: r.totalPrintLengthFirst,
      totalPrintLengthLast: r.totalPrintLengthLast,
      totalPrintLengthDelta: r.totalPrintLengthDelta,
      printheadOdometerFirst: r.printheadOdometerFirst,
      printheadOdometerLast: r.printheadOdometerLast,
      printheadOdometerDelta: r.printheadOdometerDelta,
      headUsageFirst: r.headUsageFirst,
      headUsageLast: r.headUsageLast,
      headUsageDelta: r.headUsageDelta,
      ribbonLengthFirst: r.ribbonLengthFirst,
      ribbonLengthLast: r.ribbonLengthLast,
      ribbonLengthDelta: r.ribbonLengthDelta,
      mediaLengthFirst: r.mediaLengthFirst,
      mediaLengthLast: r.mediaLengthLast,
      mediaLengthDelta: r.mediaLengthDelta,
      hasNegativeDelta: r.hasNegativeDelta,
      updatedAt: r.updatedAt.toISOString(),
    }))

    return c.json({ success: true, data: { count: data.length, data } }, 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`[GET /api/printhead-benchmark] DB error: ${message}`)
    // Tabel belum ada (db:push belum jalan) -> pesan jelas, bukan 500 misterius.
    if (/doesn't exist|unknown table|1146/i.test(message)) {
      return c.json(
        {
          success: false,
          error:
            'Tabel printhead_benchmarks belum ada — jalankan `bun run db:push` lalu `bun run benchmark:refresh`.',
        },
        500,
      )
    }
    return c.json({ success: false, error: 'Gagal membaca data dari database' }, 500)
  }
})

export { app as benchmarkRouteApp }
