<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PrinterMeterReading } from '~/types/api'

const { fetchReadings } = useZebraApi()

const limit = ref(20)
const limitOptions = [
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 },
  { label: '100', value: 100 }
]

const readings = ref<PrinterMeterReading[]>([])
const pending = ref(false)
const error = ref<string | null>(null)
const autoRefresh = ref(true)
const lastUpdated = ref<Date | null>(null)

async function load() {
  pending.value = true
  error.value = null
  try {
    const res = await fetchReadings(limit.value)
    readings.value = res.data
    lastUpdated.value = new Date()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    pending.value = false
  }
}

let timer: ReturnType<typeof setInterval> | null = null

watch([limit, autoRefresh], () => {
  load()
  if (timer) clearInterval(timer)
  if (autoRefresh.value) {
    timer = setInterval(load, 30_000)
  }
})

onMounted(() => {
  load()
  timer = setInterval(load, 30_000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const selectedReading = ref<PrinterMeterReading | null>(null)
const detailOpen = ref(false)

function openDetail(row: PrinterMeterReading) {
  selectedReading.value = row
  detailOpen.value = true
}

const columns: TableColumn<PrinterMeterReading>[] = [
  {
    accessorKey: 'measuredAt',
    header: 'Measured At',
    cell: ({ row }) => formatDateTime(row.original.measuredAt)
  },
  { accessorKey: 'printerId', header: 'Printer ID' },
  { accessorKey: 'model', header: 'Model' },
  { accessorKey: 'ipAddress', header: 'IP Address' },
  {
    accessorKey: 'printheadId',
    header: 'Printhead',
    cell: ({ row }) => row.original.printheadId ?? '-'
  },
  {
    accessorKey: 'totalLabelCount',
    header: 'Labels',
    cell: ({ row }) => formatNumber(row.original.totalLabelCount)
  },
  {
    accessorKey: 'totalPrintLength',
    header: 'Print Length',
    cell: ({ row }) => formatNumber(row.original.totalPrintLength)
  },
  {
    accessorKey: 'printheadOdometer',
    header: 'Odometer',
    cell: ({ row }) => formatNumber(row.original.printheadOdometer)
  },
  {
    accessorKey: 'headUsage',
    header: 'Head Usage',
    cell: ({ row }) => formatNumber(row.original.headUsage)
  },
  {
    accessorKey: 'ribbonLength',
    header: 'Ribbon',
    cell: ({ row }) => formatNumber(row.original.ribbonLength)
  },
  {
    accessorKey: 'mediaLength',
    header: 'Media',
    cell: ({ row }) => formatNumber(row.original.mediaLength)
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => h(UButton, {
      'size': 'xs',
      'variant': 'ghost',
      'icon': 'i-lucide-eye',
      'aria-label': 'Lihat detail',
      'onClick': () => openDetail(row.original)
    })
  }
]
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-3">
      <USelect
        v-model="limit"
        :items="limitOptions"
        value-key="value"
        icon="i-lucide-list"
        size="xs"
        class="w-24"
        aria-label="Jumlah baris"
      />
      <USwitch
        v-model="autoRefresh"
        label="Auto refresh (30s)"
        size="xs"
      />
      <UButton
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="subtle"
        :loading="pending"
        @click="load"
      >
        Refresh
      </UButton>
      <span
        v-if="lastUpdated"
        class="text-xs text-muted"
      >
        Diperbarui {{ formatDateTime(lastUpdated.toISOString()) }}
      </span>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Gagal memuat data"
      :description="error"
    />

    <UTable
      v-else
      :data="readings"
      :columns="columns"
      :loading="pending"
      size="xs"
      sticky
      class="max-h-[480px]"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-database"
          description="Belum ada data reading."
        />
      </template>
    </UTable>

    <ReadingDetailModal
      v-model:open="detailOpen"
      :reading="selectedReading"
    />
  </div>
</template>
