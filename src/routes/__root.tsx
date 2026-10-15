import { getLocale, initializeLanguage, isLocale, languageStorageKey, localizeError, setLocale, t } from '../lib/i18n.ts'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
import { createEffect, onCleanup, onMount, type JSX } from 'solid-js'
import appCss from '../styles.css?url'
import { LanguageSwitcher } from '../components/ui.tsx'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: t('Соседи — решаем вместе') },
      { name: 'description', content: t('Проблемы дома, прозрачные сметы и решения, принятые вместе с соседями.') },
    ],
    links: [{ rel: 'stylesheet', href: appCss }, { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
  }),
  shellComponent: RootDocument,
  component: Outlet,
  errorComponent: (props) => <main class="fatal"><LanguageSwitcher /><h1>{t('Не удалось загрузить дом')}</h1><p>{localizeError(props.error)}</p><button onClick={() => props.reset()}>{t('Попробовать снова')}</button></main>,
  notFoundComponent: () => <main class="fatal"><LanguageSwitcher /><h1>{t('Страница не найдена')}</h1><a href="/">{t('Вернуться к дому')}</a></main>,
})

function RootDocument(props: { children: JSX.Element }) {
  onMount(() => {
    initializeLanguage()
    addEventListener('storage', storageChanged)
    createEffect(() => {
      document.documentElement.lang = getLocale()
      document.title = t('Соседи — решаем вместе')
      document.querySelector('meta[name="description"]')?.setAttribute('content', t('Проблемы дома, прозрачные сметы и решения, принятые вместе с соседями.'))
    })
  })
  onCleanup(() => removeEventListener('storage', storageChanged))
  function storageChanged(event: StorageEvent) {
    if (event.key === languageStorageKey && isLocale(event.newValue)) setLocale(event.newValue)
  }
  return <html lang="ru"><head><HydrationScript /><HeadContent /></head><body>{props.children}<Scripts /></body></html>
}
