/** Verifikasi isi printhead_benchmarks via Drizzle (tanpa HTTP). */
import { db } from '../db/client'
import { printheadBenchmarks } from '../db/schema'

const rows = await db.select().from(printheadBenchmarks)
console.log(`rows: ${rows.length}`)
for (const r of rows) {
  console.log(
    `• ${r.printheadId} | readings=${r.readingCount} | ` +
      `tlcΔ=${r.totalLabelCountDelta} | tplΔ=${r.totalPrintLengthDelta} | ` +
      `odoΔ=${r.printheadOdometerDelta} | huΔ=${r.headUsageDelta} | ` +
      `ribΔ=${r.ribbonLengthDelta} | medΔ=${r.mediaLengthDelta} | ` +
      `lifespan=${r.lifespanMinutes}m | neg=${r.hasNegativeDelta} | ` +
      `${r.firstSeenAt.toISOString()} → ${r.lastSeenAt.toISOString()}`,
  )
}
process.exit(0)
