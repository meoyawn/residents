import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import solid from 'vite-plugin-solid'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  server: { port: 5173 },
  plugins: [
    basicSsl(),
    cloudflare({ configPath: process.env.RESIDENTS_WRANGLER_CONFIG, viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    solid({ ssr: true }),
  ],
})
