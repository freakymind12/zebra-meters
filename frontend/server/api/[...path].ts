import { defineEventHandler, getRequestURL, proxyRequest } from 'h3'

/**
 * Catch-all proxy ke ZebraMeter API.
 * Menjalankan request browser melalui server Nitro supaya
 * tidak terkena CORS (API tidak memasang middleware cors).
 *
 * Target diambil dari runtimeConfig.apiBase (server-only).
 * Override via env: NUXT_API_BASE=http://host:port
 */
export default defineEventHandler(async (event) => {
  const { apiBase } = useRuntimeConfig(event)
  const target = apiBase || 'http://localhost:3000'

  // Path setelah /api — request frontend /api/xxx diteruskan apa adanya
  // ke {target}/api/xxx.
  const url = getRequestURL(event)
  const targetUrl = new URL(url.pathname + url.search, target)

  return proxyRequest(event, targetUrl.toString(), {
    fetchOptions: {
      redirect: 'follow'
    }
  })
})
