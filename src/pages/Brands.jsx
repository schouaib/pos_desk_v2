import { useState, useEffect, useCallback } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { hasPerm } from '../lib/auth'

export default function Brands({ path }) {
  const { t } = useI18n()
  const canAdd    = hasPerm('brands', 'add')
  const canEdit   = hasPerm('brands', 'edit')
  const canDelete = hasPerm('brands', 'delete')
  const canWrite  = canAdd || canEdit || canDelete

  const [result, setResult] = useState({ items: [], total: 0, page: 1, limit: 10, pages: 1 })
  const [page, setPage] = useState(1)
  const [filterQ, setFilterQ] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [form, setForm] = useState({ name: '' })
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await api.listBrandsPage({ q: searchQ, page, limit: 10 })
      setResult(data)
    } catch {}
  }, [searchQ, page])

  useEffect(() => {
    let cancelled = false
    api.listBrandsPage({ q: searchQ, page, limit: 10 })
      .then(data => { if (!cancelled) setResult(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [searchQ, page])

  function doSearch() { setPage(1); setSearchQ(filterQ) }

  function openCreate() {
    setEditing(null); setForm({ name: '' }); setError(''); openModal('brand-modal')
  }

  function openEdit(item) {
    setEditing(item); setForm({ name: item.name }); setError(''); openModal('brand-modal')
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (editing) await api.updateBrand(editing.id, form)
      else await api.createBrand(form)
      closeModal('brand-modal'); load()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try { await api.deleteBrand(deleteTarget.id); setDeleteTarget(null); closeModal('brand-delete-modal'); load() } catch {}
  }

  const { items, pages } = result

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('brandsPage')}</h2>
        {canAdd && <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newBrand')}</button>}
      </div>

      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-3 flex-wrap items-center">
        <div class="flex flex-col flex-1 max-w-xs">
          <span class="text-xs text-base-content/70 mb-0.5">{t('search')}</span>
          <input class="input input-bordered input-sm" placeholder={t('search')}
            value={filterQ} onInput={(e) => setFilterQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        </div>
        <button class="btn btn-sm btn-primary btn-outline self-end" onClick={doSearch}>{t('search')}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('brandName')}</th>
                {canWrite && <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 w-24">{t('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                  <td class="px-3 py-2.5 font-medium">{item.name}</td>
                  {canWrite && (
                    <td class="px-3 py-2.5">
                      <div class="flex gap-1">
                        {canEdit && (
                          <div class="tooltip tooltip-left" data-tip={t('edit')}>
                            <button class="btn btn-sm btn-ghost btn-square" onClick={() => openEdit(item)}>
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                              </svg>
                            </button>
                          </div>
                        )}
                        {canDelete && (
                          <div class="tooltip tooltip-left" data-tip={t('delete')}>
                            <button class="btn btn-sm btn-ghost btn-square text-error" onClick={() => { setDeleteTarget(item); openModal('brand-delete-modal') }}>
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={canWrite ? 2 : 1} class="px-3 py-12 text-center">
                    <div class="flex flex-col items-center gap-2 text-base-content/50">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" />
                      </svg>
                      <p class="text-sm">{t('noBrands')}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div class="flex items-center justify-between px-4 py-3 border-t border-base-200 bg-base-50">
            <span class="text-xs text-base-content/70">{page} / {pages}</span>
            <div class="join">
              <button class="join-item btn btn-sm btn-ghost border border-base-300" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              <button class="join-item btn btn-sm btn-ghost border border-base-300" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      <Modal id="brand-modal" title={editing ? t('editBrand') : t('newBrand')}>
        {error && <div class="alert alert-error text-sm py-2 mb-3"><span>{error}</span></div>}
        <form onSubmit={handleSubmit} class="space-y-3">
          <label class="form-control">
            <span class="label-text text-sm">{t('brandName')}</span>
            <input class="input input-bordered input-sm" value={form.name} required onInput={(e) => setForm({ name: e.target.value })} />
          </label>
          <div class="modal-action">
            <button type="submit" class={`btn btn-primary btn-sm ${loading ? 'loading' : ''}`} disabled={loading}>
              {editing ? t('saveChanges') : t('newBrand')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal id="brand-delete-modal" title={t('deleteBrand')}>
        <p class="text-sm mb-4 font-medium">{deleteTarget?.name}</p>
        <div class="modal-action">
          <button class="btn btn-error btn-sm" onClick={confirmDelete}>{t('delete')}</button>
          <button class="btn btn-ghost btn-sm" onClick={() => closeModal('brand-delete-modal')}>{t('back')}</button>
        </div>
      </Modal>
    </Layout>
  )
}
