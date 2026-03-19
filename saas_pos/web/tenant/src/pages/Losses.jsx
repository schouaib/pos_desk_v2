import { useState, useEffect, useCallback } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function defaultTo() {
  return new Date().toISOString().slice(0, 10)
}

const TYPE_BADGE = {
  vol:   'badge-error',
  perte: 'badge-warning',
  casse: 'badge-info',
}

export default function Losses({ path }) {
  const { t } = useI18n()

  const [items, setItems]   = useState([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [pages, setPages]   = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom]     = useState(defaultFrom)
  const [to, setTo]         = useState(defaultTo)
  const [loading, setLoading] = useState(false)

  const limit = 10

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listLosses({ search, from, to, page, limit })
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPages(Math.max(1, Math.ceil((data.total || 0) / limit)))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [search, from, to, page])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.listLosses({ search, from, to, page, limit })
      .then(data => {
        if (cancelled) return
        setItems(data.items || [])
        setTotal(data.total || 0)
        setPages(Math.max(1, Math.ceil((data.total || 0) / limit)))
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [search, from, to, page])

  function doSearch() {
    setPage(1)
    setSearch(searchInput)
  }

  function applyDates() {
    setPage(1)
    load()
  }

  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end   = Math.min(page * limit, total)

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('losses')}</h2>
      </div>

      {/* Filters */}
      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-2 flex-wrap items-end">
        <div class="flex-1 min-w-40">
          <input
            class="input input-bordered input-sm w-full"
            placeholder={t('searchProducts')}
            value={searchInput}
            onInput={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
        </div>
        <button class="btn btn-sm btn-primary btn-outline" onClick={doSearch}>{t('search')}</button>

        <label class="form-control">
          <span class="label-text text-xs">{t('dateFrom')}</span>
          <input type="date" class="input input-bordered input-sm" value={from}
            onInput={(e) => { setFrom(e.target.value); setPage(1) }} />
        </label>
        <label class="form-control">
          <span class="label-text text-xs">{t('dateTo')}</span>
          <input type="date" class="input input-bordered input-sm" value={to}
            onInput={(e) => { setTo(e.target.value); setPage(1) }} />
        </label>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto">
        <table class="table table-sm w-full">
          <thead class="bg-base-200/60">
            <tr>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 whitespace-nowrap">{t('lossDate')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('productName')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('barcodes')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('lossType')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('lossQty')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('lossRemark')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} class="py-10 text-center">
                  <span class="loading loading-spinner loading-md text-primary" />
                </td>
              </tr>
            )}
            {!loading && items.map((item) => (
              <tr key={item.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                <td class="px-3 py-2.5 text-sm whitespace-nowrap">
                  {new Date(item.created_at).toLocaleDateString()}{' '}
                  <span class="text-base-content/40 text-xs">
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </td>
                <td class="px-3 py-2.5 font-medium text-sm">{item.product_name}</td>
                <td class="px-3 py-2.5 text-sm text-base-content/60">{item.barcode || '—'}</td>
                <td class="px-3 py-2.5">
                  <span class={`badge badge-xs ${TYPE_BADGE[item.type] || 'badge-ghost'}`}>
                    {t('loss' + item.type.charAt(0).toUpperCase() + item.type.slice(1))}
                  </span>
                </td>
                <td class="px-3 py-2.5 font-mono text-sm text-error">-{item.qty}</td>
                <td class="px-3 py-2.5 text-sm text-base-content/70">{item.remark || '—'}</td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} class="px-3 py-12 text-center">
                  <div class="flex flex-col items-center gap-2 text-base-content/30">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                    </svg>
                    <p class="text-sm">{t('noLosses')}</p>
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
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <button key={p} class={`join-item btn btn-sm ${p === page ? 'btn-active' : ''}`}
                onClick={() => setPage(p)}>{p}</button>
            ))}
            <button class="join-item btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>»</button>
          </div>
        </div>
      )}
    </Layout>
  )
}
