import { useState, useEffect, useCallback } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { hasPerm } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { printInvoice, printHtml } from '../lib/invoicePrint'

const DOC_TYPES = ['bc', 'devis', 'facture', 'avoir']
const STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'unpaid', 'partial', 'paid', 'cancelled']
const LIMIT = 15

const STATUS_BADGE = {
  draft: 'badge-ghost', sent: 'badge-info', accepted: 'badge-success', rejected: 'badge-error',
  unpaid: 'badge-warning', partial: 'badge-warning', paid: 'badge-success', cancelled: 'badge-ghost',
}

const DOC_LABEL = { bc: 'bonCommande', devis: 'devis', facture: 'facture', avoir: 'avoir' }
const STATUS_LABEL = {
  draft: 'docDraft', sent: 'docSent', accepted: 'docAccepted', rejected: 'docRejected',
  unpaid: 'docUnpaid', partial: 'docPartial', paid: 'docPaid', cancelled: 'docCancelled',
}

function defaultFrom() {
  const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10)
}
function defaultTo() { return new Date().toISOString().slice(0, 10) }

export default function Facturation({ path }) {
  const { t, lang } = useI18n()
  const canAdd = hasPerm('facturation', 'add')
  const canEdit = hasPerm('facturation', 'edit')
  const canDelete = hasPerm('facturation', 'delete')
  const canAvoir = hasPerm('facturation', 'avoir')

  // List state
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [q, setQ] = useState('')

  // Detail state
  const [detail, setDetail] = useState(null)

  // Avoir state
  const [avoirTarget, setAvoirTarget] = useState(null)
  const [avoirLines, setAvoirLines] = useState([])
  const [avoirNote, setAvoirNote] = useState('')
  const [avoirLoading, setAvoirLoading] = useState(false)
  const [avoirError, setAvoirError] = useState('')

  // Pay state
  const [payTarget, setPayTarget] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payPayMethod, setPayPayMethod] = useState('cash')
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState('')

  // Convert state
  const [convertTarget, setConvertTarget] = useState(null)
  const [convertPayMethod, setConvertPayMethod] = useState('cash')
  const [convertLoading, setConvertLoading] = useState(false)

  // Lookups
  const [store, setStore] = useState({})

  useEffect(() => {
    api.getStoreSettings().then((d) => setStore(d)).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: LIMIT, date_from: from, date_to: to }
      if (tab) params.doc_type = tab
      if (statusFilter) params.status = statusFilter
      if (q) params.q = q
      const res = await api.listFacturation(params)
      setItems(res.items || [])
      setTotal(res.total || 0)
      setPages(res.pages || 1)
    } catch {}
    setLoading(false)
  }, [page, tab, statusFilter, from, to, q])

  useEffect(() => { load() }, [load])

  async function handleDelete(doc) {
    if (!confirm(`${t('delete')} ${doc.ref}?`)) return
    try { await api.deleteFacturationDoc(doc.id); load() } catch (err) { alert(err.message) }
  }

  function openConvertModal(doc) {
    setConvertTarget(doc)
    setConvertPayMethod('cash')
    openModal('convert-modal')
  }

  async function handleConvert() {
    if (!convertTarget) return
    setConvertLoading(true)
    try {
      await api.convertFacturationDoc(convertTarget.id, { payment_method: convertPayMethod })
      closeModal('convert-modal')
      setConvertTarget(null)
      load()
    } catch (err) { alert(err.message) }
    setConvertLoading(false)
  }

  async function handleStatusChange(doc, newStatus) {
    try { await api.updateFacturationStatus(doc.id, { status: newStatus }); load() } catch {}
  }

  function printPaymentReceipt(doc, payment, index) {
    const pmLabels = { cash: t('payMethod_cash'), cheque: t('payMethod_cheque'), virement: t('payMethod_virement') }
    const dateStr = payment.created_at ? new Date(payment.created_at).toLocaleDateString(lang === 'ar' ? 'ar-DZ' : 'fr-DZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
    const timeStr = payment.created_at ? new Date(payment.created_at).toLocaleTimeString(lang === 'ar' ? 'ar-DZ' : 'fr-DZ', { hour: '2-digit', minute: '2-digit' }) : ''
    const dir = lang === 'ar' ? 'rtl' : 'ltr'
    const accent = store.brand_color || '#1a56db'

    const html = `<!DOCTYPE html>
<html dir="${dir}"><head><meta charset="UTF-8">
<title>${t('paymentReceipt')} - ${doc.ref}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',system-ui,sans-serif; font-size:12px; color:#1e293b; background:#e2e8f0; direction:${dir}; }
  .page { width:210mm; margin:0 auto; background:#fff; padding:24px 32px; box-shadow:0 4px 24px rgba(0,0,0,.1); }
  .header { border-bottom:3px solid ${accent}; padding-bottom:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-start; }
  .title { font-size:20px; font-weight:800; color:${accent}; text-transform:uppercase; letter-spacing:1px; }
  .store-name { font-size:14px; font-weight:700; }
  .meta { font-size:11px; color:#64748b; }
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; }
  .info-box { padding:14px 16px; border-radius:8px; font-size:11px; line-height:1.7; }
  .info-from { background:#f8fafc; border:1px solid #e2e8f0; }
  .info-to { background:${accent}08; border:1px solid ${accent}25; }
  .info-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:#94a3b8; margin-bottom:6px; }
  .info-to .info-label { color:${accent}; }
  .info-name { font-size:13px; font-weight:700; margin-bottom:2px; }
  .amount-box { text-align:center; padding:24px; margin:20px 0; border-radius:12px; background:linear-gradient(135deg,${accent},${accent}dd); }
  .amount-label { font-size:12px; color:rgba(255,255,255,.8); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
  .amount-value { font-size:32px; font-weight:800; color:#fff; font-variant-numeric:tabular-nums; }
  .details { margin:20px 0; }
  .detail-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f1f5f9; font-size:12px; }
  .detail-row .label { color:#64748b; }
  .detail-row .value { font-weight:600; font-variant-numeric:tabular-nums; }
  .timbre-row .value { color:#d97706; }
  .signature { margin-top:40px; display:flex; justify-content:space-between; }
  .sig-box { width:45%; text-align:center; }
  .sig-line { border-top:1px solid #cbd5e1; margin-top:50px; padding-top:6px; font-size:10px; color:#94a3b8; }
  @media print { body { background:#fff; } .page { box-shadow:none; } }
  @page { size:A4; margin:15mm; }
</style></head><body>
<div class="page">
  <div class="header">
    <div>
      <div class="title">${lang === 'ar' ? 'وصل دفع' : lang === 'en' ? 'PAYMENT RECEIPT' : 'REÇU DE PAIEMENT'}</div>
      <div class="meta">${lang === 'ar' ? 'رقم' : 'N°'} ${doc.ref}-V${index + 1} — ${dateStr} ${timeStr}</div>
    </div>
    <div style="text-align:${lang === 'ar' ? 'left' : 'right'}">
      <div class="store-name">${store.name || ''}</div>
      <div class="meta">${store.address || ''}</div>
      <div class="meta">${store.phone || ''}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-box info-from">
      <div class="info-label">${lang === 'ar' ? 'من' : 'De'}</div>
      <div class="info-name">${store.name || ''}</div>
      ${store.rc ? `<div>RC: ${store.rc}</div>` : ''}
      ${store.nif ? `<div>NIF: ${store.nif}</div>` : ''}
    </div>
    <div class="info-box info-to">
      <div class="info-label">${lang === 'ar' ? 'العميل' : 'Client'}</div>
      <div class="info-name">${doc.client_name || ''}</div>
    </div>
  </div>
  <div class="amount-box">
    <div class="amount-label">${lang === 'ar' ? 'المبلغ المدفوع' : lang === 'en' ? 'Amount Paid' : 'Montant payé'}</div>
    <div class="amount-value">${new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2 }).format(payment.amount)} ${store.currency || 'DA'}</div>
  </div>
  <div class="details">
    <div class="detail-row"><span class="label">${lang === 'ar' ? 'رقم الفاتورة' : 'Facture N°'}</span><span class="value">${doc.ref}</span></div>
    <div class="detail-row"><span class="label">${t('totalTTC')}</span><span class="value">${formatDA(doc.total)}</span></div>
    <div class="detail-row"><span class="label">${t('blPaymentMethod')}</span><span class="value">${pmLabels[payment.payment_method] || payment.payment_method}</span></div>
    ${payment.timbre > 0 ? `<div class="detail-row timbre-row"><span class="label">${t('timbreFiscal')}</span><span class="value">${formatDA(payment.timbre)}</span></div>` : ''}
    <div class="detail-row"><span class="label">${t('paidAmount')}</span><span class="value">${formatDA(doc.paid_amount)}</span></div>
    <div class="detail-row"><span class="label"><strong>${t('remaining')}</strong></span><span class="value"><strong>${formatDA(doc.total - doc.paid_amount)}</strong></span></div>
    ${payment.note ? `<div class="detail-row"><span class="label">${t('note')}</span><span class="value">${payment.note}</span></div>` : ''}
  </div>
  <div class="signature">
    <div class="sig-box"><div class="sig-line">${lang === 'ar' ? 'ختم وتوقيع البائع' : 'Cachet et signature vendeur'}</div></div>
    <div class="sig-box"><div class="sig-line">${lang === 'ar' ? 'توقيع العميل' : 'Signature client'}</div></div>
  </div>
</div>
</body></html>`

    printHtml(html)
  }

  async function handlePrint(doc) {
    // Fetch client details for legal info
    let client = null
    if (doc.client_id) {
      try { client = await api.getClient(doc.client_id) } catch {}
    }

    const docTitle = doc.doc_type === 'bc' ? (lang === 'ar' ? 'طلب شراء' : lang === 'en' ? 'PURCHASE ORDER' : 'BON DE COMMANDE')
      : doc.doc_type === 'devis' ? (lang === 'ar' ? 'عرض أسعار' : lang === 'en' ? 'QUOTE' : 'DEVIS')
      : doc.doc_type === 'avoir' ? (lang === 'ar' ? 'إشعار دائن' : lang === 'en' ? 'CREDIT NOTE' : 'AVOIR')
      : (lang === 'ar' ? 'فاتورة' : lang === 'en' ? 'INVOICE' : 'FACTURE')

    // Payment method label
    const pmLabels = { cash: t('payMethod_cash'), cheque: t('payMethod_cheque'), virement: t('payMethod_virement') }
    const pmLabel = pmLabels[doc.payment_method] || ''

    // Adapt facturation doc to printInvoice format
    const sale = {
      id: doc.id,
      ref: doc.ref,
      number: doc.ref.split('-').pop(),
      lines: doc.lines,
      total_ht: doc.total_ht,
      total_vat: doc.total_vat,
      total: doc.total,
      timbre: doc.timbre || 0,
      amount_paid: doc.paid_amount || 0,
      change: 0,
      cashier_email: doc.created_by_email,
      payment_method: doc.payment_method || '',
      created_at: doc.created_at,
    }

    printInvoice({
      store,
      sale,
      client,
      lang,
      labels: {
        title: docTitle,
        invoiceNum: doc.ref,
        date: t('date'),
        dueDate: doc.due_date ? t('dueDate') : undefined,
        cashier: t('createdBy'),
        paymentMethod: pmLabel ? `${t('blPaymentMethod')}: ${pmLabel}` : undefined,
        billedTo: lang === 'ar' ? 'العميل' : lang === 'en' ? 'Billed To' : 'Facturé à',
        from: lang === 'ar' ? 'من' : lang === 'en' ? 'From' : 'De',
        colDesignation: t('product'),
        colQty: t('qty'),
        colUnitHT: lang === 'ar' ? 'س.و قبل الضريبة' : 'P.U HT',
        colDiscount: t('discount'),
        colTotalHT: t('totalHT'),
        colVAT: t('tva') + ' %',
        colTotalTTC: t('totalTTC'),
        subtotalHT: t('totalHT'),
        vat: t('tva'),
        totalTTC: t('totalTTC'),
        timbre: t('timbreFiscal'),
        paid: t('paidAmount'),
        amountDue: t('remaining'),
        stampSignature: lang === 'ar' ? 'الختم والتوقيع' : lang === 'en' ? 'Stamp & Signature' : 'Cachet et signature',
        thankYou: lang === 'ar' ? 'شكراً لثقتكم' : lang === 'en' ? 'Thank you for your business' : 'Merci pour votre confiance',
      },
    })
  }

  // Avoir
  function openAvoirModal(doc) {
    setAvoirTarget(doc)
    setAvoirLines(doc.lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id || '', qty: 0, max: l.qty, name: l.product_name })))
    setAvoirNote(''); setAvoirError('')
    openModal('avoir-modal')
  }

  async function submitAvoir(e) {
    e.preventDefault()
    setAvoirLoading(true); setAvoirError('')
    try {
      const lines = avoirLines.filter((l) => l.qty > 0).map((l) => ({
        product_id: l.product_id, variant_id: l.variant_id, qty: l.qty,
      }))
      if (lines.length === 0) { setAvoirError('Select at least one line'); setAvoirLoading(false); return }
      await api.createAvoir(avoirTarget.id, { lines, note: avoirNote })
      closeModal('avoir-modal'); load()
    } catch (err) { setAvoirError(err.message) }
    setAvoirLoading(false)
  }

  // Pay
  function openPayModal(doc) {
    setPayTarget(doc); setPayAmount(''); setPayNote(''); setPayPayMethod(doc.payment_method || 'cash'); setPayError('')
    openModal('pay-modal')
  }

  async function submitPay(e) {
    e.preventDefault()
    setPayLoading(true); setPayError('')
    try {
      await api.payFacture(payTarget.id, { amount: parseFloat(payAmount), payment_method: payTarget.payment_method || 'cash', note: payNote })
      closeModal('pay-modal'); load()
    } catch (err) { setPayError(err.message) }
    setPayLoading(false)
  }

  function formatDA(n) { return new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2 }).format(n) + ' DA' }
  function formatDate(d) { return d ? new Date(d).toLocaleDateString(lang === 'ar' ? 'ar-DZ' : 'fr-DZ') : '—' }

  const docTypeLabel = (dt) => t(DOC_LABEL[dt] || dt)
  const statusLabel = (s) => t(STATUS_LABEL[s] || s)

  return (
    <Layout currentPath={path}>
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
        <h1 class="text-2xl font-bold">{t('facturationPage')}</h1>
      </div>

      {/* Tabs */}
      <div class="tabs tabs-boxed mb-3 bg-base-200 p-1 rounded-lg">
        <button class={`tab tab-sm ${tab === '' ? 'tab-active' : ''}`} onClick={() => { setTab(''); setPage(1) }}>{t('allDocTypes')}</button>
        {DOC_TYPES.map((dt) => (
          <button key={dt} class={`tab tab-sm ${tab === dt ? 'tab-active' : ''}`} onClick={() => { setTab(dt); setPage(1) }}>{docTypeLabel(dt)}</button>
        ))}
      </div>

      {/* Filters */}
      <div class="flex flex-wrap gap-2 mb-3 items-end">
        <input type="text" class="input input-bordered input-sm w-48" placeholder={t('search')} value={q} onInput={(e) => { setQ(e.target.value); setPage(1) }} />
        <select class="select select-bordered select-sm" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">{t('allStatuses')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <input type="date" class="input input-bordered input-sm" value={from} onInput={(e) => { setFrom(e.target.value); setPage(1) }} />
        <input type="date" class="input input-bordered input-sm" value={to} onInput={(e) => { setTo(e.target.value); setPage(1) }} />
      </div>

      {/* Table */}
      <div class="overflow-x-auto bg-base-100 rounded-lg border border-base-300">
        <table class="table table-sm">
          <thead>
            <tr class="bg-base-200/60">
              <th class="px-3 py-2.5">{t('ref')}</th>
              <th class="px-3 py-2.5">{t('type')}</th>
              <th class="px-3 py-2.5">{t('clientName')}</th>
              <th class="px-3 py-2.5 text-right">{t('total')}</th>
              <th class="px-3 py-2.5">{t('status')}</th>
              <th class="px-3 py-2.5">{t('date')}</th>
              <th class="px-3 py-2.5">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((doc) => (
              <tr key={doc.id} class="hover cursor-pointer" onClick={() => setDetail(doc)}>
                <td class="px-3 py-2 font-mono text-xs">{doc.ref}</td>
                <td class="px-3 py-2"><span class="badge badge-xs badge-outline">{docTypeLabel(doc.doc_type)}</span></td>
                <td class="px-3 py-2 text-sm">{doc.client_name}</td>
                <td class="px-3 py-2 text-right font-mono text-sm">{formatDA(doc.total)}</td>
                <td class="px-3 py-2"><span class={`badge badge-xs ${STATUS_BADGE[doc.status]}`}>{statusLabel(doc.status)}</span></td>
                <td class="px-3 py-2 text-xs">{formatDate(doc.created_at)}</td>
                <td class="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <div class="flex gap-1 flex-wrap">
                    {/* Convert to facture */}
                    {canAdd && (doc.doc_type === 'bc' || doc.doc_type === 'devis') && doc.status !== 'rejected' && (
                      <button class="btn btn-xs btn-primary btn-ghost border border-primary" onClick={() => openConvertModal(doc)}>{t('convertToFacture')}</button>
                    )}
                    {/* Status changes for devis */}
                    {canEdit && doc.doc_type === 'devis' && doc.status === 'draft' && (
                      <button class="btn btn-xs btn-info btn-ghost border border-info" onClick={() => handleStatusChange(doc, 'sent')}>{t('docSent')}</button>
                    )}
                    {canEdit && doc.doc_type === 'devis' && (doc.status === 'draft' || doc.status === 'sent') && (
                      <>
                        <button class="btn btn-xs btn-success btn-ghost border border-success" onClick={() => handleStatusChange(doc, 'accepted')}>{t('docAccepted')}</button>
                        <button class="btn btn-xs btn-error btn-ghost border border-error" onClick={() => handleStatusChange(doc, 'rejected')}>{t('docRejected')}</button>
                      </>
                    )}
                    {/* Avoir on facture */}
                    {canAvoir && doc.doc_type === 'facture' && (
                      <button class="btn btn-xs btn-warning btn-ghost border border-warning" onClick={() => openAvoirModal(doc)}>{t('avoir')}</button>
                    )}
                    {/* Pay facture */}
                    {canEdit && doc.doc_type === 'facture' && doc.status !== 'paid' && (
                      <button class="btn btn-xs btn-success btn-ghost border border-success" onClick={() => openPayModal(doc)}>{t('recordPayment')}</button>
                    )}
                    {/* Delete (draft only) */}
                    {/* Print */}
                    <button class="btn btn-xs btn-ghost border border-base-300" onClick={() => handlePrint(doc)}>{t('print')}</button>
                    {canDelete && doc.status === 'draft' && (
                      <button class="btn btn-xs btn-error btn-ghost border border-error" onClick={() => handleDelete(doc)}>{t('delete')}</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr><td colSpan={7} class="text-center py-8 text-base-content/70">{t('noResults')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div class="flex justify-center gap-1 mt-3">
          <button class="btn btn-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>&laquo;</button>
          <span class="btn btn-xs btn-ghost">{page} / {pages}</span>
          <button class="btn btn-xs" disabled={page >= pages} onClick={() => setPage(page + 1)}>&raquo;</button>
        </div>
      )}

      {/* Detail Panel */}
      {detail && (
        <div class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div class="bg-base-100 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header band */}
            <div class={`px-6 py-4 rounded-t-2xl flex items-center justify-between ${
              detail.doc_type === 'avoir' ? 'bg-warning/10 border-b-2 border-warning/30' :
              detail.doc_type === 'facture' ? 'bg-primary/10 border-b-2 border-primary/30' :
              detail.doc_type === 'devis' ? 'bg-secondary/10 border-b-2 border-secondary/30' :
              'bg-info/10 border-b-2 border-info/30'
            }`}>
              <div>
                <div class="flex items-center gap-3">
                  <h2 class="text-xl font-bold font-mono">{detail.ref}</h2>
                  <span class={`badge ${STATUS_BADGE[detail.status]}`}>{statusLabel(detail.status)}</span>
                </div>
                <p class="text-sm text-base-content/70 mt-0.5">{docTypeLabel(detail.doc_type)} — {formatDate(detail.created_at)}</p>
              </div>
              <button class="btn btn-sm btn-circle btn-ghost" onClick={() => setDetail(null)}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div class="p-6">
              {/* Info cards */}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                {/* Client card */}
                <div class="bg-base-200/50 rounded-xl p-4 border border-base-300/50">
                  <p class="text-xs font-semibold uppercase tracking-wide text-base-content/70 mb-2">{t('clientName')}</p>
                  <p class="font-semibold text-sm">{detail.client_name}</p>
                  {detail.payment_method && (
                    <div class="mt-2 flex items-center gap-1.5">
                      <span class={`badge badge-sm ${detail.payment_method === 'cash' ? 'badge-warning' : detail.payment_method === 'cheque' ? 'badge-info' : 'badge-secondary'}`}>
                        {t('payMethod_' + detail.payment_method)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Status/links card */}
                <div class="bg-base-200/50 rounded-xl p-4 border border-base-300/50 space-y-1.5 text-xs">
                  {detail.due_date && <div class="flex justify-between"><span class="text-base-content/70">{t('dueDate')}</span><span class="font-medium">{formatDate(detail.due_date)}</span></div>}
                  {detail.valid_until && <div class="flex justify-between"><span class="text-base-content/70">{t('validUntil')}</span><span class="font-medium">{formatDate(detail.valid_until)}</span></div>}
                  {detail.payment_terms && <div class="flex justify-between"><span class="text-base-content/70">{t('paymentTerms')}</span><span class="font-medium">{detail.payment_terms}</span></div>}
                  {detail.parent_ref && <div class="flex justify-between"><span class="text-base-content/70">{t('parentDoc')}</span><span class="font-mono font-medium">{detail.parent_ref}</span></div>}
                  {detail.sale_ref && <div class="flex justify-between"><span class="text-base-content/70">{t('linkedSale')}</span><span class="font-mono font-medium">{detail.sale_ref}</span></div>}
                  {detail.created_by_email && <div class="flex justify-between"><span class="text-base-content/70">{t('createdBy')}</span><span class="font-medium">{detail.created_by_email}</span></div>}
                </div>
              </div>

              {/* Payment progress bar (facture only) */}
              {detail.doc_type === 'facture' && (
                <div class="mb-5 bg-base-200/50 rounded-xl p-4 border border-base-300/50">
                  <div class="flex justify-between text-xs mb-2">
                    <span class="text-base-content/70">{t('paidAmount')}: <span class="font-semibold text-success">{formatDA(detail.paid_amount)}</span></span>
                    <span class="text-base-content/70">{t('remaining')}: <span class="font-semibold text-error">{formatDA(detail.total - detail.paid_amount)}</span></span>
                  </div>
                  <div class="w-full bg-base-300 rounded-full h-2.5">
                    <div class={`h-2.5 rounded-full transition-all ${detail.status === 'paid' ? 'bg-success' : 'bg-primary'}`}
                      style={{ width: `${Math.min(100, (detail.paid_amount / detail.total) * 100)}%` }} />
                  </div>
                  {(detail.timbre ?? 0) > 0 && (
                    <div class="flex justify-end mt-2">
                      <span class="text-xs text-warning font-medium">{t('timbreFiscal')}: {formatDA(detail.timbre)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Lines table */}
              <div class="overflow-x-auto rounded-xl border border-base-300/50 mb-4">
                <table class="table table-sm w-full">
                  <thead>
                    <tr class="bg-base-200/60">
                      <th class="text-xs font-semibold uppercase tracking-wide text-base-content/70">#</th>
                      <th class="text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('product')}</th>
                      <th class="text-xs font-semibold uppercase tracking-wide text-base-content/70 text-right">{t('qty')}</th>
                      <th class="text-xs font-semibold uppercase tracking-wide text-base-content/70 text-right">{t('unitPrice')}</th>
                      <th class="text-xs font-semibold uppercase tracking-wide text-base-content/70 text-right">{t('discount')}</th>
                      <th class="text-xs font-semibold uppercase tracking-wide text-base-content/70 text-right">{t('vat')}</th>
                      <th class="text-xs font-semibold uppercase tracking-wide text-base-content/70 text-right">{t('totalTTC')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l, i) => (
                      <tr key={i} class={i % 2 === 0 ? '' : 'bg-base-200/20'}>
                        <td class="text-xs text-base-content/50">{i + 1}</td>
                        <td class="font-medium text-sm">{l.product_name}</td>
                        <td class="text-right font-mono text-sm">{l.qty}</td>
                        <td class="text-right font-mono text-sm">{formatDA(l.unit_price)}</td>
                        <td class="text-right font-mono text-sm text-error">{l.discount > 0 ? formatDA(l.discount) : <span class="text-base-content/50">—</span>}</td>
                        <td class="text-right"><span class="badge badge-xs badge-outline">{l.vat}%</span></td>
                        <td class="text-right font-mono text-sm font-semibold">{formatDA(l.total_ttc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div class="flex justify-end mb-4">
                <div class="bg-base-200/50 rounded-xl border border-base-300/50 p-4 min-w-[280px]">
                  <div class="flex justify-between text-sm py-1"><span class="text-base-content/80">{t('totalHT')}</span><span class="font-mono">{formatDA(detail.total_ht)}</span></div>
                  <div class="flex justify-between text-sm py-1"><span class="text-base-content/80">{t('tva')}</span><span class="font-mono">{formatDA(detail.total_vat)}</span></div>
                  <div class="divider my-1" />
                  {(detail.timbre ?? 0) > 0 && (
                    <div class="flex justify-between text-sm py-1"><span class="text-warning">{t('timbreFiscal')}</span><span class="font-mono text-warning">{formatDA(detail.timbre)}</span></div>
                  )}
                  <div class="flex justify-between text-base font-bold py-1"><span>{t('totalTTC')}</span><span class="font-mono">{formatDA(detail.total)}</span></div>
                </div>
              </div>

              {/* Payments history */}
              {detail.payments?.length > 0 && (
                <div class="mb-4">
                  <h4 class="text-xs font-bold uppercase tracking-widest text-base-content/70 mb-2">{t('paymentHistory')}</h4>
                  <div class="space-y-1.5">
                    {detail.payments.map((p, i) => (
                      <div key={i} class="flex items-center gap-2 text-xs bg-success/5 border border-success/15 rounded-lg px-3 py-2">
                        <span class="font-mono font-bold text-success text-sm">{formatDA(p.amount)}</span>
                        <span class={`badge badge-xs ${p.payment_method === 'cash' ? 'badge-warning' : 'badge-info'}`}>{t('payMethod_' + p.payment_method)}</span>
                        {p.timbre > 0 && <span class="badge badge-xs badge-warning badge-outline">{t('timbreFiscal')}: {formatDA(p.timbre)}</span>}
                        <span class="text-base-content/70 ms-auto">{formatDate(p.created_at)}</span>
                        {p.note && <span class="text-base-content/70 italic">{p.note}</span>}
                        <button class="btn btn-xs btn-ghost border border-base-300" onClick={() => printPaymentReceipt(detail, p, i)}>
                          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Note */}
              {detail.note && (
                <div class="bg-base-200/30 rounded-lg px-4 py-3 mb-4 border border-base-300/30">
                  <p class="text-xs text-base-content/70 font-semibold uppercase tracking-wide mb-1">{t('note')}</p>
                  <p class="text-sm text-base-content/80">{detail.note}</p>
                </div>
              )}

              {/* Action buttons */}
              <div class="flex justify-end gap-2">
                {canEdit && detail.doc_type === 'facture' && detail.status !== 'paid' && (
                  <button class="btn btn-sm btn-success gap-1" onClick={() => { setDetail(null); openPayModal(detail) }}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                    {t('recordPayment')}
                  </button>
                )}
                {canAvoir && detail.doc_type === 'facture' && (
                  <button class="btn btn-sm btn-warning btn-outline gap-1" onClick={() => { setDetail(null); openAvoirModal(detail) }}>
                    {t('avoir')}
                  </button>
                )}
                <button class="btn btn-sm btn-primary gap-1" onClick={() => handlePrint(detail)}>
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
                  {t('print')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {/* Avoir Modal */}
      <Modal id="avoir-modal" title={`${t('newAvoir')} — ${avoirTarget?.ref || ''}`}>
        {avoirError && <div class="alert alert-error text-sm py-2 mb-3"><span>{avoirError}</span></div>}
        <form onSubmit={submitAvoir}>
          <p class="text-sm text-base-content/80 mb-3">{t('selectProducts')}</p>
          {avoirLines.map((l, i) => (
            <div key={i} class="flex items-center gap-2 mb-1">
              <span class="text-sm flex-1">{l.name}</span>
              <span class="text-xs text-base-content/70">max: {l.max}</span>
              <input type="number" class="input input-bordered input-xs w-20" min="0" max={l.max} step="any" value={l.qty}
                onInput={(e) => {
                  const v = Math.min(parseFloat(e.target.value) || 0, l.max)
                  setAvoirLines((prev) => prev.map((al, idx) => idx === i ? { ...al, qty: v } : al))
                }} />
            </div>
          ))}
          <div class="form-control mt-3">
            <label class="label"><span class="label-text text-xs">{t('note')}</span></label>
            <textarea class="textarea textarea-bordered textarea-sm" value={avoirNote} onInput={(e) => setAvoirNote(e.target.value)} rows={2} />
          </div>
          <div class="modal-action">
            <button type="submit" class={`btn btn-warning btn-sm ${avoirLoading ? 'loading' : ''}`} disabled={avoirLoading}>{t('create')}</button>
          </div>
        </form>
      </Modal>

      {/* Pay Modal */}
      <Modal id="pay-modal" title={`${t('recordPayment')} — ${payTarget?.ref || ''}`}>
        {payError && <div class="alert alert-error text-sm py-2 mb-3"><span>{payError}</span></div>}
        {payTarget && (
          <form onSubmit={submitPay}>
            <div class="text-sm mb-3">
              <span class="text-base-content/80">{t('remaining')}: </span>
              <span class="font-semibold">{formatDA(payTarget.total - payTarget.paid_amount)}</span>
            </div>
            {/* Payment method (locked to facture's method) */}
            <div class="form-control mb-3">
              <label class="label"><span class="label-text text-xs">{t('blPaymentMethod')}</span></label>
              <div class="btn btn-sm btn-primary no-animation cursor-default w-full">{t('payMethod_' + (payTarget.payment_method || 'cash'))}</div>
            </div>
            <div class="form-control mb-3">
              <label class="label"><span class="label-text">{t('amount')}</span></label>
              <input type="number" class="input input-bordered input-sm" min="0.01" step="any"
                max={payTarget.total - payTarget.paid_amount} value={payAmount}
                onInput={(e) => setPayAmount(e.target.value)} required />
            </div>
            {(payTarget.payment_method || 'cash') === 'cash' && parseFloat(payAmount) > 300 && (
              <div class="flex justify-between items-center px-2 py-1.5 mb-2 rounded bg-warning/10 text-warning text-sm">
                <span>{t('timbreFiscal')}</span>
                <span class="font-mono">{(() => {
                  const amt = parseFloat(payAmount) || 0
                  if (amt <= 300) return '0.00'
                  const tr = Math.ceil(amt / 100)
                  const rate = amt <= 30000 ? 1 : amt <= 100000 ? 1.5 : 2
                  return Math.max(5, Math.round(tr * rate * 100) / 100).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })
                })()}</span>
              </div>
            )}
            <div class="form-control mb-3">
              <label class="label"><span class="label-text text-xs">{t('note')}</span></label>
              <textarea class="textarea textarea-bordered textarea-sm" value={payNote} onInput={(e) => setPayNote(e.target.value)} rows={2} />
            </div>
            <div class="modal-action">
              <button type="submit" class={`btn btn-success btn-sm ${payLoading ? 'loading' : ''}`} disabled={payLoading}>{t('recordPayment')}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Convert Modal — select payment method */}
      <Modal id="convert-modal" title={`${t('convertToFacture')} — ${convertTarget?.ref || ''}`}>
        <p class="text-sm text-base-content/80 mb-4">{t('blPaymentMethod')}</p>
        <div class="flex flex-col gap-2 mb-4">
          {['cash', 'cheque', 'virement'].map((m) => (
            <button
              key={m}
              class={`btn ${convertPayMethod === m ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setConvertPayMethod(m)}
            >
              {t('payMethod_' + m)}
            </button>
          ))}
        </div>
        <div class="modal-action">
          <button class="btn btn-ghost btn-sm" onClick={() => closeModal('convert-modal')}>{t('cancel')}</button>
          <button
            class={`btn btn-primary btn-sm ${convertLoading ? 'loading' : ''}`}
            disabled={convertLoading}
            onClick={handleConvert}
          >
            {t('convertToFacture')}
          </button>
        </div>
      </Modal>
    </Layout>
  )
}
