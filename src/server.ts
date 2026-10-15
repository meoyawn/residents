import handler, { createServerEntry } from '@tanstack/solid-start/server-entry'
import { env } from 'cloudflare:workers'
import { handleApi } from './server/api.ts'
import { cleanup } from './server/auth.ts'

const entry = createServerEntry({
  async fetch(request, options) {
    const path = new URL(request.url).pathname
    const response = path.startsWith('/api/') || path === '/mcp' || path.startsWith('/oauth/') || path.startsWith('/.well-known/')
      ? await handleApi(request, env)
      : await handler.fetch(request, options)
    const headers = new Headers(response.headers)
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('X-Frame-Options', 'DENY')
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    headers.set('Cache-Control', 'private, no-store')
    if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  },
})

export default {
  fetch: entry.fetch,
  async scheduled(_event: ScheduledController, bindings: Env) { await cleanup(bindings) },
}
