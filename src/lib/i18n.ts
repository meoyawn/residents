import { createSignal } from 'solid-js'
import { tatarMessages, type MessageKey } from './messages-tt.ts'

export type Locale = 'ru' | 'tt'
export const languageStorageKey = 'residents.locale'
const [locale, updateLocale] = createSignal<Locale>('ru')
export const getLocale = locale
const templateKeys = (Object.keys(tatarMessages) as MessageKey[]).filter((key) => key.includes('{'))

export const isLocale = (value: unknown): value is Locale => value === 'ru' || value === 'tt'

/** Locale state changes only in the browser; server renders always use Russian. */
export function setLocale(value: Locale) {
  if (typeof document === 'undefined' || !isLocale(value)) return
  updateLocale(value)
  try { localStorage.setItem(languageStorageKey, value) } catch { /* Switching still works when storage is unavailable. */ }
}

export function initializeLanguage() {
  let preferred: string | null = null
  try { preferred = localStorage.getItem(languageStorageKey) } catch { /* Use the browser language. */ }
  if (isLocale(preferred)) { updateLocale(preferred); return }
  for (const language of navigator.languages) {
    const candidate = language.toLowerCase().split('-')[0]
    if (isLocale(candidate)) { updateLocale(candidate); return }
  }
  updateLocale('ru')
}

export function t(key: MessageKey, values: Record<string, string | number> = {}) {
  const message = locale() === 'tt' ? tatarMessages[key] : key
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder))
}

/** Translates canonical API, import and audit messages without translating user content. */
export function localizeMessage(message: string): string {
  if (Object.hasOwn(tatarMessages, message)) return t(message as MessageKey)
  for (const key of templateKeys) {
    const names: string[] = []
    const escaped = key.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
    const pattern = escaped.replace(/\{(\w+)\}/g, (_placeholder, name: string) => { names.push(name); return '([\\s\\S]+?)' })
    const match = new RegExp(`^${pattern}$`).exec(message)
    if (match) {
      const values = Object.fromEntries(names.map((name, index) => [name, match[index + 1]]))
      if (values.detail?.endsWith('. Начинаем новый раунд голосования.')) values.detail = values.detail.slice(0, -'Начинаем новый раунд голосования.'.length) + t('Начинаем новый раунд голосования.')
      return t(key, values)
    }
  }
  return message
}

export function plural(count: number, one: MessageKey, few: MessageKey, many: MessageKey) {
  const category = new Intl.PluralRules('ru').select(count)
  return t(category === 'one' ? one : category === 'few' ? few : many)
}

export const localizeError = (error: unknown) => localizeMessage(errorMessage(error))

export function errorMessage(error: unknown): MessageKey {
  if (!(error instanceof Error)) return 'Не удалось выполнить действие'
  if (Object.hasOwn(tatarMessages, error.message)) return error.message as MessageKey
  if (error.cause === 400) return 'Проверьте данные'
  return 'Не удалось выполнить действие. Попробуйте снова'
}
