import { t, plural } from '../lib/i18n.ts'
import { createMemo, createResource, createSignal, For, Show } from 'solid-js'
import type { Building, Detail, Option } from '../lib/models.ts'
import { action, api, categoryLabels, dateTime, errorMessage, money, shortDate, statusLabels } from '../lib/client.ts'
import { Dialog, Empty, Icon, Notice } from './ui.tsx'

export function DecisionDetail(props: { problemId: string; building: Building; csrf: string | null; signedIn: boolean; close: () => void; login: () => void; changed: () => Promise<void> }) {
  const [revision, setRevision] = createSignal(0)
  const [data] = createResource(() => [props.building.id, props.problemId, revision()] as const, async ([buildingId, problemId]) => api<Detail>(`/api/decision?buildingId=${encodeURIComponent(buildingId)}&problemId=${encodeURIComponent(problemId)}`))
  const [selected, setSelected] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const [message, setMessage] = createSignal('')
  const [editor, setEditor] = createSignal<Option | null | undefined>(undefined)
  const [manageStatus, setManageStatus] = createSignal(false)
  const [comment, setComment] = createSignal('')
  const canVote = createMemo(() => data()?.problem.status === 'open' && Date.parse(data()?.problem.deadline || '') > Date.now())
  const selectedId = createMemo(() => selected() || data()?.problem.my_option_id || '')
  async function refresh() { setRevision((value) => value + 1); await props.changed() }
  async function vote() {
    if (!props.signedIn) { props.login(); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await action('vote', { buildingId: props.building.id, problemId: props.problemId, optionId: selectedId(), version: data()?.problem.version }, props.csrf)
      setMessage('Ваш голос учтён. До окончания голосования его можно изменить.'); await refresh()
    } catch (error) { setError(errorMessage(error)); setRevision((value) => value + 1) }
    finally { setBusy(false) }
  }
  async function submitComment(event: Event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await action('comment', { buildingId: props.building.id, problemId: props.problemId, body: comment() }, props.csrf)
      setComment(''); setMessage('Комментарий опубликован'); await refresh()
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <Dialog title={t('Открытый вопрос')} eyebrow={props.building.name} close={props.close} sheet wide><Show when={!data.error} fallback={<Notice message={errorMessage(data.error)} />}><Show when={data()} fallback={<div class="loading">{t('Загружаем вопрос…')}</div>}>{(detail) => <><div class="detail-meta"><span class={`status-pill ${detail().problem.status}`}>{statusLabels()[detail().problem.status]}</span><span>{categoryLabels()[detail().problem.category]}</span><span>{t('Редакция {version}', { version: detail().problem.version })}</span></div><h1 class="detail-title">{detail().problem.title}</h1><div class="author-line"><span class="avatar small-avatar">{detail().problem.author_name.charAt(0)}</span>{detail().problem.author_name}<span>·</span>{shortDate(detail().problem.created_at)}</div><p class="detail-description">{detail().problem.description}</p><Show when={detail().problem.outcome}><div class="outcome"><Icon name="checks" /><div><strong>{t('Результат')}</strong><p>{detail().problem.outcome}</p></div></div></Show><div class="detail-divider" /><div class="section-line"><h3>{t('Варианты решения')} <span>{detail().options.length}</span></h3><Show when={props.building.can_admin}><button class="text-button" onClick={() => setEditor(null)}><Icon name="plus" size={16} />{t('Добавить')}</button></Show></div><p class="section-hint">{t('Сравните стоимость и выберите один вариант.')}</p><Show when={detail().options.length} fallback={<Empty title={t('Сначала обсудим варианты')} text={t('Администратор добавит предложения и стоимость работ. Пока можно поделиться идеей в комментариях.')} icon="comment" />}><div class="vote-options"><For each={detail().options}>{(option) => <div classList={{ 'vote-option': true, 'option-selected': selectedId() === option.id }}><label class="option-label"><Show when={canVote()} fallback={<span class="option-radio static-radio"><Icon name="file" size={15} /></span>}><input type="radio" name="solution" value={option.id} checked={selectedId() === option.id} disabled={busy() || (!!props.signedIn && !props.building.can_participate)} onChange={() => setSelected(option.id)} /><span class="option-radio"><Show when={selectedId() === option.id}><span /></Show></span></Show><div class="option-copy"><div class="option-title">{option.title}</div><Show when={option.description}><div class="option-scenario-label">{t('Сценарий решения')}</div><p>{option.description}</p></Show><div class="option-price"><Show when={option.price_kopecks > 0} fallback={t('Бесплатно')}>{money(option.price_kopecks)}</Show><span>{t('общая стоимость')}</span></div><Show when={option.price_kopecks > 0}><div class="cost-split">{t('≈ {price} на квартиру при {count} квартирах', { price: money(Math.ceil(option.price_kopecks / props.building.apartments_count)), count: props.building.apartments_count })}</div></Show><div class="cost-note">{option.cost_note}</div><div class="option-results"><div class="option-bar"><span style={{ width: `${detail().problem.votes_count ? option.votes_count / detail().problem.votes_count * 100 : 0}%` }} /></div><span>{option.votes_count} {plural(option.votes_count, 'голос', 'голоса', 'голосов')}</span></div></div></label><Show when={props.building.can_admin && ['discussion','open'].includes(detail().problem.status)}><button class="option-edit" aria-label={t('Изменить {title}', { title: option.title })} onClick={() => setEditor(option)}><Icon name="settings" size={15} />{t('Изменить')}</button></Show></div>}</For></div><p class="fine-print">{t('Сумма на квартиру — ориентир, а не начисление. Смету, количество квартир и порядок оплаты нужно согласовать отдельно.')}</p><div class="voting-summary"><span><Icon name="users" size={17} />{t('{votes} из {residents} жителей', { votes: detail().problem.votes_count, residents: detail().eligible_count })}</span><Show when={detail().problem.deadline}><span><Icon name="clock" size={17} />{t('До {date}', { date: shortDate(detail().problem.deadline!) })}</span></Show></div><Show when={canVote()} fallback={<Show when={detail().problem.status === 'open'}><Notice message={t('Срок голосования истёк. Администратор подведёт итоги.')} /></Show>}><Show when={!props.signedIn || props.building.can_participate} fallback={<Notice message={t('Для голосования требуется подтверждённое проживание в этом доме.')} />}><button class="button primary vote-button" disabled={busy() || (props.signedIn && !selectedId())} onClick={vote}>{busy() ? t('Сохраняем…') : !props.signedIn ? t('Войти, чтобы проголосовать') : detail().problem.my_option_id ? t('Обновить мой голос') : t('Проголосовать')}<Icon name="vote" size={19} /></button><p class="fine-print center">{t('Один подтверждённый житель — один голос. Это совместное обсуждение, не юридическое общее собрание.')}</p></Show></Show></Show><Show when={editor() !== undefined}><OptionEditor option={editor()} detail={detail()} building={props.building} csrf={props.csrf} cancel={() => setEditor(undefined)} saved={async () => { setEditor(undefined); setMessage('Варианты обновлены. Начата новая редакция голосования.'); await refresh() }} /></Show><Show when={props.building.can_admin}><button class="button secondary manage-button" onClick={() => setManageStatus(!manageStatus())}><Icon name="settings" size={17} />{t('Управление голосованием')}<Icon name="down" size={15} /></button><Show when={manageStatus()}><StatusEditor detail={detail()} building={props.building} csrf={props.csrf} saved={async () => { setManageStatus(false); await refresh() }} /></Show></Show><Notice message={message()} kind="success" /><Notice message={error()} /><div class="detail-divider" /><div class="section-line"><h3>{t('Разговор с соседями')} <span>{detail().problem.comments_count}</span></h3><Icon name="comment" /></div><Show when={props.signedIn && (props.building.can_participate || props.building.can_admin) && detail().problem.status !== 'resolved'} fallback={<Show when={!props.signedIn}><button class="button secondary" onClick={props.login}>{t('Войти, чтобы оставить комментарий')}</button></Show>}><form class="comment-form" onSubmit={submitComment}><label class="sr-only" for="comment-text">{t('Ваш комментарий')}</label><textarea id="comment-text" rows="3" placeholder={t('Предложите идею или задайте вопрос…')} maxlength="3000" value={comment()} onInput={(event) => setComment(event.currentTarget.value)} required /><div><span>{t('Обсуждаем решения, уважаем соседей.')}</span><button class="button primary small" disabled={busy() || !comment().trim()}>{t('Отправить')}<Icon name="arrow" size={15} /></button></div></form></Show><div class="comments-list"><For each={detail().comments} fallback={<p class="section-hint">{t('Пока нет комментариев. Ваше мнение может начать разговор.')}</p>}>{(item) => <article class="comment"><span class="avatar">{item.name.charAt(0)}</span><div><div class="comment-heading"><strong>{item.name}</strong><time>{dateTime(item.created_at)}</time></div><Show when={item.apartment}><span class="comment-apartment">{t('Квартира {apartment}', { apartment: item.apartment! })}</span></Show><p>{item.body}</p></div></article>}</For></div></>}</Show></Show></Dialog>
}

function OptionEditor(props: { option: Option | null | undefined; detail: Detail; building: Building; csrf: string | null; cancel: () => void; saved: () => Promise<void> }) {
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const [costNote, setCostNote] = createSignal<string>()
  async function submit(event: SubmitEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const values = new FormData(event.currentTarget as HTMLFormElement)
    try {
      await action('option.save', { buildingId: props.building.id, problemId: props.detail.problem.id, version: props.detail.problem.version, optionId: props.option?.id, title: values.get('title'), description: values.get('description'), priceKopecks: Math.round(Number(values.get('price')) * 100), costNote: values.get('costNote') }, props.csrf)
      await props.saved()
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <form class="inline-editor stack-form" onSubmit={submit}><h3>{props.option ? t('Изменить решение') : t('Новый вариант решения')}</h3><label>{t('Название решения')}<input name="title" value={props.option?.title || ''} minlength="3" maxlength="180" required /></label><label>{t('Сценарий решения')}<textarea name="description" rows="3" value={props.option?.description || ''} maxlength="2000" /></label><label>{t('Стоимость всех работ, ₽')}<input name="price" type="number" min="0" max="10000000" step="0.01" value={(props.option?.price_kopecks || 0) / 100} required /></label><label>{t('Основание сметы')}<input name="costNote" value={costNote() ?? props.option?.cost_note ?? t('Предварительная смета')} onInput={(event) => setCostNote(event.currentTarget.value)} maxlength="300" required /></label><Notice message={t('Изменение варианта или цены сбросит текущие голоса. Жители будут голосовать по новой редакции.')} /><Notice message={error()} /><div class="form-actions"><button type="button" class="button secondary" onClick={props.cancel}>{t('Отмена')}</button><button class="button primary" disabled={busy()}>{busy() ? t('Сохраняем…') : t('Сохранить вариант')}</button></div></form>
}

function StatusEditor(props: { detail: Detail; building: Building; csrf: string | null; saved: () => Promise<void> }) {
  const [next, setNext] = createSignal('open')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  async function submit(event: SubmitEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const values = new FormData(event.currentTarget as HTMLFormElement)
    try {
      await action('problem.status', { buildingId: props.building.id, problemId: props.detail.problem.id, version: props.detail.problem.version, status: next(), deadline: next() === 'open' ? new Date(`${values.get('deadline')}T23:59:59+03:00`).toISOString() : undefined, outcome: values.get('outcome') || undefined }, props.csrf)
      await props.saved()
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <form class="inline-editor stack-form" onSubmit={submit}><label>{t('Следующий этап')}<select value={next()} onChange={(event) => setNext(event.currentTarget.value)}><option value="open">{t('Открыть новый раунд голосования')}</option><option value="closed">{t('Подвести итоги')}</option><option value="resolved">{t('Отметить как решённый')}</option><option value="discussion">{t('Вернуть на обсуждение')}</option></select></label><Show when={next() === 'open'} fallback={<Show when={next() !== 'discussion'}><label>{t('Результат')}<textarea name="outcome" rows="3" placeholder={t('Что решили, кто отвечает и когда ожидаются работы?')} maxlength="2000" required /></label></Show>}><label>{t('Голосуем до (время Казани)')}<input name="deadline" type="date" value={new Date(Date.now() + 604800000).toISOString().slice(0,10)} required /></label><p class="fine-print">{t('Новый раунд сбрасывает прежние голоса. Для открытия нужны как минимум два варианта.')}</p></Show><Notice message={error()} /><button class="button primary" disabled={busy()}>{busy() ? t('Сохраняем…') : t('Обновить этап')}</button></form>
}
