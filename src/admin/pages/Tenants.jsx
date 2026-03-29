import { useState, useEffect, useRef } from 'preact/hooks'
import { Modal, openModal, closeModal } from '../../components/Modal'
import { saApi } from '../api'
import { useI18n } from '../../lib/i18n'

const empty = { name: '', email: '', phone: '', brand_color: '#3b82f6', plan_id: '', plan_expires_at: '' }

export default function Tenants() {
  const { t } = useI18n()
  const [tenants, setTenants] = useState([])
  const [plans, setPlans] = useState([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [viewUsers, setViewUsers] = useState(null)
  const [tenantUsers, setTenantUsers] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    try {
      const [res, p] = await Promise.all([saApi.listTenants(), saApi.listPlans()])
      setTenants(res?.items || res || [])
      setPlans(p || [])
    } catch {}
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null); setForm(empty); setError(''); openModal('sa-tenant-modal')
  }

  function openEdit(ten) {
    setEditing(ten)
    setForm({
      name: ten.name, email: ten.email, phone: ten.phone,
      brand_color: ten.brand_color || '#3b82f6', plan_id: ten.plan_id,
      plan_expires_at: ten.plan_expires_at ? new Date(ten.plan_expires_at).toISOString().slice(0, 16) : '',
    })
    setError(''); openModal('sa-tenant-modal')
  }

  async function openUsers(ten) {
    setViewUsers(ten); setTenantUsers([])
    try { setTenantUsers(await saApi.listTenantUsers(ten.id)) } catch {}
    openModal('sa-users-modal')
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const body = { ...form, plan_expires_at: form.plan_expires_at ? new Date(form.plan_expires_at).toISOString() : '' }
      if (editing) await saApi.updateTenant(editing.id, body)
      else await saApi.createTenant(body)
      closeModal('sa-tenant-modal'); load()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function toggleTenant(ten) {
    try { await saApi.setTenantActive(ten.id, !ten.active); load() } catch {}
  }

  async function toggleUser(u) {
    try {
      await saApi.setTenantUserActive(viewUsers.id, u.id, !u.active)
      setTenantUsers(await saApi.listTenantUsers(viewUsers.id))
    } catch {}
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('storesTenants') || 'Stores'}</h2>
        <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newStore') || 'New Store'}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                {[t('store') || 'Store', t('email'), t('plan') || 'Plan', t('expires') || 'Expires', t('status'), t('actions')].map((h, i) => (
                  <th key={i} class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((ten) => {
                const plan = plans.find((p) => p.id === ten.plan_id)
                return (
                  <tr key={ten.id} class="border-b border-base-200">
                    <td class="px-3 py-2.5">
                      <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ten.brand_color }} />
                        <span class="font-medium">{ten.name}</span>
                      </div>
                    </td>
                    <td class="px-3 py-2.5 text-sm text-base-content/80">{ten.email}</td>
                    <td class="px-3 py-2.5"><span class="badge badge-outline badge-sm">{plan?.name || '—'}</span></td>
                    <td class="px-3 py-2.5 text-sm tabular-nums">{ten.plan_expires_at ? new Date(ten.plan_expires_at).toLocaleDateString() : '—'}</td>
                    <td class="px-3 py-2.5">
                      <span class={`text-xs font-semibold px-2 py-0.5 rounded-full ${ten.active ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                        {ten.active ? t('active') || 'Active' : t('disabled') || 'Disabled'}
                      </span>
                    </td>
                    <td class="px-3 py-2.5">
                      <div class="flex gap-1">
                        <button class="btn btn-xs btn-ghost border border-base-300" onClick={() => openEdit(ten)}>{t('edit') || 'Edit'}</button>
                        <button class="btn btn-xs btn-ghost border border-base-300" onClick={() => openUsers(ten)}>{t('users') || 'Users'}</button>
                        <button class={`btn btn-xs btn-ghost border ${ten.active ? 'border-error text-error' : 'border-success text-success'}`} onClick={() => toggleTenant(ten)}>
                          {ten.active ? t('disable') || 'Disable' : t('enable') || 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {tenants.length === 0 && (
                <tr><td colSpan={6} class="px-3 py-12 text-center text-base-content/70">{t('noStores') || 'No stores yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal id="sa-tenant-modal" title={editing ? t('editStore') || 'Edit Store' : t('newStoreTitle') || 'New Store'}>
        {error && <div class="alert alert-error text-sm py-2 mb-3"><span>{error}</span></div>}
        <form onSubmit={handleSubmit} class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <label class="form-control col-span-2">
              <span class="label-text text-sm">{t('storeName') || 'Store Name'}</span>
              <input class="input input-bordered input-sm" value={form.name} onInput={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('email')}</span>
              <input type="email" class="input input-bordered input-sm" value={form.email} onInput={(e) => setForm({ ...form, email: e.target.value })} required={!editing} disabled={!!editing} />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('phone')}</span>
              <input class="input input-bordered input-sm" value={form.phone} onInput={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('plan') || 'Plan'}</span>
              <select class="select select-bordered select-sm" value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })} required>
                <option value="">{t('selectPlan') || 'Select plan'}</option>
                {plans.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('planExpires') || 'Expires'}</span>
              <input type="datetime-local" class="input input-bordered input-sm" value={form.plan_expires_at} onInput={(e) => setForm({ ...form, plan_expires_at: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('brandColor') || 'Brand Color'}</span>
              <div class="flex gap-2 items-center">
                <input type="color" class="w-10 h-9 rounded border cursor-pointer" value={form.brand_color} onInput={(e) => setForm({ ...form, brand_color: e.target.value })} />
                <span class="text-sm font-mono">{form.brand_color}</span>
              </div>
            </label>
          </div>
          <div class="modal-action">
            <button type="submit" class={`btn btn-primary btn-sm ${loading ? 'loading' : ''}`} disabled={loading}>
              {editing ? t('saveChanges') || 'Save' : t('createStore') || 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal id="sa-users-modal" title={`${t('users') || 'Users'} — ${viewUsers?.name || ''}`}>
        <div class="overflow-x-auto rounded-lg border border-base-200">
          <table class="table table-xs w-full">
            <thead class="bg-base-200/60">
              <tr>
                {[t('name'), t('email'), t('role') || 'Role', t('status'), ''].map((h, i) => (
                  <th key={i} class="px-3 py-2 text-xs font-semibold uppercase text-base-content/70">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenantUsers.map((u) => (
                <tr key={u.id} class="border-b border-base-200">
                  <td class="px-3 py-2 font-medium">{u.name}</td>
                  <td class="px-3 py-2 text-xs">{u.email}</td>
                  <td class="px-3 py-2"><span class="badge badge-outline badge-xs">{u.role}</span></td>
                  <td class="px-3 py-2">
                    <span class={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.active ? 'bg-success/15 text-success' : 'bg-base-200 text-base-content/70'}`}>
                      {u.active ? t('active') || 'Active' : t('off') || 'Off'}
                    </span>
                  </td>
                  <td class="px-3 py-2">
                    <button class={`btn btn-xs btn-ghost border ${u.active ? 'border-error text-error' : 'border-success text-success'}`} onClick={() => toggleUser(u)}>
                      {u.active ? t('disable') || 'Disable' : t('enable') || 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
              {tenantUsers.length === 0 && (
                <tr><td colSpan={5} class="px-3 py-8 text-center text-base-content/70">{t('noUsers') || 'No users'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  )
}
