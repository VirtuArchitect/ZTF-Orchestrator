import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyThemeMode, getStoredThemeMode } from './theme.ts'
import { installDemoMode } from './demoMode.ts'

const demoBase = import.meta.env.BASE_URL
if (import.meta.env.VITE_ZTF_DEMO === 'true' && demoBase.endsWith('/demo/')) {
  // Pages serves the demo shell for legacy console bookmarks.
  const legacyBase = demoBase.slice(0, -'demo/'.length)
  const { pathname, search, hash } = window.location
  if (pathname.startsWith(legacyBase) && !pathname.startsWith(demoBase) && pathname !== demoBase.slice(0, -1)) {
    window.history.replaceState(null, '', `${demoBase}${pathname.slice(legacyBase.length)}${search}${hash}`)
  }
}

installDemoMode()
applyThemeMode(getStoredThemeMode())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
