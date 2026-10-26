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
    page: z
      .string()
      .regex(/^[1-9]\d*$/, 'page harus bilangan bulat positif')
      .optional()
      .openapi({
        param: { name: 'page', in: 'query' },
        description: '1-based page number (default: 1)',
        example: '1',
      }),
    limit: z
      .string()
      .optional()
      .openapi({
        param: { name: 'limit', in: 'query' },
        description: 'Page size, 1-100 (default: 50)',
        example: '50',
      }),
    model: z
      .string()
      .optional()
      .openapi({
        param: { name: 'model', in: 'query' },
        description: 'Filter by exact lastModel',
        example: 'ZT620',
      }),
    status: z
      .enum(['ACTIVE', 'INACTIVE'])
      .optional()
      .openapi({
        param: { name: 'status', in: 'query' },
        description: 'Filter status pemeliharaan head: ACTIVE | INACTIVE',
        example: 'ACTIVE',
      }),
    sort: z
      .string()
      .optional()
      .openapi({
        param: { name: 'sort', in: 'query' },
        description:
          'Sort key: reading_count | lifespan | head_usage_delta | odometer_delta | total_label_count_delta | total_print_length_delta | ribbon_length_delta | media_length_delta (default: head_usage_delta)',
        example: 'head_usage_delta',
      }),
    direction: z
      .enum(['asc', 'desc'])
      .optional()
      .openapi({
        param: { name: 'direction', in: 'query' },
        description: 'Sort direction: asc | desc (default: desc)',
        example: 'desc',
      }),
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
    collectorHostname: z.string().nullable(),
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
    status: z.enum(['ACTIVE', 'INACTIVE']),
    updatedAt: z.string().openapi({ format: 'date-time' }),
  })
  .openapi('PrintheadBenchmark')

export const benchmarkListDataSchema = z
  .object({
    count: z
      .number()
      .int()
      .openapi({ description: 'Total baris yang cocok dengan filter (seluruh halaman)' }),
    data: z.array(benchmarkItemSchema).openapi({ description: 'Hanya baris pada halaman yang diminta' }),
    models: z
      .array(z.string())
      .openapi({ description: 'Semua nilai lastModel unik (non-null) untuk pilihan filter' }),
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
    400: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean().openapi({ example: false }),
            error: z.string().openapi({ example: 'Validation failed' }),
            details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
          }),
        },
      },
      description: 'Parameter query tidak valid (page/direction)',
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
