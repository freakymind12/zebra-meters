import { Hono } from 'hono'
import { printerMeterRoutes } from './routes/printer-meter'

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

export default app
