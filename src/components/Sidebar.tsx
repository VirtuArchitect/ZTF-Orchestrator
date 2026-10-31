import { Link, useLocation } from '../router'
import { useEffect, useRef, useState } from 'react'
import type { ElementType } from 'react'
import {
  LayoutDashboard, Download, Settings, Workflow, Terminal,
  History, FileCode, Wrench, ChevronRight, Users, GitBranch, ScrollText,
  FileSearch, Clock, Layers, ShieldCheck, ListChecks, Boxes, FileArchive, Archive, ShieldAlert, Wand2, Blocks, Compass, RotateCcw, Building2
} from 'lucide-react'
import { useStore } from '../store'
import { APP_VERSION } from '../version'
import BrandLogo from './BrandLogo'
import clsx from 'clsx'

type Role = 'admin' | 'operator' | 'viewer'
type NavItem = { path: string; icon: ElementType; label: string; roles: Role[]; badge?: string }
type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean }

const ALL_ROLES: Role[] = ['admin', 'operator', 'viewer']
const OPERATORS: Role[] = ['admin', 'operator']
const ADMINS: Role[] = ['admin']
const NAV_SCROLL_KEY = 'ztf-sidebar-scroll-top'

const NAV_GROUPS: NavGroup[] = [
  { label: 'Workspace', items: [
    { path: '/start', icon: Compass, label: 'Start Here', roles: ALL_ROLES },
    { path: '/overview', icon: LayoutDashboard, label: 'Overview', roles: ALL_ROLES },
    { path: '/clusters', icon: Building2, label: 'Clusters', roles: ALL_ROLES },
  ] },
  { label: 'Operations', items: [
    { path: '/start/deploy', icon: Download, label: 'Deploy', roles: ALL_ROLES },
    { path: '/start/configure', icon: Settings, label: 'Configure', roles: ALL_ROLES },
    { path: '/recovery', icon: RotateCcw, label: 'Disaster Recovery', roles: ALL_ROLES },
    { path: '/start/monitor', icon: FileSearch, label: 'Monitor & Verify', roles: ALL_ROLES },
  ] },
  { label: 'Automation', items: [
    { path: '/pipelines', icon: GitBranch, label: 'Pipelines', roles: ALL_ROLES },
    { path: '/jobs', icon: ListChecks, label: 'Jobs / Queue', roles: ALL_ROLES },
    { path: '/approvals', icon: ShieldCheck, label: 'Approvals', roles: ALL_ROLES },
  ] },
  { label: 'Advanced Automation', collapsible: true, items: [
    { path: '/workflows', icon: Workflow, label: 'Workflows', roles: OPERATORS },
    { path: '/scripts', icon: Terminal, label: 'Scripts', roles: OPERATORS },
    { path: '/yaml-studio', icon: Wand2, label: 'YAML Studio', roles: ALL_ROLES },
    { path: '/configs', icon: FileCode, label: 'Config Files', roles: ALL_ROLES },
    { path: '/executions', icon: History, label: 'Executions', roles: ALL_ROLES },
    { path: '/schedules', icon: Clock, label: 'Schedules', roles: ALL_ROLES },
    { path: '/parallel', icon: Layers, label: 'Parallel Exec', roles: ALL_ROLES },
    { path: '/recovery/runs', icon: History, label: 'Recovery Runs', roles: ALL_ROLES },
    { path: '/recovery/rehearsals', icon: RotateCcw, label: 'Rehearsals', roles: ALL_ROLES },
    { path: '/drift', icon: FileSearch, label: 'Drift Detection', roles: ALL_ROLES },
    { path: '/upgrade-advisor', icon: ShieldAlert, label: 'Upgrade Advisor', roles: ALL_ROLES },
    { path: '/validation-evidence', icon: FileArchive, label: 'Validation Evidence', roles: ALL_ROLES },
  ] },
  { label: 'Optional Integrations', collapsible: true, items: [
    { path: '/nkp', icon: Boxes, label: 'NKP Framework', roles: ALL_ROLES, badge: 'Preview' },
    { path: '/workflows-2x', icon: Blocks, label: 'Workflows 2.x', roles: OPERATORS, badge: 'Preview' },
    { path: '/scripts-2x', icon: Blocks, label: 'Scripts 2.x', roles: OPERATORS, badge: 'Preview' },
    { path: '/ztf2-iac', icon: Blocks, label: 'ZTF 2.x IaC', roles: OPERATORS, badge: 'Preview' },
  ] },
  { label: 'Administration', collapsible: true, items: [
    { path: '/setup', icon: Download, label: 'Setup & Install', roles: OPERATORS },
    { path: '/global-config', icon: Settings, label: 'Global Config', roles: ALL_ROLES },
    { path: '/appliance', icon: Archive, label: 'Appliance Ops', roles: ALL_ROLES },
    { path: '/users', icon: Users, label: 'Users', roles: ADMINS },
    { path: '/audit-log', icon: ScrollText, label: 'Audit Log', roles: ADMINS },
    { path: '/settings', icon: Wrench, label: 'Settings', roles: OPERATORS },
  ] },
]

export default function Sidebar() {
  const navRef = useRef<HTMLElement | null>(null)
  const {
    sidebarOpen,
    sidebarPreferenceInitialized,
    ztfInstalled,
    toggleSidebar,
    setSidebarOpen,
    markSidebarPreferenceInitialized,
    user,
  } = useStore()
  const location = useLocation()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const group = NAV_GROUPS.find(g => g.collapsible && g.items.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/')))
    if (group) setExpanded(current => ({ ...current, [group.label]: true }))
  }, [location.pathname])
  const role = user?.role
  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => role && item.roles.includes(role)),
  })).filter(group => group.items.length > 0)

  useEffect(() => {
    if (!sidebarPreferenceInitialized) {
      setSidebarOpen(true)
      markSidebarPreferenceInitialized()
    }
  }, [markSidebarPreferenceInitialized, setSidebarOpen, sidebarPreferenceInitialized])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const saved = window.sessionStorage.getItem(NAV_SCROLL_KEY)
    if (!saved) return
    window.requestAnimationFrame(() => {
      nav.scrollTop = Number(saved) || 0
    })
  }, [role, sidebarOpen])

  return (
    <aside className={clsx(
      'fixed top-0 left-0 h-full bg-gray-950 border-r border-border flex flex-col transition-all duration-300 z-40 shadow-2xl shadow-black/20 md:shadow-none',
      sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-16'
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border flex-shrink-0">
        <Link
          to="/"
          aria-label="My landing page"
          title="My landing page"
          onClick={() => {
            window.sessionStorage.setItem(NAV_SCROLL_KEY, '0')
            if (navRef.current) navRef.current.scrollTop = 0
            if (window.innerWidth < 768 && sidebarOpen) toggleSidebar()
          }}
          className={clsx(
            'inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutanix-blue',
            sidebarOpen ? 'h-12 w-52' : 'h-10 w-10 justify-center'
          )}
        >
          {sidebarOpen ? (
            <BrandLogo className="h-12 w-52" />
          ) : (
            <BrandLogo variant="mark" className="w-8 h-8 flex-shrink-0" />
          )}
        </Link>
      </div>

      {/* Status indicator */}
      {sidebarOpen && (
        <div className="mx-3 mt-3 mb-1 px-3 py-2 rounded-lg bg-surface border border-border">
          <div className="flex items-center gap-2">
            <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', ztfInstalled ? 'bg-nutanix-teal' : 'bg-yellow-500')} />
            <span className="text-xs text-gray-400 truncate">
              {ztfInstalled ? 'Framework installed' : 'Framework not found'}
            </span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav
        ref={navRef}
        onScroll={event => {
          window.sessionStorage.setItem(NAV_SCROLL_KEY, String(event.currentTarget.scrollTop))
        }}
        className="flex-1 py-3 overflow-y-auto"
      >
        <div className="space-y-4 px-2">
          {visibleGroups.map(group => (
            <div key={group.label}>
              {group.collapsible ? <button type="button" aria-expanded={Boolean(expanded[group.label])} aria-controls={`nav-${group.label.replace(/ /g, '-').toLowerCase()}`} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-gray-400 hover:bg-surface" title={!sidebarOpen ? group.label : undefined} onClick={() => { if (!sidebarOpen) setSidebarOpen(true); setExpanded(current => ({ ...current, [group.label]: !current[group.label] })) }}><span>{sidebarOpen ? group.label : group.label === 'Advanced Automation' ? <Terminal size={18} /> : group.label === 'Optional Integrations' ? <Boxes size={18} /> : <Settings size={18} />}</span>{sidebarOpen && <ChevronRight size={14} className={expanded[group.label] ? 'rotate-90' : ''} />}</button> : sidebarOpen ? (
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  {group.label}
                </div>
              ) : (
                <div className="mx-3 mb-1 border-t border-border/70" />
              )}
              <div id={`nav-${group.label.replace(/ /g, '-').toLowerCase()}`} className="space-y-0.5" hidden={group.collapsible && !expanded[group.label]}>
                {group.items.map(item => {
                  const active = location.pathname === item.path ||
                    (!['/', '/recovery', '/start'].includes(item.path) && location.pathname.startsWith(`${item.path}/`))
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => {
                        if (window.innerWidth < 768 && sidebarOpen) toggleSidebar()
                      }}
                      className={clsx(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm group',
                        active
                          ? 'bg-nutanix-blue text-white'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-surface'
                      )}
                      title={!sidebarOpen ? `${item.label}${item.badge ? ` (${item.badge})` : ''}` : undefined}
                    >
                      <item.icon size={18} className="flex-shrink-0" />
                      {sidebarOpen && (
                        <>
                          <span className="flex-1 truncate font-medium">{item.label}</span>
                          {item.badge && (
                            <span className={clsx(
                              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                              active
                                ? 'bg-white/15 text-white'
                                : 'border border-blue-200 bg-blue-50 text-blue-700'
                            )}>
                              {item.badge}
                            </span>
                          )}
                          {active && <ChevronRight size={14} className="flex-shrink-0 opacity-60" />}
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Navigation mode */}
      <div className={clsx('border-t border-border p-3', sidebarOpen ? 'space-y-3' : 'flex justify-center')}>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Use compact navigation' : 'Use labeled navigation'}
          title={sidebarOpen ? 'Use compact navigation' : 'Use labeled navigation'}
          className={clsx(
            'flex items-center rounded-lg border border-border bg-surface text-gray-400 transition-colors hover:text-gray-200 hover:border-border-light',
            sidebarOpen ? 'w-full justify-between px-3 py-2 text-xs' : 'h-10 w-10 justify-center'
          )}
        >
          {sidebarOpen && <span>Navigation labels</span>}
          <ChevronRight size={16} className={clsx('transition-transform', sidebarOpen ? 'rotate-180' : '')} />
        </button>
        {sidebarOpen && (
          <div>
            <p className="text-xs text-gray-600">ZeroTouch Orchestrator v{APP_VERSION}</p>
          </div>
        )}
      </div>
    </aside>
  )
}
