/**
 * Printhead Benchmark routes — mounted at /api/printhead-benchmark
 *
 *   get.ts     → GET /  (baca tabel printhead_benchmarks)
 *   schemas.ts → Zod + createRoute (OpenAPI)
 *   index.ts   → mount di bawah /api/printhead-benchmark
 */
import { createOpenAPIApp } from '@config/api-response'
import { benchmarkRouteApp } from './get'

const printheadBenchmarkApp = createOpenAPIApp()

printheadBenchmarkApp.route('/', benchmarkRouteApp)

export { printheadBenchmarkApp }
