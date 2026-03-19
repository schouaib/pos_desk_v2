import { useState, useEffect, useRef } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

const empty = { name: '', email: '', phone: '', brand_color: '#3b82f6', plan_id: '', plan_expires_at: '' }

export default function Tenants({ path }) {
  const { t } = useI18n()
  const [tenants, setTenants] = useState([])
  const [plans, setPlans] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [viewUsers, setViewUsers] = useState(null)
  const [tenantUsers, setTenantUsers] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef(null)
  const observerRef = useRef(null)

  // Import
  const [importTenant, setImportTenant] = useState(null)
  const [importFile, setImportFile] = useState(null)
  const [conflictMode, setConflictMode] = useState('skip')
  const [importResult, setImportResult] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')

  async function loadPage(p, reset = false) {
    setLoadingMore(true)
    try {
      const [res, p2] = await Promise.all([api.listTenants(p), reset && p === 1 ? api.listPlans() : Promise.resolve(null)])
      setTenants((prev) => reset ? res.items : [...prev, ...res.items])
      if (p2) setPlans(p2)
      setPage(p)
      setHasMore(p < res.pages)
    } catch {}
    finally { setLoadingMore(false) }
  }

  function reload() { loadPage(1, true) }

  useEffect(() => { loadPage(1, true) }, [])

  const paginationRef = useRef({ hasMore: false, loadingMore: false, page: 1 })
  useEffect(() => { paginationRef.current = { hasMore, loadingMore, page } }, [hasMore, loadingMore, page])

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

  function openCreate() {
    setEditing(null)
    setForm(empty)
    setError('')
    openModal('tenant-modal')
  }

  function openEdit(ten) {
    setEditing(ten)
    setForm({
      name: ten.name,
      email: ten.email,
      phone: ten.phone,
      brand_color: ten.brand_color || '#3b82f6',
      plan_id: ten.plan_id,
      plan_expires_at: ten.plan_expires_at
        ? new Date(ten.plan_expires_at).toISOString().slice(0, 16)
        : '',
    })
    setError('')
    openModal('tenant-modal')
  }

  async function openUsers(ten) {
    setViewUsers(ten)
    setTenantUsers([])
    try {
      setTenantUsers(await api.listTenantUsers(ten.id))
    } catch {}
    openModal('users-modal')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = {
        ...form,
        plan_expires_at: form.plan_expires_at
          ? new Date(form.plan_expires_at).toISOString()
          : '',
      }
      if (editing) {
        await api.updateTenant(editing.id, body)
      } else {
        await api.createTenant(body)
      }
      closeModal('tenant-modal')
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleTenant(ten) {
    try { await api.setTenantActive(ten.id, !ten.active); reload() } catch {}
  }

  async function toggleUser(u) {
    try {
      await api.setTenantUserActive(viewUsers.id, u.id, !u.active)
      setTenantUsers(await api.listTenantUsers(viewUsers.id))
    } catch {}
  }

  function openImport(ten) {
    setImportTenant(ten)
    setImportFile(null)
    setConflictMode('skip')
    setImportResult(null)
    setImportError('')
    openModal('import-modal')
  }

  async function handleImport() {
    if (!importFile) return
    setImportLoading(true)
    setImportError('')
    setImportResult(null)
    try {
      const res = await api.importProducts(importTenant.id, importFile, conflictMode)
      setImportResult(res)
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImportLoading(false)
    }
  }

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('storesTenants')}</h2>
        <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newStore')}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                {[t('store'), t('email'), t('plan'), t('expires'), t('status'), t('actions')].map((h, i) => (
                  <th key={i} class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((ten) => {
                const plan = plans.find((p) => p.id === ten.plan_id)
                return (
                  <tr key={ten.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                    <td class="px-3 py-2.5">
                      <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ten.brand_color }} />
                        <span class="font-medium">{ten.name}</span>
                      </div>
                    </td>
                    <td class="px-3 py-2.5 text-sm text-base-content/70">{ten.email}</td>
                    <td class="px-3 py-2.5">
                      <span class="badge badge-outline badge-sm">{plan?.name || '—'}</span>
                    </td>
                    <td class="px-3 py-2.5 text-sm tabular-nums text-base-content/70">
                      {ten.plan_expires_at ? new Date(ten.plan_expires_at).toLocaleDateString() : '—'}
                    </td>
                    <td class="px-3 py-2.5">
                      <span class={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${ten.active ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                        {ten.active ? t('active') : t('disabled')}
                      </span>
                    </td>
                    <td class="px-3 py-2.5">
                      <div class="flex gap-1">
                        <button class="btn btn-xs btn-ghost border border-base-300" onClick={() => openEdit(ten)}>{t('edit')}</button>
                        <button class="btn btn-xs btn-ghost border border-base-300" onClick={() => openUsers(ten)}>{t('users')}</button>
                        <button class="btn btn-xs btn-ghost border border-info text-info hover:bg-info hover:text-white" onClick={() => openImport(ten)}>Import</button>
                        <button
                          class={`btn btn-xs btn-ghost border ${ten.active ? 'border-error text-error hover:bg-error hover:text-white' : 'border-success text-success hover:bg-success hover:text-white'}`}
                          onClick={() => toggleTenant(ten)}
                        >
                          {ten.active ? t('disable') : t('enable')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {tenants.length === 0 && !loadingMore && (
                <tr>
                  <td colSpan={6} class="px-3 py-12 text-center text-base-content/40">{t('noStores')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div ref={sentinelRef} class="h-4" />
      {loadingMore && (
        <div class="flex justify-center py-4">
          <span class="loading loading-spinner loading-sm text-base-content/40" />
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal id="tenant-modal" title={editing ? t('editStore') : t('newStoreTitle')}>
        {error && <div class="alert alert-error text-sm py-2 mb-3"><span>{error}</span></div>}
        <form onSubmit={handleSubmit} class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <label class="form-control col-span-2">
              <span class="label-text text-sm">{t('storeName')}</span>
              <input class="input input-bordered input-sm" value={form.name}
                onInput={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('email')}</span>
              <input type="email" class="input input-bordered input-sm" value={form.email}
                onInput={(e) => setForm({ ...form, email: e.target.value })} required={!editing} disabled={!!editing} />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('phone')}</span>
              <input class="input input-bordered input-sm" value={form.phone}
                onInput={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('plan')}</span>
              <select class="select select-bordered select-sm" value={form.plan_id}
                onChange={(e) => setForm({ ...form, plan_id: e.target.value })} required>
                <option value="">{t('selectPlan')}</option>
                {plans.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (${p.price}/mo)</option>
                ))}
              </select>
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('planExpires')}</span>
              <input type="datetime-local" class="input input-bordered input-sm" value={form.plan_expires_at}
                onInput={(e) => setForm({ ...form, plan_expires_at: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('brandColor')}</span>
              <div class="flex gap-2 items-center">
                <input type="color" class="w-10 h-9 rounded border cursor-pointer" value={form.brand_color}
                  onInput={(e) => setForm({ ...form, brand_color: e.target.value })} />
                <span class="text-sm font-mono">{form.brand_color}</span>
              </div>
            </label>
          </div>
          <div class="modal-action">
            <button type="submit" class={`btn btn-primary btn-sm ${loading ? 'loading' : ''}`} disabled={loading}>
              {editing ? t('saveChanges') : t('createStore')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Tenant Users Modal */}
      <Modal id="users-modal" title={`${t('users')} — ${viewUsers?.name}`}>
        <div class="overflow-x-auto rounded-lg border border-base-200">
          <table class="table table-xs w-full">
            <thead class="bg-base-200/60">
              <tr>
                {[t('name'), t('email'), t('role'), t('status'), ''].map((h, i) => (
                  <th key={i} class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-base-content/50 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenantUsers.map((u) => (
                <tr key={u.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                  <td class="px-3 py-2 font-medium">{u.name}</td>
                  <td class="px-3 py-2 text-xs text-base-content/70">{u.email}</td>
                  <td class="px-3 py-2">
                    <span class="badge badge-outline badge-xs">{u.role}</span>
                  </td>
                  <td class="px-3 py-2">
                    <span class={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${u.active ? 'bg-success/15 text-success' : 'bg-base-200 text-base-content/50'}`}>
                      {u.active ? t('active') : t('off')}
                    </span>
                  </td>
                  <td class="px-3 py-2">
                    <button
                      class={`btn btn-xs btn-ghost border ${u.active ? 'border-error text-error hover:bg-error hover:text-white' : 'border-success text-success hover:bg-success hover:text-white'}`}
                      onClick={() => toggleUser(u)}
                    >
                      {u.active ? t('disable') : t('enable')}
                    </button>
                  </td>
                </tr>
              ))}
              {tenantUsers.length === 0 && (
                <tr>
                  <td colSpan={5} class="px-3 py-8 text-center text-base-content/40">{t('noUsers')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Import Products Modal */}
      <Modal id="import-modal" title={`Import Products — ${importTenant?.name || ''}`}>
        {importError && <div class="alert alert-error text-sm py-2 mb-3"><span>{importError}</span></div>}

        {importResult ? (
          <div class="space-y-3">
            <p class="text-xs text-base-content/50 text-center">Total rows in file: {importResult.total_rows}</p>
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="bg-success/10 rounded-lg p-3">
                <div class="text-2xl font-bold text-success">{importResult.imported}</div>
                <div class="text-xs">Imported</div>
              </div>
              <div class="bg-info/10 rounded-lg p-3">
                <div class="text-2xl font-bold text-info">{importResult.updated}</div>
                <div class="text-xs">Updated</div>
              </div>
              <div class="bg-warning/10 rounded-lg p-3">
                <div class="text-2xl font-bold text-warning">{importResult.skipped}</div>
                <div class="text-xs">Skipped</div>
              </div>
            </div>
            {importResult.errors?.length > 0 && (
              <div class="bg-base-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                <p class="text-xs font-semibold mb-1">Errors:</p>
                {importResult.errors.map((e, i) => (
                  <p key={i} class="text-xs text-error">{e}</p>
                ))}
              </div>
            )}
            <div class="modal-action">
              <button class="btn btn-sm" onClick={() => { setImportResult(null); setImportFile(null) }}>Import More</button>
              <button class="btn btn-sm btn-primary" onClick={() => closeModal('import-modal')}>Done</button>
            </div>
          </div>
        ) : (
          <div class="space-y-3">
            <label class="form-control">
              <span class="label-text text-sm mb-1">Excel or CSV file</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                class="file-input file-input-bordered file-input-sm w-full"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </label>

            {importFile && (
              <p class="text-xs text-base-content/50">{importFile.name}</p>
            )}

            <div class="flex items-center gap-4">
              <span class="text-sm font-medium">If barcode exists:</span>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="conflict" class="radio radio-xs" checked={conflictMode === 'skip'} onChange={() => setConflictMode('skip')} />
                <span class="text-sm">Skip</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="conflict" class="radio radio-xs" checked={conflictMode === 'update'} onChange={() => setConflictMode('update')} />
                <span class="text-sm">Update</span>
              </label>
            </div>

            <div class="modal-action">
              <button
                class={`btn btn-primary btn-sm ${importLoading ? 'loading' : ''}`}
                disabled={importLoading || !importFile}
                onClick={handleImport}
              >
                Import
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  )
}
