/**
 * Printer Meter routes — mounted at /api/printer-meter
 *
 * Struktur: tiap endpoint di-separate ke file masing-masing.
 * Sub-app menggunakan basePath agar path dalam OpenAPI doc = /api/printer-meter/...
 *
 *   post.ts  → POST /
 *   get.ts   → GET /
 *   index.ts → mount semua di bawah /api/printer-meter
 */
import { createOpenAPIApp } from '@config/api-response'
import { postRouteApp } from './post'
import { getRouteApp } from './get'

// Sub-app gabungan — basePath memastikan path OpenAPI = /api/printer-meter/{method}
const printerMeterApp = createOpenAPIApp()

// Mount endpoint sub-apps
printerMeterApp.route('/', postRouteApp)
printerMeterApp.route('/', getRouteApp)

export { printerMeterApp }

