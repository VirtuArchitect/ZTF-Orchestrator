import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react'

type LocationState = {
  pathname: string
  search: string
  hash: string
}

type RouterContextValue = {
  location: LocationState
  navigate: (to: string, options?: { replace?: boolean }) => void
}

type ParamsContextValue = Record<string, string>

const RouterContext = createContext<RouterContextValue | null>(null)
const ParamsContext = createContext<ParamsContextValue>({})
const BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL)

function normalizeBasePath(value: string) {
  if (!value || value === '/') return '/'
  return `/${value.replace(/^\/+|\/+$/g, '')}/`
}

function stripBasePath(pathname: string) {
  if (BASE_PATH === '/') return pathname || '/'
  if (pathname === BASE_PATH.slice(0, -1)) return '/'
  if (pathname.startsWith(BASE_PATH)) {
    const stripped = pathname.slice(BASE_PATH.length - 1)
    return stripped || '/'
  }
  return pathname || '/'
}

function withBasePath(appPath: string) {
  if (BASE_PATH === '/') return appPath || '/'
  const normalized = appPath.startsWith('/') ? appPath.slice(1) : appPath
  return `${BASE_PATH}${normalized}`.replace(/\/$/, '') || BASE_PATH
}

function currentLocation(): LocationState {
  return {
    pathname: stripBasePath(window.location.pathname),
    search: window.location.search,
    hash: window.location.hash,
  }
}

function internalTarget(to: string) {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(to) || to.startsWith('//')) return null
  const raw = to.replace(/\\/g, '/')
  const target = new URL(raw.startsWith('/') ? withBasePath(raw) : raw, window.location.href)
  if (target.origin !== window.location.origin) return null
  const pathname = stripBasePath(target.pathname)
  return `${pathname}${target.search}${target.hash}`
}

function browserTarget(appTarget: string) {
  const target = new URL(appTarget, window.location.origin)
  return `${withBasePath(target.pathname)}${target.search}${target.hash}`
}

function useRouter() {
  const context = useContext(RouterContext)
  if (!context) throw new Error('Router hooks must be used inside BrowserRouter')
  return context
}

export function BrowserRouter({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<LocationState>(() => currentLocation())

  useEffect(() => {
    const onPopState = () => setLocation(currentLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const value = useMemo<RouterContextValue>(() => ({
    location,
    navigate(to, options) {
      const next = internalTarget(to)
      if (!next) return
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const nextBrowserTarget = browserTarget(next)
      if (nextBrowserTarget !== current) {
        if (options?.replace) window.history.replaceState(null, '', nextBrowserTarget)
        else window.history.pushState(null, '', nextBrowserTarget)
      }
      setLocation(currentLocation())
    },
  }), [location])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

type RouteProps = {
  path: string
  element: ReactNode
}

export function Route(_props: RouteProps) {
  return null
}

function matchPath(pattern: string, pathname: string): ParamsContextValue | null {
  const pathParts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  const patternParts = pattern.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)

  if (pattern === '*') return {}
  if (pattern === '/' && pathname === '/') return {}
  if (patternParts.length !== pathParts.length) return null

  const params: ParamsContextValue = {}
  for (let i = 0; i < patternParts.length; i += 1) {
    const patternPart = patternParts[i]
    const pathPart = pathParts[i]
    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart)
      continue
    }
    if (patternPart !== pathPart) return null
  }
  return params
}

export function Routes({ children }: { children: ReactNode }) {
  const { location } = useRouter()
  let fallback: ReactElement<RouteProps> | null = null

  for (const child of Children.toArray(children)) {
    if (!isValidElement<RouteProps>(child)) continue
    if (child.props.path === '*') {
      fallback = child
      continue
    }
    const params = matchPath(child.props.path, location.pathname)
    if (params) {
      return (
        <ParamsContext.Provider value={params}>
          {child.props.element}
        </ParamsContext.Provider>
      )
    }
  }

  return fallback ? <>{fallback.props.element}</> : null
}

type NavigateProps = {
  to: string
  replace?: boolean
}

export function Navigate({ to, replace }: NavigateProps) {
  const { navigate } = useRouter()
  useEffect(() => {
    navigate(to, { replace })
  }, [navigate, replace, to])
  return null
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string
}

export function Link({ to, onClick, ...props }: LinkProps) {
  const { navigate } = useRouter()

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      props.target
    ) {
      return
    }

    const target = internalTarget(to)
    if (!target) return

    event.preventDefault()
    navigate(target)
  }

  const target = internalTarget(to)
  return <a href={target ? browserTarget(target) : '#'} onClick={handleClick} {...props} />
}

export function useNavigate() {
  return useRouter().navigate
}

export function useLocation() {
  return useRouter().location
}

export function useParams<T extends ParamsContextValue = ParamsContextValue>() {
  return useContext(ParamsContext) as Partial<T>
}

type SearchParamsInit = Record<string, string> | URLSearchParams | string

export function useSearchParams(): [URLSearchParams, (next: SearchParamsInit) => void] {
  const { location, navigate } = useRouter()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])

  function setSearchParams(next: SearchParamsInit) {
    const nextParams = next instanceof URLSearchParams
      ? next
      : typeof next === 'string'
        ? new URLSearchParams(next)
        : new URLSearchParams(next)
    const query = nextParams.toString()
    navigate(`${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
  }

  return [params, setSearchParams]
}
