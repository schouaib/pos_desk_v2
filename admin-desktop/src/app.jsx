import Router, { route } from 'preact-router'
import { useEffect, useState, lazy, Suspense } from 'preact/compat'
import { isLoggedIn, clearAuth } from './lib/auth'
import { loadConfig, serverUrl } from './lib/config'
import { api } from './lib/api'

const Activation = lazy(() => import('./pages/Activation'))
const ServerSetup = lazy(() => import('./pages/ServerSetup'))
const Login = lazy(() => import('./pages/Login'))
const Setup = lazy(() => import('./pages/Setup'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Plans = lazy(() => import('./pages/Plans'))
const Tenants = lazy(() => import('./pages/Tenants'))
const Admins = lazy(() => import('./pages/Admins'))
const ApiMetrics = lazy(() => import('./pages/ApiMetrics'))
const Storage = lazy(() => import('./pages/Storage'))
const FolderRequests = lazy(() => import('./pages/FolderRequests'))
const Chat = lazy(() => import('./pages/Chat'))

function Spinner() {
  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <span class="loading loading-spinner loading-lg text-primary" />
    </div>
  )
}

function Guard({ component: Component, path, ...props }) {
  useEffect(() => {
    if (!isLoggedIn()) route('/login', true)
  }, [])
  if (!isLoggedIn()) return null
  return <Component path={path} {...props} />
}

function RedirectRoot() {
  useEffect(() => {
    route(isLoggedIn() ? '/dashboard' : '/login', true)
  }, [])
  return null
}

function SessionReplacedScreen() {
  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card bg-base-100 shadow max-w-sm w-full">
        <div class="card-body items-center text-center py-10">
          <h2 class="text-xl font-bold">Session Ended</h2>
          <p class="text-base-content/60 text-sm mt-2">You were signed in from another device. Please log in again.</p>
          <button onClick={() => { window.location.reload() }} class="btn btn-primary btn-sm mt-6">Log in</button>
        </div>
      </div>
    </div>
  )
}

export function App() {
  const [booting, setBooting] = useState(true)
  const [blocked, setBlocked] = useState(false)
  const [activated, setActivated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(true)
  const [sessionReplaced, setSessionReplaced] = useState(false)
  const [needsServerSetup, setNeedsServerSetup] = useState(false)

  // Step 1: Block browser, check activation
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) {
      setBlocked(true)
      setBooting(false)
      return
    }
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('check_activation').then((valid) => {
        setActivated(valid)
        setBooting(false)
      }).catch(() => {
        setActivated(false)
        setBooting(false)
      })
    })
  }, [])

  // Step 2: Session replaced listener
  useEffect(() => {
    function onSessionReplaced() { clearAuth(); setSessionReplaced(true) }
    window.addEventListener('session-replaced', onSessionReplaced)
    return () => window.removeEventListener('session-replaced', onSessionReplaced)
  }, [])

  // Step 3: Load config + check setup (only after activation)
  useEffect(() => {
    if (!activated) return
    loadConfig().then(() => {
      if (!serverUrl.value) {
        setNeedsServerSetup(true)
        setLoading(false)
        setChecking(false)
      } else {
        setLoading(false)
        checkSetup()
      }
    })
  }, [activated])

  function checkSetup() {
    setChecking(true)
    api.setupStatus()
      .then(({ needs_setup }) => {
        if (needs_setup) route('/setup', true)
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }

  function handleConnected() {
    setNeedsServerSetup(false)
    checkSetup()
  }

  function handleActivated() {
    setActivated(true)
  }

  if (booting) return <Spinner />

  if (blocked) return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card bg-base-100 shadow max-w-sm w-full">
        <div class="card-body items-center text-center py-10">
          <div class="w-16 h-16 rounded-full bg-error/20 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 class="text-xl font-bold">Desktop Only</h2>
          <p class="text-base-content/60 text-sm mt-2">This application requires the CiPOSdz Admin desktop app. Browser access is not allowed.</p>
        </div>
      </div>
    </div>
  )

  if (!activated) {
    return (
      <Suspense fallback={<Spinner />}>
        <Activation onActivated={handleActivated} />
      </Suspense>
    )
  }

  if (sessionReplaced) return <SessionReplacedScreen />
  if (loading) return <Spinner />

  if (needsServerSetup) {
    return (
      <Suspense fallback={<Spinner />}>
        <ServerSetup onConnected={handleConnected} />
      </Suspense>
    )
  }

  if (checking) return <Spinner />

  return (
    <Suspense fallback={<Spinner />}>
      <Router>
        <Setup path="/setup" />
        <Login path="/login" />
        <Guard component={Dashboard} path="/dashboard" />
        <Guard component={Plans} path="/plans" />
        <Guard component={Tenants} path="/tenants" />
        <Guard component={Admins} path="/admins" />
        <Guard component={ApiMetrics} path="/metrics" />
        <Guard component={Storage} path="/storage" />
        <Guard component={FolderRequests} path="/folder-requests" />
        <Guard component={Chat} path="/chat" />
        <RedirectRoot path="/" />
      </Router>
    </Suspense>
  )
}
