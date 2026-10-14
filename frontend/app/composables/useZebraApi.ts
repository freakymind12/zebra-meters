import type {
  ApiEnvelope,
  BenchmarkListData,
  PrinterMeterListData
} from '~/types/api'

/**
 * Client API ZebraMeter — dipakai komponen halaman dashboard.
 * Default (public.apiBase kosong) request masuk ke proxy Nitro
 * internal (/api/...) sehingga tidak ada masalah CORS.
 */
export function useZebraApi() {
  const config = useRuntimeConfig()
  // Bila public.apiBase diset (mis. NUXT_PUBLIC_API_BASE), langsung ke API;
  // kalau kosong, '' berarti relatif ke origin Nuxt (proxy /api/[...path]).
  const base = config.public.apiBase || ''

  async function request<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    try {
      const envelope = await $fetch<ApiEnvelope<T>>(`${base}${path}`, { query })
      if (!envelope.success || envelope.data === undefined) {
        throw new Error(envelope.error || 'Response API tidak valid')
      }
      return envelope.data
    } catch (err) {
      // ofetch melempar FetchError dengan .data berisi envelope error dari API
      const apiError = (err as { data?: ApiEnvelope<T> })?.data
      if (apiError?.error) throw new Error(apiError.error, { cause: err })
      if (err instanceof Error) throw err
      throw new Error(String(err), { cause: err })
    }
  }

  function fetchReadings(opts: {
    page?: number
    limit?: number
    printheadId?: string
    printheadMissing?: boolean
    ipAddress?: string
    model?: string
    printerId?: string
    hostname?: string
    month?: string
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}) {
    return request<PrinterMeterListData>('/api/printer-meter', {
      page: opts.page,
      limit: opts.limit,
      printheadId: opts.printheadId,
      printheadMissing: opts.printheadMissing ? 'true' : undefined,
      ipAddress: opts.ipAddress,
      model: opts.model,
      printerId: opts.printerId,
      hostname: opts.hostname,
      month: opts.month,
      sort: opts.sort,
      direction: opts.direction
    })
  }

  function fetchBenchmarks(opts: {
    page?: number
    limit?: number
    head?: string
    model?: string
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}) {
    return request<BenchmarkListData>('/api/printhead-benchmark', {
      page: opts.page,
      limit: opts.limit,
      head: opts.head,
      // Model kosong berarti "semua model" — jangan kirim "undefined" ke API.
      model: opts.model ? opts.model : undefined,
      sort: opts.sort,
      direction: opts.direction
    })
  }

  return { fetchReadings, fetchBenchmarks }
}

// ------------------------------------------------------------
// Formatter bersama
// ------------------------------------------------------------
const numberFmt = new Intl.NumberFormat('id-ID')
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short'
})

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : numberFmt.format(value)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : dateTimeFmt.format(d)
}

export function formatLifespan(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '-'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = Math.round(minutes % 60)
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (mins || parts.length === 0) parts.push(`${mins}m`)
  return parts.join(' ')
}
