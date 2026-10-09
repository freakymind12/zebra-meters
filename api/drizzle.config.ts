import type { Config } from 'drizzle-kit'
import { getDbConfig } from './src/config'

/**
 * Konfigurasi Drizzle Kit (generate / push / migrate / studio).
 *
 * Kredensial diambil dari src/config.ts (sumber tunggal) —
 * development default ke MySQL localhost:3306 (lihat .env.example).
 *
 * Drizzle Kit selalu meminta `dbCredentials` saat membaca config, termasuk
 * `generate` yang tidak membuka koneksi. Karena itu config CLI boleh fallback;
 * runtime API tetap fail-fast melalui getDbConfig() tanpa opsi ini.
 */
const dbCredentials = getDbConfig({ allowDefaultsInProduction: true })

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
