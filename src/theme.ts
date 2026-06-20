export type ThemeMode = 'system' | 'dark' | 'light'

export const THEME_STORAGE_KEY = 'ztf-theme-mode'

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    stored = null
  }
  return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'system'
}

export function resolveThemeMode(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode
  if (typeof window === 'undefined') return 'dark'
  if (!window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const resolved = resolveThemeMode(mode)
  document.documentElement.classList.toggle('theme-light', resolved === 'light')
  document.documentElement.classList.toggle('theme-dark', resolved === 'dark')
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
}

export function setStoredThemeMode(mode: ThemeMode) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Keep the visual change even when browser storage is unavailable.
  }
  applyThemeMode(mode)
}
