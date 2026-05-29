import { Menu, LogOut, UserCircle } from 'lucide-react'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

const ROLE_COLOURS: Record<string, string> = {
  admin:    'text-amber-400 bg-amber-400/10 border-amber-400/30',
  operator: 'text-nutanix-cyan bg-nutanix-cyan/10 border-nutanix-cyan/30',
  viewer:   'text-gray-400 bg-gray-400/10 border-gray-400/30',
}

export default function Header({ title, subtitle, actions }: HeaderProps) {
  const { toggleSidebar, user, clearAuth } = useStore()

  const logout = async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }) } catch { /* ok */ }
    clearAuth()
  }

  return (
    <header className="min-h-16 border-b border-border flex items-center px-4 sm:px-6 gap-3 sm:gap-4 bg-gray-950/90 backdrop-blur-sm flex-shrink-0">
      <button onClick={toggleSidebar} className="btn-ghost p-1.5 -ml-1.5" aria-label="Toggle navigation">
        <Menu size={18} />
      </button>

      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-gray-100 truncate">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
      </div>

      {actions && <div className="hidden sm:flex items-center gap-2 flex-shrink-0">{actions}</div>}

      {/* User badge */}
      {user && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1.5">
            <UserCircle size={15} className="text-gray-400" />
            <span className="text-sm text-gray-300">{user.username}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${ROLE_COLOURS[user.role] ?? ROLE_COLOURS.viewer}`}>
              {user.role}
            </span>
          </div>
          <button
            onClick={logout}
            className="btn-ghost p-1.5 text-gray-500 hover:text-red-400"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      )}
    </header>
  )
}
