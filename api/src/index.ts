import { Hono } from 'hono'
import { port, resolveApiKey } from './config'
import { printerMeterRoutes } from './routes/printer-meter'

// Fail-fast di production: DB_* sudah divalidasi saat modul db/client di-import,
// di sini kita memastikan API_KEY juga tersedia sebelum server melayani request.
resolveApiKey()

const app = new Hono()

// ------------------------------------------------------------
// Base
// ------------------------------------------------------------
app.get('/', (c) => {
  return c.json({
    name: 'ZebraMeter API',
    endpoints: {
      health: 'GET /health',
      postReading: 'POST /api/printer-meter',
      listReadings: 'GET /api/printer-meter?limit=20',
    },
  })
})

app.get('/health', (c) => {
  return c.json({ ok: true, status: 'up' })
})

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------
app.route('/api/printer-meter', printerMeterRoutes)

console.log(`ZebraMeter API listening on :${port}`)

// Format ini membuat PORT dari environment authoritative untuk Bun auto-serve.
export default { port, fetch: app.fetch }
