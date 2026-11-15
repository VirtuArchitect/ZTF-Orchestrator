import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const configuredBase = process.env.VITE_ZTF_BASE
  const base = configuredBase || (mode === 'demo' ? '/ZTF-Orchestrator/demo/' : '/')
  const outDir = mode === 'demo' ? 'dist-demo' : 'dist'

  return {
    base,
    build: {
      outDir,
    },
    plugins: [
      react(),
      {
        name: 'demo-social-preview',
        apply: 'build',
        transformIndexHtml() {
          if (mode !== 'demo') return
          const site = 'https://virtuarchitect.github.io/ZTF-Orchestrator/'
          const properties = {
            'og:type': 'website',
            'og:url': site + 'demo/',
            'og:title': 'ZTF-Orchestrator interactive demo',
            'og:description': 'Explore guided Nutanix deployment workflows with simulated data.',
            'og:image': site + 'linkedin-demo-landscape.png',
            'og:image:type': 'image/png',
            'og:image:width': '1200',
            'og:image:height': '627',
            'og:image:alt': 'Still stitching Nutanix deployment workflows together? Explore the ZTF-Orchestrator demo.',
          }
          return Object.entries(properties).map(([property, content]) => ({
            tag: 'meta',
            attrs: { property, content },
            injectTo: 'head' as const,
          }))
        },
      },
    ],
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
