import "dotenv/config";
import { z } from "zod";

// ========== Load Environment ==========
// Bun otomatis memuat `.env` di root `api/`. Untuk production, Docker Compose
// menyuplai environment variable langsung ke container (lihat docker-compose.yaml).

// ========== Environment Schema ==========
const envSchema = z.object({
  // Environment — "development" | "production"
  NODE_ENV: z.enum(["development", "production"]).default("development"),

  // API — PORT dipakai Bun auto-serve & Dockerfile/compose
  PORT: z.coerce.number().default(3000),

  // Database (MySQL) — dev default; production disuplai Docker Compose
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default("zebrameter"),
  DB_PASSWORD: z.string().default("zebrameter_secret"),
  DB_NAME: z.string().default("zebrameter_db"),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000), // 1 minute
});

// ========== Parse and Validate ==========
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parseResult.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parseResult.data;

// ========== Helpers ==========
export const isDevelopment = () => env.NODE_ENV !== "production";
export const isProduction = () => env.NODE_ENV === "production";

// ========== Database Config (dipakai db/client.ts & drizzle.config.ts) ==========
export const dbConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
} as const;