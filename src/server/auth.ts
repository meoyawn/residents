import { timingSafeEqual } from 'node:crypto'
import type { User } from '../lib/models.ts'
import { loginSchema, verifyOtpSchema, normalizePhone } from '../lib/validation.ts'
import { body, checkOrigin, fail, isDevelopment, json } from './http.ts'

export interface Principal {
  user: User
  csrf: string
  csrfHash: string
  sessionHash: string
}

export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function safeEqual(left: string, right: string) {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

async function otpHash(bindings: Env, challengeId: string, code: string) {
  if (!bindings.OTP_SECRET || bindings.OTP_SECRET.length < 32) fail(503, 'Вход ещё не настроен: требуется OTP_SECRET')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(bindings.OTP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${challengeId}:${code}`))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function getPrincipal(request: Request, bindings: Env): Promise<Principal | null> {
  const token = request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('__Host-residents='))?.slice('__Host-residents='.length)
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const sessionHash = await hash(token)
  const row = await bindings.DB.prepare('SELECT u.id,u.name,u.phone,u.is_webmaster,s.csrf_hash,s.csrf_token FROM sessions s JOIN users u ON u.id IS s.user_id WHERE s.token_hash IS ? AND s.expires_at > ?').bind(sessionHash, Date.now()).first<User & { csrf_hash: string; csrf_token: string }>()
  if (!row) return null
  return { user: { id: row.id, name: row.name, phone: row.phone, is_webmaster: row.is_webmaster }, csrf: row.csrf_token, csrfHash: row.csrf_hash, sessionHash }
}

export async function requirePrincipal(request: Request, bindings: Env) {
  const principal = await getPrincipal(request, bindings)
  if (!principal) fail(401, 'Войдите через WhatsApp')
  return principal
}

export async function authorizeWrite(request: Request, bindings: Env) {
  checkOrigin(request)
  const principal = await requirePrincipal(request, bindings)
  const csrf = request.headers.get('X-CSRF-Token') || ''
  if (!safeEqual(await hash(csrf), principal.csrfHash)) fail(403, 'Сессия обновилась. Перезагрузите страницу')
  return principal
}

async function limit(bindings: Env, key: string, max: number, seconds: number) {
  const now = Date.now()
  const result = await bindings.DB.prepare(`INSERT INTO auth_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires_at < ? THEN 1 ELSE attempts + 1 END, expires_at = CASE WHEN expires_at < ? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`).bind(key, now + seconds * 1000, now, now).first<{ attempts: number }>()
  if (!result || result.attempts > max) fail(429, 'Слишком много попыток. Попробуйте позже')
}

export async function requestOtp(request: Request, bindings: Env) {
  checkOrigin(request)
  const input = await body(request, loginSchema)
  const sandbox = isDevelopment(request, bindings)
  if (!sandbox && (!bindings.WHATSAPP_ACCESS_TOKEN || !bindings.WHATSAPP_PHONE_NUMBER_ID)) fail(503, 'WhatsApp ещё не подключён администратором')
  await limit(bindings, `phone:${await hash(input.phone)}`, 1, 60)
  await limit(bindings, `phone-hour:${await hash(input.phone)}`, 5, 3600)
  await limit(bindings, `ip:${await hash(request.headers.get('CF-Connecting-IP') || 'local')}`, sandbox ? 100 : 15, 3600)
  const challengeId = crypto.randomUUID()
  let number: number
  do { number = crypto.getRandomValues(new Uint32Array(1))[0] } while (number >= 4_294_000_000)
  const code = (number % 1_000_000).toString().padStart(6, '0')
  const now = Date.now()
  const codeHash = await otpHash(bindings, challengeId, code)
  await bindings.DB.batch([
    bindings.DB.prepare('UPDATE otp_challenges SET consumed_at = ? WHERE phone IS ? AND consumed_at IS NULL').bind(now, input.phone),
    bindings.DB.prepare('INSERT INTO otp_challenges(id,phone,code_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind(challengeId, input.phone, codeHash, now + 300000, now),
  ])
  if (!sandbox) {
    let sent: Response
    try {
      sent = await fetch(`https://graph.facebook.com/${bindings.WHATSAPP_GRAPH_VERSION}/${bindings.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${bindings.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ messaging_product: 'whatsapp', to: input.phone.slice(1), type: 'template', template: { name: bindings.WHATSAPP_TEMPLATE_NAME, language: { code: bindings.WHATSAPP_TEMPLATE_LANGUAGE }, components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }, { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] }] } }),
      })
    } catch { fail(502, 'Не удалось отправить код. Попробуйте через минуту') }
    if (!sent.ok) {
      console.error(JSON.stringify({ event: 'whatsapp_send_failed', status: sent.status }))
      fail(502, 'Не удалось отправить код. Попробуйте через минуту')
    }
  }
  await bindings.DB.prepare('UPDATE otp_challenges SET delivered = 1 WHERE id IS ?').bind(challengeId).run()
  return json({ challengeId, expiresIn: 300, sandboxCode: sandbox ? code : undefined })
}

export async function verifyOtp(request: Request, bindings: Env) {
  checkOrigin(request)
  const input = await body(request, verifyOtpSchema)
  const now = Date.now()
  const challenge = await bindings.DB.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id IS ? AND consumed_at IS NULL AND delivered IS 1 AND expires_at > ? AND attempts < 5 RETURNING phone,code_hash').bind(input.challengeId, now).first<{ phone: string; code_hash: string }>()
  if (!challenge || !safeEqual(await otpHash(bindings, input.challengeId, input.code), challenge.code_hash)) fail(400, 'Неверный или истёкший код. Запросите новый')
  const bootstrap = bindings.BOOTSTRAP_WEBMASTER_PHONE && normalizePhone(bindings.BOOTSTRAP_WEBMASTER_PHONE) === challenge.phone
  await bindings.DB.prepare('INSERT INTO users(id,phone,is_webmaster) VALUES(?,?,?) ON CONFLICT(phone) DO NOTHING').bind(crypto.randomUUID(), challenge.phone, bootstrap ? 1 : 0).run()
  if (bootstrap) await bindings.DB.prepare('UPDATE users SET is_webmaster = 1 WHERE phone IS ?').bind(challenge.phone).run()
  const user = await bindings.DB.prepare('SELECT id,name,phone,is_webmaster FROM users WHERE phone IS ?').bind(challenge.phone).first<User>()
  if (!user) fail(500, 'Не удалось создать профиль')
  const token = randomToken()
  const tokenHash = await hash(token)
  const csrf = randomToken()
  const results = await bindings.DB.batch([
    bindings.DB.prepare('INSERT INTO sessions(token_hash,user_id,csrf_hash,csrf_token,challenge_id,expires_at,created_at) SELECT ?,?,?,?,?,?,? FROM otp_challenges WHERE id IS ? AND consumed_at IS NULL AND expires_at > ?').bind(tokenHash, user.id, await hash(csrf), csrf, input.challengeId, now + 604800000, now, input.challengeId, now),
    bindings.DB.prepare('UPDATE otp_challenges SET consumed_at = ? WHERE id IS ? AND consumed_at IS NULL').bind(now, input.challengeId),
  ])
  if (!results[0].meta.changes) fail(400, 'Код уже использован')
  return json({ user, csrf }, 200, { 'Set-Cookie': `__Host-residents=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800` })
}

export async function logout(request: Request, bindings: Env) {
  const principal = await authorizeWrite(request, bindings)
  await bindings.DB.prepare('DELETE FROM sessions WHERE token_hash IS ?').bind(principal.sessionHash).run()
  return json({ ok: true }, 200, { 'Set-Cookie': '__Host-residents=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' })
}

export async function cleanup(bindings: Env) {
  await bindings.DB.batch([
    bindings.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
    bindings.DB.prepare('DELETE FROM otp_challenges WHERE expires_at < ? AND id NOT IN (SELECT challenge_id FROM sessions)').bind(Date.now() - 86400000),
    bindings.DB.prepare('DELETE FROM auth_limits WHERE expires_at < ?').bind(Date.now()),
    bindings.DB.prepare('DELETE FROM mcp_tokens WHERE expires_at < ?').bind(Date.now()),
    bindings.DB.prepare('DELETE FROM oauth_codes WHERE expires_at < ?').bind(Date.now()),
  ])
}
