import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

export async function startRuntime(options?: { port: number; https: boolean }) {
  const root = resolve('dist/server')
  const files = (await readdir(root, { recursive: true })).filter((path) => path.endsWith('.js'))
  const modules = await Promise.all(files.map(async (path) => ({ type: 'ESModule' as const, path: resolve(root,path), contents: await readFile(resolve(root,path),'utf8') })))
  modules.sort((a,b) => Number(b.path.endsWith('/index.js')) - Number(a.path.endsWith('/index.js')))
  const runtime = new Miniflare(convertV4MiniflareOptions({ name: 'residents-tests', modules, modulesRoot: root, compatibilityDate: '2026-10-14', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'integration' }, assets: { directory: resolve('dist/client'), routerConfig: { has_user_worker: true } }, ...options, bindings: { AUTH_MODE: 'development', OTP_SECRET: randomBytes(32).toString('hex'), WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_PHONE_NUMBER_ID: '', WHATSAPP_TEMPLATE_NAME: 'residents_login', WHATSAPP_TEMPLATE_LANGUAGE: 'ru', WHATSAPP_GRAPH_VERSION: 'v25.0', BOOTSTRAP_WEBMASTER_PHONE: '' } }))
  const db = await runtime.getD1Database('DB')
  await db.exec((await readFile('migrations/0001_initial.sql','utf8')).replace(/\n/g,' '))
  await db.exec((await readFile('seeds/demo.sql','utf8')).replace(/\n/g,' '))
  return runtime
}
