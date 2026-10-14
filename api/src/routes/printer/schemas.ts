import { z, createRoute } from '@hono/zod-openapi'
import { METER_NAMES } from '../../db/schema'

// ============================================================
// Meter Names (enum — sinkron dengan db/schema.ts)
// ============================================================
export const meterNameSchema = z.enum(METER_NAMES as unknown as [string, ...string[]])

// ============================================================
// Raw Meter Entry  { raw, value, error? }
// ============================================================
export const rawMeterEntrySchema = z
  .object({
    raw: z.string().nullable().openapi({ description: 'Raw string from printer', example: '466886 INCHES, 1185892 CENTIMETERS' }),
    value: z.number().nullable().openapi({ description: 'Parsed numeric value', example: 466886 }),
    error: z.string().optional().openapi({ description: 'Error message if meter read failed' }),
  })
  .openapi('RawMeterEntry')

export const rawMetersSchema = z
  .record(z.string(), rawMeterEntrySchema)
  .openapi('RawMeters')

// ============================================================
// Meters — numerik hasil parse per meter
// PowerShell mengirim angka atau string desimal, atau null.
// ============================================================
export const meterValueSchema = z.union([z.number(), z.string(), z.null()])
export const metersSchema = z.record(z.string(), meterValueSchema).openapi('Meters')

// ============================================================
// POST /api/printer-meter — request body
// ============================================================
export const postBodySchema = z
  .object({
    printerId: z.string().trim().min(1, 'printerId wajib diisi').openapi({ description: 'Printer serial number', example: 'DJ123456789' }),
    model: z.string().trim().min(1, 'model wajib diisi').openapi({ description: 'Printer model', example: 'ZT620' }),
    ipAddress: z.string().trim().min(1, 'ipAddress wajib diisi').openapi({ description: 'Printer IP address', example: '192.168.41.254' }),
    measuredAt: z
      .string()
      .trim()
      .min(1, 'measuredAt wajib diisi')
      .refine((v) => !Number.isNaN(new Date(v).getTime()), {
        message: 'measuredAt bukan tanggal valid (ISO 8601)',
      })
      .openapi({ description: 'ISO 8601 timestamp when reading was taken', example: '2026-10-10T08:32:20.0000000+07:00' }),
    collectorHostname: z.string().optional().openapi({ description: 'Hostname of the collector PC' }),
    collectorIp: z.string().optional().openapi({ description: 'IP of the collector PC that reached the printer' }),
    printheadId: z.string().optional().openapi({ description: 'Printhead serial number' }),
    meters: metersSchema,
    rawMeters: rawMetersSchema,
  })
  .openapi('PrinterMeterPostBody')

export type PostBody = z.infer<typeof postBodySchema>

// ============================================================
// GET /api/printer-meter — query parameters
// ============================================================
export const getQuerySchema = z
  .object({
    limit: z
      .string()
      .optional()
      .openapi({ param: { name: 'limit', in: 'query' }, description: 'Jumlah reading terbaru (1-100)', example: '20' }),
    page: z
      .string()
      .regex(/^[1-9]\d*$/, 'page harus bilangan bulat positif')
      .refine((value) => Number.isSafeInteger(Number(value)) && Number(value) <= 1_000_000, 'page terlalu besar')
      .optional()
      .openapi({ param: { name: 'page', in: 'query' }, description: 'Halaman 1-based', example: '1' }),
    printheadId: z
      .string()
      .optional()
      .openapi({ param: { name: 'printheadId', in: 'query' }, description: 'Filter exact printhead ID' }),
    printheadMissing: z
      .enum(['true'])
      .optional()
      .openapi({ param: { name: 'printheadMissing', in: 'query' }, description: 'Set true to filter readings without a printhead ID' }),
    ipAddress: z
      .string()
      .optional()
      .openapi({ param: { name: 'ipAddress', in: 'query' }, description: 'Filter exact printer IP address' }),
    model: z
      .string()
      .optional()
      .openapi({ param: { name: 'model', in: 'query' }, description: 'Filter exact printer model' }),
    printerId: z
      .string()
      .optional()
      .openapi({ param: { name: 'printerId', in: 'query' }, description: 'Filter exact printer ID' }),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month harus berformat YYYY-MM')
      .optional()
      .openapi({ param: { name: 'month', in: 'query' }, description: 'Filter bulan pengukuran (YYYY-MM), waktu kalender Asia/Jakarta', example: '2026-10' }),
    sort: z
      .enum([
        'measuredAt',
        'totalLabelCount',
        'totalPrintLength',
        'printheadOdometer',
        'headUsage',
        'ribbonLength',
        'mediaLength'
      ])
      .optional()
      .openapi({
        param: { name: 'sort', in: 'query' },
        description: 'Kolom numeric atau tanggal yang diurutkan',
        example: 'measuredAt'
      }),
    direction: z
      .enum(['asc', 'desc'])
      .optional()
      .openapi({ param: { name: 'direction', in: 'query' }, description: 'Arah pengurutan', example: 'desc' }),
  })
  .openapi('PrinterMeterGetQuery')

export type GetQuery = z.infer<typeof getQuerySchema>


// ============================================================
// Response schemas
// ============================================================
export const postResponseDataSchema = z
  .object({
    id: z.number().int().openapi({ description: 'ID meter reading', example: 42 }),
    printerRowId: z.number().int().openapi({ description: 'ID printer row', example: 7 }),
    message: z.string().openapi({ example: 'Meter reading tersimpan' }),
  })
  .openapi('PrinterMeterPostData')

export const readingItemSchema = z
  .object({
    id: z.number().int(),
    printerId: z.string(),
    model: z.string(),
    ipAddress: z.string(),
    measuredAt: z.string().openapi({ description: 'ISO 8601 timestamp', format: 'date-time' }),
    collectorHostname: z.string().nullable(),
    collectorIp: z.string().nullable(),
    printheadId: z.string().nullable(),
    totalLabelCount: z.number().nullable(),
    totalPrintLength: z.number().nullable(),
    printheadOdometer: z.number().nullable(),
    headUsage: z.number().nullable(),
    ribbonLength: z.number().nullable(),
    mediaLength: z.number().nullable(),
    rawMeters: rawMetersSchema,
    createdAt: z.string().openapi({ description: 'Record creation timestamp', format: 'date-time' }),
  })
  .openapi('PrinterMeterReading')

export const getResponseDataSchema = z
  .object({
    count: z.number().int().openapi({ description: 'Total readings matching filters across all pages' }),
    data: z.array(readingItemSchema).openapi({ description: 'Readings for the requested page, newest first' }),
    filters: z.object({
      printheadIds: z.array(z.string()),
      hasMissingPrinthead: z.boolean(),
      ipAddresses: z.array(z.string()),
      models: z.array(z.string()),
      printerIds: z.array(z.string()),
    }).openapi({ description: 'All distinct select-filter values, independent of active filters and pagination' }),
  })
  .openapi('PrinterMeterListData')

// ============================================================
// Route definitions
// ============================================================
export const postRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Printer Meter'],
  summary: 'Simpan meter reading dari Zebra collector',
  description: 'Terima payload meter dari collect-zebra.ps1, upsert printer, dan simpan reading.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: postBodySchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean().openapi({ example: true }),
            data: postResponseDataSchema,
          }),
        },
      },
      description: 'Meter reading berhasil tersimpan',
    },
    400: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean().openapi({ example: false }),
            error: z.string(),
            details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
          }),
        },
      },
      description: 'Payload tidak valid atau gagal diproses',
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
      description: 'Gagal menyimpan ke database',
    },
  },
})

export const getRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Printer Meter'],
  summary: 'Ambil reading terbaru',
  description: 'Ambil meter reading dengan filter printer, printhead, model, IP, dan bulan; mendukung pagination.',
  request: {
    query: getQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean().openapi({ example: true }),
            data: getResponseDataSchema,
          }),
        },
      },
      description: 'Daftar meter readings',
    },
    400: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean().openapi({ example: false }),
            error: z.string(),
            details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
          }),
        },
      },
      description: 'Parameter query tidak valid',
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
