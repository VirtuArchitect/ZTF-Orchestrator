/** Poll GET-style observations only. Never use for submission or mutations. */
export function httpFailure(response: Response, message: string) {
  const header = response.headers.get('Retry-After')
  const seconds = header ? Number(header) : NaN
  const delay = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : 0
  return Object.assign(new Error(message), { retryAfterMs: Number.isFinite(delay) ? Math.min(300_000, Math.max(0, delay)) : 0 })
}

export function pollReadOnly<T>(read: (signal: AbortSignal) => Promise<T>, apply: (value: T) => void, fail: (message: string) => void, interval = 30_000) {
  let active = true, inFlight = false, failures = 0
  let timer: ReturnType<typeof setTimeout>
  const controller = new AbortController()
  const load = async () => {
    if (!active || inFlight) return
    if (document.hidden) { timer = setTimeout(load, interval); return }
    inFlight = true
    let delay = interval
    try {
      const value = await read(controller.signal)
      if (active) { apply(value); failures = 0 }
    } catch (error) {
      if (active) {
        fail(error instanceof Error ? error.message : 'Readback unavailable; displayed records may be stale.')
        failures++
        const retry = (error as { retryAfterMs?: number })?.retryAfterMs || 0
        delay = Math.min(300_000, Math.max(interval * 2 ** Math.min(failures, 5), retry))
      }
    } finally {
      inFlight = false
      if (active) timer = setTimeout(load, delay)
    }
  }
  const visible = () => { if (!document.hidden && !inFlight) { clearTimeout(timer); void load() } }
  document.addEventListener('visibilitychange', visible)
  void load()
  return () => { active = false; clearTimeout(timer); controller.abort(); document.removeEventListener('visibilitychange', visible) }
}
