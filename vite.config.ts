import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind all interfaces (0.0.0.0), not just `localhost`. On Node 17+ `localhost`
    // resolves to IPv6 `::1` first, so the default bind is IPv6-loopback only — the
    // GitHub Codespaces port-forward proxy connects over IPv4 127.0.0.1 and gets
    // connection-refused. `host: true` makes the forwarded URL reachable.
    host: true,
    port: 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
