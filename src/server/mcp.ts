import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import type { User } from '../lib/models.ts'
import { actionSchemas, dashboard, detail, executeAction, getBuildings, requireWebmaster, residents } from './service.ts'
import { authorizeWrite, hash, randomToken } from './auth.ts'
import { body, fail, json } from './http.ts'

export async function mcpUser(request: Request, bindings: Env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (rsm_[a-f0-9]{64})$/)?.[1]
  if (!token) return null
  return bindings.DB.prepare('SELECT u.id,u.name,u.phone,u.is_webmaster FROM mcp_tokens t JOIN users u ON u.id IS t.user_id WHERE t.token_hash IS ? AND t.expires_at > ? AND u.is_webmaster IS 1').bind(await hash(token), Date.now()).first<User>()
}

export async function handleMcp(request: Request, bindings: Env) {
  const origin = new URL(request.url).origin
  if (request.headers.has('Origin') && request.headers.get('Origin') !== origin) fail(403, 'Origin denied')
  const user = await mcpUser(request, bindings)
  if (!user) return json({ error: 'Authenticate through WhatsApp as a webmaster' }, 401, { 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` })
  const server = new McpServer({ name: 'residents', version: '0.1.0' })
  server.registerTool('list_buildings', { description: 'List buildings and their collection. Webmaster access does not imply residency.' }, async () => result(await getBuildings(bindings, user)))
  server.registerTool('list_decisions', { description: 'Get decisions, costs, participation and recent activity for one building.', inputSchema: { buildingId: z.string() } }, async (input) => result(await dashboard(bindings, user, input.buildingId)))
  server.registerTool('get_decision', { description: 'Get solving options, costs, voting revision and comments.', inputSchema: { buildingId: z.string(), problemId: z.string() } }, async (input) => result(await detail(bindings, user, input.buildingId, input.problemId)))
  server.registerTool('list_residents', { description: 'Read private resident phone numbers and building verification status.', inputSchema: { buildingId: z.string() } }, async (input) => result(await residents(bindings, user, input.buildingId)))
  const names: Record<string, string> = { join: 'request_residency', 'problem.add': 'create_problem', 'option.save': 'save_solving_option', vote: 'vote', comment: 'comment', 'problem.status': 'set_decision_status', 'resident.verify': 'verify_resident', 'resident.import': 'bulk_approve_residents', 'collection.add': 'create_collection', 'building.add': 'create_building', 'role.grant': 'assign_role' }
  const descriptions: Record<string, string> = { join: 'Request residency; administrators verify it separately.', 'problem.add': 'Create a problem for a building.', 'option.save': 'Add or edit a solution and its price in kopecks. This starts a new revision and clears earlier votes. Supply the current version.', vote: 'Vote as a verified resident only. A webmaster without residency cannot vote.', comment: 'Comment on a building problem.', 'problem.status': 'Open voting with a future deadline and at least two options, or record an outcome and close it. Opening a round clears votes.', 'resident.verify': 'Approve, reject or edit a resident; apartment and entrance may be null. Rejecting revokes their votes.', 'resident.import': 'Bulk import up to 300 WhatsApp numbers and immediately approve residency, even with unknown apartments. Does not send messages or assign admin roles.', 'collection.add': 'Create a building collection.', 'building.add': 'Add a building to a collection. apartmentsCount is used only for an indicative cost split.', 'role.grant': 'Grant or revoke building admin, collection admin or global webmaster; residency is separate.' }
  for (const [action, schema] of Object.entries(actionSchemas)) {
    server.registerTool(names[action], { description: descriptions[action], inputSchema: schema.shape, annotations: { readOnlyHint: false, destructiveHint: ['option.save','problem.status','resident.verify','role.grant'].includes(action) } }, async (input: unknown) => {
      try { return result(await executeAction(bindings, user, action, input)) }
      catch (error) {
        let message = 'Operation failed'
        if (error instanceof Response) { const data = await error.json() as { error: string }; message = data.error }
        else if (error instanceof z.ZodError) message = error.issues[0]?.message || message
        else if (error instanceof Error && /Decision changed|Voting unavailable/.test(error.message)) message = 'Decision changed; refresh before retrying'
        return { isError: true, content: [{ type: 'text' as const, text: message }] }
      }
    })
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true, maxRequestBodySize: 131072 })
  await server.connect(transport)
  return transport.handleRequest(request)
}

const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] })

export async function tokenRoute(request: Request, bindings: Env) {
  const principal = await authorizeWrite(request, bindings)
  requireWebmaster(principal.user)
  const input = await body(request, z.object({ operation: z.enum(['create','revoke']), tokenHash: z.string().optional(), label: z.string().trim().min(1).max(80).default('MCP client') }))
  if (input.operation === 'revoke') {
    await bindings.DB.prepare('DELETE FROM mcp_tokens WHERE token_hash IS ? AND user_id IS ?').bind(input.tokenHash || '', principal.user.id).run()
    return json({ ok: true })
  }
  const token = `rsm_${randomToken()}`
  const expiresAt = Date.now() + 86400000
  await bindings.DB.prepare('INSERT INTO mcp_tokens(token_hash,user_id,label,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await hash(token), principal.user.id, input.label, expiresAt, Date.now()).run()
  return json({ token, expiresAt })
}
