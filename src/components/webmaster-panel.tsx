import { t } from '../lib/i18n.ts'
import { createResource, createSignal, For, Show } from 'solid-js'
import type { Bootstrap } from '../lib/models.ts'
import { api, dateTime, errorMessage } from '../lib/client.ts'
import { Icon, Notice } from './ui.tsx'

interface Token { token_hash: string; label: string; expires_at: number }

export function WebmasterPanel(props: { data: Bootstrap }) {
  const [epoch, setEpoch] = createSignal(0)
  const [tokens] = createResource(epoch, async () => api<Token[]>('/api/mcp/tokens'))
  const [newToken, setNewToken] = createSignal('')
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  async function createToken() {
    setBusy(true); setError(''); setCopied(false)
    try {
      const result = await api<{ token: string }>('/api/mcp/tokens', { input: { operation: 'create', label: 'MCP client' }, csrf: props.data.csrf })
      setNewToken(result.token); setEpoch((value) => value + 1)
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  async function revoke(tokenHash: string) {
    setBusy(true); setError('')
    try { await api('/api/mcp/tokens', { input: { operation: 'revoke', tokenHash }, csrf: props.data.csrf }); setNewToken(''); setEpoch((value) => value + 1) }
    catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  async function copyToken() {
    try { await navigator.clipboard.writeText(newToken()); setCopied(true) }
    catch { setError('Не удалось скопировать. Выделите и скопируйте токен вручную.') }
  }
  return <section class="webmaster-page"><div class="page-heading"><div><span class="eyebrow">WEBMASTER</span><h1>{t('Все дома под управлением')}</h1><p>{t('Создавайте дома, назначайте администраторов и импортируйте жителей через MCP.')}</p></div><span class="webmaster-mark"><Icon name="settings" size={28} /></span></div><div class="mcp-card"><div class="section-line"><h3>{t('Подключение MCP')}</h3><span class="status-pill open">Streamable HTTP</span></div><p>{t('В MCP-клиенте укажите этот адрес. Авторизация откроет WhatsApp-вход и запросит подтверждение доступа к роли webmaster.')}</p><code class="endpoint">{location.origin}/mcp</code><div class="mcp-info"><Icon name="shield" /><p>{t('Webmaster не обязан быть жителем. Голосовать можно только с подтверждённым проживанием в выбранном доме.')}</p></div><details class="manual-token"><summary>{t('Ручное подключение с токеном')}</summary><p>{t('Токен действует 24 часа. Он даёт права вашей роли webmaster и показывается один раз.')}</p><button class="button primary" disabled={busy()} onClick={createToken}><Icon name="plus" size={17} />{t('Создать токен')}</button><Show when={newToken()}><div class="token-box"><code>{newToken()}</code><button class="button secondary small" onClick={copyToken}>{copied() ? t('Скопировано') : t('Скопировать')}</button></div><pre class="mcp-config">{JSON.stringify({ mcpServers: { residents: { url: `${location.origin}/mcp`, headers: { Authorization: `Bearer ${newToken()}` } } } }, null, 2)}</pre></Show><For each={tokens()}>{(token) => <div class="token-row"><div><strong>{token.label}</strong><span>{t('До {date}', { date: dateTime(token.expires_at) })}</span></div><button class="text-button danger-text" disabled={busy()} onClick={() => void revoke(token.token_hash)}>{t('Отозвать')}</button></div>}</For></details><Notice message={error()} /><Show when={tokens.error}><Notice message={errorMessage(tokens.error)} /></Show></div><div class="mcp-card"><h3>{t('Что доступно агенту')}</h3><div class="tool-list"><div><Icon name="building" /><span><strong>{t('Дома и группы')}</strong><p>{t('Создание групп и домов, просмотр всех объектов')}</p></span></div><div><Icon name="users" /><span><strong>{t('Жители и администраторы')}</strong><p>{t('Массовое подтверждение номеров, назначение квартир, выдача и отзыв ролей')}</p></span></div><div><Icon name="vote" /><span><strong>{t('Вопросы и решения')}</strong><p>{t('Варианты, цены, сроки голосования, итоги и комментарии')}</p></span></div></div><p class="fine-print">{t('Для изменения вариантов передавайте текущую редакцию вопроса. При смене сметы прежние голоса сбрасываются.')}</p></div><div class="mcp-card"><h3>{t('Система уже рассчитана на несколько домов')}</h3><div class="building-directory"><For each={props.data.buildings}>{(building) => <div><Icon name="building" size={18} /><span><strong>{building.name}</strong><small>{building.city} · {building.collection_name}</small></span></div>}</For></div></div></section>
}

export function OAuthConsent(props: { request: string; data: Bootstrap; login: () => void; cancel: () => void }) {
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  function clientName() {
    try { const parsed = JSON.parse(props.request) as { clientName?: string }; return parsed.clientName || t('MCP-клиент') }
    catch { return t('MCP-клиент') }
  }
  async function approve() {
    setBusy(true); setError('')
    try {
      const result = await api<{ redirect: string }>('/oauth/approve', { input: JSON.parse(props.request), csrf: props.data.csrf })
      location.assign(result.redirect)
    } catch (error) { setError(errorMessage(error)); setBusy(false) }
  }
  return <div class="oauth-card"><span class="empty-icon"><Icon name="shield" size={30} /></span><h2>{t('Подключить {client}?', { client: clientName() })}</h2><p>{t('Клиент запрашивает роль webmaster: управление домами, администраторами, номерами жителей и решениями.')}</p><Show when={props.data.user} fallback={<button class="button primary" onClick={props.login}>{t('Войти через WhatsApp')}</button>}><Show when={props.data.user?.is_webmaster} fallback={<Notice message={t('Этот номер не имеет роли webmaster. Войдите с назначенным номером.')} />}><button class="button primary" disabled={busy()} onClick={approve}>{busy() ? t('Подключаем…') : t('Разрешить доступ на 1 час')}</button></Show></Show><button class="text-button" onClick={props.cancel}>{t('Отмена')}</button><Notice message={error()} /></div>
}
