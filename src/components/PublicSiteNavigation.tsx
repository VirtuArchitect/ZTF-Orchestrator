import navigation from '../public-site-navigation.json'
import '../public-site-navigation.css'

/** The static site is the parent of the published demo, including deep routes. */
export default function PublicSiteNavigation() {
  const root = new URL('../', new URL(import.meta.env.BASE_URL, window.location.origin)).pathname
  return (
    <header className="ztf-site-header" aria-label="Public website" data-public-navigation>
      <div className="ztf-site-header-inner">
        <a className="brand ztf-site-brand" href={root} aria-label="ZTF-Orchestrator home">
          <img src={`${root}zto-logo-mark.svg`} width="34" height="34" alt="" />
          ZTF-Orchestrator
        </a>
        <nav aria-label="Main navigation">
          {navigation.map(item => (
            <a key={item.id} href={item.path.startsWith('https://') ? item.path : root + item.path}
              className={item.id === 'home' ? 'ztf-site-home' : undefined}
              aria-current={item.id === 'demo' ? 'page' : undefined}>
              {item.label}{item.id === 'github' && <span aria-hidden="true">↗</span>}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}
