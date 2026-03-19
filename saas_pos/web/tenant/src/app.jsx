import Router, { route } from 'preact-router'
import { useEffect, useState, lazy, Suspense, memo } from 'preact/compat'
import { isLoggedIn, clearAuth, hasPerm, isTenantAdmin, hasFeature, batchAlerts } from './lib/auth'
import { api } from './lib/api'
import { useI18n } from './lib/i18n'

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
const basedHistory = createBasedHistory('/tenant')

const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
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
const ActivationKeys = lazy(() => import('./pages/ActivationKeys'))

const Spinner = memo(() => (
  <div class="min-h-screen flex items-center justify-center bg-base-200">
    <span class="loading loading-spinner loading-lg text-primary" />
  </div>
))

function PlanExpiredScreen() {
  const { t } = useI18n()
  function handleLogout() {
    clearAuth()
    window.location.href = '/tenant/login'
  }
  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card bg-base-100 shadow max-w-sm w-full">
        <div class="card-body items-center text-center py-10">
          <div class="w-16 h-16 rounded-full bg-error/20 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 class="text-xl font-bold text-error">{t('planExpiredTitle')}</h2>
          <p class="text-base-content/60 text-sm mt-2">{t('planExpiredDesc')}</p>
          <button class="btn btn-outline btn-sm mt-6" onClick={handleLogout}>
            {t('logout')}
          </button>
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
          <div class="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 15v2m0-6v2m0-6V5m-7 7a7 7 0 1114 0A7 7 0 015 12z" />
            </svg>
          </div>
          <h2 class="text-xl font-bold">{t('sessionReplacedTitle')}</h2>
          <p class="text-base-content/60 text-sm mt-2">{t('sessionReplacedDesc')}</p>
          <a href="/tenant/login" class="btn btn-primary btn-sm mt-6">{t('login')}</a>
        </div>
      </div>
    </div>
  )
}

// perm: ['module', 'action'] — redirects to /dashboard when permission is absent
// feat: 'feature' — redirects to /dashboard when plan feature is disabled
// adminOnly: true — redirects to /dashboard for non-admin users
function Guard({ component: Component, path, perm, feat, adminOnly, ...props }) {
  useEffect(() => {
    if (!isLoggedIn()) { route('/login', true); return }
    if (adminOnly && !isTenantAdmin()) { route('/dashboard', true); return }
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
    route(isLoggedIn() ? '/dashboard' : '/login', true)
  }, [])
  return null
}

export function App() {
  const [planExpired, setPlanExpired] = useState(false)
  const [sessionReplaced, setSessionReplaced] = useState(false)

  useEffect(() => {
    function onPlanExpired() { setPlanExpired(true) }
    function onSessionReplaced() { clearAuth(); setSessionReplaced(true) }
    window.addEventListener('plan-expired', onPlanExpired)
    window.addEventListener('session-replaced', onSessionReplaced)

    // Fetch batch expiry alerts once on app init (covers page refresh / folder switch)
    if (isLoggedIn() && isTenantAdmin() && hasFeature('batch_tracking') && batchAlerts.value.length === 0) {
      api.listBatchAlerts().then(items => { batchAlerts.value = items || [] }).catch(() => {})
    }

    return () => {
      window.removeEventListener('plan-expired', onPlanExpired)
      window.removeEventListener('session-replaced', onSessionReplaced)
    }
  }, [])

  if (planExpired) return <PlanExpiredScreen />
  if (sessionReplaced) return <SessionReplacedScreen />

  return (
    <Suspense fallback={<Spinner />}>
      <Router history={basedHistory}>
        <Signup path="/signup" />
        <Login path="/login" />
        <Guard component={Dashboard} path="/dashboard" />
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
        <Guard component={ActivationKeys} path="/activation-keys" adminOnly />
        <RedirectRoot path="/" />
      </Router>
    </Suspense>
  )
}
