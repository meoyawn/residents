import { z } from 'zod'

export function fail(status: number, message: string): never {
  throw json({ error: message }, status)
}

export function json(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } })
}

export function isDevelopment(request: Request, bindings: Env) {
  return bindings.AUTH_MODE === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
}

export function checkOrigin(request: Request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) fail(403, 'Запрос должен быть отправлен с этого сайта')
}

export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415, 'Ожидается JSON')
  if (!request.body) fail(400, 'Пустой запрос')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.byteLength
    if (size > 131072) {
      await reader.cancel()
      fail(413, 'Запрос слишком большой')
    }
    chunks.push(chunk.value)
  }
  const buffer = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength }
  let parsed: unknown
  try { parsed = JSON.parse(new TextDecoder().decode(buffer)) }
  catch { fail(400, 'Некорректный JSON') }
  const result = schema.safeParse(parsed)
  if (!result.success) fail(400, result.error.issues[0]?.message || 'Проверьте данные')
  return result.data
}
