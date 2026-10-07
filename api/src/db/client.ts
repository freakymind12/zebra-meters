import { drizzle } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'
import * as schema from './schema'

// ============================================================
// Koneksi MySQL (mysql2 pool + Drizzle ORM)
// ------------------------------------------------------------
// Kredensial dari .env (Bun memuat .env otomatis),
// default mengikuti docker-compose.yaml.
// ============================================================

const pool = createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'zebrameter',
  password: process.env.DB_PASSWORD ?? 'zebrameter_secret',
  database: process.env.DB_NAME ?? 'zebrameter_db',
  waitForConnections: true,
  connectionLimit: 10,
})

export const db = drizzle(pool, { schema, mode: 'default' })

export type Database = typeof db
