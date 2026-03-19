import { useState, useEffect, useRef } from 'preact/hooks'
import { route } from 'preact-router'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { isTenantAdmin, authUser } from '../lib/auth'
import { useI18n } from '../lib/i18n'

const MODULES = ['products', 'categories', 'brands', 'units', 'purchases', 'suppliers', 'sales', 'expenses', 'retraits', 'clients', 'folders', 'favorites']
const BASE_ACTIONS = ['view', 'add', 'edit', 'delete']

const SPECIAL_PERMS = {
  products: ['movement', 'loss', 'adjustment', 'alert', 'export', 'archive', 'price_history', 'valuation'],
  purchases: ['validate', 'pay', 'return'],
  suppliers: ['pay'],
  sales: ['earnings', 'user_summary', 'return'],
}

const ACTION_COLOR = {
  view: 'badge-primary', add: 'badge-primary', edit: 'badge-primary', delete: 'badge-primary',
  movement: 'badge-warning', loss: 'badge-warning',
  adjustment: 'badge-warning', alert: 'badge-warning', export: 'badge-warning',
  archive: 'badge-warning', price_history: 'badge-warning', valuation: 'badge-warning',
  validate: 'badge-accent', pay: 'badge-accent', return: 'badge-accent',
  earnings: 'badge-success',
  user_summary: 'badge-info',
}

function emptyPerms() {
  const p = {}
  for (const m of MODULES) {
    p[m] = { view: false, add: false, edit: false, delete: false, movement: false, loss: false, validate: false, pay: false, earnings: false, user_summary: false, adjustment: false, alert: false, export: false, return: false, archive: false, price_history: false, valuation: false }
  }
  return p
}

function mergePerms(saved) {
  const base = emptyPerms()
  if (!saved) return base
  for (const m of MODULES) {
    if (saved[m]) base[m] = { ...base[m], ...saved[m] }
  }
  return base
}

const emptyForm = { name: '', email: '', password: '', role: 'cashier', permissions: emptyPerms() }

const LIMIT = 10

export default function Users({ path }) {
  const { t } = useI18n()
  const [users, setUsers] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef(null)
  const observerRef = useRef(null)

  useEffect(() => {
    if (!isTenantAdmin()) { route('/dashboard'); return }
    loadPage(1, true)
  }, [])

  async function loadPage(p, reset = false) {
    setLoadingMore(true)
    try {
      const res = await api.listUsers(p)
      setUsers((prev) => reset ? res.items : [...prev, ...res.items])
      setPage(p)
      setHasMore(p < res.pages)
    } catch {}
    finally { setLoadingMore(false) }
  }

  // Keep a ref in sync with latest pagination state so the observer
  // callback always reads fresh values without being recreated.
  const paginationRef = useRef({ hasMore: false, loadingMore: false, page: 1 })
  useEffect(() => { paginationRef.current = { hasMore, loadingMore, page } }, [hasMore, loadingMore, page])

  // Create the observer exactly once — no recreation on state changes.
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        const { hasMore, loadingMore, page } = paginationRef.current
        if (hasMore && !loadingMore) loadPage(page + 1)
      }
    }, { threshold: 0.1 })
    if (sentinelRef.current) observer.observe(sentinelRef.current)
    observerRef.current = observer
    return () => observer.disconnect()
  }, [])

  function reload() { loadPage(1, true) }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    openModal('user-modal')
  }

  function openEdit(u) {
    setEditing(u)
    setForm({ name: u.name, email: u.email, password: '', role: u.role, permissions: mergePerms(u.permissions) })
    setError('')
    openModal('user-modal')
  }

  function togglePerm(module, action) {
    setForm((f) => ({
      ...f,
      permissions: {
        ...f.permissions,
        [module]: { ...f.permissions[module], [action]: !f.permissions[module][action] },
      },
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = { name: form.name, role: form.role, permissions: form.permissions }
      if (editing) {
        await api.updateUser(editing.id, payload)
      } else {
        await api.createUser({ ...payload, email: form.email, password: form.password })
      }
      closeModal('user-modal')
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleUser(u) {
    if (u.id === authUser.value?.id) return
    try { await api.setUserActive(u.id, !u.active); reload() } catch {}
  }

  const moduleLabel = (m) => t('perm' + m.charAt(0).toUpperCase() + m.slice(1))
  const actionLabel = (a) => {
    if (a === 'movement') return t('permMovement')
    if (a === 'loss') return t('permLoss')
    if (a === 'validate') return t('permValidate')
    if (a === 'pay') return t('permPay')
    if (a === 'earnings') return t('permEarnings')
    if (a === 'user_summary') return t('permUserSummary')
    if (a === 'adjustment') return t('permAdjustment')
    if (a === 'alert') return t('permAlert')
    if (a === 'export') return t('permExport')
    if (a === 'return') return t('permReturn')
    if (a === 'archive') return t('permArchive')
    if (a === 'price_history') return t('permPriceHistory')
    if (a === 'valuation') return t('permValuation')
    return t('perm' + a.charAt(0).toUpperCase() + a.slice(1))
  }

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('staffPage')}</h2>
        <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newStaff')}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
        <table class="table table-sm w-full">
          <thead class="bg-base-200/60">
            <tr>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('name')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('email')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('role')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('status')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 w-28">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} class={`border-b border-base-200 hover:bg-base-50 transition-colors ${u.id === authUser.value?.id ? 'bg-base-200/50' : ''}`}>
                <td class="px-3 py-2.5 font-medium">
                  {u.name}
                  {u.id === authUser.value?.id && <span class="badge badge-xs badge-primary ms-2">{t('you')}</span>}
                </td>
                <td class="px-3 py-2.5 text-sm">{u.email}</td>
                <td class="px-3 py-2.5">
                  <span class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'tenant_admin' ? 'bg-primary/15 text-primary' : 'bg-base-200 text-base-content/60'}`}>
                    {u.role === 'tenant_admin' ? t('admin') : t('cashier')}
                  </span>
                </td>
                <td class="px-3 py-2.5">
                  <span class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.active ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                    {u.active ? t('active') : t('disabled')}
                  </span>
                </td>
                <td class="px-3 py-2.5">
                  <div class="flex gap-1">
                    <div class="tooltip tooltip-left" data-tip={t('edit')}>
                      <button class="btn btn-xs btn-ghost btn-square" onClick={() => openEdit(u)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                    </div>
                    <div class="tooltip tooltip-left" data-tip={u.active ? t('disable') : t('enable')}>
                      <button
                        class={`btn btn-xs btn-ghost btn-square ${u.active ? 'text-error' : 'text-success'}`}
                        onClick={() => toggleUser(u)}
                        disabled={u.id === authUser.value?.id}
                      >
                        {u.active
                          ? <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                          : <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        }
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loadingMore && (
              <tr><td colSpan={5} class="px-3 py-12 text-center text-base-content/30 text-sm">{t('noStaff')}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} class="h-4" />
      {loadingMore && (
        <div class="flex justify-center py-4">
          <span class="loading loading-spinner loading-sm text-base-content/40" />
        </div>
      )}

      <Modal id="user-modal" title={editing ? t('editStaff') : t('newStaffMember')}>
        {error && <div class="alert alert-error text-sm py-2 mb-3"><span>{error}</span></div>}
        <form onSubmit={handleSubmit} class="space-y-3">
          <label class="form-control">
            <span class="label-text text-sm">{t('name')}</span>
            <input class="input input-bordered input-sm" value={form.name}
              onInput={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          {!editing && (
            <>
              <label class="form-control">
                <span class="label-text text-sm">{t('email')}</span>
                <input type="email" class="input input-bordered input-sm" value={form.email}
                  onInput={(e) => setForm({ ...form, email: e.target.value })} required />
              </label>
              <label class="form-control">
                <span class="label-text text-sm">{t('password')}</span>
                <input type="password" class="input input-bordered input-sm" value={form.password}
                  onInput={(e) => setForm({ ...form, password: e.target.value })} required />
              </label>
            </>
          )}
          <label class="form-control">
            <span class="label-text text-sm">{t('role')}</span>
            <select class="select select-bordered select-sm" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="cashier">{t('cashier')}</option>
              <option value="tenant_admin">{t('admin')}</option>
            </select>
          </label>

          {/* Permission cards — only for cashier */}
          {form.role === 'cashier' && (
            <div>
              <p class="label-text text-sm font-semibold mb-3">{t('permissionsTitle')}</p>
              <div class="grid grid-cols-2 gap-2">
                {MODULES.map((m) => {
                  const specials = SPECIAL_PERMS[m] || []
                  const allActions = [...BASE_ACTIONS, ...specials]
                  const allOn = allActions.every((a) => form.permissions[m][a])
                  function toggleAll() {
                    const next = !allOn
                    setForm((f) => ({
                      ...f,
                      permissions: {
                        ...f.permissions,
                        [m]: { ...f.permissions[m], ...Object.fromEntries(allActions.map((a) => [a, next])) },
                      },
                    }))
                  }
                  return (
                    <div key={m} class="bg-base-200 rounded-xl p-3">
                      <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-semibold">{moduleLabel(m)}</span>
                        <button type="button" class="btn btn-xs btn-ghost h-5 min-h-0 py-0 text-xs" onClick={toggleAll}>
                          {allOn ? t('clearAll') : t('selectAll')}
                        </button>
                      </div>
                      <div class="flex flex-wrap gap-1">
                        {allActions.map((a) => {
                          const active = form.permissions[m][a]
                          const color = ACTION_COLOR[a]
                          return (
                            <span
                              key={a}
                              class={`badge badge-sm cursor-pointer select-none ${active ? color : 'badge-ghost border border-base-content/20'}`}
                              onClick={() => togglePerm(m, a)}
                            >
                              {actionLabel(a)}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div class="modal-action">
            <button type="submit" class={`btn btn-primary btn-sm ${loading ? 'loading' : ''}`} disabled={loading}>
              {editing ? t('saveChanges') : t('createStaff')}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  )
}
