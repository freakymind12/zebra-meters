<template>
  <div
    class="grid gap-4 lg:grid-cols-2"
    role="status"
    aria-live="polite"
  >
    <div
      v-for="index in 4"
      :key="index"
      class="space-y-2"
    >
      <div class="h-4 w-44 animate-pulse rounded bg-elevated motion-reduce:animate-none" />
      <div class="h-[320px] animate-pulse rounded-lg border border-default bg-elevated/40 motion-reduce:animate-none" />
    </div>
    <span class="sr-only">Memuat chart...</span>
  </div>
</template>
