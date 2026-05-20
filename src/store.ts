import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Settings, Execution, SystemCheck } from './types'

interface User {
  username: string
  role: 'admin' | 'operator' | 'viewer'
}

interface AppState {
  // Auth
  sessionToken: string
  user: User | null
  setAuth: (token: string, user: User) => void
  clearAuth: () => void

  // Settings
  settings: Settings
  setSettings: (s: Partial<Settings>) => void

  // System status
  systemChecks: SystemCheck[]
  ztfInstalled: boolean
  setSystemChecks: (checks: SystemCheck[], installed: boolean) => void

  // Executions
  executions: Execution[]
  setExecutions: (e: Execution[]) => void
  addExecution: (e: Execution) => void

  // UI state
  sidebarOpen: boolean
  toggleSidebar: () => void
  activePage: string
  setActivePage: (p: string) => void

  // Running execution
  runningExecution: {
    id: string
    workflow: string
    logs: Array<{ type: string; data: string; ts: number }>
    status: 'running' | 'done' | 'error'
  } | null
  startExecution: (id: string, workflow: string) => void
  appendLog: (type: string, data: string) => void
  finishExecution: (status: 'done' | 'error') => void
  clearRunning: () => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      sessionToken: '',
      user: null,
      setAuth: (token, user) => set({ sessionToken: token, user }),
      clearAuth: () => set({ sessionToken: '', user: null }),

      // Settings
      settings: {
        ztfPath:   '',
        pythonPath: 'python3',
        configDir: '',
        repoUrl:   'https://github.com/nutanixdev/zerotouch-framework.git',
      },
      setSettings: (s) => set(state => ({ settings: { ...state.settings, ...s } })),

      systemChecks: [],
      ztfInstalled: false,
      setSystemChecks: (checks, installed) => set({ systemChecks: checks, ztfInstalled: installed }),

      executions: [],
      setExecutions: (e) => set({ executions: e }),
      addExecution: (e) => set(state => ({ executions: [e, ...state.executions].slice(0, 50) })),

      sidebarOpen: true,
      toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
      activePage: 'dashboard',
      setActivePage: (p) => set({ activePage: p }),

      runningExecution: null,
      startExecution: (id, workflow) => set({
        runningExecution: { id, workflow, logs: [], status: 'running' },
      }),
      appendLog: (type, data) => set(state => ({
        runningExecution: state.runningExecution
          ? { ...state.runningExecution, logs: [...state.runningExecution.logs, { type, data, ts: Date.now() }] }
          : null,
      })),
      finishExecution: (status) => set(state => ({
        runningExecution: state.runningExecution ? { ...state.runningExecution, status } : null,
      })),
      clearRunning: () => set({ runningExecution: null }),
    }),
    {
      name: 'ztf-ui-store',
      partialize: (state) => ({
        sessionToken: state.sessionToken,
        user:         state.user,
        settings:     state.settings,
        sidebarOpen:  state.sidebarOpen,
      }),
    }
  )
)
