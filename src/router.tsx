import { createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen.ts'

export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true, defaultPendingMinMs: 0 })
}
