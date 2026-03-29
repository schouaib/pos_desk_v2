import { useState, useEffect, useCallback } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { hasPerm, hasFeature, authUser } from '../lib/auth'
import { printHtml } from '../lib/invoicePrint'

const emptyForm = { name: '', phone: '', email: '', address: '', rc: '', nif: '', nis: '', nart: '', compte_rib: '' }
const STMT_PAGE_SIZE = 10

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function Clients({ path }) {
  const { t } = useI18n()
  const canAdd      = hasPerm('clients', 'add')
  const canEdit     = hasPerm('clients', 'edit')
  const canDelete   = hasPerm('clients', 'delete')
  const canPayments = hasFeature('client_payments') && hasPerm('clients', 'edit')
  const canViewSales = hasFeature('sales') && hasPerm('sales', 'view')
  const canWrite    = canAdd || canEdit || canDelete

  const [result, setResult]   = useState({ items: [], total: 0, page: 1, limit: 10, pages: 1 })
  const [page, setPage]       = useState(1)
  const [filterQ, setFilterQ] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [form, setForm]       = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [error, setError]     = useState('')

  // Statement modal
  const [stmtTarget, setStmtTarget]       = useState(null)
  const [statement, setStatement]         = useState([])
  const [stmtLoading, setStmtLoading]     = useState(false)
  const [stmtPage, setStmtPage]           = useState(1)
  const [payAmount, setPayAmount]         = useState('')
  const [payNote, setPayNote]             = useState('')
  const [payError, setPayError]           = useState('')
  const [payLoading, setPayLoading]       = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError]   = useState('')

  // Archived
  const [archivedItems, setArchivedItems] = useState([])
  const [archivedTotal, setArchivedTotal] = useState(0)
  const [showArchived, setShowArchived]   = useState(false)

  // Sales history modal
  const [salesTarget, setSalesTarget]     = useState(null)
  const [salesResult, setSalesResult]     = useState({ items: [], total: 0 })
  const [salesPage, setSalesPage]         = useState(1)
  const [salesFrom, setSalesFrom]         = useState(today())
  const [salesTo, setSalesTo]             = useState(today())
  const [salesDraftFrom, setSalesDraftFrom] = useState(today())
  const [salesDraftTo, setSalesDraftTo]   = useState(today())
  const [salesLoading, setSalesLoading]   = useState(false)
  const [expandedSale, setExpandedSale]   = useState(null)
  const [selectedSales, setSelectedSales]         = useState(new Set())
  const [saleLinesToPrint, setSaleLinesToPrint]   = useState(new Set())

  const load = useCallback(async () => {
    try {
      const data = await api.listClients({ q: searchQ, page, limit: 10 })
      setResult(data)
    } catch {}
  }, [searchQ, page])

  useEffect(() => {
    let cancelled = false
    api.listClients({ q: searchQ, page, limit: 10 })
      .then(data => { if (!cancelled) setResult(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [searchQ, page])


  function doSearch() {
    setPage(1)
    setSearchQ(filterQ)
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    openModal('client-modal')
  }

  function openEdit(c) {
    setEditing(c)
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', rc: c.rc || '', nif: c.nif || '', nis: c.nis || '', nart: c.nart || '', compte_rib: c.compte_rib || '' })
    setError('')
    openModal('client-modal')
  }

  async function openStatement(c) {
    setStmtTarget(c)
    setPayAmount('')
    setPayNote('')
    setPayError('')
    setStmtPage(1)
    openModal('stmt-modal')
    await loadStatement(c.id)
  }

  async function loadStatement(clientId) {
    setStmtLoading(true)
    try {
      const data = await api.getClientStatement(clientId)
      setStatement(data || [])
    } catch {} finally {
      setStmtLoading(false)
    }
  }

  function openDelete(c) {
    setDeleteTarget(c)
    setDeleteError('')
    openModal('delete-modal')
  }

  async function loadClientSales(clientId, from, to, page) {
    setSalesLoading(true)
    try {
      const data = await api.listClientSales(clientId, { from, to, page, limit: 10 })
      setSalesResult(data)
    } catch {} finally { setSalesLoading(false) }
  }

  function openClientSales(c) {
    setSalesTarget(c)
    setSalesPage(1)
    setExpandedSale(null)
    setSelectedSales(new Set())
    setSaleLinesToPrint(new Set())
    const t0 = today()
    setSalesFrom(t0); setSalesTo(t0)
    setSalesDraftFrom(t0); setSalesDraftTo(t0)
    openModal('client-sales-modal')
    loadClientSales(c.id, t0, t0, 1)
  }

  function applyClientSalesFilter() {
    setSalesPage(1)
    setSelectedSales(new Set())
    setSaleLinesToPrint(new Set())
    setSalesFrom(salesDraftFrom)
    setSalesTo(salesDraftTo)
    loadClientSales(salesTarget.id, salesDraftFrom, salesDraftTo, 1)
  }

  function toggleSaleSelect(id, e) {
    e.stopPropagation()
    setSelectedSales(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSaleLines(id, e) {
    e.stopPropagation()
    setSaleLinesToPrint(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllSales() { setSelectedSales(new Set(salesResult.items.map(s => s.id))) }
  function clearAllSales() { setSelectedSales(new Set()); setSaleLinesToPrint(new Set()) }

  async function handleSave() {
    if (!form.name.trim()) { setError(t('clientName') + ' ' + t('isRequired')); return }
    setError('')
    try {
      if (editing) {
        await api.updateClient(editing.id, form)
      } else {
        await api.createClient(form)
      }
      closeModal('client-modal')
      load()
    } catch (e) { setError(e.message) }
  }

  async function handlePay() {
    const amount = Number(payAmount)
    if (!amount || amount <= 0) { setPayError(t('paymentAmountPos')); return }
    setPayError('')
    setPayLoading(true)
    try {
      await api.addClientPayment(stmtTarget.id, { amount, note: payNote })
      const newBalance = Math.max(0, stmtTarget.balance - amount)
      setStmtTarget((prev) => ({ ...prev, balance: newBalance }))
      // Print receipt
      printClientPaymentReceipt(stmtTarget, amount, payNote, newBalance)
      setPayAmount('')
      setPayNote('')
      setStmtPage(1)
      await loadStatement(stmtTarget.id)
      load()
    } catch (e) { setPayError(e.message) } finally { setPayLoading(false) }
  }

  function printClientPaymentReceipt(client, amount, note, newBalance) {
    const user = authUser.value
    const storeName = user?.tenant_name || ''
    const dir = lang === 'ar' ? 'rtl' : 'ltr'
    const dateStr = new Date().toLocaleDateString(lang === 'ar' ? 'ar-DZ' : 'fr-DZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const timeStr = new Date().toLocaleTimeString(lang === 'ar' ? 'ar-DZ' : 'fr-DZ', { hour: '2-digit', minute: '2-digit' })
    const fmtDA = (n) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2 }).format(n) + ' DA'

    const html = `<!DOCTYPE html>
<html dir="${dir}"><head><meta charset="UTF-8">
<title>${t('paymentReceipt')} - ${client.name}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',system-ui,sans-serif; font-size:12px; color:#1e293b; background:#e2e8f0; direction:${dir}; }
  .page { width:210mm; margin:0 auto; background:#fff; padding:24px 32px; box-shadow:0 4px 24px rgba(0,0,0,.1); }
  .header { border-bottom:3px solid #1a56db; padding-bottom:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-start; }
  .title { font-size:20px; font-weight:800; color:#1a56db; text-transform:uppercase; letter-spacing:1px; }
  .store-name { font-size:14px; font-weight:700; }
  .meta { font-size:11px; color:#64748b; }
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; }
  .info-box { padding:14px 16px; border-radius:8px; font-size:11px; line-height:1.7; }
  .info-from { background:#f8fafc; border:1px solid #e2e8f0; }
  .info-to { background:#1a56db08; border:1px solid #1a56db25; }
  .info-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:#94a3b8; margin-bottom:6px; }
  .info-to .info-label { color:#1a56db; }
  .info-name { font-size:13px; font-weight:700; margin-bottom:2px; }
  .amount-box { text-align:center; padding:24px; margin:20px 0; border-radius:12px; background:linear-gradient(135deg,#1a56db,#1a56dbdd); }
  .amount-label { font-size:12px; color:rgba(255,255,255,.8); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
  .amount-value { font-size:32px; font-weight:800; color:#fff; font-variant-numeric:tabular-nums; }
  .details { margin:20px 0; }
  .detail-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f1f5f9; font-size:12px; }
  .detail-row .label { color:#64748b; }
  .detail-row .value { font-weight:600; font-variant-numeric:tabular-nums; }
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
      <div class="meta">${dateStr} ${timeStr}</div>
    </div>
    <div style="text-align:${lang === 'ar' ? 'left' : 'right'}">
      <div class="store-name">${storeName}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-box info-from">
      <div class="info-label">${lang === 'ar' ? 'من' : 'De'}</div>
      <div class="info-name">${storeName}</div>
    </div>
    <div class="info-box info-to">
      <div class="info-label">${lang === 'ar' ? 'العميل' : 'Client'}</div>
      <div class="info-name">${client.name || ''}</div>
      ${client.code ? `<div>${client.code}</div>` : ''}
      ${client.phone ? `<div>${client.phone}</div>` : ''}
    </div>
  </div>
  <div class="amount-box">
    <div class="amount-label">${lang === 'ar' ? 'المبلغ المدفوع' : lang === 'en' ? 'Amount Paid' : 'Montant payé'}</div>
    <div class="amount-value">${fmtDA(amount)}</div>
  </div>
  <div class="details">
    <div class="detail-row"><span class="label">${lang === 'ar' ? 'الرصيد المتبقي' : lang === 'en' ? 'Remaining Balance' : 'Solde restant'}</span><span class="value">${fmtDA(newBalance)}</span></div>
    ${note ? `<div class="detail-row"><span class="label">${t('note')}</span><span class="value">${note}</span></div>` : ''}
    <div class="detail-row"><span class="label">${lang === 'ar' ? 'بواسطة' : lang === 'en' ? 'By' : 'Par'}</span><span class="value">${user?.email || ''}</span></div>
  </div>
  <div class="signature">
    <div class="sig-box"><div class="sig-line">${lang === 'ar' ? 'ختم وتوقيع البائع' : 'Cachet et signature vendeur'}</div></div>
    <div class="sig-box"><div class="sig-line">${lang === 'ar' ? 'توقيع العميل' : 'Signature client'}</div></div>
  </div>
</div>
</body></html>`

    printHtml(html)
  }

  function printStatement() {
    const client = stmtTarget
    const rows = [...statement].reverse()
    const user = authUser.value
    const storeName = user?.tenant_name || ''
    const storeEmail = user?.email || ''
    const now = new Date()
    const nowStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) +
      ' — ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const tableRows = rows.map((e, i) => {
      const date = new Date(e.date).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }) +
        ' ' + new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const isSale = e.type === 'sale'
      const rowClass = i % 2 === 0 ? '' : 'alt'
      const linesHtml = isSale && e.lines && e.lines.length > 0
        ? `<tr class="lines-row ${rowClass}"><td colspan="6"><div class="lines-list">${
            e.lines.map(l =>
              `<div class="line-item"><span class="line-name">${l.product_name}</span><span class="line-qty">${l.qty} × ${l.unit_price.toFixed(2)}</span><span class="line-ttc">${l.total_ttc.toFixed(2)}</span></div>`
            ).join('')
          }</div></td></tr>`
        : ''
      return `<tr class="${rowClass}">
        <td>${date}</td>
        <td><span class="badge ${isSale ? 'badge-debit' : 'badge-credit'}">${isSale ? t('stmtSale') : t('stmtPayment')}</span></td>
        <td class="mono ref">${e.ref || '—'}</td>
        <td class="mono amt ${isSale ? 'red' : ''}">${isSale ? e.amount.toFixed(2) : ''}</td>
        <td class="mono amt ${!isSale ? 'green' : ''}">${!isSale ? e.amount.toFixed(2) : ''}</td>
        <td class="mono amt bold ${e.balance > 0 ? 'red' : 'green'}">${e.balance.toFixed(2)}</td>
      </tr>${linesHtml}`
    }).join('')

    const balanceColor = client.balance > 0 ? '#dc2626' : '#16a34a'
    const totalSales = rows.filter(e => e.type === 'sale').reduce((s, e) => s + e.amount, 0)
    const totalPayments = rows.filter(e => e.type !== 'sale').reduce((s, e) => s + e.amount, 0)

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${t('clientStatement')} — ${client.name}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }

    /* ── Header ── */
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #1e3a5f; margin-bottom: 20px; }
    .header-left h1 { font-size: 22px; font-weight: 700; color: #1e3a5f; letter-spacing: -.3px; margin-bottom: 2px; }
    .header-left .subtitle { font-size: 11px; color: #6b7280; }
    .header-right { text-align: right; }
    .header-right .store-name { font-size: 14px; font-weight: 700; color: #1e3a5f; }
    .header-right .store-email { font-size: 10px; color: #9ca3af; margin-top: 2px; }

    /* ── Info cards ── */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .info-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; }
    .info-card h3 { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; margin-bottom: 8px; }
    .info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .info-row:last-child { margin-bottom: 0; }
    .info-label { color: #6b7280; font-size: 10px; }
    .info-value { font-weight: 600; font-size: 11px; }
    .info-value.mono { font-family: 'Courier New', monospace; }
    .balance-card { border-color: ${balanceColor}40; background: ${balanceColor}08; }
    .balance-big { font-size: 20px; font-weight: 700; color: ${balanceColor}; font-family: 'Courier New', monospace; text-align: right; }
    .balance-label { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: ${balanceColor}99; margin-bottom: 6px; }

    /* ── Summary row ── */
    .summary { display: flex; gap: 0; margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .summary-item { flex: 1; padding: 10px 14px; text-align: center; border-right: 1px solid #e5e7eb; }
    .summary-item:last-child { border-right: none; }
    .summary-item .s-label { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; margin-bottom: 4px; }
    .summary-item .s-val { font-size: 14px; font-weight: 700; font-family: 'Courier New', monospace; }

    /* ── Table ── */
    .section-title { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: #9ca3af; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1e3a5f; }
    thead th { color: #fff; padding: 7px 8px; font-size: 10px; font-weight: 600; text-align: left; letter-spacing: .03em; }
    thead th.amt { text-align: right; }
    tbody tr { border-bottom: 1px solid #f3f4f6; }
    tbody tr.alt { background: #f9fafb; }
    tbody tr:last-child { border-bottom: none; }
    td { padding: 6px 8px; vertical-align: middle; }
    .ref { color: #6b7280; font-size: 10px; }
    .amt { text-align: right; }
    .mono { font-family: 'Courier New', monospace; }
    .bold { font-weight: 700; }
    .red { color: #dc2626; }
    .green { color: #16a34a; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 99px; font-size: 9px; font-weight: 600; letter-spacing: .03em; }
    .badge-debit { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .badge-credit { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
    .lines-row td { padding: 0 8px 4px 8px; border-bottom: 1px solid #f3f4f6; }
    .lines-list { padding: 4px 0 4px 8px; border-left: 2px solid #e5e7eb; margin-left: 4px; }
    .line-item { display: flex; gap: 8px; align-items: center; font-size: 9.5px; color: #6b7280; padding: 1px 0; }
    .line-name { flex: 1; }
    .line-qty { color: #9ca3af; white-space: nowrap; }
    .line-ttc { font-family: 'Courier New', monospace; color: #374151; white-space: nowrap; }

    /* ── Footer ── */
    .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
    .footer-left { font-size: 9px; color: #d1d5db; }
    .footer-right { font-size: 9px; color: #9ca3af; }

    @media print {
      .no-print { display: none; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>${t('clientStatement')}</h1>
      <div class="subtitle">${t('stmtGeneratedOn')}: ${nowStr}</div>
    </div>
    <div class="header-right">
      ${storeName ? `<div class="store-name">${storeName}</div>` : ''}
      ${storeEmail ? `<div class="store-email">${storeEmail}</div>` : ''}
    </div>
  </div>

  <!-- Info grid -->
  <div class="info-grid">
    <div class="info-card">
      <h3>${t('clientName')}</h3>
      <div class="info-row">
        <span class="info-label">${t('clientName')}</span>
        <span class="info-value">${client.name}</span>
      </div>
      ${client.code ? `<div class="info-row"><span class="info-label">${t('clientCode')}</span><span class="info-value mono">${client.code}</span></div>` : ''}
      ${client.phone ? `<div class="info-row"><span class="info-label">${t('clientPhone')}</span><span class="info-value">${client.phone}</span></div>` : ''}
      ${client.email ? `<div class="info-row"><span class="info-label">${t('clientEmail')}</span><span class="info-value">${client.email}</span></div>` : ''}
      ${client.address ? `<div class="info-row"><span class="info-label">${t('clientAddress')}</span><span class="info-value">${client.address}</span></div>` : ''}
      ${client.rc   ? `<div class="info-row"><span class="info-label">RC</span><span class="info-value mono">${client.rc}</span></div>` : ''}
      ${client.nif  ? `<div class="info-row"><span class="info-label">NIF</span><span class="info-value mono">${client.nif}</span></div>` : ''}
      ${client.nis  ? `<div class="info-row"><span class="info-label">NIS</span><span class="info-value mono">${client.nis}</span></div>` : ''}
      ${client.nart ? `<div class="info-row"><span class="info-label">N° Art.</span><span class="info-value mono">${client.nart}</span></div>` : ''}
      ${client.compte_rib ? `<div class="info-row"><span class="info-label">RIB</span><span class="info-value mono">${client.compte_rib}</span></div>` : ''}
    </div>
    <div class="info-card balance-card">
      <div class="balance-label">${t('outstandingBalance')}</div>
      <div class="balance-big">${client.balance.toFixed(2)}</div>
    </div>
  </div>

  <!-- Summary -->
  <div class="summary">
    <div class="summary-item">
      <div class="s-label">${t('stmtSale')}s</div>
      <div class="s-val red">${totalSales.toFixed(2)}</div>
    </div>
    <div class="summary-item">
      <div class="s-label">${t('stmtPayment')}s</div>
      <div class="s-val green">${totalPayments.toFixed(2)}</div>
    </div>
    <div class="summary-item">
      <div class="s-label">${t('outstandingBalance')}</div>
      <div class="s-val" style="color:${balanceColor}">${client.balance.toFixed(2)}</div>
    </div>
    <div class="summary-item">
      <div class="s-label">Transactions</div>
      <div class="s-val" style="color:#374151">${rows.length}</div>
    </div>
  </div>

  <!-- Ledger -->
  <div class="section-title">${t('clientStatement')}</div>
  <table>
    <thead>
      <tr>
        <th style="width:16%">Date</th>
        <th style="width:12%">${t('stmtType')}</th>
        <th>${t('stmtRef')}</th>
        <th class="amt" style="width:13%">${t('stmtDebit')}</th>
        <th class="amt" style="width:13%">${t('stmtCredit')}</th>
        <th class="amt" style="width:14%">${t('outstandingBalance')}</th>
      </tr>
    </thead>
    <tbody>${tableRows || `<tr><td colspan="6" style="text-align:center;padding:20px;color:#9ca3af">${t('noStatement')}</td></tr>`}</tbody>
  </table>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">${storeName}</div>
    <div class="footer-right">${t('stmtGeneratedOn')}: ${nowStr}</div>
  </div>

  <script>window.onload = function() { window.print() }<\/script>
</body>
</html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
  }

  async function printSales() {
    const client = salesTarget
    const user = authUser.value
    const storeName = user?.tenant_name || ''
    const storeEmail = user?.email || ''
    const now = new Date()
    const nowStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) +
      ' — ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const periodStr = `${salesFrom} → ${salesTo}`

    // Fetch all sales for the period (high limit for print)
    let allSales = []
    try {
      const data = await api.listClientSales(client.id, { from: salesFrom, to: salesTo, page: 1, limit: 500 })
      allSales = (data.items || []).filter(s => selectedSales.has(s.id))
    } catch { return }

    if (allSales.length === 0) return

    const totalTTC = allSales.reduce((s, x) => s + x.total, 0)
    const tableRows = allSales.map((s, i) => {
      const date = new Date(s.created_at).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }) +
        ' ' + new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const rowClass = i % 2 === 0 ? '' : 'alt'
      const linesHtml = saleLinesToPrint.has(s.id) && s.lines && s.lines.length > 0
        ? `<tr class="lines-row ${rowClass}"><td colspan="4"><div class="lines-list">${
            s.lines.map(l =>
              `<div class="line-item"><span class="line-name">${l.product_name}</span><span class="line-qty">${l.qty} × ${l.unit_price.toFixed(2)}</span><span class="line-ttc">${l.total_ttc.toFixed(2)}</span></div>`
            ).join('')
          }</div></td></tr>`
        : ''
      return `<tr class="${rowClass}">
        <td>${date}</td>
        <td class="mono ref">${s.ref}</td>
        <td><span class="badge ${s.sale_type === 'cash' ? 'badge-cash' : 'badge-credit'}">${s.sale_type === 'cash' ? t('cashSale') : t('creditSale')}</span></td>
        <td class="mono amt bold">${s.total.toFixed(2)}</td>
      </tr>${linesHtml}`
    }).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${t('salesHistory')} — ${client.name}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #1e3a5f; margin-bottom: 20px; }
    .header-left h1 { font-size: 22px; font-weight: 700; color: #1e3a5f; letter-spacing: -.3px; margin-bottom: 2px; }
    .header-left .subtitle { font-size: 11px; color: #6b7280; }
    .header-right { text-align: right; }
    .header-right .store-name { font-size: 14px; font-weight: 700; color: #1e3a5f; }
    .header-right .store-email { font-size: 10px; color: #9ca3af; margin-top: 2px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .info-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; }
    .info-card h3 { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; margin-bottom: 8px; }
    .info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .info-row:last-child { margin-bottom: 0; }
    .info-label { color: #6b7280; font-size: 10px; }
    .info-value { font-weight: 600; font-size: 11px; }
    .info-value.mono { font-family: 'Courier New', monospace; }
    .summary { display: flex; gap: 0; margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .summary-item { flex: 1; padding: 10px 14px; text-align: center; border-right: 1px solid #e5e7eb; }
    .summary-item:last-child { border-right: none; }
    .summary-item .s-label { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; margin-bottom: 4px; }
    .summary-item .s-val { font-size: 14px; font-weight: 700; font-family: 'Courier New', monospace; }
    .section-title { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: #9ca3af; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1e3a5f; }
    thead th { color: #fff; padding: 7px 8px; font-size: 10px; font-weight: 600; text-align: left; letter-spacing: .03em; }
    thead th.amt { text-align: right; }
    tbody tr { border-bottom: 1px solid #f3f4f6; }
    tbody tr.alt { background: #f9fafb; }
    tbody tr:last-child { border-bottom: none; }
    td { padding: 6px 8px; vertical-align: middle; }
    tfoot td { padding: 7px 8px; font-weight: 700; border-top: 2px solid #e5e7eb; background: #f9fafb; }
    .ref { color: #6b7280; font-size: 10px; }
    .amt { text-align: right; }
    .mono { font-family: 'Courier New', monospace; }
    .bold { font-weight: 700; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 99px; font-size: 9px; font-weight: 600; }
    .badge-cash { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
    .badge-credit { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
    .lines-row td { padding: 0 8px 4px 8px; border-bottom: 1px solid #f3f4f6; }
    .lines-list { padding: 4px 0 4px 8px; border-left: 2px solid #e5e7eb; margin-left: 4px; }
    .line-item { display: flex; gap: 8px; align-items: center; font-size: 9.5px; color: #6b7280; padding: 1px 0; }
    .line-name { flex: 1; }
    .line-qty { color: #9ca3af; white-space: nowrap; }
    .line-ttc { font-family: 'Courier New', monospace; color: #374151; white-space: nowrap; }
    .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
    .footer-left { font-size: 9px; color: #d1d5db; }
    .footer-right { font-size: 9px; color: #9ca3af; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${t('salesHistory')}</h1>
      <div class="subtitle">${periodStr}</div>
    </div>
    <div class="header-right">
      ${storeName ? `<div class="store-name">${storeName}</div>` : ''}
      ${storeEmail ? `<div class="store-email">${storeEmail}</div>` : ''}
    </div>
  </div>
  <div class="info-grid">
    <div class="info-card">
      <h3>${t('clientName')}</h3>
      <div class="info-row"><span class="info-label">${t('clientName')}</span><span class="info-value">${client.name}</span></div>
      ${client.code ? `<div class="info-row"><span class="info-label">${t('clientCode')}</span><span class="info-value mono">${client.code}</span></div>` : ''}
      ${client.phone ? `<div class="info-row"><span class="info-label">${t('clientPhone')}</span><span class="info-value">${client.phone}</span></div>` : ''}
      ${client.address ? `<div class="info-row"><span class="info-label">${t('clientAddress')}</span><span class="info-value">${client.address}</span></div>` : ''}
      ${client.rc   ? `<div class="info-row"><span class="info-label">RC</span><span class="info-value mono">${client.rc}</span></div>` : ''}
      ${client.nif  ? `<div class="info-row"><span class="info-label">NIF</span><span class="info-value mono">${client.nif}</span></div>` : ''}
      ${client.nis  ? `<div class="info-row"><span class="info-label">NIS</span><span class="info-value mono">${client.nis}</span></div>` : ''}
      ${client.nart ? `<div class="info-row"><span class="info-label">N° Art.</span><span class="info-value mono">${client.nart}</span></div>` : ''}
      ${client.compte_rib ? `<div class="info-row"><span class="info-label">RIB</span><span class="info-value mono">${client.compte_rib}</span></div>` : ''}
    </div>
    <div class="info-card">
      <h3>${t('outstandingBalance')}</h3>
      <div class="info-row"><span class="info-label">${t('outstandingBalance')}</span><span class="info-value mono" style="color:${client.balance > 0 ? '#dc2626' : '#16a34a'}">${client.balance.toFixed(2)}</span></div>
    </div>
  </div>
  <div class="summary">
    <div class="summary-item">
      <div class="s-label">${t('salesHistory')}</div>
      <div class="s-val" style="color:#374151">${allSales.length}</div>
    </div>
    <div class="summary-item">
      <div class="s-label">${t('totalTTC')}</div>
      <div class="s-val" style="color:#1e3a5f">${totalTTC.toFixed(2)}</div>
    </div>
    <div class="summary-item">
      <div class="s-label">${t('cashSale')}</div>
      <div class="s-val" style="color:#16a34a">${allSales.filter(x=>x.sale_type==='cash').reduce((s,x)=>s+x.total,0).toFixed(2)}</div>
    </div>
    <div class="summary-item">
      <div class="s-label">${t('creditSale')}</div>
      <div class="s-val" style="color:#d97706">${allSales.filter(x=>x.sale_type==='credit').reduce((s,x)=>s+x.total,0).toFixed(2)}</div>
    </div>
  </div>
  <div class="section-title">${t('salesHistory')}</div>
  <table>
    <thead>
      <tr>
        <th style="width:22%">Date</th>
        <th style="width:18%">${t('stmtRef')}</th>
        <th style="width:14%">${t('saleType')}</th>
        <th class="amt">${t('totalTTC')}</th>
      </tr>
    </thead>
    <tbody>${tableRows || `<tr><td colspan="4" style="text-align:center;padding:20px;color:#9ca3af">${t('noSales')}</td></tr>`}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="amt">${t('totalTTC')}</td>
        <td class="amt mono">${totalTTC.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">
    <div class="footer-left">${storeName}</div>
    <div class="footer-right">${t('stmtGeneratedOn')}: ${nowStr}</div>
  </div>
  <script>window.onload = function() { window.print() }<\/script>
</body>
</html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  async function confirmDelete() {
    try {
      const res = await api.deleteClient(deleteTarget.id)
      closeModal('delete-modal')
      if (res?.archived) alert(t('client_archived_instead'))
      load()
    } catch (e) {
      setDeleteError(e.message)
    }
  }

  async function loadArchived() {
    try {
      const data = await api.listArchivedClients({ page: 1, limit: 50 })
      setArchivedItems(data.items || [])
      setArchivedTotal(data.total || 0)
    } catch { setArchivedItems([]) }
  }

  async function openArchived() {
    setShowArchived(true)
    await loadArchived()
    document.getElementById('archived-clients-modal')?.showModal()
  }

  async function handleUnarchive(id) {
    try {
      await api.unarchiveClient(id)
      loadArchived()
      load()
    } catch {}
  }

  const { items, pages } = result

  // Newest-first, paginated
  const stmtRows = [...statement].reverse()
  const stmtTotalPages = Math.max(1, Math.ceil(stmtRows.length / STMT_PAGE_SIZE))
  const stmtPageRows = stmtRows.slice((stmtPage - 1) * STMT_PAGE_SIZE, stmtPage * STMT_PAGE_SIZE)

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('clientsPage')}</h2>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-ghost gap-1" onClick={openArchived}>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            {t('showArchived')}
          </button>
          {canAdd && (
            <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newClient')}</button>
          )}
        </div>
      </div>

      {/* Search */}
      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-2">
        <input
          class="input input-bordered input-sm flex-1 max-w-xs"
          placeholder={t('searchClients')}
          value={filterQ}
          onInput={(e) => setFilterQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
        />
        <button class="btn btn-sm btn-primary btn-outline" onClick={doSearch}>{t('search')}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden"><div class="overflow-x-auto">
        <table class="table table-sm w-full">
          <thead class="bg-base-200/60">
            <tr>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{t('clientCode')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{t('clientName')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{t('clientPhone')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{t('clientEmail')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap text-end">{t('outstandingBalance')}</th>
              {canWrite && <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap"></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 6 : 5} class="py-12 text-center">
                  <div class="flex flex-col items-center gap-2 text-base-content/50">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                    <p class="text-sm">{t('noClients')}</p>
                  </div>
                </td>
              </tr>
            )}
            {items.map((c) => (
              <tr key={c.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                <td class="px-3 py-2.5 font-mono text-xs text-base-content/80">{c.code}</td>
                <td class="px-3 py-2.5 font-medium">{c.name}</td>
                <td class="px-3 py-2.5 text-sm">{c.phone || '—'}</td>
                <td class="px-3 py-2.5 text-sm">{c.email || '—'}</td>
                <td class="px-3 py-2.5 text-end">
                  <span class={`font-mono text-sm font-semibold ${c.balance > 0 ? 'text-error' : 'text-success'}`}>
                    {c.balance.toFixed(2)}
                  </span>
                </td>
                {canWrite && (
                  <td class="px-3 py-2.5 text-end">
                    <div class="flex gap-1 justify-end">
                      {canViewSales && (
                        <div class="tooltip tooltip-left" data-tip={t('salesHistory')}>
                          <button class="btn btn-sm btn-ghost btn-square text-secondary" onClick={() => openClientSales(c)}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {canPayments && (
                        <div class="tooltip tooltip-left" data-tip={t('clientStatement')}>
                          <button class="btn btn-sm btn-ghost btn-square text-primary" onClick={() => openStatement(c)}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {canEdit && (
                        <div class="tooltip tooltip-left" data-tip={t('edit')}>
                          <button class="btn btn-sm btn-ghost btn-square" onClick={() => openEdit(c)}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {canDelete && (
                        <div class="tooltip tooltip-left" data-tip={t('deleteClient')}>
                          <button class="btn btn-sm btn-ghost btn-square text-error" onClick={() => openDelete(c)}>
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

      {/* ── Statement Modal ── */}
      <Modal id="stmt-modal" size="xl" title={
        <div>
          <span>{stmtTarget?.name}</span>
          <span class="text-xs font-mono text-base-content/70 ms-2">{stmtTarget?.code}</span>
          <div class={`font-mono font-bold text-sm mt-0.5 ${stmtTarget?.balance > 0 ? 'text-error' : 'text-success'}`}>
            {t('outstandingBalance')}: {stmtTarget?.balance?.toFixed(2)}
          </div>
        </div>
      }>
        {/* Add payment form */}
        {canPayments && (
          <div class="-mx-1 px-4 py-3 bg-base-200 rounded-lg border border-base-300 mb-4">
            <p class="text-xs font-semibold text-base-content/80 mb-2">{t('addPayment')}</p>
            <div class="flex gap-2">
              <label class="form-control flex-1">
                <span class="label-text text-xs">{t('paymentAmountLabel')}</span>
                <input type="number" min="0.01" step="any" class="input input-bordered input-sm"
                  value={payAmount} onInput={(e) => setPayAmount(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePay()} />
              </label>
              <label class="form-control flex-1">
                <span class="label-text text-xs">{t('paymentNote')}</span>
                <input class="input input-bordered input-sm" value={payNote}
                  onInput={(e) => setPayNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePay()} />
              </label>
              <div class="flex items-end pb-0.5">
                <button class="btn btn-primary btn-sm" onClick={handlePay} disabled={payLoading}>
                  {payLoading
                    ? <span class="loading loading-spinner loading-xs" />
                    : <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  }
                </button>
              </div>
            </div>
            {payError && <p class="text-error text-xs mt-1">{payError}</p>}
          </div>
        )}

        {/* Statement ledger */}
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs font-semibold text-base-content/80">{t('clientStatement')}</p>
          {statement.length > 0 && (
            <span class="text-xs text-base-content/70">{statement.length} {t('of')} {statement.length}</span>
          )}
        </div>
        <div class="space-y-2 max-h-[50vh] overflow-y-auto pe-1">
          {stmtLoading ? (
            <div class="flex justify-center py-8"><span class="loading loading-spinner loading-md" /></div>
          ) : stmtPageRows.length === 0 ? (
            <p class="text-center text-sm text-base-content/70 py-8">{t('noStatement')}</p>
          ) : stmtPageRows.map((e) => (
            <div key={e.id} class={`rounded-lg border ${e.type === 'sale' ? 'border-error/20 bg-error/5' : 'border-success/20 bg-success/5'}`}>
              <div class="px-3 py-2.5">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class={`badge badge-xs shrink-0 ${e.type === 'sale' ? 'badge-error' : 'badge-success'}`}>
                      {e.type === 'sale' ? t('stmtSale') : t('stmtPayment')}
                    </span>
                    <span class="text-xs font-mono text-base-content/70 truncate">{e.ref || '—'}</span>
                  </div>
                  <div class="text-end shrink-0">
                    {e.type === 'sale'
                      ? <span class="font-mono text-sm font-semibold text-error">+{e.amount.toFixed(2)}</span>
                      : <span class="font-mono text-sm font-semibold text-success">−{e.amount.toFixed(2)}</span>
                    }
                  </div>
                </div>
                <div class="flex items-center justify-between mt-1">
                  <span class="text-xs text-base-content/70">
                    {new Date(e.date).toLocaleDateString()} {new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div class="flex items-center gap-2">
                    {e.type === 'payment' && (
                      <button class="btn btn-xs btn-ghost border border-base-300" onClick={() => printClientPaymentReceipt(stmtTarget, e.amount, e.note || '', e.balance)}>{t('print')}</button>
                    )}
                    <span class={`text-xs font-mono font-medium ${e.balance > 0 ? 'text-error/70' : 'text-success/70'}`}>
                      {t('outstandingBalance')}: {e.balance.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              {e.type === 'sale' && e.lines && e.lines.length > 0 && (
                <div class="border-t border-error/10 px-3 py-2 space-y-1">
                  {e.lines.map((l, i) => (
                    <div key={i} class="flex items-center justify-between gap-2 text-xs">
                      <span class="text-base-content/80 truncate flex-1">{l.product_name}</span>
                      <span class="text-base-content/70 shrink-0">{l.qty} × {l.unit_price.toFixed(2)}</span>
                      <span class="font-mono text-base-content/80 shrink-0">{l.total_ttc.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        {stmtTotalPages > 1 && (
          <div class="flex items-center justify-between mt-3 pt-2 border-t border-base-300">
            <span class="text-xs text-base-content/70">
              {t('showing')} {(stmtPage - 1) * STMT_PAGE_SIZE + 1}–{Math.min(stmtPage * STMT_PAGE_SIZE, stmtRows.length)} {t('of')} {stmtRows.length}
            </span>
            <div class="flex gap-1">
              <button class="btn btn-xs btn-ghost" disabled={stmtPage <= 1} onClick={() => setStmtPage((p) => p - 1)}>‹</button>
              <span class="btn btn-xs btn-ghost no-animation">{stmtPage} / {stmtTotalPages}</span>
              <button class="btn btn-xs btn-ghost" disabled={stmtPage >= stmtTotalPages} onClick={() => setStmtPage((p) => p + 1)}>›</button>
            </div>
          </div>
        )}

        <div class="modal-action">
          {statement.length > 0 && (
            <button class="btn btn-sm btn-ghost gap-1" onClick={printStatement}>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
              {t('printStatement')}
            </button>
          )}
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('stmt-modal')}>{t('back')}</button>
        </div>
      </Modal>

      {/* Create / Edit Modal */}
      <Modal id="client-modal" title={editing ? t('editClient') : t('newClient')}>
        <div class="space-y-3">
          <label class="form-control">
            <span class="label-text text-xs">{t('clientName')} *</span>
            <input class="input input-bordered input-sm" value={form.name}
              onInput={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
          </label>
          <label class="form-control">
            <span class="label-text text-xs">{t('clientPhone')}</span>
            <input class="input input-bordered input-sm" value={form.phone}
              onInput={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label class="form-control">
            <span class="label-text text-xs">{t('clientEmail')}</span>
            <input type="email" class="input input-bordered input-sm" value={form.email}
              onInput={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label class="form-control">
            <span class="label-text text-xs">{t('clientAddress')}</span>
            <textarea class="textarea textarea-bordered textarea-sm resize-none" rows={2} value={form.address}
              onInput={(e) => setForm({ ...form, address: e.target.value })} />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="form-control">
              <span class="label-text text-xs">RC</span>
              <input class="input input-bordered input-sm" value={form.rc}
                onInput={(e) => setForm({ ...form, rc: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">NIF</span>
              <input class="input input-bordered input-sm" value={form.nif}
                onInput={(e) => setForm({ ...form, nif: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">NIS</span>
              <input class="input input-bordered input-sm" value={form.nis}
                onInput={(e) => setForm({ ...form, nis: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">N° Article</span>
              <input class="input input-bordered input-sm" value={form.nart}
                onInput={(e) => setForm({ ...form, nart: e.target.value })} />
            </label>
          </div>
          <label class="form-control">
            <span class="label-text text-xs">RIB</span>
            <input class="input input-bordered input-sm" value={form.compte_rib}
              onInput={(e) => setForm({ ...form, compte_rib: e.target.value })} />
          </label>
          {error && <p class="text-error text-sm">{error}</p>}
        </div>
        <div class="modal-action">
          <button class="btn btn-primary btn-sm" onClick={handleSave}>{t('saveChanges')}</button>
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('client-modal')}>{t('back')}</button>
        </div>
      </Modal>

      {/* Client Sales History Modal */}
      <Modal id="client-sales-modal" size="xl" title={`${t('salesHistory')} — ${salesTarget?.name || ''}`}>
        {/* Date filter */}
        <div class="flex gap-2 mb-4 items-end">
          <label class="form-control flex-1">
            <span class="label-text text-xs">{t('dateFrom')}</span>
            <input type="date" class="input input-bordered input-sm" value={salesDraftFrom}
              onInput={(e) => setSalesDraftFrom(e.target.value)} />
          </label>
          <label class="form-control flex-1">
            <span class="label-text text-xs">{t('dateTo')}</span>
            <input type="date" class="input input-bordered input-sm" value={salesDraftTo}
              onInput={(e) => setSalesDraftTo(e.target.value)} />
          </label>
          <button class="btn btn-sm btn-primary btn-outline shrink-0" onClick={applyClientSalesFilter}>
            {t('search')}
          </button>
        </div>

        {/* Select-all toolbar */}
        {salesResult.items.length > 0 && (
          <div class="flex items-center gap-2 mb-2">
            <button class="btn btn-xs btn-ghost" onClick={selectAllSales}>{t('selectAll')}</button>
            <button class="btn btn-xs btn-ghost" onClick={clearAllSales}>{t('clearAll')}</button>
            {selectedSales.size > 0 && (
              <span class="text-xs text-base-content/70 ms-1">{selectedSales.size} {t('selected')}</span>
            )}
          </div>
        )}

        {/* Sales list */}
        <div class="space-y-2 max-h-[60vh] overflow-y-auto pe-1">
          {salesLoading ? (
            <div class="flex justify-center py-8"><span class="loading loading-spinner loading-md" /></div>
          ) : salesResult.items.length === 0 ? (
            <p class="text-center text-sm text-base-content/70 py-8">{t('noSales')}</p>
          ) : salesResult.items.map((s) => (
            <div key={s.id} class="rounded-lg border border-base-300 overflow-hidden">
              {/* Sale header */}
              <div class="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-base-200 transition-colors">
                <input type="checkbox" class="checkbox checkbox-xs shrink-0"
                  checked={selectedSales.has(s.id)}
                  onClick={(e) => toggleSaleSelect(s.id, e)}
                  onChange={() => {}} />
                {selectedSales.has(s.id) && (
                  <div class="tooltip tooltip-right shrink-0" data-tip={t('includeProductDetails')}>
                    <button
                      class={`btn btn-xs btn-square shrink-0 ${saleLinesToPrint.has(s.id) ? 'btn-primary' : 'btn-ghost text-base-content/50'}`}
                      onClick={(e) => toggleSaleLines(s.id, e)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5M3.75 6.75h16.5M3.75 17.25h16.5" />
                      </svg>
                    </button>
                  </div>
                )}
                <button
                  class="flex-1 text-start flex items-center justify-between gap-2"
                  onClick={() => setExpandedSale(expandedSale === s.id ? null : s.id)}
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span class={`badge badge-xs shrink-0 ${s.sale_type === 'cash' ? 'badge-success' : 'badge-warning'}`}>
                      {s.sale_type === 'cash' ? t('cashSale') : t('creditSale')}
                    </span>
                    <span class="font-mono text-xs text-base-content/80 shrink-0">{s.ref}</span>
                    <span class="text-xs text-base-content/70 truncate">
                      {new Date(s.created_at).toLocaleDateString()} {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="font-mono text-sm font-semibold">{s.total.toFixed(2)}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class={`w-3.5 h-3.5 text-base-content/70 transition-transform ${expandedSale === s.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
              </div>
              {/* Expanded items */}
              {expandedSale === s.id && (
                <div class="border-t border-base-300 bg-base-50">
                  <table class="table table-xs w-full">
                    <thead>
                      <tr class="text-base-content/70">
                        <th>{t('productName')}</th>
                        <th class="text-center">{t('qty')}</th>
                        <th class="text-end">{t('blColUnitHT')}</th>
                        <th class="text-end">{t('totalTTC')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.lines.map((l, i) => (
                        <tr key={i}>
                          <td class="font-medium">{l.product_name}</td>
                          <td class="text-center font-mono">{l.qty}</td>
                          <td class="text-end font-mono">{l.unit_price.toFixed(2)}</td>
                          <td class="text-end font-mono font-semibold">{l.total_ttc.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr class="font-semibold border-t border-base-300">
                        <td colspan="3" class="text-end text-xs text-base-content/80">{t('totalTTC')}</td>
                        <td class="text-end font-mono">{s.total.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        {salesResult.total > 10 && (
          <div class="flex items-center justify-between mt-3 pt-3 border-t border-base-300">
            <span class="text-xs text-base-content/70">
              {t('showing')} {(salesPage - 1) * 10 + 1}–{Math.min(salesPage * 10, salesResult.total)} {t('of')} {salesResult.total}
            </span>
            <div class="flex gap-1">
              <button class="btn btn-xs btn-ghost" disabled={salesPage <= 1} onClick={() => {
                const p = salesPage - 1; setSalesPage(p); loadClientSales(salesTarget.id, salesFrom, salesTo, p)
              }}>‹</button>
              <span class="btn btn-xs btn-ghost no-animation">{salesPage} / {Math.ceil(salesResult.total / 10)}</span>
              <button class="btn btn-xs btn-ghost" disabled={salesPage * 10 >= salesResult.total} onClick={() => {
                const p = salesPage + 1; setSalesPage(p); loadClientSales(salesTarget.id, salesFrom, salesTo, p)
              }}>›</button>
            </div>
          </div>
        )}

        <div class="modal-action">
          {salesResult.total > 0 && (
            <button class="btn btn-sm btn-ghost gap-1" onClick={printSales} disabled={selectedSales.size === 0}>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
              {t('printStatement')}{selectedSales.size > 0 ? ` (${selectedSales.size})` : ''}
            </button>
          )}
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('client-sales-modal')}>{t('back')}</button>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal id="delete-modal" title={t('deleteClient')}>
        <p class="text-sm mb-1">{deleteTarget?.name}</p>
        {deleteTarget?.balance > 0 && (
          <div class="alert alert-warning text-xs py-2 mb-3">
            <span>{t('clientHasBalance')}: {deleteTarget.balance.toFixed(2)}</span>
          </div>
        )}
        {deleteError && <p class="text-error text-sm mb-2">{deleteError}</p>}
        <div class="modal-action">
          <button class="btn btn-error btn-sm" onClick={confirmDelete}
            disabled={deleteTarget?.balance > 0}>
            {t('deleteConfirm')}
          </button>
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('delete-modal')}>{t('back')}</button>
        </div>
      </Modal>

      {/* Archived Clients Modal */}
      <dialog id="archived-clients-modal" class="modal">
        <div class="modal-box max-w-2xl">
          <h3 class="font-bold text-lg mb-4">{t('archivedClients')}</h3>
          {archivedItems.length === 0 ? (
            <p class="text-center text-base-content/70 py-8">{t('noArchivedClients')}</p>
          ) : (
            <table class="table table-sm w-full">
              <thead>
                <tr>
                  <th>{t('name')}</th>
                  <th>{t('phone')}</th>
                  <th>{t('balance')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {archivedItems.map(c => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{(c.balance || 0).toFixed(2)}</td>
                    <td>
                      <button class="btn btn-xs btn-success btn-outline" onClick={() => handleUnarchive(c.id)}>{t('unarchive')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div class="modal-action">
            <form method="dialog"><button class="btn btn-sm">{t('back')}</button></form>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>
    </Layout>
  )
}
