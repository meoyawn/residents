import { t } from '../lib/i18n.ts'
import { createSignal, For, Show } from 'solid-js'
import { api, errorMessage } from '../lib/client.ts'
import type { Bootstrap } from '../lib/models.ts'
import { Dialog, Icon, Notice } from './ui.tsx'

export function AuthDialog(props: { development: boolean; close: () => void; signedIn: () => Promise<void> }) {
  const [phone, setPhone] = createSignal('')
  const [challenge, setChallenge] = createSignal('')
  const [code, setCode] = createSignal('')
  const [sandboxCode, setSandboxCode] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const [sentAt, setSentAt] = createSignal(0)
  async function send(event?: Event) {
    event?.preventDefault()
    setBusy(true); setError('')
    try {
      const data = await api<{ challengeId: string; sandboxCode?: string }>('/api/auth/request', { input: { phone: phone() } })
      setChallenge(data.challengeId); setSandboxCode(data.sandboxCode || ''); setCode(''); setSentAt(Date.now())
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  async function verify(event: Event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await api<Bootstrap>('/api/auth/verify', { input: { challengeId: challenge(), code: code() } })
      await props.signedIn(); props.close()
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <Dialog title={challenge() ? t('Код из WhatsApp') : t('Добро пожаловать, сосед')} eyebrow={t('ВАШ ДОМ НАЧИНАЕТСЯ ЗДЕСЬ')} close={props.close}><div class="auth-symbol"><Icon name="comment" size={30} /></div><Show when={challenge()} fallback={<><p class="modal-intro">{t('Войдите по номеру WhatsApp. Пароли не нужны, а ваш номер виден только администраторам дома.')}</p><form onSubmit={send} class="stack-form"><label>{t('Номер WhatsApp')}<input type="tel" autocomplete="tel" placeholder="+1 202 555-0100" value={phone()} onInput={(event) => setPhone(event.currentTarget.value)} required /></label><button class="button primary" disabled={busy()}>{busy() ? t('Отправляем…') : t('Получить код в WhatsApp')}<Icon name="arrow" size={18} /></button></form><Show when={props.development}><div class="sandbox-accounts"><span class="eyebrow">{t('ТЕСТОВЫЕ АККАУНТЫ')}</span><p>{t('Выберите номер, затем получите локальный код. Сообщения не отправляются.')}</p><div class="account-buttons"><For each={[{ label: t('Житель'), phone: '+12025550102' }, { label: t('Админ'), phone: '+12025550103' }, { label: 'Webmaster', phone: '+12025550101' }]}>{(account) => <button class="button secondary small" onClick={() => setPhone(account.phone)}>{account.label}</button>}</For></div></div></Show></>}><p class="modal-intro">{t('Введите шестизначный код для {phone}. Он действует 5 минут.', { phone: phone() })}</p><Show when={sandboxCode()}><div class="sandbox-code"><span>{t('Локальный код · WhatsApp не подключён')}</span><strong>{sandboxCode()}</strong><button class="text-button" onClick={() => setCode(sandboxCode())}>{t('Подставить код')}</button></div></Show><form class="stack-form" onSubmit={verify}><label>{t('Код подтверждения')}<input class="otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" value={code()} onInput={(event) => setCode(event.currentTarget.value.replace(/\D/g,''))} required /></label><button class="button primary" disabled={busy() || code().length !== 6}>{busy() ? t('Проверяем…') : t('Войти')}<Icon name="arrow" size={18} /></button></form><div class="auth-links"><button class="text-button" disabled={busy()} onClick={() => { setChallenge(''); setError('') }}>{t('Изменить номер')}</button><button class="text-button" disabled={busy()} onClick={() => { if (Date.now() - sentAt() < 60000) setError('Новый код можно запросить через минуту'); else void send() }}>{t('Отправить ещё раз')}</button></div></Show><Notice message={error()} /><p class="fine-print"><Icon name="shield" size={14} />{t('Номер подтверждает личность. Проживание подтверждает администратор.')}</p></Dialog>
}
