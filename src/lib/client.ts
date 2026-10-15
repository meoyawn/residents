import { errorMessage as canonicalErrorMessage, getLocale, t } from './i18n.ts'

export async function api<T>(path: string, options?: { input?: unknown; csrf?: string | null }): Promise<T> {
  const response = await fetch(path, options?.input === undefined ? { credentials: 'same-origin' } : {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': options.csrf || '' }, body: JSON.stringify(options.input),
  })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие', { cause: response.status })
  return data
}

export const action = <T>(name: string, input: unknown, csrf: string | null) => api<T>('/api/actions', { input: { action: name, input }, csrf })
export const money = (kopecks: number) => new Intl.NumberFormat(Intl.NumberFormat.supportedLocalesOf([`${getLocale()}-RU`])[0] || 'ru-RU', { maximumFractionDigits: 2 }).format(kopecks / 100) + ' ₽'
export const shortDate = (value: string) => formatDate(value, { day: 'numeric', month: 'long' })
export const dateTime = (value: string | number) => formatDate(value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const categoryLabels = () => ({ yard: t('Наш двор'), access: t('Доступность'), maintenance: t('Содержание дома'), safety: t('Безопасность'), other: t('Другое') })
export const statusLabels = () => ({ discussion: t('Обсуждаем'), open: t('Голосуем'), closed: t('Итоги'), resolved: t('Решено') })
export const errorMessage = canonicalErrorMessage

/** CLDR Tatar month names also cover browsers whose Intl data omits Tatar. */
function formatDate(value: string | number, options: Intl.DateTimeFormatOptions) {
  const date = new Date(value)
  const formatter = new Intl.DateTimeFormat(`${getLocale()}-RU`, { ...options, timeZone: 'Europe/Moscow' })
  if (getLocale() === 'ru' || formatter.resolvedOptions().locale.startsWith('tt')) return formatter.format(date)
  const months = options.month === 'long'
    ? ['гыйнвар', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
    : ['гыйн.', 'фев.', 'мар.', 'апр.', 'май', 'июнь', 'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.']
  const month = Number(new Intl.DateTimeFormat('ru-RU', { month: 'numeric', timeZone: 'Europe/Moscow' }).format(date)) - 1
  return new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'Europe/Moscow' }).formatToParts(date).map((part) => part.type === 'month' ? months[month] : part.value).join('')
}
