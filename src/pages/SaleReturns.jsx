import { useState, useEffect } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

export default function SaleReturns({ path }) {
  const { t } = useI18n()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const limit = 10

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.listSaleReturns({ from, to, page, limit })
      .then(data => {
        if (cancelled) return
        setItems(data.items || [])
        setTotal(data.total || 0)
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [from, to, page])

  const pages = Math.max(1, Math.ceil(total / limit))

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('saleReturns')}</h2>
      </div>

      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-2 flex-wrap items-end">
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
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('ref')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('originalSale')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('saleDate')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('saleCashier')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('saleTotalTTC')}</th>
                <th class="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} class="py-10 text-center"><span class="loading loading-spinner loading-md text-primary" /></td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} class="py-12 text-center text-base-content/30 text-sm">{t('noReturns')}</td></tr>
              )}
              {!loading && items.map(r => (
                <>
                  <tr key={r.id} class={`border-b border-base-200 cursor-pointer transition-colors ${expanded === r.id ? 'bg-base-200/60' : 'hover:bg-base-50'}`}
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td class="px-3 py-2.5 font-mono text-xs">{r.ref}</td>
                    <td class="px-3 py-2.5 font-mono text-xs text-primary">{r.original_sale_ref}</td>
                    <td class="px-3 py-2.5 text-sm">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td class="px-3 py-2.5 text-sm">{r.cashier_email}</td>
                    <td class="px-3 py-2.5 text-end font-mono text-sm text-error font-semibold">{r.total?.toFixed(2)}</td>
                    <td class="px-3 py-2.5">
                      <svg xmlns="http://www.w3.org/2000/svg"
                        class={`w-3.5 h-3.5 transition-transform duration-200 text-base-content/40 ${expanded === r.id ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr key={`${r.id}-detail`}>
                      <td colSpan={6} class="p-0 bg-base-200">
                        <div class="p-3">
                          <table class="table table-xs w-full bg-base-100 rounded-lg shadow-sm">
                            <thead><tr><th>{t('productName')}</th><th class="text-center">{t('qty')}</th><th class="text-end">HT</th><th class="text-end">TTC</th><th>{t('reason')}</th></tr></thead>
                            <tbody>
                              {(r.lines || []).map((l, i) => (
                                <tr key={i}>
                                  <td class="text-xs font-medium">{l.product_name}</td>
                                  <td class="text-center font-mono text-xs">{l.qty}</td>
                                  <td class="text-end font-mono text-xs">{l.total_ht?.toFixed(2)}</td>
                                  <td class="text-end font-mono text-xs font-medium">{l.total_ttc?.toFixed(2)}</td>
                                  <td class="text-xs text-base-content/60">{l.reason || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {total > 0 && (
        <div class="flex items-center justify-between mt-4 text-sm">
          <span class="text-base-content/60">{t('showing')} {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} {t('of')} {total}</span>
          <div class="join">
            <button class="join-item btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>«</button>
            <button class="join-item btn btn-sm btn-active">{page}</button>
            <button class="join-item btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>»</button>
          </div>
        </div>
      )}
    </Layout>
  )
}
