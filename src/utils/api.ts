import { useStore } from '../store'

function getApiKey(): string {
  return useStore.getState().settings.apiKey || ''
}

export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('X-API-Key', getApiKey())
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(input, { ...init, headers })
}

export function apiHeaders(): Record<string, string> {
  return { 'X-API-Key': getApiKey() }
}
