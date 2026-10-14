/**
 * migrateBenchmarks.ts — runner idempoten untuk SP + EVENT trigger.
 *
 * Script ini hanya menerapkan stored procedure dan event scheduler
 * ke database. Tabel diasumsikan sudah ada (via `db:push` atau
 * migration lain).
 *
 * Jalankan dari folder `api/`: bun src/script/migrateBenchmarks.ts
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPool } from 'mysql2/promise'
import { dbConfig } from '../config/env'

const here = dirname(fileURLToPath(import.meta.url))
const SP_FILE = join(here, '..', 'db', 'procedures', 'sp_refresh_printhead_benchmarks.sql')
const EVENT_FILE = join(here, '..', 'db', 'procedures', 'ev_refresh_printhead_benchmarks.sql')

function splitSp(source: string): string[] {
  const lines = source.split(/\r?\n/)
  const out: string[] = []
  let delimiter = ';'
  let buf: string[] = []
  const flush = () => {
    const stmt = buf.join('\n').trim()
    buf = []
    if (stmt !== '') out.push(stmt)
  }
  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (trimmed === '' || trimmed.startsWith('--')) continue
    const upper = trimmed.toUpperCase()
    if (upper.startsWith('DELIMITER ')) {
      flush()
      delimiter = trimmed.slice('DELIMITER '.length).trim() || ';'
      continue
    }
    if (delimiter !== ';' && trimmed.endsWith(delimiter)) {
      buf.push(rawLine.slice(0, rawLine.lastIndexOf(delimiter)))
      flush()
      continue
    }
    buf.push(rawLine)
    if (delimiter === ';' && trimmed.endsWith(';')) flush()
  }
  flush()
  return out.map((s) => s.trim().replace(/;$/, '').trim()).filter((s) => s !== '')
}

async function main(): Promise<void> {
  const pool = createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 2,
    multipleStatements: true,
  })

  try {
    // MySQL 8.4 tidak mendukung CREATE INDEX IF NOT EXISTS —
    // error duplikat diabaikan agar idempoten.
    const sp = readFileSync(SP_FILE, 'utf8')
    for (const stmt of splitSp(sp)) {
      try {
        await pool.query(stmt)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/Duplicate key name|already exists/i.test(message)) continue
        throw error
      }
    }
    console.log('✅ SP applied: sp_refresh_printhead_benchmarks')

    // EVENT scheduler 15 menit (butuh event_scheduler=ON;
    // di Docker sudah via --event-scheduler=ON di compose).
    const eventSql = readFileSync(EVENT_FILE, 'utf8')
    for (const stmt of splitSp(eventSql)) {
      await pool.query(stmt)
    }
    const [schedRows] = await pool.query(
      "SELECT @@GLOBAL.event_scheduler AS scheduler",
    )
    const sched = schedRows as Array<{ scheduler: string }>
    console.log(
      `✅ EVENT applied: ev_refresh_printhead_benchmarks ` +
        `(event_scheduler=${sched[0]?.scheduler ?? 'UNKNOWN'})`,
    )
    if (String(sched[0]?.scheduler ?? '').toUpperCase() !== 'ON') {
      console.warn(
        '⚠️  event_scheduler bukan ON — EVENT tidak akan jalan. ' +
          'Aktifkan: SET GLOBAL event_scheduler = ON;',
      )
    }
  } finally {
    await pool.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ migrateBenchmarks gagal:', error)
    process.exit(1)
  })