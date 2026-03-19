import { useState, useEffect, useCallback } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { hasPerm } from '../lib/auth'

const LIMIT = 15

export default function ExpiringBatches({ path }) {
  const { t } = useI18n()

  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(30)
  const [daysInput, setDaysInput] = useState(30)
  const canDelete = hasPerm('products', 'delete')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listExpiringBatchesPaginated({ days, page, limit: LIMIT })
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [days, page])

  useEffect(() => { load() }, [load])

  function applyDays() { setPage(1); setDays(daysInput) }

  async function handleDelete(id) {
    try { await api.deleteBatch(id); load() } catch {}
  }

  const now = new Date()
  function daysUntil(dateStr) {
    if (!dateStr) return null
    const d = new Date(dateStr)
    return Math.ceil((d - now) / (1000 * 60 * 60 * 24))
  }

  function expiryBadge(dateStr) {
    const d = daysUntil(dateStr)
    if (d === null) return null
    if (d < 0) return <span class="badge badge-error badge-sm">{t('expired')}</span>
    if (d === 0) return <span class="badge badge-error badge-sm">{t('expiresToday')}</span>
    if (d <= 7) return <span class="badge badge-warning badge-sm">{d}d</span>
    return <span class="badge badge-info badge-sm">{d}d</span>
  }

  const start = total === 0 ? 0 : (page - 1) * LIMIT + 1
  const end = Math.min(page * LIMIT, total)

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('expiring')}</h2>
        {total > 0 && <span class="badge badge-warning badge-lg">{total}</span>}
      </div>

      {/* Filter bar */}
      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-2 flex-wrap items-end">
        <label class="form-control">
          <span class="label-text text-xs">{t('expiryAlertDays')}</span>
          <div class="flex gap-1">
            <input type="number" min="0" step="1" class="input input-bordered input-sm w-20"
              value={daysInput}
              onInput={(e) => setDaysInput(parseInt(e.target.value) || 0)}
              onKeyDown={(e) => e.key === 'Enter' && applyDays()} />
            <button class="btn btn-sm btn-primary btn-outline" onClick={applyDays}>{t('search')}</button>
          </div>
        </label>
        <div class="flex gap-1">
          {[0, 7, 15, 30, 60, 90].map(d => (
            <button key={d} class={`btn btn-xs ${days === d ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setDaysInput(d); setPage(1); setDays(d) }}>
              {d === 0 ? t('expired') : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('productName')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('batchNumber')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('expiryDate')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('qty')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('prixAchat')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50"></th>
                {canDelete && <th class="px-3 py-2.5"></th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={canDelete ? 7 : 6} class="py-10 text-center"><span class="loading loading-spinner loading-md text-primary" /></td></tr>
              )}
              {!loading && items.map((b) => (
                <tr key={b.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                  <td class="px-3 py-2.5 font-medium">{b.product_name}</td>
                  <td class="px-3 py-2.5 font-mono text-sm">{b.batch_number}</td>
                  <td class="px-3 py-2.5 text-sm">
                    {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : '—'}
                  </td>
                  <td class="px-3 py-2.5 text-end font-mono text-sm">{b.qty}</td>
                  <td class="px-3 py-2.5 text-end font-mono text-sm">{b.prix_achat}</td>
                  <td class="px-3 py-2.5">{expiryBadge(b.expiry_date)}</td>
                  {canDelete && (
                    <td class="px-3 py-2.5">
                      <button class="btn btn-xs btn-ghost text-error" onClick={() => handleDelete(b.id)}>✕</button>
                    </td>
                  )}
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={canDelete ? 7 : 6} class="py-12 text-center">
                    <div class="flex flex-col items-center gap-2 text-success">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                      </svg>
                      <p class="text-sm">{t('noExpiring')}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div class="flex items-center justify-between mt-4 text-sm">
          <span class="text-base-content/60">{t('showing')} {start}–{end} {t('of')} {total}</span>
          <div class="join">
            <button class="join-item btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>«</button>
            {(() => {
              const btns = []
              const wing = 2
              let s = Math.max(1, page - wing)
              let e = Math.min(pages, page + wing)
              if (s > 1) { btns.push(1); if (s > 2) btns.push('...') }
              for (let i = s; i <= e; i++) btns.push(i)
              if (e < pages) { if (e < pages - 1) btns.push('...'); btns.push(pages) }
              return btns.map((b, i) =>
                b === '...'
                  ? <button key={`d${i}`} class="join-item btn btn-sm btn-disabled">...</button>
                  : <button key={b} class={`join-item btn btn-sm ${b === page ? 'btn-active' : ''}`} onClick={() => setPage(b)}>{b}</button>
              )
            })()}
            <button class="join-item btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>»</button>
          </div>
        </div>
      )}
    </Layout>
  )
}
