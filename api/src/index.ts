import { swaggerUI } from '@hono/swagger-ui'
import { env } from '@config/env'
import { createOpenAPIApp, globalErrorHandler } from '@config/api-response'
import { loggerMiddleware } from '@middleware/logger'
import { printerMeterApp } from '@routes/printer'
import { printheadBenchmarkApp } from '@routes/printhead-benchmark'

// ============================================================
// Root app (OpenAPIHono — swagger UI + OpenAPI doc)
// ============================================================
const app = createOpenAPIApp()

// Global error handler — untuk semua error yang tidak tertangani route
app.onError(globalErrorHandler)

// Request logging
app.use('*', loggerMiddleware)

// ------------------------------------------------------------
// Base / health
// ------------------------------------------------------------
app.get('/', (c) =>
  c.json({
    name: 'ZebraMeter API',
    docs: '/docs',
    endpoints: {
      health: 'GET /health',
      postReading: 'POST /api/printer-meter',
      listReadings: 'GET /api/printer-meter?limit=20',
      benchmarks: 'GET /api/printhead-benchmark?limit=50',
      openapiJson: 'GET /openapi.json',
    },
  }),
)

app.get('/health', (c) => c.json({ success: true, data: { status: 'up' } }))

// ------------------------------------------------------------
// Routes — printer meter (POST + GET) & printhead benchmark
// ------------------------------------------------------------
app.route('/api/printer-meter', printerMeterApp)
app.route('/api/printhead-benchmark', printheadBenchmarkApp)

// ------------------------------------------------------------
// OpenAPI + Swagger UI
// ------------------------------------------------------------
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'ZebraMeter API',
    version: '1.0.0',
    description: 'REST API untuk menerima data meter printer Zebra dan menyimpannya ke MySQL.',
  },
  servers: [{ url: `http://localhost:${env.PORT}`, description: 'Development' }],
})

app.get('/docs', swaggerUI({ url: '/openapi.json', docExpansion: 'list' }))

// ============================================================
// Start
// ============================================================
console.log(`ZebraMeter API listening on :${env.PORT}`)
console.log(`Swagger UI: http://localhost:${env.PORT}/docs`)

export default { port: env.PORT, fetch: app.fetch }
