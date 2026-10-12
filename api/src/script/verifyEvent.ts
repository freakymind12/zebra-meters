/** Verifikasi EVENT scheduler 15 menit + isi printhead_benchmarks. */
import { createPool } from 'mysql2/promise'
import { dbConfig } from '../config/env'

const pool = createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
})

const [sched] = await pool.query('SELECT @@GLOBAL.event_scheduler AS scheduler')
console.log('event_scheduler:', (sched as Array<Record<string, unknown>>)[0])

const [events] = await pool.query(
  'SELECT EVENT_NAME, STATUS, EVENT_DEFINITION, `INTERVAL_VALUE`, `INTERVAL_FIELD`, STARTS, LAST_EXECUTED, STATUS AS state ' +
    'FROM INFORMATION_SCHEMA.EVENTS WHERE EVENT_NAME = ?',
  ['ev_refresh_printhead_benchmarks'],
)
console.log('event:', events)

const [counts] = await pool.query(
  'SELECT COUNT(*) AS n, MAX(updated_at) AS last_update FROM printhead_benchmarks',
)
console.log('benchmarks:', counts)

await pool.end()
process.exit(0)
