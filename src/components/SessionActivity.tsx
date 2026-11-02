import { useEffect } from 'react'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import { isDemoMode } from '../demoMode'

// Polling, an open tab and page visibility alone are not evidence of activity.
export default function SessionActivity() {
  const token = useStore(s => s.sessionToken)
  useEffect(() => {
    if (!token || isDemoMode()) return
    let pending = false
    let lastSent = 0
    let lastInteractionAt = 0
    let sending = false
    const controller = new AbortController()
    const flush = async () => {
      // Do not replay an old queued interaction when a hidden tab is reopened.
      if (pending && Date.now() - lastInteractionAt > 60_000) pending = false
      if (!pending || sending || document.visibilityState !== 'visible' || Date.now() - lastSent < 30_000) return
      pending = false
      lastSent = Date.now()
      sending = true
      try {
        await apiFetch('/api/auth/activity', { method: 'POST', signal: controller.signal })
      } catch { /* Activity reporting must not interrupt an operator's action. */ }
      finally { sending = false }
    }
    const interaction = (event: Event) => {
      if (!event.isTrusted || document.visibilityState !== 'visible') return
      pending = true
      lastInteractionAt = Date.now()
      void flush()
    }
    window.addEventListener('pointerdown', interaction, { passive: true })
    window.addEventListener('keydown', interaction, { passive: true })
    const timer = window.setInterval(() => { void flush() }, 30_000)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pointerdown', interaction)
      window.removeEventListener('keydown', interaction)
      controller.abort()
    }
  }, [token])
  return null
}
