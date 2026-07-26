import { useEffect, useState } from 'react'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { LibraryPage } from './pages/LibraryPage'
import { LogPage } from './pages/LogPage'
import { ModelPage } from './pages/ModelPage'
import { SetupPage } from './pages/SetupPage'
import { StoragePage } from './pages/StoragePage'
import { Link } from './router'

function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/'
}

function AppShell() {
  const [revision, setRevision] = useState(0)
  const [path, setPath] = useState(currentPath)
  const refresh = () => setRevision((value) => value + 1)
  useEffect(() => {
    const update = () => setPath(currentPath())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const modelMatch = path.match(/^\/model\/([^/]+)$/)
  const logMatch = path.match(/^\/log\/([^/]+)$/)
  const setupMatch = path.match(/^\/setup\/([^/]+)$/)
  let page = <LibraryPage revision={revision} refresh={refresh} />
  if (path === '/storage') page = <StoragePage refresh={refresh} />
  else if (modelMatch) page = <ModelPage modelId={decodeURIComponent(modelMatch[1])} revision={revision} refresh={refresh} />
  else if (logMatch) page = <LogPage logId={decodeURIComponent(logMatch[1])} revision={revision} refresh={refresh} />
  else if (setupMatch) page = <SetupPage modelId={decodeURIComponent(setupMatch[1])} refresh={refresh} />
  return <div className="app"><header className="site-header"><Link className="brand" to="/"><span className="brand-mark">✦</span><span>FLIGHT<em>TRACE</em></span></Link><nav><Link to="/">Library</Link><Link to="/storage">Storage</Link></nav></header>{page}<footer><span>FlightTrace public beta · © 2026 FlightTrace contributors · <a href="https://github.com/tstuli/FlightTrace/blob/main/LICENSE" target="_blank" rel="noreferrer">GNU GPLv3</a></span><span>Telemetry analysis is advisory. Always follow equipment guidance. Provided “as is,” without warranties.</span></footer></div>
}

export default function App() { return <AppErrorBoundary><AppShell /></AppErrorBoundary> }
