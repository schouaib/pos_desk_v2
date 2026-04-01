import { useState, useEffect, useCallback } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { hasPerm } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { Pagination } from '../components/Pagination'

function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10)
}

const emptyForm = { amount: '', reason: '' }

export default function Retraits({ path }) {
  const { t, fmt } = useI18n()
  const canAdd = hasPerm('retraits', 'add')
  const canDelete = hasPerm('retraits', 'delete')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const limit = 10

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listRetraits({ from, to, page, limit })
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPages(Math.max(1, Math.ceil((data.total || 0) / limit)))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [from, to, page])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.listRetraits({ from, to, page, limit })
      .then(data => {
        if (cancelled) return
        setItems(data.items || [])
        setTotal(data.total || 0)
        setPages(Math.max(1, Math.ceil((data.total || 0) / limit)))
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [from, to, page])

  function closeAllDialogs() {
    closeModal('retrait-modal')
    setDeleteTarget(null)
  }

  function openCreate() {
    closeAllDialogs()
    setForm(emptyForm)
    setError('')
    openModal('retrait-modal')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.createRetrait({ amount: parseFloat(form.amount), reason: form.reason })
      closeModal('retrait-modal')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await api.deleteRetrait(deleteTarget.id)
      setDeleteTarget(null)
      load()
    } catch {}
  }


  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('retraitsPage')}</h2>
        {canAdd && <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newRetrait')}</button>}
      </div>

      {/* Filters */}
      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-3 flex-wrap items-center">
        <div class="flex flex-col">
          <span class="text-xs text-base-content/70 mb-0.5">{t('dateFrom')}</span>
          <input type="date" class="input input-bordered input-sm"
            value={from} onInput={(e) => { setFrom(e.target.value); setPage(1) }} />
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-base-content/70 mb-0.5">{t('dateTo')}</span>
          <input type="date" class="input input-bordered input-sm"
            value={to} onInput={(e) => { setTo(e.target.value); setPage(1) }} />
        </div>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto">
        <table class="table table-sm w-full">
          <thead class="bg-base-200/60">
            <tr>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{t('date')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{t('retraitAmount')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('retraitReason')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('email')}</th>
              {canDelete && <th class="px-3 py-2.5 w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} class="py-10 text-center">
                <span class="loading loading-spinner loading-md text-primary" />
              </td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={5} class="px-3 py-12 text-center text-base-content/50 text-sm">{t('noRetraits')}</td></tr>
            )}
            {!loading && items.map((r) => (
              <tr key={r.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                <td class="px-3 py-2.5 text-sm whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td class="px-3 py-2.5 text-end font-mono font-semibold">{fmt(r.amount)}</td>
                <td class="px-3 py-2.5 text-sm text-base-content/80 max-w-xs truncate">{r.reason || '—'}</td>
                <td class="px-3 py-2.5 text-sm text-base-content/70">{r.user_email}</td>
                {canDelete && (
                  <td class="px-3 py-2.5 text-end">
                    <div class="tooltip tooltip-left" data-tip={t('delete')}>
                      <button class="btn btn-sm btn-ghost btn-square text-error" onClick={() => setDeleteTarget(r)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Pagination page={page} pages={pages} total={total} limit={limit} onPageChange={setPage} />

      {/* Add modal */}
      <Modal id="retrait-modal" title={t('newRetrait')}>
        {error && <div class="alert alert-error text-sm py-2 mb-3"><span>{error}</span></div>}
        <form onSubmit={handleSubmit} class="space-y-3">
          <label class="form-control">
            <span class="label-text text-sm">{t('retraitAmount')}</span>
            <input type="number" step="0.01" min="0.01" class="input input-bordered input-sm" value={form.amount} required
              onInput={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label class="form-control">
            <span class="label-text text-sm">{t('retraitReason')}</span>
            <textarea class="textarea textarea-bordered textarea-sm" rows={2} value={form.reason}
              onInput={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>
          <div class="modal-action">
            <button type="submit" class={`btn btn-primary btn-sm ${saving ? 'loading' : ''}`} disabled={saving}>
              {t('newRetrait')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div class="modal modal-open">
          <div class="modal-box max-w-sm">
            <p class="text-sm mb-4">{t('deleteRetrait')}</p>
            <p class="font-semibold mb-4">{fmt(deleteTarget.amount)} — {deleteTarget.reason || '—'}</p>
            <div class="modal-action">
              <button class="btn btn-sm btn-ghost" onClick={() => setDeleteTarget(null)}>{t('back')}</button>
              <button class="btn btn-sm btn-error" onClick={handleDelete}>{t('delete')}</button>
            </div>
          </div>
          <div class="modal-backdrop" onClick={() => setDeleteTarget(null)} />
        </div>
      )}
    </Layout>
  )
}
