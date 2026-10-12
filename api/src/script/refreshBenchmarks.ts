/**
 * refreshBenchmarks.ts — Terapkan & jalankan SP printhead benchmarks.
 *
 * Langkah:
 *   1. Pastikan tabel `printhead_benchmarks` ada (via `bun run db:push` dulu).
 *   2. Apply SP dari `src/db/procedures/sp_refresh_printhead_benchmarks.sql`
 *      (parser DELIMITER $$ ... $$ + DELIMITER ;).
 *   3. CALL sp_refresh_printhead_benchmarks(filter, rebuild) lalu
 *      tampilkan ringkasan isi tabel.
 *
 * Jalankan dari folder `api/`:
 *   bun src/script/refreshBenchmarks.ts
 *   bun src/script/refreshBenchmarks.ts --head PH18D3402A001
 *   bun src/script/refreshBenchmarks.ts --rebuild
 *   bun src/script/refreshBenchmarks.ts --apply-only   (hanya pasang SP)
 *
 * Catatan: SP tidak dikelola drizzle-kit, jadi file SQL di-apply manual
 * via script ini (dev) atau `mysql < file.sql` (production).
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPool } from 'mysql2/promise'
import { dbConfig } from '../config/env'

const here = dirname(fileURLToPath(import.meta.url))
const SP_FILE = join(here, '..', 'db', 'procedures', 'sp_refresh_printhead_benchmarks.sql')

function parseArgs(argv: string[]): {
  head: string | null
  rebuild: boolean
  applyOnly: boolean
} {
  let head: string | null = null
  let rebuild = false
  let applyOnly = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--head' && i + 1 < argv.length) head = argv[++i]!
    else if (a.startsWith('--head=')) head = a.slice('--head='.length) || null
    else if (a === '--rebuild') rebuild = true
    else if (a === '--apply-only') applyOnly = true
  }
  return { head, rebuild, applyOnly }
}

/**
 * Pecah file SQL ber-DELIMITER menjadi statement siap eksekusi.
 * Mendukung pola: DELIMITER $$ ... $$ dan statement biasa ... ;
 * Baris komentar (--) & baris kosong dilewati.
 */
function splitStatements(source: string): string[] {
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
  return out
    .map((s) => s.trim().replace(/;$/, '').trim())
    .filter((s) => s !== '')
}

async function main(): Promise<void> {
  const { head, rebuild, applyOnly } = parseArgs(process.argv.slice(2))

  const pool = createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 2,
    multipleStatements: false,
  })

  try {
    // --- 1) Apply SP statement per statement ---
    const source = readFileSync(SP_FILE, 'utf8')
    const statements = splitStatements(source)
    for (const stmt of statements) {
      await pool.query(stmt)
    }
    console.log(`✅ SP applied (${statements.length} statements): sp_refresh_printhead_benchmarks`)

    if (applyOnly) return

    // --- 2) CALL SP ---
    await pool.query('CALL sp_refresh_printhead_benchmarks(?, ?)', [
      head,
      rebuild ? 1 : 0,
    ])
    console.log(
      `✅ Benchmark refreshed (head=${head ?? 'ALL'}, rebuild=${rebuild ? 1 : 0}).`,
    )

    // --- 3) Ringkasan isi tabel ---
    const [rows] = await pool.query(
      'SELECT `printhead_id`, `reading_count`, `head_usage_delta`, ' +
        '`printhead_odometer_delta`, `lifespan_minutes`, `updated_at` ' +
        'FROM `printhead_benchmarks` ORDER BY `printhead_id`',
    )
    const list = rows as Array<Record<string, unknown>>
    console.log(`📊 printhead_benchmarks: ${list.length} baris`)
    for (const r of list) {
      console.log(
        `  • ${r['printhead_id']} | readings=${r['reading_count']} | ` +
          `head_usageΔ=${r['head_usage_delta']} | odoΔ=${r['printhead_odometer_delta']} | ` +
          `lifespan=${r['lifespan_minutes']} mnt`,
      )
    }
  } finally {
    await pool.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ refreshBenchmarks gagal:', error)
    process.exit(1)
  })
