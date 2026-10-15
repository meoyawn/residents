import { createServerFn } from '@tanstack/solid-start'
import { getRequest } from '@tanstack/solid-start/server'
import { env } from 'cloudflare:workers'
import { bootstrap, dashboard } from './service.ts'
import { isDevelopment } from './http.ts'

export const loadBootstrap = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const development = isDevelopment(request, env)
  const data = await bootstrap(request, env, development)
  const building = data.buildings.find((item) => item.can_participate || item.can_admin) || data.buildings[0]
  const feed = building && (development || building.can_participate || building.can_admin) ? await dashboard(env, data.user, building.id, development) : null
  return { bootstrap: data, dashboard: feed, buildingId: building?.id || '' }
})
