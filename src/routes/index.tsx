import { t } from '../lib/i18n.ts'
import { createFileRoute } from '@tanstack/solid-router'
import { App } from '../components/app.tsx'
import { loadBootstrap } from '../server/bootstrap-fn.ts'

export const Route = createFileRoute('/')({
  ssr: 'data-only',
  validateSearch: (search: Record<string, unknown>) => ({ oauth: typeof search.oauth === 'string' ? search.oauth : undefined }),
  loader: () => loadBootstrap(),
  pendingComponent: () => <div class="app-loading"><span class="loading-logo">{t('соседи.')}</span><p>{t('Открываем пространство вашего дома…')}</p></div>,
  component: HomePage,
})

function HomePage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  return <App initial={data()} oauth={search().oauth} />
}
