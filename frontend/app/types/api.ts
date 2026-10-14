// ============================================================
// Tipe API ZebraMeter — mirror schema OpenAPI di api/src/routes
// ============================================================

// --- printer-meter ---
export interface RawMeterEntry {
  raw: string | null
  value: number | null
  error?: string
}

export type RawMeters = Record<string, RawMeterEntry>

export interface PrinterMeterReading {
  id: number
  printerId: string
  model: string
  ipAddress: string
  measuredAt: string
  collectorHostname: string | null
  collectorIp: string | null
  printheadId: string | null
  totalLabelCount: number | null
  totalPrintLength: number | null
  printheadOdometer: number | null
  headUsage: number | null
  ribbonLength: number | null
  mediaLength: number | null
  rawMeters: RawMeters
  createdAt: string
}

export interface PrinterMeterListData {
  count: number
  data: PrinterMeterReading[]
  filters: {
    printheadIds: string[]
    hasMissingPrinthead: boolean
    ipAddresses: string[]
    models: string[]
    printerIds: string[]
    hostnames: string[]
  }
}

// --- printhead-benchmark ---
export interface PrintheadBenchmark {
  id: number
  printheadId: string
  firstPrinterId: number | null
  lastPrinterId: number | null
  firstModel: string | null
  lastModel: string | null
  firstSeenAt: string
  lastSeenAt: string
  readingCount: number
  lifespanMinutes: number | null
  totalLabelCountFirst: number | null
  totalLabelCountLast: number | null
  totalLabelCountDelta: number | null
  totalPrintLengthFirst: number | null
  totalPrintLengthLast: number | null
  totalPrintLengthDelta: number | null
  printheadOdometerFirst: number | null
  printheadOdometerLast: number | null
  printheadOdometerDelta: number | null
  headUsageFirst: number | null
  headUsageLast: number | null
  headUsageDelta: number | null
  ribbonLengthFirst: number | null
  ribbonLengthLast: number | null
  ribbonLengthDelta: number | null
  mediaLengthFirst: number | null
  mediaLengthLast: number | null
  mediaLengthDelta: number | null
  hasNegativeDelta: boolean
  updatedAt: string
}

export interface BenchmarkListData {
  count: number
  data: PrintheadBenchmark[]
  models: string[]
}

// --- envelope ---
export interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
  details?: Array<{ path: string, message: string }>
}
