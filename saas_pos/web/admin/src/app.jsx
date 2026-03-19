import Router, { route } from 'preact-router'
import { useEffect, useState, lazy, Suspense } from 'preact/compat'
import { isLoggedIn, clearAuth } from './lib/auth'
import { api } from './lib/api'

function createBasedHistory(base) {
  function strip(p) { return p.startsWith(base) ? p.slice(base.length) || '/' : p }
  return {
    get location() { return { pathname: strip(window.location.pathname), search: window.location.search } },
    listen(cb) {
      const fn = () => cb({ pathname: strip(window.location.pathname), search: window.location.search })
      addEventListener('popstate', fn)
      return () => removeEventListener('popstate', fn)
    },
    push(url) { history.pushState(null, null, base + url) },
    replace(url) { history.replaceState(null, null, base + url) },
  }
}
const basedHistory = createBasedHistory('/admin')

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
          <a href="/admin/login" class="btn btn-primary btn-sm mt-6">Log in</a>
        </div>
      </div>
    </div>
  )
}

export function App() {
  const [checking, setChecking] = useState(true)
  const [sessionReplaced, setSessionReplaced] = useState(false)

  useEffect(() => {
    function onSessionReplaced() { clearAuth(); setSessionReplaced(true) }
    window.addEventListener('session-replaced', onSessionReplaced)
    return () => window.removeEventListener('session-replaced', onSessionReplaced)
  }, [])

  useEffect(() => {
    api.setupStatus()
      .then(({ needs_setup }) => {
        if (needs_setup) route('/setup', true)
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  if (sessionReplaced) return <SessionReplacedScreen />

  if (checking) return <Spinner />

  return (
    <Suspense fallback={<Spinner />}>
      <Router history={basedHistory}>
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
