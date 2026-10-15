import { t } from '../lib/i18n.ts'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { action, categoryLabels, errorMessage } from '../lib/client.ts'
import type { Bootstrap, Building } from '../lib/models.ts'
import { Dialog, Icon, Notice } from './ui.tsx'
import { parseResidentImport } from '../lib/validation.ts'

export function ProblemForm(props: { building: Building; csrf: string | null; close: () => void; saved: () => Promise<void> }) {
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [category, setCategory] = createSignal('yard')
  async function submit(event: SubmitEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const values = new FormData(event.currentTarget as HTMLFormElement)
    try {
      await action('problem.add', { buildingId: props.building.id, title: values.get('title'), description: values.get('description'), category: values.get('category') }, props.csrf)
      await props.saved(); props.close()
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <Dialog title={t('Что можно сделать лучше?')} eyebrow={props.building.name} close={props.close}><p class="modal-intro">{t('Опишите проблему и её влияние на соседей. Администратор добавит варианты решения и смету.')}</p><form onSubmit={submit} class="stack-form"><label>{t('Название открытого вопроса')}<input name="title" placeholder={t('Например, освещение у 4-го подъезда')} minlength="5" maxlength="180" required /></label><label>{t('Категория')}<select name="category" aria-label={t('Категория')} value={category()} onChange={(event) => setCategory(event.currentTarget.value)}><For each={Object.keys(categoryLabels()) as (keyof ReturnType<typeof categoryLabels>)[]}>{(value) => <option value={value}>{categoryLabels()[value]}</option>}</For></select></label><label>{t('Что случилось и что вы предлагаете?')}<textarea name="description" rows="5" placeholder={t('Где находится проблема? Кому она мешает? Как можно её решить?')} minlength="10" maxlength="5000" required /></label><Notice message={error()} /><button class="button primary" disabled={busy()}>{busy() ? t('Публикуем…') : t('Предложить соседям')}<Icon name="plus" size={18} /></button></form></Dialog>
}

export function JoinForm(props: { building: Building; data: Bootstrap; close: () => void; saved: () => Promise<void> }) {
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  async function submit(event: SubmitEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const values = new FormData(event.currentTarget as HTMLFormElement)
    try {
      await action('join', { buildingId: props.building.id, name: values.get('name'), apartment: values.get('apartment') || null, entrance: values.get('entrance') || null }, props.data.csrf)
      await props.saved(); props.close()
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <Dialog title={t('Познакомимся?')} eyebrow={props.building.name} close={props.close}><p class="modal-intro">{t('Администратор проверит ваш номер и подтвердит проживание. Номер квартиры можно указать позже.')}</p><form onSubmit={submit} class="stack-form"><label>{t('Как к вам обращаться')}<input name="name" value={props.data.user?.name === 'Житель' ? '' : props.data.user?.name} autocomplete="name" minlength="2" maxlength="80" required /></label><div class="form-row"><label>{t('Квартира')} <span class="optional">{t('необязательно')}</span><input name="apartment" placeholder="101" maxlength="20" /></label><label>{t('Подъезд')} <span class="optional">{t('необязательно')}</span><input name="entrance" placeholder="4" maxlength="20" /></label></div><Notice message={error()} /><button class="button primary" disabled={busy()}>{busy() ? t('Отправляем…') : t('Подтвердить проживание')}<Icon name="shield" size={18} /></button></form></Dialog>
}

export function ImportForm(props: { building: Building; csrf: string | null; close: () => void; saved: () => Promise<void> }) {
  const [text, setText] = createSignal('')
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [step, setStep] = createSignal<'input' | 'preview'>('input')
  const parsed = createMemo(() => parseResidentImport(text()))
  async function submit(event: Event) {
    event.preventDefault()
    if (parsed().errors.length || !parsed().rows.length) { setError('Исправьте номера перед импортом'); return }
    if (step() === 'input') { setStep('preview'); setError(''); return }
    setBusy(true); setError('')
    try { await action('resident.import', { buildingId: props.building.id, residents: parsed().rows }, props.csrf); await props.saved(); props.close() }
    catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  function readFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0]
    if (!file) return
    if (file.size > 100000) { setError('Файл должен быть меньше 100 КБ'); return }
    file.text().then(setText).catch((error) => setError(errorMessage(error)))
  }
  return <Dialog title={t('Импорт жителей')} eyebrow={props.building.name} close={props.close} wide><p class="modal-intro">{t('Подтверждайте только номера жителей, которых вы проверили. Квартира и подъезд могут оставаться неизвестными.')}</p><form onSubmit={submit} class="stack-form"><Show when={step() === 'input'} fallback={<><div class="approval-summary"><Icon name="shield" size={28} /><h3>{t('Подтвердить {count} жителей?', { count: parsed().rows.length })}</h3><p>{t('Все эти номера получат доступ к обсуждениям и голосованиям в доме {building}. WhatsApp-сообщения отправляться не будут.', { building: props.building.name })}</p></div><div class="import-preview"><table><thead><tr><th>WhatsApp</th><th>{t('Квартира')}</th><th>{t('Подъезд')}</th></tr></thead><tbody>{parsed().rows.slice(0,20).map((row) => <tr><td>{row.phone}</td><td>{row.apartment || t('Неизвестна')}</td><td>{row.entrance || '—'}</td></tr>)}</tbody></table><Show when={parsed().rows.length > 20}><p>{t('И ещё {count} жителей', { count: parsed().rows.length - 20 })}</p></Show></div><button type="button" class="text-button" onClick={() => setStep('input')}>{t('Вернуться к списку')}</button></>}><label>{t('Номера WhatsApp')}<textarea rows="7" placeholder={'+1 202 555-0100\n+7 999 123-45-68;101;4;Ирина'} value={text()} onInput={(event) => setText(event.currentTarget.value)} required /></label><p class="fine-print">{t('Один номер на строку или столбцы: телефон; квартира; подъезд; имя. Разделители: точка с запятой, запятая или табуляция. Повторяющиеся номера объединяются. До 300 жителей.')}</p><label class="upload-field"><Icon name="import" />{t('Загрузить CSV или TXT')}<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={readFile} /></label><Show when={text()}><div class="import-count">{t('Распознано номеров:')} <strong>{parsed().rows.length}</strong></div></Show>{parsed().errors.map((message) => <Notice message={message} />)}</Show><Notice message={error()} /><button class="button primary" disabled={busy() || !parsed().rows.length || !!parsed().errors.length}>{busy() ? t('Импортируем…') : step() === 'input' ? t('Проверить список') : t('Импортировать и подтвердить')}<Icon name={step() === 'input' ? 'arrow' : 'checks'} size={18} /></button></form></Dialog>
}
