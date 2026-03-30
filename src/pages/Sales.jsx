import { useState, useEffect, useCallback } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { hasPerm, hasFeature, isTenantAdmin } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { buildReceipt } from '../lib/escpos'
import { printBytes, getConnection } from '../lib/webusbPrint'
import { printBL } from '../lib/blPrint'
import { printInvoice } from '../lib/invoicePrint'
import { printReceipt } from '../lib/receiptPrint'

function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10)
}

export default function Sales({ path }) {
  const { t, lang } = useI18n()
  const showEarnings = hasPerm('sales', 'earnings')
  const canReturn = hasPerm('sales', 'return')

  const [items, setItems]   = useState([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [pages, setPages]   = useState(1)
  const [from, setFrom]     = useState(defaultFrom)
  const [to, setTo]         = useState(defaultTo)
  const [loading, setLoading] = useState(false)
  const [detailSale, setDetailSale] = useState(null) // sale shown in detail dialog
  const [searchRef, setSearchRef] = useState('')
  const [printingId, setPrintingId] = useState(null)
  const [store, setStore] = useState({})
  // Sale return
  const [returnTarget, setReturnTarget] = useState(null)
  const [returnLines, setReturnLines] = useState([])
  const [returnLoading, setReturnLoading] = useState(false)
  const [returnError, setReturnError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.getStoreSettings().then((d) => { if (!cancelled) setStore(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function handlePrintReceipt(e, s) {
    e.stopPropagation()
    let client = null
    if (s.client_id) {
      try { client = await api.getClient(s.client_id) } catch {}
    }
    printReceipt({
      store,
      sale: s,
      client,
      lang,
      labels: {
        date:       t('receiptDate'),
        cashier:    t('receiptCashier'),
        subtotalHT: t('receiptSubtotalHT'),
        vat:        t('receiptVAT'),
        totalTTC:   t('receiptTotalTTC'),
        paid:       t('receiptPaid'),
        change:     t('receiptChange'),
        discount:   t('receiptDiscount'),
        thanks:     t('receiptThanks'),
      },
    })
  }

  async function handlePrintBL(e, s) {
    e.stopPropagation()
    let client = null
    if (s.client_id) {
      try { client = await api.getClient(s.client_id) } catch {}
    }
    printBL({
      store,
      sale: s,
      client,
      lang,
      labels: {
        title:           t('blTitle'),
        colDesignation:  t('blColDesignation'),
        colQty:          t('blColQty'),
        colUnitHT:       t('blColUnitHT'),
        colDiscount:     t('blColDiscount'),
        colTotalHT:      t('blColTotalHT'),
        colVAT:          t('blColVAT'),
        colTotalTTC:     t('blColTotalTTC'),
        subtotalHT:      t('receiptSubtotalHT'),
        vat:             t('receiptVAT'),
        totalTTC:        t('receiptTotalTTC'),
        paid:            t('receiptPaid'),
        change:          t('receiptChange'),
        cashier:         t('receiptCashier'),
        date:            t('receiptDate'),
        signatureSeller: t('blSignatureSeller'),
        signatureClient: t('blSignatureClient'),
        datePlace:       t('blDatePlace'),
        itemsCount:      t('blItemsCount'),
        paymentMethod:   t('blPaymentMethod'),
      },
    })
  }

  async function handlePrintInvoice(e, s) {
    e.stopPropagation()
    let client = null
    if (s.client_id) {
      try { client = await api.getClient(s.client_id) } catch {}
    }
    printInvoice({
      store,
      sale: s,
      client,
      lang,
      labels: {
        title:           t('invoiceTitle'),
        invoiceNum:      t('invoiceNum'),
        from:            t('invoiceFrom'),
        billedTo:        t('invoiceBilledTo'),
        colDesignation:  t('blColDesignation'),
        colQty:          t('blColQty'),
        colUnitHT:       t('blColUnitHT'),
        colDiscount:     t('blColDiscount'),
        colTotalHT:      t('blColTotalHT'),
        colVAT:          t('blColVAT'),
        colTotalTTC:     t('blColTotalTTC'),
        subtotalHT:      t('receiptSubtotalHT'),
        vat:             t('receiptVAT'),
        totalTTC:        t('receiptTotalTTC'),
        paid:            t('receiptPaid'),
        change:          t('receiptChange'),
        cashier:         t('receiptCashier'),
        date:            t('receiptDate'),
        amountDue:       t('invoiceAmountDue'),
        amountWords:     t('invoiceAmountWords'),
        stampSignature:  t('invoiceStampSignature'),
        thankYou:        t('invoiceThankYou'),
        itemsCount:      t('blItemsCount'),
        paymentMethod:   t('blPaymentMethod'),
        page:            t('invoicePage'),
      },
    })
  }

  async function handlePrint(e, s) {
    e.stopPropagation()
    if (!getConnection()) return
    setPrintingId(s.id)
    try {
      const bytes = buildReceipt({
        store,
        sale: s,
        labels: {
          date:       t('receiptDate'),
          cashier:    t('receiptCashier'),
          subtotalHT: t('receiptSubtotalHT'),
          vat:        t('receiptVAT'),
          totalTTC:   t('receiptTotalTTC'),
          paid:       t('receiptPaid'),
          change:     t('receiptChange'),
          discount:   t('receiptDiscount'),
          thanks:     t('receiptThanks'),
        },
      })
      await printBytes(bytes)
    } catch {}
    finally { setPrintingId(null) }
  }

  function openReturn(s) {
    setReturnTarget(s)
    setReturnLines((s.lines || []).filter(l => l.qty > 0).map(l => ({ product_id: l.product_id, product_name: l.product_name, max_qty: l.qty, qty: 0, reason: '' })))
    setReturnError('')
    document.getElementById('return-dialog')?.showModal()
  }

  async function handleReturn(e) {
    e.preventDefault()
    const lines = returnLines.filter(l => l.qty > 0).map(l => ({ product_id: l.product_id, qty: l.qty, reason: l.reason }))
    if (lines.length === 0) { setReturnError(t('noReturnQty')); return }
    setReturnLoading(true)
    setReturnError('')
    try {
      await api.createSaleReturn(returnTarget.id, { lines })
      document.getElementById('return-dialog')?.close()
      load()
    } catch (err) { setReturnError(err.message) }
    finally { setReturnLoading(false) }
  }

  const limit = 10

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { from, to, page, limit }
      if (searchRef.trim()) params.ref = searchRef.trim()
      const data = await api.listSales(params)
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPages(Math.max(1, Math.ceil((data.total || 0) / limit)))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [from, to, page, searchRef])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = { from, to, page, limit }
    if (searchRef.trim()) params.ref = searchRef.trim()
    api.listSales(params)
      .then(data => {
        if (cancelled) return
        setItems(data.items || [])
        setTotal(data.total || 0)
        setPages(Math.max(1, Math.ceil((data.total || 0) / limit)))
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [from, to, page, searchRef])

  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end   = Math.min(page * limit, total)

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('salesPage')}</h2>
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
        <div class="flex flex-col">
          <span class="text-xs text-base-content/70 mb-0.5">{t('ref')}</span>
          <input type="text" class="input input-bordered input-sm w-44" placeholder={t('searchByRef')}
            value={searchRef} onInput={(e) => { setSearchRef(e.target.value); setPage(1) }} />
        </div>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
        <table class="table table-sm w-full">
          <thead class="bg-base-200/60">
            <tr>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('ref')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{t('saleDate')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('saleCashier')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-center">{t('saleItems')}</th>
              {store.use_vat_sale && <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{t('saleTotalHT')}</th>}
              {store.use_vat_sale && <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{t('saleTotalVAT')}</th>}
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{store.use_vat_sale ? t('saleTotalTTC') : t('purchaseTotal')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{t('saleAmountPaid')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{t('saleChange')}</th>
              {showEarnings && <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-success text-end">{t('saleEarning')}</th>}
              <th class="px-3 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={(showEarnings ? 10 : 9) - (store.use_vat_sale ? 0 : 2)} class="py-10 text-center">
                  <span class="loading loading-spinner loading-md text-primary" />
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={(showEarnings ? 10 : 9) - (store.use_vat_sale ? 0 : 2)} class="py-12 text-center">
                  <div class="flex flex-col items-center gap-2 text-base-content/50">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                    </svg>
                    <p class="text-sm">{t('noSales')}</p>
                  </div>
                </td>
              </tr>
            )}
            {!loading && items.map((s) => (
              <tr key={s.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                  <td class="px-3 py-2.5 font-mono text-xs text-base-content/80">{s.ref || '—'}</td>
                  <td class="px-3 py-2.5 text-sm whitespace-nowrap">
                    {new Date(s.created_at).toLocaleDateString()}{' '}
                    <span class="text-base-content/70 text-xs">
                      {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {s.total < 0 && <span class="badge badge-xs badge-error ms-1.5">{t('return')}</span>}
                  </td>
                  <td class="px-3 py-2.5 text-sm text-base-content/80">
                    {s.cashier_email}
                    {s.client_name && (
                      <span class="block text-xs text-primary/70 font-medium">{s.client_name}</span>
                    )}
                    {s.sale_type === 'credit' && (
                      <span class="badge badge-xs badge-warning ms-0">{t('creditSale')}</span>
                    )}
                  </td>
                  <td class="px-3 py-2.5 text-center">
                    <span class="badge badge-sm badge-ghost">{s.lines?.length || 0}</span>
                  </td>
                  {store.use_vat_sale && <td class="px-3 py-2.5 text-end font-mono text-sm">{s.total_ht.toFixed(2)}</td>}
                  {store.use_vat_sale && <td class="px-3 py-2.5 text-end font-mono text-sm text-warning">{s.total_vat.toFixed(2)}</td>}
                  <td class="px-3 py-2.5 text-end font-mono text-sm font-semibold text-primary">{s.total.toFixed(2)}</td>
                  <td class="px-3 py-2.5 text-end font-mono text-sm">{s.amount_paid.toFixed(2)}</td>
                  <td class="px-3 py-2.5 text-end font-mono text-sm text-success">{s.change.toFixed(2)}</td>
                  {showEarnings && <td class="px-3 py-2.5 text-end font-mono text-sm font-semibold text-success">{(s.total_earning ?? 0).toFixed(2)}</td>}
                  <td class="px-3 py-2.5 text-end">
                    <div class="flex items-center justify-end gap-1">
                      <button
                        class="btn btn-sm btn-ghost btn-square"
                        title={t('viewSale')}
                        onClick={() => { setDetailSale(s); document.getElementById('detail-dialog')?.showModal() }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                      <button
                        class="btn btn-sm btn-ghost btn-square"
                        title={t('printReceipt')}
                        onClick={(e) => handlePrintReceipt(e, s)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                        </svg>
                      </button>
                      <button
                        class="btn btn-sm btn-ghost btn-square"
                        title={t('printBL')}
                        onClick={(e) => handlePrintBL(e, s)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      </button>
                      {s.has_facture && (
                      <button
                        class="btn btn-sm btn-ghost btn-square"
                        title={t('printInvoice')}
                        onClick={(e) => handlePrintInvoice(e, s)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      </button>
                      )}
                      {getConnection() && (
                        <button
                          class={`btn btn-sm btn-ghost btn-square ${printingId === s.id ? 'loading' : ''}`}
                          title={t('printReceipt')}
                          onClick={(e) => handlePrint(e, s)}
                          disabled={!!printingId}
                        >
                          {printingId !== s.id && (
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                            </svg>
                          )}
                        </button>
                      )}
                      {hasFeature('dvr') && isTenantAdmin() && (
                        <button
                          class="btn btn-sm btn-ghost btn-square"
                          title={t('watchClip') || 'Watch Clip'}
                          onClick={(e) => { e.stopPropagation(); window.open(`/dvr-events?ref=${s.ref}`, '_self') }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div class="flex items-center justify-between mt-4 text-sm">
          <span class="text-base-content/80">{t('showing')} {start}–{end} {t('of')} {total}</span>
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
      {/* Sale Detail dialog */}
      <dialog id="detail-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box w-full sm:max-w-2xl">
          <h3 class="font-bold text-lg mb-1">{t('saleDetail')}</h3>
          {detailSale && (
            <>
              <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-base-content/80 mb-3">
                <span><b>{t('ref')}:</b> {detailSale.ref || '—'}</span>
                <span><b>{t('saleDate')}:</b> {new Date(detailSale.created_at).toLocaleString()}</span>
                <span><b>{t('saleCashier')}:</b> {detailSale.cashier_email}</span>
                {detailSale.client_name && <span><b>{t('clientsPage')}:</b> {detailSale.client_name}</span>}
              </div>
              <div class="overflow-x-auto">
                <table class="table table-xs w-full">
                  <thead>
                    <tr>
                      <th>{t('productName')}</th>
                      <th class="text-center">{t('qty')}</th>
                      <th class="text-end">{t('prixVente1')}</th>
                      <th class="text-end">{t('discount')}</th>
                      <th class="text-end">{t('htLabel')}</th>
                      <th class="text-end">{t('ttcLabel')}</th>
                      {showEarnings && <th class="text-end text-success">{t('lineEarning')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(detailSale.lines || []).map((l, i) => (
                      <tr key={i}>
                        <td>
                          <div class="text-xs font-medium">{l.product_name}</div>
                          {l.barcode && <div class="text-xs text-base-content/70">{l.barcode}</div>}
                        </td>
                        <td class="text-center font-mono text-xs">{l.qty}</td>
                        <td class="text-end font-mono text-xs">{l.unit_price.toFixed(2)}</td>
                        <td class="text-end font-mono text-xs">
                          {l.discount > 0 ? `-${l.discount.toFixed(2)}` : '—'}
                        </td>
                        <td class="text-end font-mono text-xs">{l.total_ht.toFixed(2)}</td>
                        <td class="text-end font-mono text-xs font-medium">{l.total_ttc.toFixed(2)}</td>
                        {showEarnings && <td class="text-end font-mono text-xs font-semibold text-success">{(l.line_earning ?? 0).toFixed(2)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div class="divider my-2"></div>
              <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm font-mono">
                {store.use_vat_sale && <span>{t('saleTotalHT')}: <b>{detailSale.total_ht.toFixed(2)}</b></span>}
                {store.use_vat_sale && <span class="text-warning">{t('saleTotalVAT')}: <b>{detailSale.total_vat.toFixed(2)}</b></span>}
                <span class="text-primary font-semibold">{store.use_vat_sale ? t('saleTotalTTC') : t('purchaseTotal')}: {detailSale.total.toFixed(2)}</span>
                <span>{t('saleAmountPaid')}: {detailSale.amount_paid.toFixed(2)}</span>
                <span class="text-success">{t('saleChange')}: {detailSale.change.toFixed(2)}</span>
                {showEarnings && <span class="text-success font-semibold">{t('saleEarning')}: {(detailSale.total_earning ?? 0).toFixed(2)}</span>}
              </div>
            </>
          )}
          <div class="modal-action">
            {canReturn && detailSale && detailSale.total > 0 && (
              <button class="btn btn-sm btn-warning btn-outline" onClick={() => { document.getElementById('detail-dialog')?.close(); openReturn(detailSale) }}>
                {t('returnSale')}
              </button>
            )}
            <button type="button" class="btn btn-sm" onClick={() => document.getElementById('detail-dialog')?.close()}>{t('back')}</button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Sale Return dialog */}
      <dialog id="return-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box w-full sm:max-w-xl">
          <h3 class="font-bold text-lg mb-1">{t('saleReturns')}</h3>
          <p class="text-sm text-base-content/80 mb-3">{returnTarget?.ref}</p>
          {returnError && <div class="alert alert-error text-sm py-2 mb-3"><span>{returnError}</span></div>}
          <form onSubmit={handleReturn}>
            <table class="table table-sm w-full">
              <thead><tr><th>{t('productName')}</th><th class="w-20">{t('qty')}</th><th class="w-24">{t('returnQty')}</th><th>{t('reason')}</th></tr></thead>
              <tbody>
                {returnLines.map((l, i) => (
                  <tr key={i}>
                    <td class="text-sm">{l.product_name}</td>
                    <td class="text-sm font-mono">{l.max_qty}</td>
                    <td>
                      <input type="number" min="0" max={l.max_qty} step="any" class="input input-bordered input-xs w-20"
                        value={l.qty} onInput={(e) => {
                          const v = Math.min(parseFloat(e.target.value) || 0, l.max_qty)
                          setReturnLines(prev => prev.map((x, j) => j === i ? { ...x, qty: v } : x))
                        }} />
                    </td>
                    <td>
                      <input class="input input-bordered input-xs w-full" value={l.reason}
                        onInput={(e) => setReturnLines(prev => prev.map((x, j) => j === i ? { ...x, reason: e.target.value } : x))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div class="modal-action">
              <button type="button" class="btn btn-sm btn-ghost" onClick={() => document.getElementById('return-dialog')?.close()}>{t('back')}</button>
              <button type="submit" class={`btn btn-warning btn-sm ${returnLoading ? 'loading' : ''}`} disabled={returnLoading}>{t('confirmReturn')}</button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>
    </Layout>
  )
}
