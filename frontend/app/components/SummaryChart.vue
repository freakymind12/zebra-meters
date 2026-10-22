<script setup lang="ts">
import type { BarAnnotation, BarLineChartSeries, PieChartDatum } from '~/types/charts'
import type { PrintheadBenchmark } from '~/types/api'

const { fetchBenchmarks, fetchReadings } = useZebraApi()

const PAGE_SIZE = 100
const ALL_MODELS_VALUE = '__all_models__'

type ActivePrinthead = PrintheadBenchmark & {
  totalLabelCountDelta: number
  headUsageDelta: number
}

type HistoricalPrinthead = PrintheadBenchmark & {
  totalLabelCountDelta: number
  lifespanMinutes: number
}

const pending = ref(false)
const error = ref<string | null>(null)
const benchmarks = ref<PrintheadBenchmark[]>([])
const printerUnitsByModel = ref<PieChartDatum[]>([])
const collectorHostnamesByPrinthead = ref<Record<string, string[]>>({})
const selectedModel = ref(ALL_MODELS_VALUE)
const availableModels = ref<string[]>([])

const modelItems = computed(() => [
  { label: 'Semua Model', value: ALL_MODELS_VALUE },
  ...availableModels.value.map(value => ({ label: value, value }))
])

async function fetchAllBenchmarks() {
  const firstPage = await fetchBenchmarks({ page: 1, limit: PAGE_SIZE })
  const result = [...firstPage.data]
  const pageCount = Math.ceil(firstPage.count / PAGE_SIZE)

  for (let page = 2; page <= pageCount; page++) {
    const response = await fetchBenchmarks({ page, limit: PAGE_SIZE })
    result.push(...response.data)
  }

  return { rows: result, models: firstPage.models }
}

async function fetchReadingSummary() {
  const firstPage = await fetchReadings({ page: 1, limit: PAGE_SIZE })
  const pageCount = Math.ceil(firstPage.count / PAGE_SIZE)
  // printerId -> model + kumpulan hostname collector yang pernah melihatnya.
  const printers = new Map<string, { model: string, hostnames: Set<string> }>()
  // printheadId -> kumpulan hostname collector yang pernah melihat printhead tsb.
  const hostnamesByPrinthead = new Map<string, Set<string>>()

  function collect(rows: typeof firstPage.data) {
    for (const reading of rows) {
      const existing = printers.get(reading.printerId)

      if (existing) {
        existing.model = reading.model
        if (reading.collectorHostname) {
          existing.hostnames.add(reading.collectorHostname)
        }
      } else {
        printers.set(reading.printerId, {
          model: reading.model,
          hostnames: new Set(
            reading.collectorHostname ? [reading.collectorHostname] : []
          )
        })
      }

      if (reading.printheadId && reading.collectorHostname) {
        const hostnames = hostnamesByPrinthead.get(reading.printheadId)

        if (hostnames) {
          hostnames.add(reading.collectorHostname)
        } else {
          hostnamesByPrinthead.set(
            reading.printheadId,
            new Set([reading.collectorHostname])
          )
        }
      }
    }
  }

  collect(firstPage.data)
  for (let page = 2; page <= pageCount; page++) {
    const response = await fetchReadings({ page, limit: PAGE_SIZE })
    collect(response.data)
  }

  const unitsByModel = new Map<string, { count: number, hostnames: Set<string> }>()
  for (const printer of printers.values()) {
    const entry = unitsByModel.get(printer.model)

    if (entry) {
      entry.count += 1
      for (const hostname of printer.hostnames) {
        entry.hostnames.add(hostname)
      }
    } else {
      unitsByModel.set(printer.model, {
        count: 1,
        hostnames: new Set(printer.hostnames)
      })
    }
  }

  const sortHostnames = (set: Set<string>) =>
    [...set].sort((a, b) => a.localeCompare(b))

  const collectorHostnamesByPrinthead: Record<string, string[]> = {}
  for (const [printheadId, hostnames] of hostnamesByPrinthead) {
    collectorHostnamesByPrinthead[printheadId] = sortHostnames(hostnames)
  }

  return {
    unitsByModel: [...unitsByModel.entries()]
      .map(([name, entry]) => ({
        name,
        value: entry.count,
        hostnames: sortHostnames(entry.hostnames)
      }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
    collectorHostnamesByPrinthead
  }
}

let currentRequest = 0

async function load() {
  const requestId = ++currentRequest
  pending.value = true
  error.value = null

  try {
    const [benchmarkResult, readingSummary] = await Promise.all([
      fetchAllBenchmarks(),
      fetchReadingSummary()
    ])
    if (requestId !== currentRequest) return
    benchmarks.value = benchmarkResult.rows
    availableModels.value = benchmarkResult.models
    printerUnitsByModel.value = readingSummary.unitsByModel
    collectorHostnamesByPrinthead.value
      = readingSummary.collectorHostnamesByPrinthead
  } catch (err) {
    if (requestId !== currentRequest) return
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (requestId === currentRequest) pending.value = false
  }
}

onMounted(load)

const printheadsByModel = computed<PieChartDatum[]>(() => {
  const counts = new Map<string, number>()
  for (const benchmark of benchmarks.value) {
    if (!benchmark.lastModel) continue
    counts.set(benchmark.lastModel, (counts.get(benchmark.lastModel) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
})

const activePrintheads = computed(() =>
  benchmarks.value.filter(
    (benchmark): benchmark is ActivePrinthead =>
      benchmark.totalLabelCountDelta !== null
      && benchmark.headUsageDelta !== null
  )
)

const activePrintheadCategories = computed(() =>
  activePrintheads.value.map(benchmark => benchmark.printheadId)
)

const activePrintheadAnnotations = computed<BarAnnotation[]>(() =>
  activePrintheads.value.map(benchmark => ({
    label: benchmark.lastModel ?? 'Unknown model',
    sublabel: benchmark.printheadId,
    hostnames: collectorHostnamesByPrinthead.value[benchmark.printheadId] ?? []
  }))
)

const activePrintheadSeries = computed<BarLineChartSeries[]>(() => [
  {
    name: 'Delta Label Count',
    type: 'bar',
    data: activePrintheads.value.map(
      benchmark => benchmark.totalLabelCountDelta
    )
  },
  {
    name: 'Delta Head Usage',
    type: 'line',
    data: activePrintheads.value.map(benchmark => benchmark.headUsageDelta),
    yAxisIndex: 1
  }
])

const bestHistoricalPrintheads = computed(() =>
  benchmarks.value
    .filter(
      (benchmark): benchmark is HistoricalPrinthead =>
        (selectedModel.value === ALL_MODELS_VALUE
          || benchmark.lastModel === selectedModel.value)
        && benchmark.totalLabelCountDelta !== null
        && benchmark.lifespanMinutes !== null
    )
    .sort((a, b) => b.lifespanMinutes - a.lifespanMinutes)
    .slice(0, 10)
)

const bestHistoricalCategories = computed(() =>
  bestHistoricalPrintheads.value.map(benchmark => benchmark.printheadId)
)

const bestHistoricalAnnotations = computed<BarAnnotation[]>(() =>
  bestHistoricalPrintheads.value.map(benchmark => ({
    label: benchmark.lastModel ?? 'Unknown model',
    sublabel: benchmark.printheadId
  }))
)

const bestHistoricalSeries = computed<BarLineChartSeries[]>(() => [
  {
    name: 'Delta Label Count',
    type: 'bar',
    data: bestHistoricalPrintheads.value.map(
      benchmark => benchmark.totalLabelCountDelta
    )
  },
  {
    name: 'Lifespan',
    type: 'line',
    data: bestHistoricalPrintheads.value.map(benchmark =>
      Number((benchmark.lifespanMinutes / 1440).toFixed(1))
    ),
    yAxisIndex: 1
  }
])
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold text-highlighted">
        Summary Charts
      </h2>
      <UButton
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="subtle"
        :loading="pending"
        @click="load"
      >
        Refresh
      </UButton>
    </div>

    <UAlert
      v-if="error"
      class="motion-safe:animate-rise-in motion-reduce:animate-soft-in"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Gagal memuat ringkasan chart"
      :description="error"
    />

    <ClientOnly v-else>
      <ChartSkeleton v-if="pending && benchmarks.length === 0" />
      <div
        v-else
        class="grid gap-4 lg:grid-cols-2"
      >
        <div class="space-y-2 motion-safe:animate-rise-in motion-reduce:animate-soft-in">
          <h3 class="text-sm font-medium text-highlighted">
            Printer Unit By Model
          </h3>
          <BasePieChart
            v-if="printerUnitsByModel.length"
            :data="printerUnitsByModel"
            value-label="Printers"
          />
          <UEmpty
            v-else
            icon="i-lucide-printer"
            description="Belum ada data printer."
          />
        </div>

        <div class="space-y-2 motion-safe:animate-rise-in motion-reduce:animate-soft-in motion-safe:[animation-delay:60ms]">
          <h3 class="text-sm font-medium text-highlighted">
            Printhead Count By Printer Model
          </h3>
          <BasePieChart
            v-if="printheadsByModel.length"
            :data="printheadsByModel"
            value-label="Printheads"
          />
          <UEmpty
            v-else
            icon="i-lucide-cpu"
            description="Belum ada data benchmark printhead."
          />
        </div>

        <div class="space-y-2 motion-safe:animate-rise-in motion-reduce:animate-soft-in motion-safe:[animation-delay:120ms]">
          <h3 class="text-sm font-medium text-highlighted">
            Active Printhead Metrics
          </h3>
          <BaseBarLineChart
            v-if="activePrintheads.length"
            :categories="activePrintheadCategories"
            :series="activePrintheadSeries"
            :bar-annotations="activePrintheadAnnotations"
            :y-axes="[
              { name: 'Label Count' },
              { name: 'Head Usage', unit: 'inches' }
            ]"
            :height="380"
          />
          <UEmpty
            v-else
            icon="i-lucide-gauge"
            description="Belum ada printhead dengan delta label count dan head usage."
          />
        </div>
        <div class="space-y-2 motion-safe:animate-rise-in motion-reduce:animate-soft-in motion-safe:[animation-delay:180ms]">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-highlighted">
              Best Historical Printhead Usage
            </h3>
            <USelect
              v-model="selectedModel"
              :items="modelItems"
              value-key="value"
              icon="i-lucide-printer"
              size="xs"
              class="w-48"
              aria-label="Pilih model printer untuk chart historis"
            />
          </div>
          <BaseBarLineChart
            v-if="bestHistoricalPrintheads.length"
            :categories="bestHistoricalCategories"
            :series="bestHistoricalSeries"
            :bar-annotations="bestHistoricalAnnotations"
            :y-axes="[
              { name: 'Label Count' },
              { name: 'Lifespan', unit: 'days' }
            ]"
            :height="380"
          />
          <UEmpty
            v-else
            icon="i-lucide-history"
            description="Tidak ada data historis yang cocok untuk model ini."
          />
        </div>
      </div>
      <template #fallback>
        <ChartSkeleton />
      </template>
    </ClientOnly>
  </section>
</template>
