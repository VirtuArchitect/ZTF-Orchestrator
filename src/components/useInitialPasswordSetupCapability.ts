import { useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'

export function useInitialPasswordSetupCapability(enabled: boolean) {
  const [liveEnabled, setLiveEnabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLiveEnabled(false); setLoaded(false)
    void apiFetch('/api/initial-password-setup').then(async response => {
      if (!response.ok) throw new Error()
      const data = await response.json()
      if (!cancelled) { setLiveEnabled(typeof data.liveEnabled === 'boolean' ? data.liveEnabled : data.applyEnabled === true); setLoaded(true) }
    }).catch(() => { if (!cancelled) { setLiveEnabled(false); setLoaded(true) } })
    return () => { cancelled = true }
  }, [enabled])
  return { liveEnabled, loaded }
}
