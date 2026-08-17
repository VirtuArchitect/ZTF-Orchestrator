import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const configuredBase = process.env.VITE_ZTF_BASE
  const base = configuredBase || (mode === 'demo' ? '/ZTF-Orchestrator/' : '/')
  const outDir = mode === 'demo' ? 'dist-demo' : 'dist'

  return {
    base,
    build: {
      outDir,
    },
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://localhost:5001',
          changeOrigin: true,
        },
      },
    },
  }
})
