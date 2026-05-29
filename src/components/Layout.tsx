import { useEffect } from 'react'
import { useStore } from '../store'
import Sidebar from './Sidebar'
import Header from './Header'

interface LayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function Layout({ children, title, subtitle, actions }: LayoutProps) {
  const sidebarOpen = useStore(s => s.sidebarOpen)
  const toggleSidebar = useStore(s => s.toggleSidebar)

  useEffect(() => {
    if (window.innerWidth < 768 && useStore.getState().sidebarOpen) {
      toggleSidebar()
    }
  }, [toggleSidebar])

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar />
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={toggleSidebar}
          className="fixed inset-0 z-30 bg-gray-950/70 backdrop-blur-sm md:hidden"
        />
      )}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarOpen ? 'md:ml-64' : 'md:ml-16'}`}>
        <Header title={title} subtitle={subtitle} actions={actions} />
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
