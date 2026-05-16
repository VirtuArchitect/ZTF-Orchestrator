import { Menu } from 'lucide-react'
import { useStore } from '../store'

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function Header({ title, subtitle, actions }: HeaderProps) {
  const toggleSidebar = useStore(s => s.toggleSidebar)

  return (
    <header className="h-16 border-b border-border flex items-center px-6 gap-4 bg-gray-950/80 backdrop-blur-sm flex-shrink-0">
      <button onClick={toggleSidebar} className="btn-ghost p-1.5 -ml-1.5">
        <Menu size={18} />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-gray-100 truncate">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </header>
  )
}
