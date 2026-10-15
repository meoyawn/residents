import { z } from 'zod'
import { authorizeWrite, getPrincipal, logout, requestOtp, requirePrincipal, verifyOtp } from './auth.ts'
import { bootstrap, dashboard, detail, executeAction, requireWebmaster, residents } from './service.ts'
import { body, fail, isDevelopment, json } from './http.ts'
import { handleMcp, tokenRoute } from './mcp.ts'
import { handleOAuth } from './oauth.ts'

export async function handleApi(request: Request, bindings: Env): Promise<Response> {
  const url = new URL(request.url)
  try {
    if (url.pathname === '/mcp') return await handleMcp(request, bindings)
    if (url.pathname.startsWith('/oauth/') || url.pathname.startsWith('/.well-known/')) return await handleOAuth(request, bindings)
    if (url.pathname === '/api/auth/request' && request.method === 'POST') return await requestOtp(request, bindings)
    if (url.pathname === '/api/auth/verify' && request.method === 'POST') return await verifyOtp(request, bindings)
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return await logout(request, bindings)
    if (url.pathname === '/api/bootstrap' && request.method === 'GET') return json(await bootstrap(request, bindings, isDevelopment(request, bindings)))
    if (url.pathname === '/api/actions' && request.method === 'POST') {
      const principal = await authorizeWrite(request, bindings)
      const input = await body(request, z.object({ action: z.string(), input: z.unknown() }))
      return json(await executeAction(bindings, principal.user, input.action, input.input))
    }
    if (url.pathname === '/api/dashboard' && request.method === 'GET') {
      const principal = await getPrincipal(request, bindings)
      return json(await dashboard(bindings, principal?.user || null, url.searchParams.get('buildingId') || '', isDevelopment(request, bindings)))
    }
    if (url.pathname === '/api/decision' && request.method === 'GET') {
      const principal = await getPrincipal(request, bindings)
      return json(await detail(bindings, principal?.user || null, url.searchParams.get('buildingId') || '', url.searchParams.get('problemId') || '', isDevelopment(request, bindings)))
    }
    if (url.pathname === '/api/residents' && request.method === 'GET') {
      const principal = await requirePrincipal(request, bindings)
      return json(await residents(bindings, principal.user, url.searchParams.get('buildingId') || ''))
    }
    if (url.pathname === '/api/mcp/tokens' && request.method === 'POST') return await tokenRoute(request, bindings)
    if (url.pathname === '/api/mcp/tokens' && request.method === 'GET') {
      const principal = await requirePrincipal(request, bindings)
      requireWebmaster(principal.user)
      const result = await bindings.DB.prepare('SELECT token_hash,label,expires_at FROM mcp_tokens WHERE user_id IS ? AND expires_at > ?').bind(principal.user.id, Date.now()).all()
      return json(result.results)
    }
    fail(404, 'Маршрут не найден')
  } catch (error) {
    if (error instanceof Response) return error
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message || 'Проверьте данные' }, 400)
    if (error instanceof Error && /Decision changed|Voting unavailable|UNIQUE constraint/.test(error.message)) return json({ error: 'Данные изменились. Обновите страницу и попробуйте снова' }, 409)
    console.error(JSON.stringify({ event: 'api_error' }))
    return json({ error: 'Не удалось выполнить действие. Попробуйте снова' }, 500)
  }
}
