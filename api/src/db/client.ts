import { drizzle } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'
import { dbConfig } from '@config/env'
import * as schema from './schema'

// ============================================================
// Koneksi MySQL (mysql2 pool + Drizzle ORM)
// ------------------------------------------------------------
// Kredensial diambil dari config/env.ts (sumber tunggal,
// sudah tervalidasi Zod + fail-fast saat modul di-import).
// ============================================================

const pool = createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  waitForConnections: true,
  connectionLimit: 10,
})

export const db = drizzle(pool, { schema, mode: 'default' })

export type Database = typeof db
