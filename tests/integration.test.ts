import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import type { Miniflare } from 'miniflare'
import { startRuntime } from './helpers/runtime.ts'
import type { Bootstrap, Detail, Resident, User } from '../src/lib/models.ts'

interface Session { cookie: string; csrf: string; user: User }
let runtime: Miniflare
let admin: Session
let resident: Session
let webmaster: Session
let pending: Session
const origin = 'https://localhost'

before(async () => {
  runtime = await startRuntime()
  admin = await login('+12025550103')
  resident = await login('+12025550102')
  webmaster = await login('+12025550101')
  pending = await login('+12025550109')
})
after(async () => { await runtime?.dispose() })

async function request(path: string, session?: Session, input?: unknown, headers?: Record<string,string>) {
  return runtime.dispatchFetch(`${origin}${path}`, { method: input === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) })
}

async function read<T>(response: Awaited<ReturnType<typeof request>>): Promise<T> {
  assert.ok(response.ok, `HTTP ${response.status}: ${await response.clone().text()}`)
  return response.json() as Promise<T>
}

async function login(phone: string): Promise<Session> {
  const challenge = await read<{challengeId: string; sandboxCode: string}>(await request('/api/auth/request',undefined,{phone}))
  const response = await request('/api/auth/verify',undefined,{challengeId: challenge.challengeId, code: challenge.sandboxCode})
  const data = await read<{user: User; csrf: string}>(response)
  return { cookie: response.headers.get('Set-Cookie')!.split(';')[0], csrf: data.csrf, user: data.user }
}

async function act<T>(name: string, input: unknown, session: Session): Promise<T> {
  return read<T>(await request('/api/actions',session,{action:name,input}))
}

async function decision(id: string, session = admin) {
  return read<Detail>(await request(`/api/decision?buildingId=example-house-1&problemId=${id}`,session))
}

async function makeDecision(title: string) {
  const problem = await act<{id:string}>('problem.add',{buildingId:'example-house-1',title,description:'A decision with independent options and a transparent estimate.',category:'yard'},admin)
  const first = await act<{id:string;version:number}>('option.save',{buildingId:'example-house-1',problemId:problem.id,version:1,title:'First solution',description:'Accessible path',priceKopecks:250000,costNote:'Contractor estimate'},admin)
  const second = await act<{id:string;version:number}>('option.save',{buildingId:'example-house-1',problemId:problem.id,version:first.version,title:'Second solution',description:'Keep current state',priceKopecks:0,costNote:'No works'},admin)
  await act('problem.status',{buildingId:'example-house-1',problemId:problem.id,version:second.version,status:'open',deadline:new Date(Date.now()+86400000).toISOString()},admin)
  return {id:problem.id,first:first.id,second:second.id,version:second.version+1}
}

describe('Resident platform over the built Worker and real local D1', { concurrency: false }, () => {
  test('data-only SSR sends initial building and decision data without rendering the application component', async () => {
    const response = await request('/')
    const html = await response.text()
    assert.equal(response.status,200)
    assert.match(html,/Примерная/)
    assert.match(html,/gate-key|gate/)
    assert.doesNotMatch(html,/<h1[^>]*>Наш дом/)
    assert.equal(response.headers.get('Cache-Control'),'private, no-store')
  })

  test('WhatsApp codes create secure sessions, cannot be replayed, and lock after five failures', async () => {
    const challenge = await read<{challengeId:string;sandboxCode:string}>(await request('/api/auth/request',undefined,{phone:'+12025550131'}))
    const response = await request('/api/auth/verify',undefined,{challengeId:challenge.challengeId,code:challenge.sandboxCode})
    assert.equal(response.status,200)
    const cookie = response.headers.get('Set-Cookie') || ''
    for (const attribute of ['__Host-residents=','HttpOnly','Secure','SameSite=Lax','Path=/']) assert.ok(cookie.includes(attribute))
    assert.equal((await request('/api/auth/verify',undefined,{challengeId:challenge.challengeId,code:challenge.sandboxCode})).status,400)
    assert.equal((await request('/api/auth/request',undefined,{phone:'+12025550131'})).status,429)
    const locked = await read<{challengeId:string;sandboxCode:string}>(await request('/api/auth/request',undefined,{phone:'+12025550132'}))
    const wrong = locked.sandboxCode === '000000' ? '111111' : '000000'
    for (let i=0;i<5;i++) assert.equal((await request('/api/auth/verify',undefined,{challengeId:locked.challengeId,code:wrong})).status,400)
    assert.equal((await request('/api/auth/verify',undefined,{challengeId:locked.challengeId,code:locked.sandboxCode})).status,400)
  })

  test('sandbox authentication stays unavailable on a non-local hostname', async () => {
    const response = await runtime.dispatchFetch('https://example.app/api/auth/request',{method:'POST',headers:{Origin:'https://example.app','Content-Type':'application/json'},body:JSON.stringify({phone:'+12025550133'})})
    assert.equal(response.status,503)
    assert.doesNotMatch(await response.text(),/sandboxCode/)
  })

  test('production responses keep building discussions and resident lists behind residency and admin checks', async () => {
    const productionOrigin = 'https://residents.example'
    const paths = ['/api/dashboard?buildingId=example-house-1', '/api/decision?buildingId=example-house-1&problemId=gate', '/api/residents?buildingId=example-house-1']
    for (const path of paths) {
      const authorized = await runtime.dispatchFetch(`${productionOrigin}${path}`, { headers: { Cookie: admin.cookie } })
      assert.equal(authorized.status,200)
      for (const session of [undefined,pending]) {
        const response = await runtime.dispatchFetch(`${productionOrigin}${path}`, { headers: session ? { Cookie: session.cookie } : {} })
        assert.equal(response.status,session ? 403 : 401)
        assert.equal(response.headers.get('Cache-Control'),'private, no-store')
        assert.doesNotMatch(await response.text(),/gate-key|Давайте учтём|\+12025550103/)
      }
    }
    for (const path of ['/', '/api/bootstrap']) {
      const response = await runtime.dispatchFetch(`${productionOrigin}${path}`)
      assert.equal(response.status,200)
      assert.equal(response.headers.get('Cache-Control'),'private, no-store')
      assert.doesNotMatch(await response.text(),/gate-key|Давайте учтём|\+12025550103|sandboxCode/)
    }
  })

  test('browser mutations require matching origin and CSRF, and resident approval never grants admin', async () => {
    const input = {action:'problem.add',input:{buildingId:'example-house-1',title:'Origin boundary',description:'A meaningful description to avoid validation denials.',category:'yard'}}
    assert.equal((await request('/api/actions',resident,input,{Origin:'https://attacker.example'})).status,403)
    assert.equal((await request('/api/actions',resident,input,{'X-CSRF-Token':'wrong'})).status,403)
    assert.equal((await request('/api/residents?buildingId=example-house-1',resident)).status,403)
    assert.equal((await request('/api/actions',resident,{action:'resident.import',input:{buildingId:'example-house-1',residents:[{phone:'+12025550134'}]}})).status,403)
  })

  test('phone authentication alone does not allow voting and global webmaster status does not imply residency', async () => {
    const input = {action:'vote',input:{buildingId:'example-house-1',problemId:'gate',optionId:'gate-key',version:1}}
    assert.equal((await request('/api/actions',pending,input)).status,403)
    assert.equal((await request('/api/actions',webmaster,input)).status,403)
  })

  test('building admins and collection admins stay confined to assigned buildings', async () => {
    const outsider = await login('+12025550135')
    await act('resident.import',{buildingId:'demo-block-2',residents:[{phone:outsider.user.phone}]},admin)
    await act('role.grant',{phone:outsider.user.phone,scope:'building',scopeId:'demo-block-2'},webmaster)
    assert.equal((await request('/api/residents?buildingId=demo-block-2',outsider)).status,200)
    assert.equal((await request('/api/residents?buildingId=example-house-1',outsider)).status,403)
    assert.equal((await request('/api/actions',outsider,{action:'resident.import',input:{buildingId:'demo-block-3',residents:[{phone:'+12025550136'}]}})).status,403)
    assert.equal((await request('/api/residents?buildingId=demo-block-4',admin)).status,200)
  })

  test('bulk approval normalizes and deduplicates phones, permits unknown apartments and attaches later logins to that membership', async () => {
    const result = await act<{approved:number;duplicates:number}>('resident.import',{buildingId:'example-house-1',residents:[{phone:'8 (000) 000-00-01'},{phone:'+70000000001'},{phone:'+12025550142',apartment:'150',entrance:'4'}]},admin)
    assert.deepEqual(result,{approved:2,duplicates:1})
    const list = await read<Resident[]>(await request('/api/residents?buildingId=example-house-1',admin))
    const imported = list.find((row) => row.phone === '+70000000001')!
    assert.equal(imported.status,'verified')
    assert.equal(imported.apartment,null)
    const session = await login('+70000000001')
    assert.equal(session.user.id,imported.id)
    await act('vote',{buildingId:'example-house-1',problemId:'gate',optionId:'gate-key',version:1},session)
    assert.equal((await decision('gate',session)).problem.my_option_id,'gate-key')
    await act('resident.verify',{buildingId:'example-house-1',userId:imported.id,status:'verified',apartment:'151',entrance:'4'},admin)
    await act('resident.import',{buildingId:'example-house-1',residents:[{phone:imported.phone}]},admin)
    const updated = await read<Resident[]>(await request('/api/residents?buildingId=example-house-1',admin))
    assert.equal(updated.find((row) => row.id === imported.id)?.apartment,'151')
  })

  test('one resident has one changeable vote and options cannot cross decision or building boundaries', async () => {
    const poll = await makeDecision('Ballot uniqueness')
    await act('vote',{buildingId:'example-house-1',problemId:poll.id,optionId:poll.first,version:poll.version},resident)
    await act('vote',{buildingId:'example-house-1',problemId:poll.id,optionId:poll.second,version:poll.version},resident)
    const detail = await decision(poll.id,resident)
    assert.equal(detail.problem.votes_count,1)
    assert.equal(detail.problem.my_option_id,poll.second)
    assert.equal((await request('/api/actions',resident,{action:'vote',input:{buildingId:'example-house-1',problemId:poll.id,optionId:'gate-key',version:poll.version}})).status,400)
    assert.equal((await request(`/api/decision?buildingId=demo-block-1&problemId=${poll.id}`,resident)).status,404)
  })

  test('a cost revision clears previous consent and atomically rejects concurrent or stale revisions', async () => {
    const poll = await makeDecision('Cost revision consent')
    await act('vote',{buildingId:'example-house-1',problemId:poll.id,optionId:poll.first,version:poll.version},resident)
    const input = {action:'option.save',input:{buildingId:'example-house-1',problemId:poll.id,optionId:poll.first,version:poll.version,title:'First solution',description:'Revised contractor quote',priceKopecks:500000,costNote:'New quote'}}
    const responses = await Promise.all([request('/api/actions',admin,input),request('/api/actions',admin,input)])
    assert.deepEqual(responses.map((response) => response.status).sort(),[200,409])
    const revised = await decision(poll.id,resident)
    assert.equal(revised.problem.version,poll.version+1)
    assert.equal(revised.problem.votes_count,0)
    assert.equal(revised.problem.my_option_id,null)
    assert.equal((await request('/api/actions',resident,{action:'vote',input:{buildingId:'example-house-1',problemId:poll.id,optionId:poll.first,version:poll.version}})).status,409)
  })

  test('closing keeps results while reopening starts a new round; expired decisions reject ballots', async () => {
    const poll = await makeDecision('Voting lifecycle')
    await act('vote',{buildingId:'example-house-1',problemId:poll.id,optionId:poll.first,version:poll.version},resident)
    await act('problem.status',{buildingId:'example-house-1',problemId:poll.id,version:poll.version,status:'closed',outcome:'We chose the accessible solution.'},admin)
    const closed = await decision(poll.id,resident)
    assert.equal(closed.problem.votes_count,1)
    assert.equal(closed.problem.my_option_id,poll.first)
    assert.equal((await request('/api/actions',resident,{action:'vote',input:{buildingId:'example-house-1',problemId:poll.id,optionId:poll.second,version:closed.problem.version}})).status,409)
    await act('problem.status',{buildingId:'example-house-1',problemId:poll.id,version:closed.problem.version,status:'open',deadline:new Date(Date.now()+86400000).toISOString()},admin)
    assert.equal((await decision(poll.id)).problem.votes_count,0)
    const db = await runtime.getD1Database('DB')
    await db.prepare("UPDATE problems SET version = version + 1,deadline = '2020-01-01T00:00:00.000Z' WHERE id IS ?").bind(poll.id).run()
    assert.equal((await request('/api/actions',resident,{action:'vote',input:{buildingId:'example-house-1',problemId:poll.id,optionId:poll.first,version:closed.problem.version+2}})).status,409)
  })

  test('revoking residency removes its votes and blocks later participation', async () => {
    const session = await login('+12025550151')
    await act('resident.import',{buildingId:'example-house-1',residents:[{phone:session.user.phone}]},admin)
    await act('vote',{buildingId:'example-house-1',problemId:'gate',optionId:'gate-key',version:1},session)
    const before = (await decision('gate')).problem.votes_count
    await act('resident.verify',{buildingId:'example-house-1',userId:session.user.id,status:'rejected',apartment:null,entrance:null},admin)
    assert.equal((await decision('gate')).problem.votes_count,before-1)
    assert.equal((await request('/api/actions',session,{action:'vote',input:{buildingId:'example-house-1',problemId:'gate',optionId:'gate-key',version:1}})).status,403)
  })

  test('MCP tools authenticate with WhatsApp-derived webmaster tokens and support bulk approval', async () => {
    const token = await read<{token:string}>(await request('/api/mcp/tokens',webmaster,{operation:'create',label:'Integration client'}))
    const headers = {Authorization:`Bearer ${token.token}`,Accept:'application/json, text/event-stream'}
    const init = await read<{result:{serverInfo:{name:string}}}>(await request('/mcp',undefined,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'integration',version:'1'}}},headers))
    assert.equal(init.result.serverInfo.name,'residents')
    const approval = await read<{result:{content:{text:string}[];isError?:boolean}}>(await request('/mcp',undefined,{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'bulk_approve_residents',arguments:{buildingId:'demo-block-4',residents:[{phone:'+12025550161'}]}}},headers))
    assert.ok(!approval.result.isError)
    assert.equal(JSON.parse(approval.result.content[0].text).approved,1)
    assert.equal((await request('/api/mcp/tokens',resident,{operation:'create',label:'Unauthorized'})).status,403)
    const db = await runtime.getD1Database('DB')
    await db.prepare('UPDATE users SET is_webmaster = 0 WHERE id IS ?').bind(webmaster.user.id).run()
    assert.equal((await request('/mcp',undefined,{jsonrpc:'2.0',id:3,method:'tools/list'},headers)).status,401)
    await db.prepare('UPDATE users SET is_webmaster = 1 WHERE id IS ?').bind(webmaster.user.id).run()
  })

  test('OAuth binds codes to exact redirects, PKCE, resource and one-time token exchange', async () => {
    const client = await read<{client_id:string}>(await request('/oauth/register',undefined,{client_name:'Integration MCP',redirect_uris:['https://client.example/callback']}))
    const verifier = randomBytes(48).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const args = {clientId:client.client_id,redirectUri:'https://client.example/callback',codeChallenge:challenge,state:'opaque-state',resource:`${origin}/mcp`}
    assert.equal((await request('/oauth/approve',webmaster,{...args,redirectUri:'https://attacker.example/'})).status,400)
    const approval = await read<{redirect:string}>(await request('/oauth/approve',webmaster,args))
    const redirect = new URL(approval.redirect)
    assert.equal(redirect.searchParams.get('state'),'opaque-state')
    const form = new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:args.redirectUri,code:redirect.searchParams.get('code')!,code_verifier:verifier,resource:args.resource})
    async function exchange(values: URLSearchParams) { return runtime.dispatchFetch(`${origin}/oauth/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:values.toString()}) }
    const wrong = new URLSearchParams(form); wrong.set('code_verifier',randomBytes(48).toString('base64url'))
    assert.equal((await exchange(wrong)).status,400)
    const response = await exchange(form)
    assert.equal(response.status,200)
    assert.equal((await response.json() as {token_type:string}).token_type,'Bearer')
    assert.equal((await exchange(form)).status,400)
  })
})
