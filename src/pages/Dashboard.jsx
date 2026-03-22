import { useState, useEffect } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { SkeletonStats } from '../components/Skeleton'
import { api } from '../lib/api'
import { authUser, isTenantAdmin, mustChangePassword, setAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'

const Icon = ({ d, className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" class={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d={d} />
  </svg>
)

export default function Dashboard({ path }) {
  const { t } = useI18n()
  const [counts, setCounts] = useState({ products: null, suppliers: null, purchases: null, staff: null })

  useEffect(() => {
    let cancelled = false
    api.listProducts({ page: 1, limit: 1 }).then(r => { if (!cancelled) setCounts(c => ({ ...c, products: r.total })) }).catch(() => {})
    api.listSuppliersPage({ page: 1, limit: 1 }).then(r => { if (!cancelled) setCounts(c => ({ ...c, suppliers: r.total })) }).catch(() => {})
    api.listPurchases({ page: 1, limit: 1 }).then(r => { if (!cancelled) setCounts(c => ({ ...c, purchases: r.total })) }).catch(() => {})
    if (isTenantAdmin()) {
      api.listUsers().then(u => { if (!cancelled) setCounts(c => ({ ...c, staff: u?.length ?? 0 })) }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [])

  const email = authUser.value?.email || ''
  const initial = email[0]?.toUpperCase() || '?'

  const isLoading = counts.products === null && counts.suppliers === null && counts.purchases === null

  const stats = [
    {
      label: t('productsPage'),
      value: counts.products,
      icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
      color: 'text-primary', bg: 'bg-primary/10', href: '/products',
    },
    {
      label: t('suppliersPage'),
      value: counts.suppliers,
      icon: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
      color: 'text-secondary', bg: 'bg-secondary/10', href: '/suppliers',
    },
    {
      label: t('purchasesPage'),
      value: counts.purchases,
      icon: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
      color: 'text-accent', bg: 'bg-accent/10', href: '/purchases',
    },
    ...(isTenantAdmin() ? [{
      label: t('staffMembers'),
      value: counts.staff,
      icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
      color: 'text-success', bg: 'bg-success/10', href: '/users',
    }] : []),
  ]

  const quickActions = [
    {
      label: t('posNav'),
      href: '/pos',
      bg: 'bg-primary/10',
      color: 'text-primary',
      iconPath: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
    },
    {
      label: t('newProduct'),
      href: '/products',
      bg: 'bg-secondary/10',
      color: 'text-secondary',
      iconPath: 'M12 4.5v15m7.5-7.5h-15',
    },
    {
      label: t('salesPage'),
      href: '/sales',
      bg: 'bg-accent/10',
      color: 'text-accent',
      iconPath: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
    },
  ]

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
              <p class="text-sm text-base-content/60 mb-2">
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
        {/* Welcome */}
        <div class="flex items-center gap-3 mb-8">
          <div class="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center text-primary font-bold text-lg shrink-0">
            {initial}
          </div>
          <div>
            <h2 class="text-2xl font-bold">{t('dashboard')}</h2>
            <p class="text-sm text-base-content/55">{t('loggedInAs')} <span class="font-medium text-base-content/80">{email}</span></p>
          </div>
        </div>

        {/* Stat cards */}
        {isLoading ? (
          <div class="mb-8">
            <SkeletonStats count={isTenantAdmin() ? 4 : 3} />
          </div>
        ) : (
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {stats.map((s) => (
              <a key={s.href} href={s.href} class="card bg-base-100 shadow hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group">
                <div class="card-body p-5">
                  <div class="flex items-center justify-between mb-4">
                    <div class={`w-11 h-11 rounded-xl ${s.bg} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                      <Icon d={s.icon} className={`w-5 h-5 ${s.color}`} />
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-base-content/25 group-hover:text-base-content/50 transition-colors duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                  <p class="text-3xl font-bold tabular-nums">
                    {s.value === null ? <span class="loading loading-dots loading-xs opacity-30" /> : s.value}
                  </p>
                  <p class="text-sm text-base-content/55 mt-1">{s.label}</p>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div class="card bg-base-100 shadow mb-6">
          <div class="card-body p-5">
            <h3 class="font-semibold mb-4">{t('quickLinks')}</h3>
            <div class="flex flex-wrap gap-3">
              {quickActions.map((action) => (
                <a
                  key={action.href}
                  href={action.href}
                  class="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-base-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
                >
                  <div class={`w-9 h-9 rounded-lg ${action.bg} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                    <Icon d={action.iconPath} className={`w-4.5 h-4.5 ${action.color}`} />
                  </div>
                  <span class="text-sm font-medium">{action.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Quick links (admin only) */}
        {isTenantAdmin() && (
          <div class="card bg-base-100 shadow">
            <div class="card-body p-5">
              <h3 class="font-semibold mb-3">{t('manageStaff')}</h3>
              <div class="flex flex-wrap gap-2">
                <a href="/products"  class="btn btn-sm btn-outline">{t('productsPage')}</a>
                <a href="/purchases" class="btn btn-sm btn-outline">{t('purchasesPage')}</a>
                <a href="/suppliers" class="btn btn-sm btn-outline">{t('suppliersPage')}</a>
                <a href="/users"     class="btn btn-sm btn-outline">{t('manageStaff')}</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
