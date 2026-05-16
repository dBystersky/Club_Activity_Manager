import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Forward API calls to Express during dev and `vite preview`.
// Without `preview.proxy`, `/api/*` hits the static preview server and returns 404.
const apiProxy = {
  '/api': { target: 'http://localhost:3001', changeOrigin: true },
} as const

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { ...apiProxy },
  },
  preview: {
    proxy: { ...apiProxy },
  },
})
