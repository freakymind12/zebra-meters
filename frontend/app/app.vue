<script setup>
useHead({
  meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
  htmlAttrs: {
    lang: "id",
  },
});

useSeoMeta({
  title: "ZebraMeter Dashboard",
  description: "Dashboard metric printer Zebra.",
});
</script>

<template>
  <UApp>
    <UHeader :toggle="false">
      <template #left>
        <NuxtLink
          to="/"
          aria-label="ZebraMeter, kembali ke beranda"
          class="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <svg
            class="size-7 text-primary sm:size-8"
            viewBox="0 0 28 28"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="0" y="16" width="4" height="12" rx="2" />
            <rect x="6" y="8" width="4" height="20" rx="2" />
            <rect x="12" y="0" width="4" height="28" rx="2" />
            <rect x="18" y="12" width="4" height="16" rx="2" />
            <rect x="24" y="6" width="4" height="22" rx="2" />
          </svg>

          <span
            class="font-display text-2xl leading-none font-bold tracking-tight text-highlighted sm:text-[1.75rem]"
          >
            ZebraMeter
          </span>
        </NuxtLink>
      </template>

      <template #right>
        <UColorModeButton size="lg" />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>
  </UApp>
</template>
