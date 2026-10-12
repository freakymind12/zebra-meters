import { z, createRoute } from '@hono/zod-openapi'

// ============================================================
// GET /api/printhead-benchmark — query parameters
// ============================================================
export const benchmarkQuerySchema = z
  .object({
    head: z
      .string()
      .optional()
      .openapi({
        param: { name: 'head', in: 'query' },
        description: 'Filter 1 printhead_id (exact match)',
        example: 'PH18D3402A001',
      }),
    sort: z
      .string()
      .optional()
      .openapi({
        param: { name: 'sort', in: 'query' },
        description: 'Sortir: head_usage_delta | odometer_delta | lifespan | last_seen (default: head_usage_delta)',
        example: 'head_usage_delta',
      }),
    limit: z
      .string()
      .optional()
      .openapi({ param: { name: 'limit', in: 'query' }, description: 'Jumlah baris (1-100)', example: '20' }),
  })
  .openapi('PrintheadBenchmarkGetQuery')

export type BenchmarkQuery = z.infer<typeof benchmarkQuerySchema>

// ============================================================
// Response item — 1 baris printhead_benchmarks (camelCase)
// ============================================================
export const benchmarkItemSchema = z
  .object({
    id: z.number().int(),
    printheadId: z.string(),
    firstPrinterId: z.number().nullable(),
    lastPrinterId: z.number().nullable(),
    firstModel: z.string().nullable(),
    lastModel: z.string().nullable(),
    firstSeenAt: z.string().openapi({ format: 'date-time' }),
    lastSeenAt: z.string().openapi({ format: 'date-time' }),
    readingCount: z.number().int(),
    lifespanMinutes: z.number().nullable(),
    totalLabelCountFirst: z.number().nullable(),
    totalLabelCountLast: z.number().nullable(),
    totalLabelCountDelta: z.number().nullable(),
    totalPrintLengthFirst: z.number().nullable(),
    totalPrintLengthLast: z.number().nullable(),
    totalPrintLengthDelta: z.number().nullable(),
    printheadOdometerFirst: z.number().nullable(),
    printheadOdometerLast: z.number().nullable(),
    printheadOdometerDelta: z.number().nullable(),
    headUsageFirst: z.number().nullable(),
    headUsageLast: z.number().nullable(),
    headUsageDelta: z.number().nullable(),
    ribbonLengthFirst: z.number().nullable(),
    ribbonLengthLast: z.number().nullable(),
    ribbonLengthDelta: z.number().nullable(),
    mediaLengthFirst: z.number().nullable(),
    mediaLengthLast: z.number().nullable(),
    mediaLengthDelta: z.number().nullable(),
    hasNegativeDelta: z.boolean(),
    updatedAt: z.string().openapi({ format: 'date-time' }),
  })
  .openapi('PrintheadBenchmark')

export const benchmarkListDataSchema = z
  .object({
    count: z.number().int().openapi({ description: 'Jumlah baris' }),
    data: z.array(benchmarkItemSchema).openapi({ description: 'Agregat per printhead' }),
  })
  .openapi('PrintheadBenchmarkListData')

// ============================================================
// Route definition
// ============================================================
export const benchmarkRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Printhead Benchmark'],
  summary: 'Ambil benchmark count per printhead',
  description:
    'Baca tabel printhead_benchmarks (olahan dari meter_readings via SP sp_refresh_printhead_benchmarks).',
  request: { query: benchmarkQuerySchema },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean().openapi({ example: true }),
            data: benchmarkListDataSchema,
          }),
        },
      },
      description: 'Daftar benchmark printhead',
    },
    500: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean().openapi({ example: false }),
            error: z.string(),
          }),
        },
      },
      description: 'Gagal membaca dari database',
    },
  },
})
