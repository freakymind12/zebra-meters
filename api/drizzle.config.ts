import type { Config } from 'drizzle-kit'

/**
 * Konfigurasi Drizzle Kit (generate / push / migrate / studio).
 *
 * Kredensial diambil dari .env (lihat .env.example) —
 * default-nya sama dengan docker-compose.yaml (MySQL di localhost:3306).
 */
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'zebrameter',
    password: process.env.DB_PASSWORD ?? 'zebrameter_secret',
    database: process.env.DB_NAME ?? 'zebrameter_db',
  },
  strict: true,
  verbose: true,
} satisfies Config
