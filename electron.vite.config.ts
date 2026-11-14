import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: {
      alias: {
        ...shared,
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      // Fonty zawsze jako pliki: CSP okna (font-src z default-src 'self') blokuje data:.
      assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined)
    }
  }
})
