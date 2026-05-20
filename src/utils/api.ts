import { useStore } from '../store'

function getToken(): string {
  return useStore.getState().sessionToken || ''
}

/**
 * Authenticated fetch wrapper.
 * - Injects Authorization: Bearer <token> on every request.
 * - On 401: clears the session and redirects to /login automatically
 *   so a crashed component is never the user's experience when a
 *   session expires.
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const resp = await fetch(input, { ...init, headers })

  if (resp.status === 401) {
    useStore.getState().clearAuth()
    window.location.href = '/login'
  }

  return resp
}

/** Plain auth headers object for cases that cannot use apiFetch directly. */
export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
