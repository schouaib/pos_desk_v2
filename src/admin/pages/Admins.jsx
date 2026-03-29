import { useState, useEffect } from 'preact/hooks'
import { Modal, openModal, closeModal } from '../../components/Modal'
import { saApi } from '../api'
import { useI18n } from '../../lib/i18n'

export default function Admins() {
  const { t } = useI18n()
  const [admins, setAdmins] = useState([])
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    try {
      const res = await saApi.listAdmins()
      setAdmins(res?.items || res || [])
    } catch {}
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setForm({ name: '', email: '', password: '' }); setError(''); openModal('sa-admin-modal')
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await saApi.createAdmin(form)
      closeModal('sa-admin-modal'); load()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function toggleActive(admin) {
    try { await saApi.setAdminActive(admin.id, !admin.active); load() } catch {}
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('admins') || 'Admins'}</h2>
        <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newAdmin') || 'New Admin'}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                {[t('name'), t('email'), t('status'), t('actions')].map((h, i) => (
                  <th key={i} class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} class="border-b border-base-200">
                  <td class="px-3 py-2.5 font-medium">{a.name}</td>
                  <td class="px-3 py-2.5 text-sm text-base-content/80">{a.email}</td>
                  <td class="px-3 py-2.5">
                    <span class={`text-xs font-semibold px-2 py-0.5 rounded-full ${a.active ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                      {a.active ? t('active') || 'Active' : t('disabled') || 'Disabled'}
                    </span>
                  </td>
                  <td class="px-3 py-2.5">
                    <button class={`btn btn-xs btn-ghost border ${a.active ? 'border-error text-error' : 'border-success text-success'}`} onClick={() => toggleActive(a)}>
                      {a.active ? t('disable') || 'Disable' : t('enable') || 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
              {admins.length === 0 && (
                <tr><td colSpan={4} class="px-3 py-12 text-center text-base-content/70">{t('noAdmins') || 'No admins yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal id="sa-admin-modal" title={t('newAdmin') || 'New Admin'}>
        {error && <div class="alert alert-error text-sm py-2 mb-3"><span>{error}</span></div>}
        <form onSubmit={handleSubmit} class="space-y-3">
          <label class="form-control">
            <span class="label-text text-sm">{t('name')}</span>
            <input class="input input-bordered input-sm" value={form.name} onInput={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label class="form-control">
            <span class="label-text text-sm">{t('email')}</span>
            <input type="text" class="input input-bordered input-sm" value={form.email} onInput={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label class="form-control">
            <span class="label-text text-sm">{t('password')}</span>
            <input type="password" class="input input-bordered input-sm" value={form.password} onInput={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          </label>
          <div class="modal-action">
            <button type="submit" class={`btn btn-primary btn-sm ${loading ? 'loading' : ''}`} disabled={loading}>
              {t('createAdmin') || 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
