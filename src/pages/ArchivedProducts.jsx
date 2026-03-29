import { useState, useEffect } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { hasPerm } from '../lib/auth'

const LIMIT = 10

export default function ArchivedProducts({ path }) {
  const { t } = useI18n()
  const canArchive = hasPerm('products', 'archive')

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
      const data = await api.listArchivedProducts({ q, page, limit: LIMIT })
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

  async function handleUnarchive(p) {
    try { await api.unarchiveProduct(p.id); load() } catch {}
  }

  const start = total === 0 ? 0 : (page - 1) * LIMIT + 1
  const end = Math.min(page * LIMIT, total)

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('archivedProducts')}</h2>
        {total > 0 && <span class="badge badge-warning">{total} {t('archived')}</span>}
      </div>

      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-2 flex-wrap">
        <input class="input input-bordered input-sm flex-1 min-w-40"
          placeholder={t('searchProducts')} value={qInput}
          onInput={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        <button class="btn btn-sm btn-primary btn-outline" onClick={doSearch}>{t('search')}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('productName')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('ref')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('qtyAvailable')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('prixVente1')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('archiveDate')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 w-28">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} class="py-10 text-center"><span class="loading loading-spinner loading-md text-primary" /></td></tr>
              )}
              {!loading && items.map((p) => (
                <tr key={p.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                  <td class="px-3 py-2.5">
                    <div class="font-medium">{p.name}</div>
                    {p.barcodes?.length > 0 && (
                      <div class="text-xs text-base-content/70">{p.barcodes.slice(0, 2).join(', ')}</div>
                    )}
                  </td>
                  <td class="px-3 py-2.5 text-sm">{p.ref || '—'}</td>
                  <td class="px-3 py-2.5 text-sm">
                    {p.is_service ? <span class="badge badge-outline badge-xs">{t('isService')}</span> : p.qty_available}
                  </td>
                  <td class="px-3 py-2.5 text-sm">{p.prix_vente_1}</td>
                  <td class="px-3 py-2.5 text-xs text-base-content/70">
                    {p.archived_at ? new Date(p.archived_at).toLocaleDateString() : '—'}
                  </td>
                  <td class="px-3 py-2.5">
                    {canArchive && (
                      <button class="btn btn-xs btn-success btn-outline" onClick={() => handleUnarchive(p)}>{t('unarchive')}</button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} class="py-12 text-center">
                    <div class="flex flex-col items-center gap-2 text-base-content/50">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                      <p class="text-sm">{t('noArchivedProducts')}</p>
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
