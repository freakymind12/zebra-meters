import { and, asc, count, desc, eq, isNotNull } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '../../db/client'
import { printheadBenchmarks } from '../../db/schema'
import { createOpenAPIApp } from '@config/api-response'
import logger from '@config/logger'
import { benchmarkRoute, type BenchmarkQuery } from './schemas'

const app = createOpenAPIApp()

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const DEFAULT_SORT = 'head_usage_delta'

/**
 * Parse & clamp limit query param — lenient: omitted/invalid/non-positive
 * uses the default (50), values above 100 are capped at 100.
 */
function parseLimit(raw: BenchmarkQuery['limit']): number {
  if (raw === undefined || raw === '') return DEFAULT_LIMIT
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(Math.floor(n), MAX_LIMIT)
}

/**
 * Whitelist sort key -> Drizzle numeric column.
 * Nilai query TIDAK pernah diinterpolasi ke SQL — hanya key yang dikenal
 * dipetakan ke kolom konkret, key lain jatuh ke default.
 */
const SORT_COLUMNS = {
  reading_count: printheadBenchmarks.readingCount,
  lifespan: printheadBenchmarks.lifespanMinutes,
  head_usage_delta: printheadBenchmarks.headUsageDelta,
  odometer_delta: printheadBenchmarks.printheadOdometerDelta,
  total_label_count_delta: printheadBenchmarks.totalLabelCountDelta,
  total_print_length_delta: printheadBenchmarks.totalPrintLengthDelta,
  ribbon_length_delta: printheadBenchmarks.ribbonLengthDelta,
  media_length_delta: printheadBenchmarks.mediaLengthDelta,
} as const

type SortKey = keyof typeof SORT_COLUMNS

function resolveSortColumn(raw: BenchmarkQuery['sort']) {
  const key = (raw ?? DEFAULT_SORT).trim().toLowerCase() as SortKey
  return SORT_COLUMNS[key] ?? SORT_COLUMNS[DEFAULT_SORT]
}

// ============================================================
// GET /api/printhead-benchmark?page=&limit=&head=&model=&sort=&direction=
// ============================================================
app.openapi(benchmarkRoute, async (c) => {
  const query = c.req.valid('query') as BenchmarkQuery
  const limit = parseLimit(query.limit)
  const page = query.page ? Number(query.page) : 1
  const head = typeof query.head === 'string' && query.head.trim() !== '' ? query.head.trim() : null
  const model = typeof query.model === 'string' && query.model.trim() !== '' ? query.model.trim() : null
  const direction = query.direction ?? 'desc'
  const sortColumn = resolveSortColumn(query.sort)

  // Satu kondisi filter yang dipakai baik untuk query halaman maupun count total.
  const filters: SQL[] = []
  if (head) filters.push(eq(printheadBenchmarks.printheadId, head))
  if (model) filters.push(eq(printheadBenchmarks.lastModel, model))
  const where = filters.length ? and(...filters) : undefined

  const orderBy = [
    direction === 'asc' ? asc(sortColumn) : desc(sortColumn),
    // Tie-breaker deterministik agar urutan stabil antar halaman.
    asc(printheadBenchmarks.printheadId),
  ]

  try {
    const rows = await db
      .select()
      .from(printheadBenchmarks)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset((page - 1) * limit)

    const [totalRow] = await db
      .select({ value: count() })
      .from(printheadBenchmarks)
      .where(where)

    // Pilihan model selalu seluruh dataset (tanpa filter model/page).
    const modelRows = await db
      .selectDistinct({ lastModel: printheadBenchmarks.lastModel })
      .from(printheadBenchmarks)
      .where(isNotNull(printheadBenchmarks.lastModel))
      .orderBy(asc(printheadBenchmarks.lastModel))

    const models = modelRows
      .map((r) => r.lastModel)
      .filter((m): m is string => typeof m === 'string' && m !== '')

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
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
    }))

    return c.json(
      { success: true, data: { count: Number(totalRow?.value ?? 0), data, models } },
      200,
    )
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
