import { useState, useEffect, useCallback } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { hasPerm, authUser } from '../lib/auth'
import { Pagination } from '../components/Pagination'

const emptyForm = { name: '', phone: '', email: '', address: '', rc: '', nif: '', nis: '', nart: '', compte_rib: '', balance: 0 }
const PAGE_SIZE = 10

function today() { return new Date().toISOString().slice(0, 10) }

export default function Suppliers({ path }) {
  const { t, te, fmt } = useI18n()
  const canAdd    = hasPerm('suppliers', 'add')
  const canEdit   = hasPerm('suppliers', 'edit')
  const canDelete = hasPerm('suppliers', 'delete')
  const canPay    = hasPerm('suppliers', 'pay')
  const canWrite  = canAdd || canEdit || canDelete || canPay

  const [result, setResult] = useState({ items: [], total: 0, page: 1, limit: 10, pages: 1 })
  const [page, setPage] = useState(1)
  const [filterQ, setFilterQ] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  // Purchases modal
  const [purTarget, setPurTarget]       = useState(null)
  const [purResult, setPurResult]       = useState({ items: [], total: 0, page: 1, pages: 1 })
  const [purPage, setPurPage]           = useState(1)
  const [purLoading, setPurLoading]     = useState(false)
  const [expandedPur, setExpandedPur]   = useState(null)
  const [purLines, setPurLines]         = useState({}) // { [purchaseId]: lines[] }
  const [purDraftFrom, setPurDraftFrom] = useState(today())
  const [purDraftTo, setPurDraftTo]     = useState(today())
  const [purFrom, setPurFrom]           = useState(today())
  const [purTo, setPurTo]               = useState(today())
  const [selectedPur, setSelectedPur]   = useState(new Set())
  const [linesForPrint, setLinesForPrint] = useState(new Set())

  // Payment statement modal
  const [stmtTarget, setStmtTarget]       = useState(null)
  const [payments, setPayments]           = useState({ items: [], total: 0, page: 1, pages: 1 })
  const [stmtPage, setStmtPage]           = useState(1)
  const [stmtLoading, setStmtLoading]     = useState(false)
  const [stmtDraftFrom, setStmtDraftFrom] = useState('')
  const [stmtDraftTo, setStmtDraftTo]     = useState('')
  const [stmtFrom, setStmtFrom]           = useState('')
  const [stmtTo, setStmtTo]               = useState('')
  const [payAmount, setPayAmount]         = useState('')
  const [payNote, setPayNote]             = useState('')
  const [payError, setPayError]           = useState('')
  const [payLoading, setPayLoading]       = useState(false)
  const [reverseTarget, setReverseTarget] = useState(null)

  // Archived
  const [archivedItems, setArchivedItems] = useState([])
  const [archivedTotal, setArchivedTotal] = useState(0)

  // Adjust balance modal
  const [balanceTarget, setBalanceTarget] = useState(null)
  const [balanceAmount, setBalanceAmount] = useState(0)
  const [balanceError, setBalanceError]   = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)

  const MODAL_IDS = ['supplier-modal', 'purchases-modal', 'stmt-modal', 'balance-modal', 'delete-modal']

  function closeAllDialogs() {
    MODAL_IDS.forEach(id => closeModal(id))
    setEditing(null)
    setPurTarget(null)
    setStmtTarget(null)
    setBalanceTarget(null)
    setDeleteTarget(null)
    setError('')
    setBalanceError('')
    setPayError('')
  }

  // Clear target state when a dialog is closed via Escape
  useEffect(() => {
    function handleClose(e) {
      const id = e.target?.id
      if (id === 'supplier-modal')   setEditing(null)
      if (id === 'purchases-modal')  setPurTarget(null)
      if (id === 'stmt-modal')       setStmtTarget(null)
      if (id === 'balance-modal')    setBalanceTarget(null)
      if (id === 'delete-modal')     setDeleteTarget(null)
    }
    MODAL_IDS.forEach(id => {
      document.getElementById(id)?.addEventListener('close', handleClose)
    })
    return () => {
      MODAL_IDS.forEach(id => {
        document.getElementById(id)?.removeEventListener('close', handleClose)
      })
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const data = await api.listSuppliersPage({ q: searchQ, page, limit: 10 })
      setResult(data)
    } catch {}
  }, [searchQ, page])

  useEffect(() => {
    let cancelled = false
    api.listSuppliersPage({ q: searchQ, page, limit: 10 })
      .then(data => { if (!cancelled) setResult(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [searchQ, page])

  function doSearch() { setPage(1); setSearchQ(filterQ) }

  function openCreate() {
    closeAllDialogs()
    setEditing(null); setForm(emptyForm); setError('')
    openModal('supplier-modal')
  }

  function openEdit(s) {
    closeAllDialogs()
    setEditing(s)
    setForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: s.address || '', rc: s.rc || '', nif: s.nif || '', nis: s.nis || '', nart: s.nart || '', compte_rib: s.compte_rib || '', balance: s.balance })
    setError('')
    openModal('supplier-modal')
  }

  async function toggleExpand(p) {
    if (expandedPur === p.id) { setExpandedPur(null); return }
    setExpandedPur(p.id)
    if (!purLines[p.id]) {
      try {
        const full = await api.getPurchase(p.id)
        setPurLines(prev => ({ ...prev, [p.id]: full.lines || [] }))
      } catch {}
    }
  }

  async function openPurchases(s) {
    closeAllDialogs()
    const t0 = today()
    setPurTarget(s); setPurPage(1); setExpandedPur(null); setPurLines({})
    setPurDraftFrom(t0); setPurDraftTo(t0); setPurFrom(t0); setPurTo(t0)
    setPurResult({ items: [], total: 0, page: 1, pages: 1 })
    setSelectedPur(new Set()); setLinesForPrint(new Set())
    openModal('purchases-modal')
    setPurLoading(true)
    try {
      const data = await api.listSupplierPurchases({ supplier_id: s.id, limit: PAGE_SIZE, page: 1, date_from: t0, date_to: t0 })
      setPurResult(data)
      setSelectedPur(new Set((data.items || []).map(p => p.id)))
    } catch {} finally { setPurLoading(false) }
  }

  async function applyPurFilter() {
    setPurPage(1); setExpandedPur(null)
    setPurFrom(purDraftFrom); setPurTo(purDraftTo)
    setSelectedPur(new Set()); setLinesForPrint(new Set())
    setPurLoading(true)
    try {
      const data = await api.listSupplierPurchases({ supplier_id: purTarget.id, limit: PAGE_SIZE, page: 1, date_from: purDraftFrom, date_to: purDraftTo })
      setPurResult(data)
      setSelectedPur(new Set((data.items || []).map(p => p.id)))
    } catch {} finally { setPurLoading(false) }
  }

  async function loadPurPage(p) {
    setPurLoading(true)
    try {
      const data = await api.listSupplierPurchases({ supplier_id: purTarget.id, limit: PAGE_SIZE, page: p, date_from: purFrom, date_to: purTo })
      setPurResult(data)
      setSelectedPur(prev => {
        const next = new Set(prev)
        ;(data.items || []).forEach(item => next.add(item.id))
        return next
      })
    } catch {} finally { setPurLoading(false) }
  }

  function togglePurSelect(id, e) {
    e.stopPropagation()
    setSelectedPur(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllPur() { setSelectedPur(new Set(purResult.items.map(p => p.id))) }
  function clearAllPur() { setSelectedPur(new Set()); setLinesForPrint(new Set()) }

  function toggleLinesForPrint(id, e) {
    e.stopPropagation()
    setLinesForPrint(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function openStatement(s) {
    closeAllDialogs()
    setStmtTarget(s); setStmtPage(1)
    setStmtDraftFrom(''); setStmtDraftTo(''); setStmtFrom(''); setStmtTo('')
    setPayAmount(''); setPayNote(''); setPayError('')
    setPayments({ items: [], total: 0, page: 1, pages: 1 })
    openModal('stmt-modal')
    await loadPayments(s.id, '', '', 1)
  }

  async function loadPayments(supplierId, from, to, p) {
    setStmtLoading(true)
    try {
      const params = { limit: PAGE_SIZE, page: p }
      if (from) params.date_from = from
      if (to) params.date_to = to
      const data = await api.listSupplierPayments(supplierId, params)
      setPayments(data)
    } catch {} finally { setStmtLoading(false) }
  }

  async function applyStmtFilter() {
    setStmtPage(1)
    setStmtFrom(stmtDraftFrom); setStmtTo(stmtDraftTo)
    await loadPayments(stmtTarget.id, stmtDraftFrom, stmtDraftTo, 1)
  }

  function openBalance(s) {
    closeAllDialogs()
    setBalanceTarget(s); setBalanceAmount(0); setBalanceError('')
    openModal('balance-modal')
  }

  function openDelete(s) { closeAllDialogs(); setDeleteTarget(s); openModal('delete-modal') }

  async function handleSave() {
    setError('')
    try {
      if (editing) {
        await api.updateSupplier(editing.id, { name: form.name, phone: form.phone, email: form.email, address: form.address, rc: form.rc, nif: form.nif, nis: form.nis, nart: form.nart, compte_rib: form.compte_rib })
      } else {
        await api.createSupplier(form)
      }
      closeModal('supplier-modal')
      load()
    } catch (e) { setError(te(e.message)) }
  }

  async function handlePay() {
    const amount = Number(payAmount)
    if (!amount || amount <= 0) { setPayError(t('paymentAmount') + ' > 0'); return }
    setPayError(''); setPayLoading(true)
    try {
      const updated = await api.paySupplierBalance(stmtTarget.id, { amount, note: payNote })
      setStmtTarget(updated)
      setPayAmount(''); setPayNote('')
      setStmtPage(1)
      await loadPayments(stmtTarget.id, stmtFrom, stmtTo, 1)
      load()
    } catch (e) { setPayError(te(e.message)) } finally { setPayLoading(false) }
  }

  function handleReverse(payment) {
    setReverseTarget(payment)
    openModal('reverse-confirm-modal')
  }

  async function confirmReverse() {
    if (!reverseTarget) return
    try {
      const updated = await api.reverseSupplierPayment(stmtTarget.id, reverseTarget.id)
      setStmtTarget(updated)
      await loadPayments(stmtTarget.id, stmtFrom, stmtTo, stmtPage)
      load()
    } catch (e) { setPayError(te(e.message)) }
    finally { setReverseTarget(null); closeModal('reverse-confirm-modal') }
  }

  async function handleBalance() {
    setBalanceError('')
    try {
      await api.adjustSupplierBalance(balanceTarget.id, { amount: Number(balanceAmount) })
      closeModal('balance-modal')
      load()
    } catch (e) { setBalanceError(te(e.message)) }
  }

  async function confirmDelete() {
    try {
      const res = await api.deleteSupplier(deleteTarget.id)
      closeModal('delete-modal')
      if (res?.archived) alert(t('supplier_archived_instead'))
      load()
    } catch {}
  }

  async function loadArchived() {
    try {
      const data = await api.listArchivedSuppliers({ page: 1, limit: 500 })
      setArchivedItems(data.items || [])
      setArchivedTotal(data.total || 0)
    } catch { setArchivedItems([]) }
  }

  async function openArchived() {
    await loadArchived()
    document.getElementById('archived-suppliers-modal')?.showModal()
  }

  async function handleUnarchive(id) {
    try {
      await api.unarchiveSupplier(id)
      loadArchived()
      load()
    } catch {}
  }

  // ── Print: purchases ──
  async function printPurchases() {
    const supplier = purTarget
    const user = authUser.value
    const storeName = user?.tenant_name || ''
    const now = new Date()
    const nowStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) +
      ' — ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const periodStr = purFrom && purTo ? `${purFrom} → ${purTo}` : ''

    let allItems = []
    try {
      const data = await api.listSupplierPurchases({ supplier_id: supplier.id, limit: 500, page: 1, date_from: purFrom, date_to: purTo })
      allItems = (data.items || []).filter(p => selectedPur.has(p.id))
    } catch { return }
    if (allItems.length === 0) return

    // Fetch lines for purchases that have lines-for-print enabled
    const linesMap = { ...purLines }
    const needLines = allItems.filter(p => linesForPrint.has(p.id))
    if (needLines.length > 0) {
      await Promise.all(needLines.map(async (p) => {
        if (!linesMap[p.id]) {
          try {
            const full = await api.getPurchase(p.id)
            linesMap[p.id] = full.lines || []
          } catch { linesMap[p.id] = [] }
        }
      }))
    }

    const totalAmount = allItems.reduce((s, p) => s + p.total, 0)
    const totalPaid   = allItems.reduce((s, p) => s + p.paid_amount, 0)
    const totalRem    = totalAmount - totalPaid

    const tableRows = allItems.map((p, i) => {
      const date = new Date(p.created_at).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
      const rowClass = i % 2 === 0 ? '' : 'alt'
      const statusLabel = p.status === 'paid' ? t('paid') : p.status === 'validated' ? t('validated') : t('draft')
      const statusBadge = p.status === 'paid' ? 'badge-paid' : p.status === 'validated' ? 'badge-validated' : 'badge-draft'
      const remaining = (p.total - p.paid_amount).toFixed(2)
      const mainRow = `<tr class="${rowClass}">
        <td class="mono ref">${p.ref || '—'}</td>
        <td>${date}</td>
        <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
        <td class="mono amt">${fmt(p.total)}</td>
        <td class="mono amt green">${fmt(p.paid_amount)}</td>
        <td class="mono amt ${p.status !== 'paid' ? 'red' : ''}">${remaining}</td>
      </tr>`
      if (!linesForPrint.has(p.id)) return mainRow
      const lines = linesMap[p.id] || []
      if (lines.length === 0) return mainRow
      const lineRows = lines.map(l => `<tr class="lines-row">
        <td class="lines-indent" colspan="2"><span class="lines-product">${l.product_name || ''}</span></td>
        <td></td>
        <td class="mono amt lines-dim">${l.qty} × ${fmt((l.prix_achat || 0))}</td>
        <td></td>
        <td class="mono amt lines-dim">${fmt((l.qty * (l.prix_achat || 0)))}</td>
      </tr>`).join('')
      return mainRow + lineRows
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${t('purchasesPage')} — ${supplier.name}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #1e3a5f; margin-bottom: 20px; }
    .header-left h1 { font-size: 22px; font-weight: 700; color: #1e3a5f; letter-spacing: -.3px; margin-bottom: 2px; }
    .header-left .subtitle { font-size: 11px; color: #6b7280; }
    .header-right { text-align: right; }
    .header-right .store-name { font-size: 14px; font-weight: 700; color: #1e3a5f; }
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
    .red { color: #dc2626; }
    .green { color: #16a34a; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 99px; font-size: 9px; font-weight: 600; }
    .badge-paid { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
    .badge-validated { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
    .badge-draft { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }
    .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
    .footer-left { font-size: 9px; color: #d1d5db; }
    .footer-right { font-size: 9px; color: #9ca3af; }
    .lines-row { background: #f8fafc !important; }
    .lines-row td { padding: 3px 8px; border-bottom: none; }
    .lines-indent { padding-left: 22px !important; }
    .lines-product { font-size: 9px; color: #6b7280; font-style: italic; }
    .lines-dim { font-size: 9px; color: #9ca3af; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head><body>
  <div class="header">
    <div class="header-left">
      <h1>${t('purchasesPage')}</h1>
      ${periodStr ? `<div class="subtitle">${periodStr}</div>` : ''}
    </div>
    <div class="header-right">${storeName ? `<div class="store-name">${storeName}</div>` : ''}</div>
  </div>
  <div class="info-grid">
    <div class="info-card">
      <h3>${t('supplierName')}</h3>
      <div class="info-row"><span class="info-label">${t('supplierName')}</span><span class="info-value">${supplier.name}</span></div>
      ${supplier.phone ? `<div class="info-row"><span class="info-label">${t('supplierPhone')}</span><span class="info-value">${supplier.phone}</span></div>` : ''}
      ${supplier.address ? `<div class="info-row"><span class="info-label">${t('supplierAddress')}</span><span class="info-value">${supplier.address}</span></div>` : ''}
    </div>
    <div class="info-card">
      <h3>${t('supplierBalance')}</h3>
      <div class="info-row"><span class="info-label">${t('supplierBalance')}</span><span class="info-value mono" style="color:${supplier.balance > 0 ? '#dc2626' : '#16a34a'}">${fmt(supplier.balance)}</span></div>
    </div>
  </div>
  <div class="summary">
    <div class="summary-item"><div class="s-label">${t('purchaseTotal')}</div><div class="s-val">${fmt(totalAmount)}</div></div>
    <div class="summary-item"><div class="s-label">${t('purchasePaid2')}</div><div class="s-val" style="color:#16a34a">${fmt(totalPaid)}</div></div>
    <div class="summary-item"><div class="s-label">${t('purchaseRemaining')}</div><div class="s-val" style="color:${totalRem > 0 ? '#dc2626' : '#16a34a'}">${fmt(totalRem)}</div></div>
  </div>
  <p class="section-title">${t('purchasesPage')} (${allItems.length})</p>
  <table>
    <thead><tr>
      <th>${t('ref')}</th><th>${t('purchaseDate')}</th><th>${t('status')}</th>
      <th class="amt">${t('purchaseTotal')}</th><th class="amt">${t('purchasePaid2')}</th><th class="amt">${t('purchaseRemaining')}</th>
    </tr></thead>
    <tbody>${tableRows || `<tr><td colspan="6" style="text-align:center;padding:20px;color:#9ca3af">${t('noPurchases')}</td></tr>`}</tbody>
    <tfoot><tr>
      <td colspan="3" style="text-align:right;font-size:10px;color:#6b7280">${t('showing')} ${allItems.length}</td>
      <td style="text-align:right">${fmt(totalAmount)}</td>
      <td style="text-align:right;color:#16a34a">${fmt(totalPaid)}</td>
      <td style="text-align:right;color:${totalRem > 0 ? '#dc2626' : '#16a34a'}">${fmt(totalRem)}</td>
    </tr></tfoot>
  </table>
  <div class="footer">
    <div class="footer-left">${storeName}</div>
    <div class="footer-right">${t('stmtGeneratedOn')}: ${nowStr}</div>
  </div>
  <script>window.onload = function() { window.print() }<\/script>
</body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ── Print: payment statement ──
  async function printStatement() {
    const supplier = stmtTarget
    const user = authUser.value
    const storeName = user?.tenant_name || ''
    const now = new Date()
    const nowStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) +
      ' — ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    let allItems = []
    try {
      const params = { limit: 500, page: 1 }
      if (stmtFrom) params.date_from = stmtFrom
      if (stmtTo) params.date_to = stmtTo
      const data = await api.listSupplierPayments(supplier.id, params)
      allItems = data.items || []
    } catch { return }

    const totalPaid = allItems.reduce((s, p) => s + p.amount, 0)

    const tableRows = allItems.map((p, i) => {
      const date = new Date(p.created_at).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }) +
        ' ' + new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const rowClass = i % 2 === 0 ? '' : 'alt'
      return `<tr class="${rowClass}">
        <td>${date}</td>
        <td class="mono amt green">${fmt(p.amount)}</td>
        <td>${p.note || '—'}</td>
        <td>${p.created_by}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${t('paymentHistory')} — ${supplier.name}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #1e3a5f; margin-bottom: 20px; }
    .header-left h1 { font-size: 22px; font-weight: 700; color: #1e3a5f; letter-spacing: -.3px; margin-bottom: 2px; }
    .header-right .store-name { font-size: 14px; font-weight: 700; color: #1e3a5f; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .info-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; }
    .info-card h3 { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; margin-bottom: 8px; }
    .info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .info-row:last-child { margin-bottom: 0; }
    .info-label { color: #6b7280; font-size: 10px; }
    .info-value { font-weight: 600; font-size: 11px; }
    .info-value.mono { font-family: 'Courier New', monospace; }
    .summary { display: flex; gap: 0; margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .summary-item { flex: 1; padding: 10px 14px; text-align: center; }
    .summary-item .s-label { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; margin-bottom: 4px; }
    .summary-item .s-val { font-size: 14px; font-weight: 700; font-family: 'Courier New', monospace; color: #16a34a; }
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
    .amt { text-align: right; }
    .mono { font-family: 'Courier New', monospace; }
    .green { color: #16a34a; }
    .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
    .footer-left { font-size: 9px; color: #d1d5db; }
    .footer-right { font-size: 9px; color: #9ca3af; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head><body>
  <div class="header">
    <div class="header-left">
      <h1>${t('paymentHistory')}</h1>
      <div class="subtitle">${supplier.name}</div>
    </div>
    <div class="header-right">${storeName ? `<div class="store-name">${storeName}</div>` : ''}</div>
  </div>
  <div class="info-grid">
    <div class="info-card">
      <h3>${t('supplierName')}</h3>
      <div class="info-row"><span class="info-label">${t('supplierName')}</span><span class="info-value">${supplier.name}</span></div>
      ${supplier.phone ? `<div class="info-row"><span class="info-label">${t('supplierPhone')}</span><span class="info-value">${supplier.phone}</span></div>` : ''}
    </div>
    <div class="info-card">
      <h3>${t('supplierBalance')}</h3>
      <div class="info-row"><span class="info-label">${t('supplierBalance')}</span><span class="info-value mono" style="color:${supplier.balance > 0 ? '#dc2626' : '#16a34a'}">${fmt(supplier.balance)}</span></div>
    </div>
  </div>
  <div class="summary">
    <div class="summary-item"><div class="s-label">${t('paymentsCollected')}</div><div class="s-val">${fmt(totalPaid)}</div></div>
  </div>
  <p class="section-title">${t('paymentHistory')} (${allItems.length})</p>
  <table>
    <thead><tr>
      <th>${t('purchaseDate')}</th><th class="amt">${t('paymentAmount')}</th>
      <th>${t('note')}</th><th>${t('createdBy')}</th>
    </tr></thead>
    <tbody>${tableRows || `<tr><td colspan="4" style="text-align:center;padding:20px;color:#9ca3af">${t('noPayments')}</td></tr>`}</tbody>
    <tfoot><tr>
      <td style="text-align:right;font-size:10px;color:#6b7280" colspan="1">${t('showing')} ${allItems.length}</td>
      <td style="text-align:right;color:#16a34a">${fmt(totalPaid)}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table>
  <div class="footer">
    <div class="footer-left">${storeName}</div>
    <div class="footer-right">${t('stmtGeneratedOn')}: ${nowStr}</div>
  </div>
  <script>window.onload = function() { window.print() }<\/script>
</body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const { items, pages } = result

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('suppliersPage')}</h2>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-ghost gap-1" onClick={openArchived}>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            {t('showArchived')}
          </button>
          {canAdd && (
            <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newSupplier')}</button>
          )}
        </div>
      </div>

      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-3 flex-wrap items-center">
        <div class="flex flex-col flex-1 max-w-xs">
          <span class="text-xs text-base-content/70 mb-0.5">{t('search')}</span>
          <input class="input input-bordered input-sm" placeholder={t('search')}
            value={filterQ} onInput={(e) => setFilterQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        </div>
        <button class="btn btn-sm btn-primary btn-outline self-end" onClick={doSearch}>{t('search')}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden"><div class="overflow-x-auto">
        <table class="table table-sm w-full">
          <thead class="bg-base-200/60">
            <tr>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{t('supplierName')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{t('supplierPhone')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{t('supplierAddress')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap text-end">{t('supplierBalance')}</th>
              {canWrite && <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap"></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 5 : 4} class="py-12 text-center">
                  <div class="flex flex-col items-center gap-2 text-base-content/50">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                    </svg>
                    <p class="text-sm">{t('noSuppliers')}</p>
                  </div>
                </td>
              </tr>
            )}
            {items.map((s) => (
              <tr key={s.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                <td class="px-3 py-2.5 font-medium">{s.name}</td>
                <td class="px-3 py-2.5 text-sm">{s.phone || '—'}</td>
                <td class="px-3 py-2.5 text-sm">{s.address || '—'}</td>
                <td class={`px-3 py-2.5 text-sm text-end font-mono font-semibold ${s.balance > 0 ? 'text-error' : 'text-success'}`}>
                  {fmt(s.balance)}
                </td>
                {canWrite && (
                  <td class="px-3 py-2.5 text-end">
                    <div class="flex gap-1 justify-end">
                      <div class="tooltip tooltip-left" data-tip={t('purchasesPage')}>
                        <button class="btn btn-sm btn-ghost btn-square text-secondary" onClick={() => openPurchases(s)}>
                          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                          </svg>
                        </button>
                      </div>
                      {canPay && (
                        <div class="tooltip tooltip-left" data-tip={t('paymentHistory')}>
                          <button class="btn btn-sm btn-ghost btn-square text-primary" onClick={() => openStatement(s)}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {canEdit && (
                        <div class="tooltip tooltip-left" data-tip={t('adjustBalance')}>
                          <button class="btn btn-sm btn-ghost btn-square text-accent" onClick={() => openBalance(s)}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {canEdit && (
                        <div class="tooltip tooltip-left" data-tip={t('edit')}>
                          <button class="btn btn-sm btn-ghost btn-square" onClick={() => openEdit(s)}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {canDelete && (
                        <div class="tooltip tooltip-left" data-tip={t('disable')}>
                          <button class="btn btn-sm btn-ghost btn-square text-error" onClick={() => openDelete(s)}>
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
      </div>
      <Pagination page={page} pages={pages} total={result.total} limit={10} onPageChange={setPage} />

      {/* ── Purchases Modal ── */}
      <Modal id="purchases-modal" size="xl" title={`${t('purchasesPage')} — ${purTarget?.name || ''}`}>
        {/* Date filter */}
        <div class="flex gap-2 mb-4 items-end">
          <label class="form-control flex-1">
            <span class="label-text text-xs">{t('dateFrom')}</span>
            <input type="date" class="input input-bordered input-sm" value={purDraftFrom}
              onInput={(e) => setPurDraftFrom(e.target.value)} />
          </label>
          <label class="form-control flex-1">
            <span class="label-text text-xs">{t('dateTo')}</span>
            <input type="date" class="input input-bordered input-sm" value={purDraftTo}
              onInput={(e) => setPurDraftTo(e.target.value)} />
          </label>
          <button class="btn btn-sm btn-primary btn-outline shrink-0" onClick={applyPurFilter}>
            {t('search')}
          </button>
        </div>

        {/* Select all/none toolbar */}
        {purResult.items.length > 0 && !purLoading && (
          <div class="flex items-center gap-2 mb-2">
            <button class="btn btn-xs btn-ghost" onClick={selectAllPur}>{t('selectAll')}</button>
            <button class="btn btn-xs btn-ghost" onClick={clearAllPur}>{t('clearAll')}</button>
            <span class="text-xs text-base-content/70 ms-1">{selectedPur.size} ✓</span>
          </div>
        )}

        {/* Purchases list */}
        <div class="space-y-2 max-h-[55vh] overflow-y-auto pe-1">
          {purLoading ? (
            <div class="flex justify-center py-8"><span class="loading loading-spinner loading-md" /></div>
          ) : purResult.items.length === 0 ? (
            <p class="text-center text-sm text-base-content/70 py-8">{t('noPurchases')}</p>
          ) : purResult.items.map((p) => {
            const isPaid = p.status === 'paid'
            const remaining = p.total - p.paid_amount
            const isExpanded = expandedPur === p.id
            return (
              <div key={p.id} class={`rounded-lg border overflow-hidden ${isPaid ? 'border-success/20' : p.status === 'validated' ? 'border-warning/20' : 'border-base-300'}`}>
                <div class="w-full text-start px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-base-200 transition-colors">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs shrink-0"
                    checked={selectedPur.has(p.id)}
                    onClick={(e) => togglePurSelect(p.id, e)}
                    onChange={() => {}}
                  />
                  {selectedPur.has(p.id) && (
                    <div class="tooltip tooltip-right shrink-0" data-tip={t('includeProductDetails')}>
                      <button
                        class={`btn btn-xs btn-square shrink-0 ${linesForPrint.has(p.id) ? 'btn-primary' : 'btn-ghost text-base-content/50'}`}
                        onClick={(e) => toggleLinesForPrint(p.id, e)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h4.5" />
                        </svg>
                      </button>
                    </div>
                  )}
                  <button
                    class="flex-1 flex items-center justify-between gap-2 min-w-0"
                    onClick={() => toggleExpand(p)}
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <span class={`badge badge-xs shrink-0 ${isPaid ? 'badge-success' : p.status === 'validated' ? 'badge-warning' : 'badge-ghost'}`}>
                        {t(p.status)}
                      </span>
                      <span class="font-mono text-xs text-base-content/80 shrink-0">{p.ref || '—'}</span>
                      <span class="text-xs text-base-content/70 truncate">
                        {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      {!isPaid && <span class="text-xs font-mono text-error/80">{t('purchaseRemaining')}: {fmt(remaining)}</span>}
                      <span class="font-mono text-sm font-semibold">{fmt(p.total)}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" class={`w-3.5 h-3.5 text-base-content/70 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                </div>
                {isExpanded && (
                  <div class="border-t border-base-300 bg-base-50">
                    {!purLines[p.id] ? (
                      <div class="flex justify-center py-3"><span class="loading loading-spinner loading-xs" /></div>
                    ) : purLines[p.id].length === 0 ? (
                      <p class="text-center text-xs text-base-content/70 py-3">{t('noLines')}</p>
                    ) : (
                      <table class="table table-xs w-full">
                        <thead>
                          <tr class="text-base-content/70">
                            <th>{t('productName')}</th>
                            <th class="text-center">{t('qty')}</th>
                            <th class="text-end">{t('prixAchat')}</th>
                            <th class="text-end">{t('purchaseTotal')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purLines[p.id].map((l, i) => (
                            <tr key={i}>
                              <td class="font-medium">{l.product_name}</td>
                              <td class="text-center font-mono">{l.qty}</td>
                              <td class="text-end font-mono">{fmt(l.prix_achat)}</td>
                              <td class="text-end font-mono font-semibold">{fmt((l.qty * (l.prix_achat || 0)))}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr class="font-semibold border-t border-base-300">
                            <td colSpan={3} class="text-end text-xs text-base-content/80">{t('purchaseTotal')}</td>
                            <td class="text-end font-mono">{fmt(p.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {purResult.total > PAGE_SIZE && (
          <div class="flex items-center justify-between mt-3 pt-3 border-t border-base-300">
            <span class="text-xs text-base-content/70">
              {t('showing')} {(purPage - 1) * PAGE_SIZE + 1}–{Math.min(purPage * PAGE_SIZE, purResult.total)} {t('of')} {purResult.total}
            </span>
            <div class="flex gap-1">
              <button class="btn btn-xs btn-ghost" disabled={purPage <= 1}
                onClick={() => { const p = purPage - 1; setPurPage(p); loadPurPage(p) }}>‹</button>
              <span class="btn btn-xs btn-ghost no-animation">{purPage} / {purResult.pages}</span>
              <button class="btn btn-xs btn-ghost" disabled={purPage * PAGE_SIZE >= purResult.total}
                onClick={() => { const p = purPage + 1; setPurPage(p); loadPurPage(p) }}>›</button>
            </div>
          </div>
        )}

        <div class="modal-action flex-wrap gap-2 justify-end items-center">
          <div class="flex gap-2">
            {purResult.total > 0 && (
              <button class="btn btn-sm btn-ghost gap-1" onClick={printPurchases} disabled={selectedPur.size === 0}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                </svg>
                {t('printStatement')} {selectedPur.size > 0 && `(${selectedPur.size})`}
              </button>
            )}
            <button class="btn btn-sm btn-ghost" onClick={() => closeModal('purchases-modal')}>{t('back')}</button>
          </div>
        </div>
      </Modal>

      {/* ── Payment Statement Modal ── */}
      <Modal id="stmt-modal" size="xl" title={
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <div>
            <span class="text-lg font-bold">{stmtTarget?.name}</span>
            <div class={`font-mono font-bold text-sm ${stmtTarget?.balance > 0 ? 'text-error' : 'text-success'}`}>
              {t('supplierBalance')}: {fmt(stmtTarget?.balance)}
            </div>
          </div>
        </div>
      }>
        {/* Inline payment form */}
        {canPay && (
          <div class="-mx-1 px-4 py-3 bg-base-200/50 rounded-xl border border-base-300 mb-4">
            <p class="text-xs font-semibold text-base-content/80 mb-2 flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t('recordPayment')}
            </p>
            <div class="flex gap-2">
              <label class="form-control flex-1">
                <span class="label-text text-xs">{t('paymentAmountLabel')}</span>
                <input type="number" min="0.01" step="any"
                  class="input input-bordered input-sm"
                  value={payAmount}
                  onInput={(e) => setPayAmount(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePay()} />
              </label>
              <label class="form-control flex-1">
                <span class="label-text text-xs">{t('paymentNote')}</span>
                <input class="input input-bordered input-sm"
                  value={payNote}
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

        {/* Date filter */}
        <div class="flex gap-2 mb-4 items-end">
          <label class="form-control flex-1">
            <span class="label-text text-xs">{t('dateFrom')}</span>
            <input type="date" class="input input-bordered input-sm" value={stmtDraftFrom}
              onInput={(e) => setStmtDraftFrom(e.target.value)} />
          </label>
          <label class="form-control flex-1">
            <span class="label-text text-xs">{t('dateTo')}</span>
            <input type="date" class="input input-bordered input-sm" value={stmtDraftTo}
              onInput={(e) => setStmtDraftTo(e.target.value)} />
          </label>
          <button class="btn btn-sm btn-primary btn-outline shrink-0" onClick={applyStmtFilter}>
            {t('search')}
          </button>
        </div>

        <div class="flex items-center justify-between mb-3">
          <p class="text-sm font-semibold text-base-content/80">{t('paymentHistory')}</p>
          {payments.total > 0 && <span class="badge badge-sm badge-ghost">{payments.total}</span>}
        </div>

        {/* Payment list as table */}
        <div class="card bg-base-100 shadow-sm border border-base-300 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="table table-sm w-full">
              <thead class="bg-base-200/60">
                <tr>
                  <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('date')}</th>
                  <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('type')}</th>
                  <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('paymentNote')}</th>
                  <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('createdBy')}</th>
                  <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{t('paymentAmountLabel')}</th>
                  {canPay && <th class="px-3 py-2.5 w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {stmtLoading && (
                  <tr><td colSpan={canPay ? 6 : 5} class="py-10 text-center"><span class="loading loading-spinner loading-md text-primary" /></td></tr>
                )}
                {!stmtLoading && payments.items.length === 0 && (
                  <tr><td colSpan={canPay ? 6 : 5} class="py-10 text-center text-base-content/50 text-sm">{t('noPayments')}</td></tr>
                )}
                {!stmtLoading && payments.items.map((p) => {
                  const isReversal = !!p.reversal_of
                  const isReversed = !!p.reversed
                  return (
                    <tr key={p.id} class={`border-b border-base-200 transition-colors ${isReversed ? 'opacity-50 line-through' : isReversal ? 'bg-error/5' : 'hover:bg-base-50'}`}>
                      <td class="px-3 py-2.5 text-sm whitespace-nowrap">
                        {new Date(p.created_at).toLocaleDateString()} <span class="text-base-content/50">{new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td class="px-3 py-2.5">
                        {isReversal
                          ? <span class="badge badge-xs badge-error">{t('stmtReversal')}</span>
                          : isReversed
                            ? <span class="badge badge-xs badge-ghost">{t('reversed')}</span>
                            : p.type === 'purchase'
                              ? <span class="badge badge-xs badge-info">{t('sourcePurchase')}{p.purchase_ref ? ` ${p.purchase_ref}` : ''}</span>
                              : <span class="badge badge-xs badge-success">{t('stmtPayment')}</span>
                        }
                      </td>
                      <td class="px-3 py-2.5 text-sm text-base-content/70 max-w-[200px] truncate">{p.note || '—'}</td>
                      <td class="px-3 py-2.5 text-sm text-base-content/70">{p.created_by}</td>
                      <td class="px-3 py-2.5 text-end">
                        <span class={`font-mono text-sm font-semibold ${isReversal ? 'text-error' : 'text-success'}`}>
                          {p.amount > 0 ? '-' : '+'}{fmt(Math.abs(p.amount))}
                        </span>
                      </td>
                      {canPay && (
                        <td class="px-3 py-2.5">
                          {!isReversed && !isReversal && (
                            <div class="tooltip tooltip-left" data-tip={t('reversePayment')}>
                              <button class="btn btn-xs btn-ghost btn-square text-error" onClick={() => handleReverse(p)}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination page={stmtPage} pages={payments.pages || 1} total={payments.total} limit={PAGE_SIZE}
          onPageChange={(p) => { setStmtPage(p); loadPayments(stmtTarget.id, stmtFrom, stmtTo, p) }} />

        <div class="modal-action">
          {payments.total > 0 && (
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
      <Modal id="supplier-modal" title={editing ? t('editSupplier') : t('newSupplier')}>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <label class="form-control">
              <span class="label-text text-xs">{t('supplierName')} *</span>
              <input class="input input-bordered input-sm" value={form.name}
                onInput={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">{t('supplierPhone')}</span>
              <input class="input input-bordered input-sm" value={form.phone}
                onInput={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">{t('supplierEmail')}</span>
              <input class="input input-bordered input-sm" value={form.email}
                onInput={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">{t('supplierAddress')}</span>
              <input class="input input-bordered input-sm" value={form.address}
                onInput={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="form-control">
              <span class="label-text text-xs">{t('supplierRC')}</span>
              <input class="input input-bordered input-sm" value={form.rc}
                onInput={(e) => setForm({ ...form, rc: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">{t('supplierNIF')}</span>
              <input class="input input-bordered input-sm" value={form.nif}
                onInput={(e) => setForm({ ...form, nif: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">{t('supplierNIS')}</span>
              <input class="input input-bordered input-sm" value={form.nis}
                onInput={(e) => setForm({ ...form, nis: e.target.value })} />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">{t('supplierNART')}</span>
              <input class="input input-bordered input-sm" value={form.nart}
                onInput={(e) => setForm({ ...form, nart: e.target.value })} />
            </label>
            <label class="form-control col-span-2">
              <span class="label-text text-xs">{t('supplierRIB')}</span>
              <input class="input input-bordered input-sm" value={form.compte_rib}
                onInput={(e) => setForm({ ...form, compte_rib: e.target.value })} />
            </label>
          </div>
          {!editing && (
            <label class="form-control">
              <span class="label-text text-xs">{t('supplierBalance')}</span>
              <input type="number" class="input input-bordered input-sm" value={form.balance}
                onInput={(e) => setForm({ ...form, balance: Number(e.target.value) })} />
            </label>
          )}
          {error && <p class="text-error text-sm">{error}</p>}
        </div>
        <div class="modal-action">
          <button class="btn btn-primary btn-sm" onClick={handleSave}>{t('saveChanges')}</button>
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('supplier-modal')}>{t('back')}</button>
        </div>
      </Modal>

      {/* Manual Balance Adjustment Modal */}
      <Modal id="balance-modal" title={t('adjustBalance')}>
        <p class="text-sm mb-1 font-medium">{balanceTarget?.name}</p>
        <p class="text-xs text-base-content/80 mb-3">
          {t('supplierBalance')}: <span class="font-mono">{fmt(balanceTarget?.balance)}</span>
        </p>
        <label class="form-control mb-3">
          <span class="label-text text-xs">{t('balanceAmount')}</span>
          <input type="number" class="input input-bordered input-sm" value={balanceAmount}
            onInput={(e) => setBalanceAmount(e.target.value)} />
        </label>
        {balanceError && <p class="text-error text-sm mb-2">{balanceError}</p>}
        <div class="modal-action">
          <button class="btn btn-primary btn-sm" onClick={handleBalance}>{t('saveChanges')}</button>
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('balance-modal')}>{t('back')}</button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal id="reverse-confirm-modal" title={t('reversePayment')}>
        <p class="text-sm mb-4">{t('reversePaymentConfirm')}</p>
        {reverseTarget && (
          <p class="text-sm text-base-content/70 mb-2">
            {fmt(Math.abs(reverseTarget.amount))} — {reverseTarget.note || '—'}
          </p>
        )}
        <div class="modal-action">
          <button class="btn btn-error btn-sm" onClick={confirmReverse}>{t('confirm')}</button>
          <button class="btn btn-sm btn-ghost" onClick={() => { setReverseTarget(null); closeModal('reverse-confirm-modal') }}>{t('back')}</button>
        </div>
      </Modal>

      <Modal id="delete-modal" title={t('deleteSupplier')}>
        <p class="text-sm mb-4">{deleteTarget?.name}</p>
        <div class="modal-action">
          <button class="btn btn-error btn-sm" onClick={confirmDelete}>{t('deleteConfirm')}</button>
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('delete-modal')}>{t('back')}</button>
        </div>
      </Modal>

      {/* Archived Suppliers Modal */}
      <dialog id="archived-suppliers-modal" class="modal">
        <div class="modal-box max-w-2xl">
          <h3 class="font-bold text-lg mb-4">{t('archivedSuppliers')}</h3>
          {archivedItems.length === 0 ? (
            <p class="text-center text-base-content/70 py-8">{t('noArchivedSuppliers')}</p>
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
                {archivedItems.map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.phone || '—'}</td>
                    <td>{fmt((s.balance || 0))}</td>
                    <td>
                      <button class="btn btn-xs btn-success btn-outline" onClick={() => handleUnarchive(s.id)}>{t('unarchive')}</button>
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
