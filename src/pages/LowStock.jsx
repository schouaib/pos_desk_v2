import { useState, useEffect } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

const LIMIT = 10

export default function LowStock({ path }) {
  const { t } = useI18n()

  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await api.listLowStockProducts({ q, page, limit: LIMIT })
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [q, page])

  function doSearch() { setPage(1); setQ(qInput) }

  const start = total === 0 ? 0 : (page - 1) * LIMIT + 1
  const end = Math.min(page * LIMIT, total)

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('lowStockAlert')}</h2>
        {total > 0 && <span class="badge badge-error">{total} {t('productsPage')}</span>}
      </div>

      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-3 flex-wrap items-center">
        <div class="flex flex-col flex-1 min-w-40">
          <span class="text-xs text-base-content/70 mb-0.5">{t('search')}</span>
          <input class="input input-bordered input-sm" placeholder={t('searchProducts')} value={qInput}
            onInput={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        </div>
        <button class="btn btn-sm btn-primary btn-outline self-end" onClick={doSearch}>{t('search')}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('productName')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('ref')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{t('qtyAvailable')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{t('qtyMin')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{t('deficit')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} class="py-10 text-center"><span class="loading loading-spinner loading-md text-primary" /></td></tr>
              )}
              {!loading && items.map((p) => {
                const deficit = p.qty_min - p.qty_available
                return (
                  <tr key={p.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                    <td class="px-3 py-2.5">
                      <div class="font-medium">{p.name}</div>
                      {p.barcodes?.length > 0 && (
                        <div class="text-xs text-base-content/70">{p.barcodes.slice(0, 2).join(', ')}</div>
                      )}
                    </td>
                    <td class="px-3 py-2.5 text-sm">{p.ref || '—'}</td>
                    <td class="px-3 py-2.5 text-end font-mono text-sm">
                      <span class={p.qty_available <= 0 ? 'text-error font-bold' : 'text-warning font-semibold'}>
                        {p.qty_available}
                      </span>
                    </td>
                    <td class="px-3 py-2.5 text-end font-mono text-sm">{p.qty_min}</td>
                    <td class="px-3 py-2.5 text-end font-mono text-sm text-error font-semibold">
                      {deficit > 0 ? `-${deficit}` : '0'}
                    </td>
                  </tr>
                )
              })}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} class="py-12 text-center">
                    <div class="flex flex-col items-center gap-2 text-success">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                      </svg>
                      <p class="text-sm">{t('noLowStock')}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > 0 && (
        <div class="flex items-center justify-between mt-4 text-sm">
          <span class="text-base-content/80">{t('showing')} {start}–{end} {t('of')} {total}</span>
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
                  ? <button key={`d${i}`} class="join-item btn btn-sm btn-disabled">…</button>
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
