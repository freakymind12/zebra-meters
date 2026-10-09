// ============================================================
// Konfigurasi terpusat.
// ------------------------------------------------------------
// Development memakai default lokal. Production wajib menyuplai
// kredensial lewat environment variable.
// ============================================================

export const isProduction = process.env.NODE_ENV === 'production'

/**
 * Baca env variable.
 * @param requiredInProduction true = wajib di production;
 *        false = selalu boleh fallback (mis. PORT, karena container
 *        sudah menentukan portnya sendiri).
 */
function readEnv(name: string, developmentDefault: string, requiredInProduction: boolean): string {
  const value = process.env[name]
  if (value !== undefined && value !== '') return value

  if (isProduction && requiredInProduction) {
    throw new Error(
      `[config] Environment variable ${name} wajib di-set saat NODE_ENV=production`,
    )
  }

  return developmentDefault
}

function readEnvNumber(
  name: string,
  developmentDefault: number,
  requiredInProduction: boolean,
): number {
  const value = readEnv(name, String(developmentDefault), requiredInProduction)
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`[config] Environment variable ${name} harus berupa angka`)
  }

  return parsed
}

/**
 * Kredensial dinamis dari environment. Sengaja dihitung per fungsi (bukan
 * konstanta saat modul di-import) agar tooling seperti `drizzle-kit generate`
 * bisa memuat file ini tanpa langsung mewajibkan DB_* ada.
 */
export function getDbConfig(options?: { allowDefaultsInProduction?: boolean }) {
  const requiredInProduction = !options?.allowDefaultsInProduction

  return {
    host: readEnv('DB_HOST', 'localhost', requiredInProduction),
    port: readEnvNumber('DB_PORT', 3306, requiredInProduction),
    user: readEnv('DB_USER', 'zebrameter', requiredInProduction),
    password: readEnv('DB_PASSWORD', 'zebrameter_secret', requiredInProduction),
    database: readEnv('DB_NAME', 'zebrameter_db', requiredInProduction),
  } as const
}

/** PORT tidak wajib di production: Docker Compose sudah menetapkannya. */
export const port = readEnvNumber('PORT', 3000, false)

/**
 * API key opsional di development, tetapi wajib di production agar endpoint
 * ingest tidak terbuka tanpa autentikasi.
 */
export function resolveApiKey(): string | null {
  const value = process.env.API_KEY?.trim()
  if (value) return value

  if (isProduction) {
    throw new Error('[config] Environment variable API_KEY wajib di-set di production')
  }

  return null
}
