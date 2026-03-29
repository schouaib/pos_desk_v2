import Router, { route } from 'preact-router'
import { useEffect, useState, lazy, Suspense, memo } from 'preact/compat'
import { isLoggedIn, clearAuth, hasPerm, isTenantAdmin, hasFeature, batchAlerts } from './lib/auth'
import { api, setActivationHeaders } from './lib/api'
import { useI18n } from './lib/i18n'
import { loadConfig, appMode, getServerUrl, resetConfig } from './lib/config'
import { useHotkeys } from './lib/hotkeys'
import { ToastContainer } from './components/Toast'
import { ShortcutsOverlay, shortcutsOpen } from './components/ShortcutsOverlay'
import AdminPanel, { adminPanelOpen, initSaHeaders } from './admin/AdminPanel'

const Setup = lazy(() => import('./pages/Setup'))
const ModeSelect = lazy(() => import('./pages/ModeSelect'))
const Login = lazy(() => import('./pages/Login'))
// const Signup = lazy(() => import('./pages/Signup')) // removed — local desktop mode
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Users = lazy(() => import('./pages/Users'))
const Products = lazy(() => import('./pages/Products'))
const Favorites = lazy(() => import('./pages/Favorites'))
const Categories = lazy(() => import('./pages/Categories'))
const Brands = lazy(() => import('./pages/Brands'))
const Units = lazy(() => import('./pages/Units'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const Purchases = lazy(() => import('./pages/Purchases'))
const Losses = lazy(() => import('./pages/Losses'))
const Pos = lazy(() => import('./pages/Pos'))
const SalesHistory = lazy(() => import('./pages/Sales'))
const SalesStats = lazy(() => import('./pages/SalesStats'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Retraits = lazy(() => import('./pages/Retraits'))
const UserSummary = lazy(() => import('./pages/UserSummary'))
const Settings = lazy(() => import('./pages/Settings'))
const Clients = lazy(() => import('./pages/Clients'))
const Folders = lazy(() => import('./pages/Folders'))
const Chat = lazy(() => import('./pages/Chat'))
const SaleReturns = lazy(() => import('./pages/SaleReturns'))
const ArchivedProducts = lazy(() => import('./pages/ArchivedProducts'))
const LowStock = lazy(() => import('./pages/LowStock'))
const Transfers = lazy(() => import('./pages/Transfers'))
const ExpiringBatches = lazy(() => import('./pages/ExpiringBatches'))
const TermsConditions = lazy(() => import('./pages/TermsConditions'))
const Declarations = lazy(() => import('./pages/Declarations'))
const Facturation = lazy(() => import('./pages/Facturation'))

const Spinner = memo(() => (
  <div class="min-h-screen flex items-center justify-center bg-base-200">
    <span class="loading loading-spinner loading-lg text-primary" />
  </div>
))

function PlanExpiredScreen() {
  const { t } = useI18n()
  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card bg-base-100 shadow max-w-sm w-full">
        <div class="card-body items-center text-center py-10">
          <div class="w-16 h-16 rounded-full bg-error/20 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 class="text-xl font-bold text-error">{t('planExpiredTitle')}</h2>
          <p class="text-base-content/80 text-sm mt-2">{t('planExpiredDesc')}</p>
          <button class="btn btn-outline btn-sm mt-6" onClick={() => { clearAuth(); window.location.reload() }}>{t('logout')}</button>
        </div>
      </div>
    </div>
  )
}

function ServerUnreachable() {
  const { t } = useI18n()
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    setRetrying(true)
    try {
      await fetch(`${getServerUrl()}/healthz`, { signal: AbortSignal.timeout(3000) })
      window.location.reload()
    } catch {}
    setRetrying(false)
  }

  async function changeMode() {
    // Stop server if in server mode
    if (appMode.value === 'server' && window.__TAURI_INTERNALS__) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('stop_server').catch(() => {})
    }
    await resetConfig()
    window.location.reload()
  }

  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card bg-base-100 shadow max-w-sm w-full">
        <div class="card-body items-center text-center py-10">
          <div class="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 class="text-lg font-bold">{t('serverUnreachableTitle') || 'Server Unreachable'}</h2>
          <p class="text-base-content/80 text-sm mt-1">{getServerUrl()}</p>
          <div class="flex gap-2 mt-4">
            <button class={`btn btn-primary btn-sm ${retrying ? 'loading' : ''}`} onClick={retry}>
              {t('retry') || 'Retry'}
            </button>
            <button class="btn btn-ghost btn-sm" onClick={changeMode}>
              {t('changeMode') || 'Change Mode'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SessionReplacedScreen() {
  const { t } = useI18n()
  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card bg-base-100 shadow max-w-sm w-full">
        <div class="card-body items-center text-center py-10">
          <h2 class="text-xl font-bold">{t('sessionReplacedTitle')}</h2>
          <p class="text-base-content/80 text-sm mt-2">{t('sessionReplacedDesc')}</p>
          <a href="/login" class="btn btn-primary btn-sm mt-6">{t('login')}</a>
        </div>
      </div>
    </div>
  )
}

function Guard({ component: Component, path, perm, feat, adminOnly, ...props }) {
  useEffect(() => {
    if (!isLoggedIn()) { route('/login', true); return }
    if (adminOnly && !isTenantAdmin()) { route('/pos', true); return }
    if (feat && !hasFeature(feat)) { route('/dashboard', true); return }
    if (perm && !hasPerm(perm[0], perm[1])) { route('/dashboard', true); return }
  }, [])
  if (!isLoggedIn()) return null
  if (adminOnly && !isTenantAdmin()) return null
  if (feat && !hasFeature(feat)) return null
  if (perm && !hasPerm(perm[0], perm[1])) return null
  return <Component path={path} {...props} />
}

function RedirectRoot() {
  useEffect(() => {
    if (!isLoggedIn()) { route('/login', true); return }
    route(isTenantAdmin() ? '/dashboard' : '/pos', true)
  }, [])
  return null
}

export function App() {
  const { t } = useI18n()
  const [state, setState] = useState('loading') // 'loading' | 'activation' | 'modeSelect' | 'needsSetup' | 'starting' | 'ready' | 'unreachable'
  const [planExpired, setPlanExpired] = useState(false)
  const [sessionReplaced, setSessionReplaced] = useState(false)

  useEffect(() => {
    async function init() {
      // Block browser access — Tauri only
      if (!window.__TAURI_INTERNALS__) {
        setState('blocked')
        return
      }

      // Step 1: Check activation
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const activated = await invoke('check_activation')
        if (!activated) {
          setState('activation')
          return
        }
        // Load activation headers for server-side verification
        const machineId = await invoke('get_machine_id')
        const keyData = await invoke('get_stored_activation_key').catch(() => '')
        if (!machineId || !keyData) {
          setState('activation')
          return
        }
        setActivationHeaders(machineId, keyData)
        initSaHeaders(machineId, keyData)
      } catch {
        setState('activation')
        return
      }

      // Step 2: Load config and check mode
      await loadConfig()
      if (!appMode.value) {
        setState('modeSelect')
        return
      }
      // Mode already chosen — verify server is reachable
      try {
        await fetch(`${getServerUrl()}/healthz`, { signal: AbortSignal.timeout(5000) })
        // Check if first-time setup is needed (server mode, no super-admin yet)
        if (appMode.value === 'server') {
          try {
            const res = await fetch(`${getServerUrl()}/api/super-admin/setup-status`, { signal: AbortSignal.timeout(5000) })
            const json = await res.json()
            if (json.data?.needs_setup) {
              setState('needsSetup')
              return
            }
          } catch {}
        }
        setState('ready')
      } catch {
        // In server mode, try starting the server
        if (appMode.value === 'server' && window.__TAURI_INTERNALS__) {
          try {
            const { invoke } = await import('@tauri-apps/api/core')
            await invoke('start_server')
            setState('starting')
            return
          } catch {}
        }
        setState('unreachable')
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (state !== 'starting') return
    let cancelled = false
    async function poll() {
      for (let i = 0; i < 30; i++) {
        if (cancelled) return
        try {
          await fetch(`${getServerUrl()}/healthz`, { signal: AbortSignal.timeout(800) })
          if (!cancelled) setState('ready')
          return
        } catch { await new Promise(r => setTimeout(r, 300)) }
      }
      if (!cancelled) setState('unreachable')
    }
    poll()
    return () => { cancelled = true }
  }, [state])

  useEffect(() => {
    if (state !== 'ready') return
    function onPlanExpired() { setPlanExpired(true) }
    function onSessionReplaced() { clearAuth(); setSessionReplaced(true) }
    window.addEventListener('plan-expired', onPlanExpired)
    window.addEventListener('session-replaced', onSessionReplaced)
    if (isLoggedIn() && isTenantAdmin() && hasFeature('batch_tracking') && batchAlerts.value.length === 0) {
      api.listBatchAlerts().then(items => { batchAlerts.value = items || [] }).catch(() => {})
    }
    return () => {
      window.removeEventListener('plan-expired', onPlanExpired)
      window.removeEventListener('session-replaced', onSessionReplaced)
    }
  }, [state])

  if (state === 'loading' || state === 'starting') return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="flex flex-col items-center gap-3">
        <span class="loading loading-spinner loading-lg text-primary" />
        {state === 'starting' && <p class="text-base-content/80 text-sm">{t('startingServer') || 'Starting server...'}</p>}
      </div>
    </div>
  )
  if (state === 'blocked') return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card bg-base-100 shadow max-w-sm w-full">
        <div class="card-body items-center text-center py-10">
          <div class="w-16 h-16 rounded-full bg-error/20 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 class="text-xl font-bold">Desktop Only</h2>
          <p class="text-base-content/80 text-sm mt-2">This application requires the CiPOSdz desktop app. Browser access is not allowed.</p>
        </div>
      </div>
    </div>
  )
  if (state === 'activation') return (
    <Suspense fallback={<Spinner />}>
      <Setup onActivated={() => { setState('loading'); window.location.reload() }} />
    </Suspense>
  )
  if (state === 'needsSetup') return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card bg-base-100 shadow max-w-md w-full">
        <div class="card-body items-center text-center py-10">
          <div class="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 class="text-xl font-bold">{t('firstTimeSetup')}</h2>
          <p class="text-base-content/80 text-sm mt-2">{t('needsAdminSetup')}</p>
          <button class="btn btn-primary btn-sm mt-6" onClick={() => window.location.reload()}>{t('retry')}</button>
        </div>
      </div>
    </div>
  )
  if (state === 'modeSelect') return (
    <Suspense fallback={<Spinner />}>
      <ModeSelect onReady={() => setState('ready')} />
    </Suspense>
  )
  if (state === 'unreachable') return <ServerUnreachable />
  if (planExpired) return <PlanExpiredScreen />
  if (sessionReplaced) return <SessionReplacedScreen />

  // Global keyboard shortcuts
  useHotkeys({
    'ctrl+d': () => route('/dashboard'),
    'ctrl+p': () => route('/pos'),
    'ctrl+f': () => { document.querySelector('[data-search]')?.focus() },
    '?': () => { shortcutsOpen.value = !shortcutsOpen.value },
    'ctrl+shift+f12': () => { adminPanelOpen.value = !adminPanelOpen.value },
  }, [])

  return (
    <Suspense fallback={<Spinner />}>
      <ToastContainer />
      <ShortcutsOverlay />
      <AdminPanel />
      <Router>
        <Login path="/login" />
        <Guard component={Dashboard} path="/dashboard" adminOnly />
        <Guard component={Users} path="/users" adminOnly feat="access_management" />
        <Guard component={Products} path="/products" feat="products" perm={['products', 'view']} />
        <Guard component={ArchivedProducts} path="/archived-products" feat="products" perm={['products', 'archive']} />
        <Guard component={LowStock} path="/low-stock" feat="products" perm={['products', 'alert']} />
        <Guard component={ExpiringBatches} path="/expiring-batches" feat="batch_tracking" perm={['products', 'view']} />
        <Guard component={Favorites} path="/favorites" feat="favorites" perm={['favorites', 'view']} />
        <Guard component={Categories} path="/categories" feat="products" perm={['categories', 'view']} />
        <Guard component={Brands} path="/brands" feat="products" perm={['brands', 'view']} />
        <Guard component={Units} path="/units" feat="products" perm={['units', 'view']} />
        <Guard component={Suppliers} path="/suppliers" feat="suppliers" perm={['suppliers', 'view']} />
        <Guard component={Purchases} path="/purchases" feat="purchases" perm={['purchases', 'view']} />
        <Guard component={Losses} path="/losses" feat="losses" perm={['products', 'loss']} />
        <Guard component={Pos} path="/pos" feat="pos" perm={['sales', 'add']} />
        <Guard component={SalesHistory} path="/sales" feat="sales" perm={['sales', 'view']} />
        <Guard component={SaleReturns} path="/sale-returns" feat="sales" perm={['sales', 'return']} />
        <Guard component={SalesStats} path="/sales-stats" feat="stats" perm={['sales', 'earnings']} />
        <Guard component={Expenses} path="/expenses" feat="expenses" perm={['expenses', 'view']} />
        <Guard component={Retraits} path="/retraits" feat="retraits" perm={['retraits', 'view']} />
        <Guard component={UserSummary} path="/user-summary" feat="user_summary" perm={['sales', 'user_summary']} />
        <Guard component={Settings} path="/settings" adminOnly />
        <Guard component={Clients} path="/clients" feat="clients" perm={['clients', 'view']} />
        <Guard component={Folders} path="/folders" feat="multi_folders" perm={['folders', 'view']} />
        <Guard component={Transfers} path="/transfers" feat="stock_transfers" perm={['products', 'view']} />
        <Guard component={Chat} path="/chat" adminOnly />
        <Guard component={Facturation} path="/facturation" feat="facturation" perm={['facturation', 'view']} />
        <Guard component={Declarations} path="/declarations" adminOnly feat="stats" />
        <TermsConditions path="/terms" />
        <RedirectRoot path="/" />
      </Router>
    </Suspense>
  )
}
