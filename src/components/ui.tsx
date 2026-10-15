import { t, localizeMessage, getLocale, setLocale, isLocale } from '../lib/i18n.ts'
import { onCleanup, onMount, Show, type JSX } from 'solid-js'
import { Dynamic, Portal } from 'solid-js/web'
import { ArrowDownToLine, ArrowLeft, ArrowRight, Bell, Building2, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3, DoorOpen, Ellipsis, FileText, Home, Leaf, LogOut, MessageCircle, Plus, Search, Settings2, ShieldCheck, Sparkles, Users, Vote, Wallet, X } from 'lucide-solid'

const icons = { arrow: ArrowRight, back: ArrowLeft, bell: Bell, building: Building2, check: Check, checks: CheckCheck, chevron: ChevronRight, down: ChevronDown, help: CircleHelp, list: ClipboardList, clock: Clock3, gate: DoorOpen, more: Ellipsis, file: FileText, home: Home, leaf: Leaf, logout: LogOut, comment: MessageCircle, plus: Plus, search: Search, settings: Settings2, shield: ShieldCheck, sparkles: Sparkles, users: Users, vote: Vote, wallet: Wallet, close: X, import: ArrowDownToLine }
export type IconName = keyof typeof icons

export function Icon(props: { name: IconName; size?: number; class?: string }) {
  return <Dynamic component={icons[props.name]} size={props.size || 20} stroke-width={1.7} aria-hidden="true" class={props.class} />
}

export function Logo() {
  return <span class="brand"><span class="brand-icon"><Icon name="building" size={25} /></span><span>{t('соседи')}<span class="brand-dot">.</span></span></span>
}

export function LanguageSwitcher() {
  return <select class="language-switcher" aria-label={t('Язык интерфейса')} value={getLocale()} onChange={(event) => {
    const language = event.currentTarget.value
    if (isLocale(language)) setLocale(language)
  }}><option value="ru" lang="ru">Русский</option><option value="tt" lang="tt">Татарча</option></select>
}

export function Dialog(props: { title: string; eyebrow?: string; children: JSX.Element; close: () => void; wide?: boolean; sheet?: boolean }) {
  let dialog: HTMLDivElement | undefined
  let previous: HTMLElement | null = null
  onMount(() => {
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    dialog?.focus()
  })
  onCleanup(() => { document.body.style.overflow = ''; previous?.focus() })
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') props.close()
    if (event.key !== 'Tab' || !dialog) return
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter((element) => element.getClientRects().length)
    if (!focusable.length) { event.preventDefault(); return }
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus() }
    else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus() }
  }
  return <Portal><div class="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) props.close() }}><div ref={dialog} role="dialog" aria-modal="true" aria-label={props.title} tabindex="-1" onKeyDown={keydown} classList={{ modal: true, 'modal-wide': props.wide, 'detail-sheet': props.sheet }}><div class="modal-heading"><div><Show when={props.eyebrow}><div class="eyebrow">{props.eyebrow}</div></Show><h2>{props.title}</h2></div><div class="modal-heading-actions"><LanguageSwitcher /><button class="icon-button" aria-label={t('Закрыть')} onClick={props.close}><Icon name="close" /></button></div></div>{props.children}</div></div></Portal>
}

export function Notice(props: { message: string; kind?: 'error' | 'success' }) {
  return <Show when={props.message}><div role={props.kind === 'success' ? 'status' : 'alert'} classList={{ notice: true, 'notice-success': props.kind === 'success' }}><Icon name={props.kind === 'success' ? 'check' : 'help'} size={18} /><span>{localizeMessage(props.message)}</span></div></Show>
}

export function Empty(props: { title: string; text: string; children?: JSX.Element; icon?: IconName }) {
  return <div class="empty"><span class="empty-icon"><Icon name={props.icon || 'leaf'} size={28} /></span><h3>{props.title}</h3><p>{props.text}</p>{props.children}</div>
}

export function NeighborhoodArt() {
  return <svg class="neighborhood-art" viewBox="0 0 480 260" fill="none" role="img" aria-label={t('Зелёный двор и соседние дома')}><circle cx="320" cy="117" r="105" fill="#DFE9D7"/><circle cx="420" cy="50" r="22" fill="#ECD89F"/><path d="M4 241C101 203 147 220 225 213C320 204 399 197 480 232V260H4V241Z" fill="#CBDABD"/><path d="M88 239V94L170 62L250 94V239" fill="#E8E3D1"/><path d="M170 62V239H250V94L170 62Z" fill="#D5D2BD"/><path d="M98 95L170 67L239 95" stroke="#B6BBA6" stroke-width="3"/><path d="M280 230V56L339 33L397 56V230" fill="#F6F0DF"/><path d="M339 33V230H397V56L339 33Z" fill="#E7DDC5"/><path d="M279 57L339 33L398 57" stroke="#CDC3AA" stroke-width="3"/><g fill="#778E75"><path d="M110 113H125V134H110zM145 101H160V122H145zM110 152H125V173H110zM145 141H160V162H145zM110 191H125V212H110zM145 181H160V202H145zM187 102H203V123H187zM222 113H237V134H222zM187 141H203V162H187zM222 152H237V173H222zM187 181H203V202H187zM222 191H237V212H222zM296 77H309V97H296zM320 69H331V89H320zM296 114H309V134H296zM320 106H331V126H320zM296 151H309V171H296zM320 143H331V163H320zM296 188H309V208H296zM320 180H331V200H320zM352 68H365V88H352zM378 77H390V97H378zM352 106H365V126H352zM378 114H390V134H378zM352 143H365V163H352zM378 151H390V171H378zM352 181H365V201H352zM378 188H390V208H378z"/></g><path d="M34 249V167M432 244V146" stroke="#688165" stroke-width="5"/><ellipse cx="34" cy="157" rx="30" ry="48" fill="#9AB18B"/><ellipse cx="432" cy="132" rx="35" ry="52" fill="#829F78"/><ellipse cx="43" cy="153" rx="22" ry="34" fill="#A9BF99"/><path d="M208 260C225 233 261 221 321 227" stroke="#F8F2E3" stroke-width="18"/><path d="M264 236V204M239 236V204M237 203H268M239 216H266" stroke="#668266" stroke-width="3" stroke-linecap="round"/><path d="M62 225H81V235H62z" fill="#E3C7A0"/><circle cx="71" cy="214" r="7" fill="#D5AF8A"/><path d="M66 221L62 240M75 221L82 238" stroke="#476B56" stroke-width="6" stroke-linecap="round"/><path d="M64 241L63 250M80 239L84 248" stroke="#5D6653" stroke-width="4" stroke-linecap="round"/><path d="M409 241V224" stroke="#63825E" stroke-width="3"/><path d="M409 230C388 224 391 213 409 222M410 235C426 232 427 223 410 227" fill="#63825E"/></svg>
}
