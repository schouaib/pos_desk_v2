import { useState, useEffect, useCallback } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { authUser, mustChangePassword, setAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'

const Icon = ({ d, className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" class={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d={d} />
  </svg>
)

const fmt = (v) => (v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (v) => (v ?? 0).toLocaleString()

function getDateRange(period) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  if (period === 'today') return { from: `${todayStr}T00:00`, to: `${todayStr}T23:59` }
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - d.getDay())
    return { from: `${d.toISOString().slice(0, 10)}T00:00`, to: `${todayStr}T23:59` }
  }
  if (period === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: `${first.toISOString().slice(0, 10)}T00:00`, to: `${todayStr}T23:59` }
  }
  return { from: `${todayStr}T00:00`, to: `${todayStr}T23:59` }
}

export default function Dashboard({ path }) {
  const { t } = useI18n()
  const [period, setPeriod] = useState('today')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [expenseSum, setExpenseSum] = useState(0)
  const [retraitSum, setRetraitSum] = useState(0)
  const [paymentsCollected, setPaymentsCollected] = useState(0)
  const [caisseData, setCaisseData] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [expiringBatches, setExpiringBatches] = useState([])
  const [recentSales, setRecentSales] = useState([])
  const [topClients, setTopClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [valuation, setValuation] = useState(null)
  const [counts, setCounts] = useState({ products: null, suppliers: null, purchases: null, staff: null })

  const fetchAll = useCallback(async (p) => {
    setLoading(true)
    const range = getDateRange(p)
    try {
      const [
        statsResult, expResult, retResult, payResult,
        caisseResult, lowStockResult, expiringResult,
        salesResult, clientsResult, suppliersResult,
        valuationResult, prodCount, suppCount, purchCount, staffResult,
      ] = await Promise.all([
        api.getSalesStatistics({ from: range.from, to: range.to, include_losses: '1' }).catch(() => null),
        api.getExpenseSum({ from: range.from, to: range.to }).catch(() => ({ total: 0 })),
        api.getRetraitSum({ from: range.from, to: range.to }).catch(() => ({ total: 0 })),
        api.getClientPaymentsSum({ from: range.from, to: range.to }).catch(() => ({ total: 0 })),
        api.getCurrentCaisse().catch(() => null),
        api.listLowStockProducts({ page: 1, limit: 5 }).catch(() => ({ items: [] })),
        api.listExpiringBatches({ limit: 5 }).catch(() => []),
        api.listSales({ page: 1, limit: 5 }).catch(() => ({ items: [] })),
        api.listClients({ page: 1, limit: 5, sort: '-balance' }).catch(() => ({ items: [] })),
        api.listSuppliersPage({ page: 1, limit: 100 }).catch(() => ({ items: [] })),
        api.getProductValuation().catch(() => null),
        api.listProducts({ page: 1, limit: 1 }).catch(() => ({ total: 0 })),
        api.listSuppliersPage({ page: 1, limit: 1 }).catch(() => ({ total: 0 })),
        api.listPurchases({ page: 1, limit: 1 }).catch(() => ({ total: 0 })),
        api.listUsers().catch(() => []),
      ])
      setStats(statsResult)
      setExpenseSum(expResult?.total ?? 0)
      setRetraitSum(retResult?.total ?? 0)
      setPaymentsCollected(payResult?.total ?? 0)
      setCaisseData(caisseResult)
      setLowStock(lowStockResult?.items || [])
      setExpiringBatches(Array.isArray(expiringResult) ? expiringResult.slice(0, 5) : (expiringResult?.items || []).slice(0, 5))
      setRecentSales(salesResult?.items || [])
      setTopClients((clientsResult?.items || []).filter(c => (c.balance || 0) > 0).slice(0, 5))
      setSuppliers(suppliersResult?.items || [])
      setValuation(valuationResult)
      setCounts({
        products: prodCount?.total ?? 0,
        suppliers: suppCount?.total ?? 0,
        purchases: purchCount?.total ?? 0,
        staff: staffResult?.length ?? 0,
      })
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll(period) }, [])

  const changePeriod = (p) => { setPeriod(p); fetchAll(p) }

  const avgTicket = stats?.sales_count > 0 ? (stats.revenue_ttc / stats.sales_count) : 0
  const netAfterExpenses = (stats?.net_earning ?? 0) - expenseSum
  const supplierDebt = suppliers.reduce((sum, s) => sum + (s.balance || 0), 0)
  const marginPct = stats?.revenue_ht > 0 ? ((stats.gross_earning / stats.revenue_ht) * 100).toFixed(1) : '0.0'
  const cashPercent = stats?.revenue_ttc > 0 ? ((stats.cash_revenue_ttc / stats.revenue_ttc) * 100).toFixed(0) : 0
  const creditPercent = stats?.revenue_ttc > 0 ? ((stats.credit_revenue_ttc / stats.revenue_ttc) * 100).toFixed(0) : 0

  const email = authUser.value?.email || ''
  const initial = email[0]?.toUpperCase() || '?'

  const Loader = () => <div class="h-5 w-16 bg-base-200 rounded animate-pulse" />

  // Password change modal
  const [showPwChange, setShowPwChange] = useState(mustChangePassword())
  const [pwForm, setPwForm] = useState({ pw: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  async function handlePwChange(e) {
    e.preventDefault()
    if (pwForm.pw !== pwForm.confirm) { setPwError(t('passwordMismatch') || 'Passwords do not match'); return }
    setPwError(''); setPwLoading(true)
    try {
      await api.changePassword({ new_password: pwForm.pw })
      const updated = { ...authUser.value, must_change_password: false }
      setAuth(sessionStorage.getItem('tenant_token'), updated)
      setShowPwChange(false)
    } catch (err) { setPwError(err.message) }
    finally { setPwLoading(false) }
  }

  return (
    <Layout currentPath={path}>
      {showPwChange && (
        <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div class="card w-full max-w-sm bg-base-100 shadow-xl">
            <div class="card-body">
              <h2 class="card-title text-lg font-bold text-warning">
                {t('changePasswordRequired') || 'Change Password Required'}
              </h2>
              <p class="text-sm text-base-content/80 mb-2">
                {t('defaultPasswordWarning') || 'You are using a default password. Please change it now for security.'}
              </p>
              {pwError && <div class="alert alert-error text-sm py-2 mb-2"><span>{pwError}</span></div>}
              <form onSubmit={handlePwChange} class="space-y-3">
                <label class="form-control">
                  <span class="label-text text-sm">{t('newPassword') || 'New Password'}</span>
                  <input type="password" class="input input-bordered input-sm"
                    value={pwForm.pw} onInput={(e) => setPwForm({ ...pwForm, pw: e.target.value })} required minLength={8} autoFocus />
                </label>
                <label class="form-control">
                  <span class="label-text text-sm">{t('confirmPassword') || 'Confirm Password'}</span>
                  <input type="password" class="input input-bordered input-sm"
                    value={pwForm.confirm} onInput={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} required minLength={8} />
                </label>
                <button type="submit" class={`btn btn-warning btn-sm w-full ${pwLoading ? 'loading' : ''}`} disabled={pwLoading}>
                  {t('changePassword') || 'Change Password'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div class="page-enter">
        {/* Header + Period Filter */}
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center text-primary font-bold text-lg shrink-0">
              {initial}
            </div>
            <div>
              <h2 class="text-2xl font-bold">{t('dashboard')}</h2>
              <p class="text-sm text-base-content/70">{t('loggedInAs')} <span class="font-medium text-base-content/80">{email}</span></p>
            </div>
          </div>
          <div class="join">
            {['today', 'week', 'month'].map(p => (
              <button key={p} class={`join-item btn btn-xs ${period === p ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => changePeriod(p)} disabled={loading}>
                {t(`period_${p}`)}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Hero Cards */}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div class="rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white p-4">
            <p class="text-xs opacity-70 mb-1">{t('revenueTTC')}</p>
            <p class="text-2xl font-extrabold tabular-nums">{loading ? <Loader /> : fmt(stats?.revenue_ttc)}</p>
            <p class="text-xs opacity-60 mt-1">{t('revenueHT')}: {loading ? '...' : fmt(stats?.revenue_ht)}</p>
          </div>
          <div class="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4">
            <p class="text-xs opacity-70 mb-1">{t('salesCount')}</p>
            <p class="text-2xl font-extrabold tabular-nums">{loading ? <Loader /> : fmtInt(stats?.sales_count)}</p>
            <p class="text-xs opacity-60 mt-1">{t('dashAvgTicket')}: {loading ? '...' : fmt(avgTicket)}</p>
          </div>
          <div class="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-4">
            <p class="text-xs opacity-70 mb-1">{t('netEarning')}</p>
            <p class="text-2xl font-extrabold tabular-nums">{loading ? <Loader /> : fmt(netAfterExpenses)}</p>
            <p class="text-xs opacity-60 mt-1">{t('grossEarning')}: {loading ? '...' : `${marginPct}%`}</p>
          </div>
          <div class="rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 text-white p-4">
            <p class="text-xs opacity-70 mb-1">{t('dashExpensesWithdrawals')}</p>
            <p class="text-2xl font-extrabold tabular-nums">{loading ? <Loader /> : fmt(expenseSum + retraitSum)}</p>
            <p class="text-xs opacity-60 mt-1">{t('expenseCost')}: {fmt(expenseSum)} | {t('dashWithdrawals')}: {fmt(retraitSum)}</p>
          </div>
        </div>

        {/* Row 2: Caisse + Cash vs Credit + Quick Stats */}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
          {/* Caisse Status */}
          <div class="bg-base-100 border border-base-200 rounded-xl p-4">
            <div class="flex items-center gap-2 mb-3">
              <Icon d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" className="w-5 h-5 text-primary" />
              <h3 class="font-semibold text-sm">{t('dashCaisseStatus')}</h3>
            </div>
            {loading ? <Loader /> : caisseData ? (
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <span class="badge badge-success badge-xs">{t('dashCaisseOpen')}</span>
                  <span class="text-xs text-base-content/70">{new Date(caisseData.opened_at).toLocaleTimeString()}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-base-content/75">{t('dashOpeningAmount')}</span>
                  <span class="font-semibold">{fmt(caisseData.opening_amount)}</span>
                </div>
                {caisseData.user_name && (
                  <div class="flex justify-between text-sm">
                    <span class="text-base-content/75">{t('dashCashier')}</span>
                    <span class="font-semibold">{caisseData.user_name}</span>
                  </div>
                )}
              </div>
            ) : (
              <div class="flex items-center gap-2">
                <span class="badge badge-error badge-xs">{t('dashCaisseClosed')}</span>
                <span class="text-xs text-base-content/70">{t('dashNoCaisseSession')}</span>
              </div>
            )}
          </div>

          {/* Cash vs Credit */}
          <div class="bg-base-100 border border-base-200 rounded-xl p-4">
            <h3 class="font-semibold text-sm mb-3">{t('dashCashVsCredit')}</h3>
            {loading ? <Loader /> : (
              <div class="space-y-3">
                <div>
                  <div class="flex justify-between text-xs mb-1">
                    <span class="text-success">{t('cashRevenueTTC')}</span>
                    <span class="font-bold">{fmt(stats?.cash_revenue_ttc)} ({cashPercent}%)</span>
                  </div>
                  <progress class="progress progress-success w-full h-2" value={cashPercent} max="100" />
                </div>
                <div>
                  <div class="flex justify-between text-xs mb-1">
                    <span class="text-warning">{t('creditRevenueTTC')}</span>
                    <span class="font-bold">{fmt(stats?.credit_revenue_ttc)} ({creditPercent}%)</span>
                  </div>
                  <progress class="progress progress-warning w-full h-2" value={creditPercent} max="100" />
                </div>
                <div class="flex justify-between text-xs pt-1 border-t border-base-200">
                  <span class="text-base-content/70">{t('paymentsCollected')}</span>
                  <span class="font-bold text-info">{fmt(paymentsCollected)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div class="bg-base-100 border border-base-200 rounded-xl p-4">
            <h3 class="font-semibold text-sm mb-3">{t('dashQuickStats')}</h3>
            <div class="grid grid-cols-2 gap-3">
              {[
                { label: t('productsPage'), value: counts.products, href: '/products', color: 'text-primary', bg: 'bg-primary/10', icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z' },
                { label: t('suppliersPage'), value: counts.suppliers, href: '/suppliers', color: 'text-secondary', bg: 'bg-secondary/10', icon: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12' },
                { label: t('purchasesPage'), value: counts.purchases, href: '/purchases', color: 'text-accent', bg: 'bg-accent/10', icon: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z' },
                { label: t('staffMembers'), value: counts.staff, href: '/users', color: 'text-success', bg: 'bg-success/10', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z' },
              ].map(s => (
                <a key={s.href} href={s.href} class="flex items-center gap-2 p-2 rounded-lg hover:bg-base-200/50 transition-colors">
                  <div class={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                    <Icon d={s.icon} className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <div>
                    <p class="text-lg font-bold tabular-nums leading-tight">{s.value ?? <span class="loading loading-dots loading-xs" />}</p>
                    <p class="text-xs text-base-content/70">{s.label}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Valuation + Supplier Debt + Cost + Timbre */}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div class="bg-base-100 border border-base-200 rounded-xl p-4">
            <p class="text-xs text-base-content/70 mb-1">{t('valuation')}</p>
            <p class="text-xl font-bold tabular-nums">{loading ? <Loader /> : fmt(valuation?.total_value)}</p>
            <p class="text-xs text-base-content/60 mt-1">{fmtInt(valuation?.total_items)} {t('productsPage')}</p>
          </div>
          <div class="bg-base-100 border border-base-200 rounded-xl p-4">
            <p class="text-xs text-base-content/70 mb-1">{t('dashSupplierDebt')}</p>
            <p class={`text-xl font-bold tabular-nums ${supplierDebt > 0 ? 'text-error' : 'text-success'}`}>
              {loading ? <Loader /> : fmt(supplierDebt)}
            </p>
            <p class="text-xs text-base-content/60 mt-1">{suppliers.filter(s => (s.balance || 0) > 0).length} {t('suppliersPage')}</p>
          </div>
          <div class="bg-base-100 border border-base-200 rounded-xl p-4">
            <p class="text-xs text-base-content/70 mb-1">{t('totalCost')}</p>
            <p class="text-xl font-bold tabular-nums text-error">{loading ? <Loader /> : fmt(stats?.total_cost)}</p>
          </div>
          <div class="bg-base-100 border border-base-200 rounded-xl p-4">
            <p class="text-xs text-base-content/70 mb-1">{t('timbreFiscal')}</p>
            <p class="text-xl font-bold tabular-nums">{loading ? <Loader /> : fmt(stats?.total_timbre)}</p>
          </div>
        </div>

        {/* Row 4: Alerts */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
          {/* Low Stock */}
          <div class="bg-base-100 border border-base-200 rounded-xl">
            <div class="flex items-center justify-between px-4 py-3 border-b border-base-200">
              <div class="flex items-center gap-2">
                <Icon d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-4 h-4 text-warning" />
                <h3 class="font-semibold text-sm">{t('lowStockAlert')}</h3>
              </div>
              <a href="/low-stock" class="btn btn-ghost btn-xs">{t('dashViewAll')}</a>
            </div>
            <div class="divide-y divide-base-200">
              {lowStock.length === 0 ? (
                <p class="text-sm text-base-content/60 text-center py-4">{t('noLowStock')}</p>
              ) : lowStock.map(p => (
                <div key={p.id} class="flex items-center justify-between px-4 py-2.5">
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">{p.name}</p>
                    {p.ref && <p class="text-xs text-base-content/60">{p.ref}</p>}
                  </div>
                  <span class={`badge badge-sm ${p.stock <= 0 ? 'badge-error' : 'badge-warning'}`}>
                    {p.stock} / {p.stock_min}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Expiring Batches */}
          <div class="bg-base-100 border border-base-200 rounded-xl">
            <div class="flex items-center justify-between px-4 py-3 border-b border-base-200">
              <div class="flex items-center gap-2">
                <Icon d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 text-error" />
                <h3 class="font-semibold text-sm">{t('dashExpiringBatches')}</h3>
              </div>
              <a href="/expiring-batches" class="btn btn-ghost btn-xs">{t('dashViewAll')}</a>
            </div>
            <div class="divide-y divide-base-200">
              {expiringBatches.length === 0 ? (
                <p class="text-sm text-base-content/60 text-center py-4">{t('dashNoExpiring')}</p>
              ) : expiringBatches.map((b, i) => (
                <div key={i} class="flex items-center justify-between px-4 py-2.5">
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">{b.product_name || b.name}</p>
                    <p class="text-xs text-base-content/60">{t('dashBatch')}: {b.batch_number || b.lot}</p>
                  </div>
                  <span class={`badge badge-sm ${new Date(b.expiry_date || b.expires_at) < new Date() ? 'badge-error' : 'badge-warning'}`}>
                    {new Date(b.expiry_date || b.expires_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 5: Recent Sales + Top Clients */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
          {/* Recent Sales */}
          <div class="bg-base-100 border border-base-200 rounded-xl">
            <div class="flex items-center justify-between px-4 py-3 border-b border-base-200">
              <div class="flex items-center gap-2">
                <Icon d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" className="w-4 h-4 text-primary" />
                <h3 class="font-semibold text-sm">{t('dashRecentSales')}</h3>
              </div>
              <a href="/sales" class="btn btn-ghost btn-xs">{t('dashViewAll')}</a>
            </div>
            <div class="divide-y divide-base-200">
              {recentSales.length === 0 ? (
                <p class="text-sm text-base-content/60 text-center py-4">{t('dashNoSales')}</p>
              ) : recentSales.map(s => (
                <div key={s.id} class="flex items-center justify-between px-4 py-2.5">
                  <div class="min-w-0">
                    <p class="text-sm font-medium">{s.ref || `#${s.id?.slice(-6)}`}</p>
                    <p class="text-xs text-base-content/60">{new Date(s.created_at).toLocaleString()}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-bold tabular-nums">{fmt(s.total)}</p>
                    <span class={`badge badge-xs ${s.payment_method === 'cash' ? 'badge-success' : 'badge-warning'}`}>
                      {s.payment_method}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Clients with Balance */}
          <div class="bg-base-100 border border-base-200 rounded-xl">
            <div class="flex items-center justify-between px-4 py-3 border-b border-base-200">
              <div class="flex items-center gap-2">
                <Icon d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" className="w-4 h-4 text-warning" />
                <h3 class="font-semibold text-sm">{t('dashTopClients')}</h3>
              </div>
              <a href="/clients" class="btn btn-ghost btn-xs">{t('dashViewAll')}</a>
            </div>
            <div class="divide-y divide-base-200">
              {topClients.length === 0 ? (
                <p class="text-sm text-base-content/60 text-center py-4">{t('dashNoOutstanding')}</p>
              ) : topClients.map(c => (
                <div key={c.id} class="flex items-center justify-between px-4 py-2.5">
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">{c.name}</p>
                    {c.phone && <p class="text-xs text-base-content/60">{c.phone}</p>}
                  </div>
                  <span class="text-sm font-bold text-error tabular-nums">{fmt(c.balance)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div class="card bg-base-100 shadow mb-6">
          <div class="card-body p-5">
            <h3 class="font-semibold mb-4">{t('quickLinks')}</h3>
            <div class="flex flex-wrap gap-3">
              {[
                { label: t('posNav'), href: '/pos', bg: 'bg-primary/10', color: 'text-primary', iconPath: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z' },
                { label: t('salesStatsPage'), href: '/sales-stats', bg: 'bg-accent/10', color: 'text-accent', iconPath: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
                { label: t('newProduct'), href: '/products', bg: 'bg-secondary/10', color: 'text-secondary', iconPath: 'M12 4.5v15m7.5-7.5h-15' },
                { label: t('salesPage'), href: '/sales', bg: 'bg-info/10', color: 'text-info', iconPath: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z' },
              ].map(action => (
                <a key={action.href} href={action.href}
                  class="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-base-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
                  <div class={`w-9 h-9 rounded-lg ${action.bg} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                    <Icon d={action.iconPath} className={`w-4.5 h-4.5 ${action.color}`} />
                  </div>
                  <span class="text-sm font-medium">{action.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
