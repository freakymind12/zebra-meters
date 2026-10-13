<script setup lang="ts">
import type { PrinterMeterReading } from '~/types/api'

const props = defineProps<{
  reading: PrinterMeterReading | null
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const open = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v)
})

const meterEntries = computed(() => {
  if (!props.reading) return []
  const r = props.reading
  return [
    { key: 'totalLabelCount', label: 'Total Label Count', value: r.totalLabelCount },
    { key: 'totalPrintLength', label: 'Total Print Length', value: r.totalPrintLength },
    { key: 'printheadOdometer', label: 'Printhead Odometer', value: r.printheadOdometer },
    { key: 'headUsage', label: 'Head Usage', value: r.headUsage },
    { key: 'ribbonLength', label: 'Ribbon Length', value: r.ribbonLength },
    { key: 'mediaLength', label: 'Media Length', value: r.mediaLength }
  ]
})

const rawMeterRows = computed(() => {
  if (!props.reading?.rawMeters) return []
  return Object.entries(props.reading.rawMeters).map(([name, entry]) => ({
    name,
    value: entry.value,
    raw: entry.raw,
    error: entry.error
  }))
})

const identity = computed(() => {
  if (!props.reading) return []
  const r = props.reading
  return [
    { label: 'Printer ID', value: r.printerId },
    { label: 'Model', value: r.model },
    { label: 'IP Address', value: r.ipAddress },
    { label: 'Printhead ID', value: r.printheadId ?? '-' },
    { label: 'Measured At', value: formatDateTime(r.measuredAt) },
    { label: 'Collector Hostname', value: r.collectorHostname ?? '-' },
    { label: 'Collector IP', value: r.collectorIp ?? '-' },
    { label: 'Created At', value: formatDateTime(r.createdAt) }
  ]
})
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{ content: 'max-w-2xl' }"
    title="Detail Reading"
    :description="reading ? `${reading.printerId} — ${formatDateTime(reading.measuredAt)}` : ''"
  >
    <template #body>
      <div
        v-if="reading"
        class="space-y-6"
      >
        <div>
          <p class="text-xs font-semibold text-highlighted uppercase mb-2">
            Identitas
          </p>
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div
              v-for="item in identity"
              :key="item.label"
              class="flex justify-between gap-2"
            >
              <dt class="text-muted">
                {{ item.label }}
              </dt>
              <dd class="font-medium text-right truncate">
                {{ item.value }}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <p class="text-xs font-semibold text-highlighted uppercase mb-2">
            Meter
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div
              v-for="meter in meterEntries"
              :key="meter.key"
              class="rounded-lg bg-elevated/50 px-3 py-2"
            >
              <p class="text-xs text-muted truncate">
                {{ meter.label }}
              </p>
              <p class="text-sm font-semibold tabular-nums">
                {{ formatNumber(meter.value) }}
              </p>
            </div>
          </div>
        </div>

        <div>
          <p class="text-xs font-semibold text-highlighted uppercase mb-2">
            Raw Meters
          </p>
          <UTable
            :data="rawMeterRows"
            :columns="[
              { accessorKey: 'name', header: 'Name' },
              { accessorKey: 'value', header: 'Value', cell: ({ row }) => formatNumber(row.original.value) },
              { accessorKey: 'raw', header: 'Raw', cell: ({ row }) => row.original.raw ?? '-' },
              { accessorKey: 'error', header: 'Error', cell: ({ row }) => row.original.error ?? '-' }
            ]"
            class="text-xs"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
