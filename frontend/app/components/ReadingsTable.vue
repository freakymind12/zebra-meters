<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Column, SortingState } from '@tanstack/vue-table'
import type { DateValue } from '@internationalized/date'
import type { PrinterMeterListData, PrinterMeterReading } from '~/types/api'

const UButton = resolveComponent('UButton')
const { fetchReadings } = useZebraApi()

const limit = ref(20)
const page = ref(1)
const limitOptions = [
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 },
  { label: '100', value: 100 }
]

const ALL_FILTERS_VALUE = '__all__'
const NO_PRINTHEAD_VALUE = '__missing_printhead__'
const printheadFilter = ref(ALL_FILTERS_VALUE)
const ipAddressFilter = ref(ALL_FILTERS_VALUE)
const modelFilter = ref(ALL_FILTERS_VALUE)
const printerIdFilter = ref(ALL_FILTERS_VALUE)
const selectedMonth = ref<DateValue>()
const monthPickerOpen = ref(false)
const sorting = ref<SortingState>([{ id: 'measuredAt', desc: true }])

const readings = ref<PrinterMeterReading[]>([])
const total = ref(0)
const filterOptions = ref<PrinterMeterListData['filters']>({
  printheadIds: [],
  hasMissingPrinthead: false,
  ipAddresses: [],
  models: [],
  printerIds: []
})
const pending = ref(false)
const error = ref<string | null>(null)
const autoRefresh = ref(true)
const lastUpdated = ref<Date | null>(null)
const pageSize = computed(() => limit.value)
const SORT_KEYS: Record<string, string> = {
  measuredAt: 'measuredAt',
  totalLabelCount: 'totalLabelCount',
  totalPrintLength: 'totalPrintLength',
  printheadOdometer: 'printheadOdometer',
  headUsage: 'headUsage',
  ribbonLength: 'ribbonLength',
  mediaLength: 'mediaLength'
}
const sortKey = computed(() => SORT_KEYS[sorting.value[0]?.id ?? ''] ?? 'measuredAt')
const sortDirection = computed<'asc' | 'desc'>(() =>
  sorting.value[0]?.desc === false ? 'asc' : 'desc'
)
const monthQuery = computed(() => selectedMonth.value?.toString().slice(0, 7))
const monthLabel = computed(() => {
  if (!monthQuery.value) return 'Filter bulan'
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(`${monthQuery.value}-01T12:00:00`))
})

let currentRequest = 0
async function load() {
  const requestId = ++currentRequest
  pending.value = true
  error.value = null
  try {
    const res = await fetchReadings({
      page: page.value,
      limit: limit.value,
      printheadId:
        printheadFilter.value !== ALL_FILTERS_VALUE
        && printheadFilter.value !== NO_PRINTHEAD_VALUE
          ? printheadFilter.value
          : undefined,
      printheadMissing: printheadFilter.value === NO_PRINTHEAD_VALUE,
      ipAddress:
        ipAddressFilter.value !== ALL_FILTERS_VALUE
          ? ipAddressFilter.value
          : undefined,
      model:
        modelFilter.value !== ALL_FILTERS_VALUE ? modelFilter.value : undefined,
      printerId:
        printerIdFilter.value !== ALL_FILTERS_VALUE
          ? printerIdFilter.value
          : undefined,
      month: monthQuery.value,
      sort: sortKey.value,
      direction: sortDirection.value
    })
    if (requestId !== currentRequest) return
    readings.value = res.data
    total.value = res.count
    filterOptions.value = res.filters
    lastUpdated.value = new Date()
    const lastPage = Math.max(1, Math.ceil(total.value / pageSize.value))
    if (page.value > lastPage) {
      page.value = lastPage
      return
    }
  } catch (err) {
    if (requestId !== currentRequest) return
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (requestId === currentRequest) pending.value = false
  }
}

let timer: ReturnType<typeof setInterval> | null = null
function configureAutoRefresh() {
  if (timer) clearInterval(timer)
  if (autoRefresh.value) {
    timer = setInterval(load, 30_000)
  }
}

watch(
  [limit, printheadFilter, ipAddressFilter, modelFilter, printerIdFilter, selectedMonth, sorting],
  () => {
    if (page.value !== 1) {
      page.value = 1
      return
    }
    load()
  }
)

watch(page, load)
watch(autoRefresh, configureAutoRefresh)

onMounted(() => {
  load()
  configureAutoRefresh()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function filterItems(allLabel: string, values: string[]) {
  return [
    { label: allLabel, value: ALL_FILTERS_VALUE },
    ...values.map(value => ({ label: value, value }))
  ]
}

const printheadItems = computed(() => [
  { label: 'Semua Printhead', value: ALL_FILTERS_VALUE },
  ...(filterOptions.value.hasMissingPrinthead
    ? [{ label: 'Tanpa Printhead', value: NO_PRINTHEAD_VALUE }]
    : []),
  ...filterOptions.value.printheadIds.map(value => ({ label: value, value }))
])
const ipAddressItems = computed(() =>
  filterItems('Semua IP Address', filterOptions.value.ipAddresses)
)
const modelItems = computed(() =>
  filterItems('Semua Model', filterOptions.value.models)
)
const printerIdItems = computed(() =>
  filterItems('Semua Printer ID', filterOptions.value.printerIds)
)

function clearMonth() {
  selectedMonth.value = undefined
}

const selectedReading = ref<PrinterMeterReading | null>(null)
const detailOpen = ref(false)

function sortableHeader(label: string) {
  return ({ column }: { column: Column<PrinterMeterReading> }) => {
    const sorted = column.getIsSorted()

    return h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      size: 'xs',
      label,
      icon: sorted
        ? sorted === 'asc'
          ? 'i-lucide-arrow-up-narrow-wide'
          : 'i-lucide-arrow-down-wide-narrow'
        : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(sorted === 'asc')
    })
  }
}

function openDetail(row: PrinterMeterReading) {
  selectedReading.value = row
  detailOpen.value = true
}

const columns: TableColumn<PrinterMeterReading>[] = [
  {
    accessorKey: 'measuredAt',
    header: sortableHeader('Measured At'),
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
    header: sortableHeader('Labels'),
    cell: ({ row }) => formatNumber(row.original.totalLabelCount)
  },
  {
    accessorKey: 'totalPrintLength',
    header: sortableHeader('Print Length'),
    cell: ({ row }) => formatNumber(row.original.totalPrintLength)
  },
  {
    accessorKey: 'printheadOdometer',
    header: sortableHeader('Odometer'),
    cell: ({ row }) => formatNumber(row.original.printheadOdometer)
  },
  {
    accessorKey: 'headUsage',
    header: sortableHeader('Head Usage'),
    cell: ({ row }) => formatNumber(row.original.headUsage)
  },
  {
    accessorKey: 'ribbonLength',
    header: sortableHeader('Ribbon'),
    cell: ({ row }) => formatNumber(row.original.ribbonLength)
  },
  {
    accessorKey: 'mediaLength',
    header: sortableHeader('Media'),
    cell: ({ row }) => formatNumber(row.original.mediaLength)
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) =>
      h(UButton, {
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
        v-model="printheadFilter"
        :items="printheadItems"
        value-key="value"
        icon="i-lucide-cpu"
        size="xs"
        class="w-48"
        aria-label="Filter printhead"
      />
      <USelect
        v-model="ipAddressFilter"
        :items="ipAddressItems"
        value-key="value"
        icon="i-lucide-network"
        size="xs"
        class="w-48"
        aria-label="Filter IP address"
      />
      <USelect
        v-model="modelFilter"
        :items="modelItems"
        value-key="value"
        icon="i-lucide-printer"
        size="xs"
        class="w-40"
        aria-label="Filter model"
      />
      <USelect
        v-model="printerIdFilter"
        :items="printerIdItems"
        value-key="value"
        icon="i-lucide-fingerprint"
        size="xs"
        class="w-48"
        aria-label="Filter printer ID"
      />
      <UPopover v-model:open="monthPickerOpen">
        <UButton
          icon="i-lucide-calendar-days"
          size="xs"
          variant="outline"
          color="neutral"
          :label="monthLabel"
          aria-label="Filter berdasarkan bulan measured at"
        />
        <template #content>
          <UCalendar
            v-model="selectedMonth"
            type="month"
            locale="id-ID"
            @update:model-value="monthPickerOpen = false"
          />
        </template>
      </UPopover>
      <UButton
        v-if="selectedMonth"
        icon="i-lucide-x"
        size="xs"
        variant="ghost"
        aria-label="Hapus filter bulan"
        @click="clearMonth"
      />
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
      <span
        v-if="!error"
        class="text-xs text-muted"
      > {{ total }} baris </span>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Gagal memuat data"
      :description="error"
    />

    <template v-else>
      <UTable
        v-model:sorting="sorting"
        :data="readings"
        :columns="columns"
        :loading="pending"
        :sorting-options="{ manualSorting: true }"
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

      <div
        v-if="total > 0"
        class="flex justify-end"
      >
        <UPagination
          v-model:page="page"
          :total="total"
          :items-per-page="pageSize"
          size="xs"
        />
      </div>
    </template>

    <ReadingDetailModal
      v-model:open="detailOpen"
      :reading="selectedReading"
    />
  </div>
</template>
