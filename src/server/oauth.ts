import { z } from 'zod'
import { authorizeWrite, hash, randomToken, safeEqual } from './auth.ts'
import { body, fail, json } from './http.ts'
import { requireWebmaster } from './service.ts'

const authorizeSchema = z.object({ clientId: z.string(), redirectUri: z.string().url(), codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), state: z.string().max(1000), resource: z.string().url() })

export async function handleOAuth(request: Request, bindings: Env): Promise<Response> {
  const url = new URL(request.url)
  const origin = url.origin
  if (url.pathname === '/.well-known/oauth-protected-resource' || url.pathname === '/.well-known/oauth-protected-resource/mcp') return json({ resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: ['webmaster'], bearer_methods_supported: ['header'] })
  if (url.pathname === '/.well-known/oauth-authorization-server') return json({ issuer: origin, authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`, registration_endpoint: `${origin}/oauth/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: ['webmaster'] })
  if (url.pathname === '/oauth/register' && request.method === 'POST') {
    const input = await body(request, z.object({ client_name: z.string().min(1).max(100).default('MCP client'), redirect_uris: z.array(z.string().url()).min(1).max(10), token_endpoint_auth_method: z.literal('none').optional() }))
    for (const uri of input.redirect_uris) {
      const redirect = new URL(uri)
      if ((redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(redirect.hostname))) || redirect.hash || redirect.username || redirect.password) fail(400, 'Invalid redirect URI')
    }
    const clientId = crypto.randomUUID()
    await bindings.DB.prepare('INSERT INTO oauth_clients(id,name,redirect_uris,created_at) VALUES(?,?,?,?)').bind(clientId, input.client_name, JSON.stringify(input.redirect_uris), Date.now()).run()
    return json({ client_id: clientId, client_name: input.client_name, redirect_uris: input.redirect_uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] }, 201)
  }
  if (url.pathname === '/oauth/authorize' && request.method === 'GET') {
    if (url.searchParams.get('response_type') !== 'code' || url.searchParams.get('code_challenge_method') !== 'S256' || url.searchParams.get('scope') !== 'webmaster') fail(400, 'Only authorization code with PKCE S256 and webmaster scope is supported')
    const input = authorizeSchema.parse({ clientId: url.searchParams.get('client_id'), redirectUri: url.searchParams.get('redirect_uri'), codeChallenge: url.searchParams.get('code_challenge'), state: url.searchParams.get('state') || '', resource: url.searchParams.get('resource') })
    const client = await validateClient(bindings, input.clientId, input.redirectUri)
    if (input.resource !== `${origin}/mcp`) fail(400, 'Invalid resource')
    const destination = new URL('/', origin)
    destination.searchParams.set('oauth', JSON.stringify({ ...input, clientName: client.name }))
    return Response.redirect(destination.href, 302)
  }
  if (url.pathname === '/oauth/approve' && request.method === 'POST') {
    const principal = await authorizeWrite(request, bindings)
    requireWebmaster(principal.user)
    const input = await body(request, authorizeSchema)
    await validateClient(bindings, input.clientId, input.redirectUri)
    if (input.resource !== `${origin}/mcp`) fail(400, 'Invalid resource')
    const code = randomToken()
    await bindings.DB.prepare('INSERT INTO oauth_codes(code_hash,user_id,client_id,redirect_uri,code_challenge,resource,expires_at) VALUES(?,?,?,?,?,?,?)').bind(await hash(code), principal.user.id, input.clientId, input.redirectUri, input.codeChallenge, input.resource, Date.now() + 120000).run()
    const destination = new URL(input.redirectUri)
    destination.searchParams.set('code', code)
    destination.searchParams.set('state', input.state)
    return json({ redirect: destination.href })
  }
  if (url.pathname === '/oauth/token' && request.method === 'POST') {
    if (Number(request.headers.get('Content-Length') || 0) > 8192) fail(413, 'Request too large')
    const text = await request.text()
    if (text.length > 8192) fail(413, 'Request too large')
    const form = new URLSearchParams(text)
    if (form.get('grant_type') !== 'authorization_code') return json({ error: 'unsupported_grant_type' }, 400)
    const verifier = form.get('code_verifier') || ''
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return json({ error: 'invalid_grant' }, 400)
    const codeHash = await hash(form.get('code') || '')
    const code = await bindings.DB.prepare('SELECT * FROM oauth_codes WHERE code_hash IS ? AND consumed_at IS NULL AND expires_at > ?').bind(codeHash, Date.now()).first<{ user_id: string; client_id: string; redirect_uri: string; code_challenge: string; resource: string }>()
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
    if (!code || code.client_id !== form.get('client_id') || code.redirect_uri !== form.get('redirect_uri') || code.resource !== form.get('resource') || !safeEqual(code.code_challenge, challenge)) return json({ error: 'invalid_grant' }, 400)
    const user = await bindings.DB.prepare('SELECT is_webmaster FROM users WHERE id IS ?').bind(code.user_id).first<{ is_webmaster: number }>()
    if (!user?.is_webmaster) return json({ error: 'access_denied' }, 403)
    const token = `rsm_${randomToken()}`
    const result = await bindings.DB.batch([
      bindings.DB.prepare('INSERT INTO mcp_tokens(token_hash,user_id,label,expires_at,created_at) SELECT ?,?, ?,?,? FROM oauth_codes WHERE code_hash IS ? AND consumed_at IS NULL AND expires_at > ?').bind(await hash(token), code.user_id, 'OAuth MCP client', Date.now() + 3600000, Date.now(), codeHash, Date.now()),
      bindings.DB.prepare('UPDATE oauth_codes SET consumed_at = ? WHERE code_hash IS ? AND consumed_at IS NULL').bind(Date.now(), codeHash),
    ])
    if (!result[0].meta.changes) return json({ error: 'invalid_grant' }, 400)
    return json({ access_token: token, token_type: 'Bearer', expires_in: 3600, scope: 'webmaster' })
  }
  fail(404, 'OAuth endpoint not found')
}

async function validateClient(bindings: Env, clientId: string, redirectUri: string) {
  const client = await bindings.DB.prepare('SELECT name,redirect_uris FROM oauth_clients WHERE id IS ?').bind(clientId).first<{ name: string; redirect_uris: string }>()
  if (!client || !(JSON.parse(client.redirect_uris) as string[]).includes(redirectUri)) fail(400, 'Unregistered client or redirect URI')
  return client
}
