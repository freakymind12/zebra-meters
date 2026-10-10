import type { Config } from 'drizzle-kit'
import { dbConfig } from './src/config/env'

/**
 * Konfigurasi Drizzle Kit (generate / push / migrate / studio).
 *
 * Kredensial diambil dari src/config/env.ts (sumber tunggal).
 * Dev defaults ada di schema Zod (localhost:3306, dll.) sehingga
 * `drizzle-kit generate` / `db:push` / `db:studio` tetap jalan
 * tanpa .env; production menyuplai DB_* lewat Docker Compose.
 */
const dbCredentials = dbConfig

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    host: dbCredentials.host,
    port: dbCredentials.port,
    user: dbCredentials.user,
    password: dbCredentials.password,
    database: dbCredentials.database,
  },
  strict: true,
  verbose: true,
} satisfies Config
