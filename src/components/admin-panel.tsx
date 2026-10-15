import { t } from '../lib/i18n.ts'
import { createMemo, createResource, createSignal, For, Show } from 'solid-js'
import type { Building, Resident } from '../lib/models.ts'
import { action, api, errorMessage } from '../lib/client.ts'
import { Empty, Icon, Notice } from './ui.tsx'

export function AdminPanel(props: { building: Building; csrf: string | null; epoch: number; import: () => void; changed: () => Promise<void> }) {
  const [list] = createResource(() => [props.building.id, props.epoch] as const, async ([buildingId]) => api<Resident[]>(`/api/residents?buildingId=${encodeURIComponent(buildingId)}`))
  const [search, setSearch] = createSignal('')
  const [filter, setFilter] = createSignal('all')
  const [editing, setEditing] = createSignal('')
  const filtered = createMemo(() => (list() || []).filter((row) => (filter() === 'all' || row.status === filter()) && `${row.name} ${row.phone} ${row.apartment || ''}`.toLowerCase().includes(search().toLowerCase())))
  return <section class="admin-page"><div class="page-heading"><div><span class="eyebrow">{t('АДМИНИСТРАТОР ДОМА')}</span><h1>{t('Наши соседи')}</h1><p>{t('Подтвердите проживание, чтобы каждый голос был настоящим.')}</p></div><button class="button primary" onClick={props.import}><Icon name="import" size={18} />{t('Импортировать')}</button></div><div class="admin-callout"><Icon name="shield" size={24} /><div><strong>{t('Подтверждаем людей, а не только номера')}</strong><p>{t('WhatsApp проверяет владение номером. Вы проверяете, что человек живёт в этом доме. Квартиру можно назначить позже.')}</p></div></div><div class="admin-tools"><div class="search-field"><Icon name="search" size={18} /><input type="search" placeholder={t('Имя, номер или квартира')} aria-label={t('Поиск жителей')} value={search()} onInput={(event) => setSearch(event.currentTarget.value)} /></div><select aria-label={t('Статус подтверждения')} value={filter()} onChange={(event) => setFilter(event.currentTarget.value)}><option value="all">{t('Все жители')}</option><option value="pending">{t('Ждут подтверждения')}</option><option value="verified">{t('Подтверждены')}</option><option value="rejected">{t('Доступ отозван')}</option></select></div><Show when={!list.error} fallback={<Notice message={errorMessage(list.error)} />}><Show when={!list.loading} fallback={<div class="loading">{t('Загружаем жителей…')}</div>}><div class="resident-list"><For each={filtered()} fallback={<Empty title={t('Список пока пуст')} text={t('Жители появятся после заявки или импорта номеров.')} icon="users" />}>{(resident) => <article class="resident-card"><div class="resident-main"><span class="avatar">{resident.name.charAt(0)}</span><div class="resident-name"><strong>{resident.name}</strong><a href={`tel:${resident.phone}`}>{resident.phone}</a><span>{resident.apartment ? t('Кв. {apartment}', { apartment: resident.apartment }) : t('Квартира неизвестна')}<Show when={resident.entrance}>{t(' · подъезд {entrance}', { entrance: resident.entrance! })}</Show></span></div><span class={`resident-status ${resident.status}`}>{resident.status === 'verified' ? t('Подтверждён') : resident.status === 'pending' ? t('На проверке') : t('Доступ отозван')}</span></div><Show when={editing() === resident.id} fallback={<button class="text-button resident-edit" onClick={() => setEditing(resident.id)}>{resident.status === 'pending' ? t('Проверить жителя') : t('Изменить данные')}<Icon name="chevron" size={16} /></button>}><ResidentEditor resident={resident} building={props.building} csrf={props.csrf} cancel={() => setEditing('')} saved={async () => { setEditing(''); await props.changed() }} /></Show></article>}</For></div><div class="fine-print">{t('Показано {count} из {total} жителей. Номера видны только администраторам соответствующего дома.', { count: filtered().length, total: list()?.length || 0 })}</div></Show></Show></section>
}

function ResidentEditor(props: { resident: Resident; building: Building; csrf: string | null; cancel: () => void; saved: () => Promise<void> }) {
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  async function submit(event: SubmitEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const values = new FormData(event.currentTarget as HTMLFormElement)
    try {
      await action('resident.verify', { buildingId: props.building.id, userId: props.resident.id, status: values.get('status'), apartment: values.get('apartment') || null, entrance: values.get('entrance') || null }, props.csrf)
      await props.saved()
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <form class="stack-form resident-editor" onSubmit={submit}><div class="form-row"><label>{t('Квартира')}<input name="apartment" placeholder={t('Неизвестна')} value={props.resident.apartment || ''} maxlength="20" /></label><label>{t('Подъезд')}<input name="entrance" placeholder={t('Неизвестен')} value={props.resident.entrance || ''} maxlength="20" /></label></div><label>{t('Решение')}<select name="status" value={props.resident.status === 'rejected' ? 'rejected' : 'verified'}><option value="verified">{t('Проживание подтверждено')}</option><option value="rejected">{t('Отозвать доступ')}</option></select></label><Notice message={error()} /><div class="form-actions"><button type="button" class="button secondary small" onClick={props.cancel}>{t('Отмена')}</button><button class="button primary small" disabled={busy()}>{busy() ? t('Сохраняем…') : t('Сохранить')}</button></div></form>
}
