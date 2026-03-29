import { useState, useEffect, useCallback, useMemo, useRef } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { hasPerm, hasFeature } from '../lib/auth'
import { QuickAddProductModal } from '../components/QuickAddProductModal'

const STATUS_BADGE = {
  draft:                 'badge-warning',
  partially_validated:   'badge-accent',
  validated:             'badge-info',
  paid:                  'badge-success',
}

const emptyLine = { product_id: '', variant_id: '', variant_name: '', product_name: '', qty: 1, prix_achat: 0, remise: 0, prix_vente_1: 0, prix_vente_2: 0, prix_vente_3: 0, lot: '', expiry_date: '' }

const KBD = ({ children }) => (
  <kbd class="kbd kbd-xs bg-base-200 text-base-content/75 border-base-300 font-mono">{children}</kbd>
)

export default function Purchases({ path }) {
  const { t } = useI18n()
  const canAdd      = hasPerm('purchases', 'add')
  const canEdit     = hasPerm('purchases', 'edit')
  const canDelete   = hasPerm('purchases', 'delete')
  const canValidate = hasPerm('purchases', 'validate')
  const canPay      = hasPerm('purchases', 'pay')
  const canWrite    = canAdd || canEdit || canDelete || canValidate || canPay
  const canBatches  = hasFeature('batch_tracking')
  const canAddProduct = hasPerm('products', 'add')

  const [result, setResult] = useState({ items: [], total: 0, page: 1, limit: 10, pages: 0 })
  const [page, setPage] = useState(1)
  const [filterQ, setFilterQ] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [suppliers, setSuppliers] = useState([])
  const [brands, setBrands] = useState([])
  const [categories, setCategories] = useState([])

  // Form state
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formTitle, setFormTitle] = useState('')
  const [supplierID, setSupplierID] = useState('')
  const [supplierInvoice, setSupplierInvoice] = useState('')
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState([])
  const [expenses, setExpenses] = useState([])
  const [distributeExpenses, setDistributeExpenses] = useState(false)
  const [globalRemise, setGlobalRemise] = useState(0)
  const [globalRemiseType, setGlobalRemiseType] = useState('percent')
  const [formError, setFormError] = useState('')
  const [lineForm, setLineForm] = useState(emptyLine)

  // Supplier name display
  const [supplierName, setSupplierName] = useState('')

  // Product search dialog state
  const [dialogQ, setDialogQ] = useState('')
  const [dialogResults, setDialogResults] = useState([])
  const [dialogLoading, setDialogLoading] = useState(false)
  const lastDialogSearchRef = useRef('')

  const [quickAddOpen, setQuickAddOpen] = useState(false)

  // Purchase variant picker
  const [purchaseVariantProduct, setPurchaseVariantProduct] = useState(null)
  const [purchaseVariants, setPurchaseVariants] = useState([])

  // Supplier search dialog state
  const [supplierDialogQ, setSupplierDialogQ] = useState('')
  const [supplierDialogResults, setSupplierDialogResults] = useState([])

  // Payment modal
  const [payTarget, setPayTarget] = useState(null)
  const [payAmount, setPayAmount] = useState(0)
  const [payNote, setPayNote] = useState('')
  const [payError, setPayError] = useState('')

  // Payment history modal
  const [payHistoryTarget, setPayHistoryTarget] = useState(null)
  const [payHistory, setPayHistory] = useState([])

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Preview validation modal
  const [previewData, setPreviewData] = useState(null)
  const [previewTarget, setPreviewTarget] = useState(null)

  // Return modal
  const [returnTarget, setReturnTarget] = useState(null)
  const [returnLines, setReturnLines] = useState([])
  const [returnError, setReturnError] = useState('')

  // Low stock
  const [lowStockOpen, setLowStockOpen] = useState(false)
  const [lowStockItems, setLowStockItems] = useState([])

  // VAT setting
  const [useVAT, setUseVAT] = useState(false)
  const [visiblePrices, setVisiblePrices] = useState({ pv1: true, pv2: true, pv3: true })

  const brandMap = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands])
  const catMap   = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  const load = useCallback(async () => {
    try {
      const params = { page, limit: 10 }
      if (searchQ) params.q = searchQ
      if (filterStatus) params.status = filterStatus
      if (filterDateFrom) params.date_from = filterDateFrom
      if (filterDateTo) params.date_to = filterDateTo
      const data = await api.listPurchases(params)
      setResult(data)
    } catch {}
  }, [page, searchQ, filterStatus, filterDateFrom, filterDateTo])

  function doSearch() {
    setPage(1)
    setSearchQ(filterQ)
  }

  useEffect(() => {
    let cancelled = false
    const params = { page, limit: 10 }
    if (searchQ) params.q = searchQ
    if (filterStatus) params.status = filterStatus
    if (filterDateFrom) params.date_from = filterDateFrom
    if (filterDateTo) params.date_to = filterDateTo
    api.listPurchases(params)
      .then(data => { if (!cancelled) setResult(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [page, searchQ, filterStatus, filterDateFrom, filterDateTo])

  useEffect(() => {
    let cancelled = false
    api.listSuppliers().then(d => { if (!cancelled) setSuppliers(d) }).catch(() => {})
    api.listBrands().then(d => { if (!cancelled) setBrands(d) }).catch(() => {})
    api.listCategories().then(d => { if (!cancelled) setCategories(d) }).catch(() => {})
    api.getStoreSettings().then(d => { if (!cancelled) { setUseVAT(!!d?.use_vat); if (d?.visible_prices) setVisiblePrices(d.visible_prices) } }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Product dialog search
  async function doProductDialogSearch() {
    const q = dialogQ.trim()
    if (!q || q === lastDialogSearchRef.current) return
    lastDialogSearchRef.current = q
    setDialogLoading(true)
    try {
      const data = await api.listProducts({ q, limit: 10, page: 1 })
      setDialogResults(data.items || [])
    } catch {} finally {
      setDialogLoading(false)
    }
  }

  function openProductDialog() {
    setDialogQ('')
    setDialogResults([])
    lastDialogSearchRef.current = ''
    document.getElementById('product-dialog')?.showModal()
  }

  async function selectProduct(p) {
    // Check if product has variants
    try {
      const variants = await api.listVariants(p.id)
      if (variants && variants.length > 0) {
        setPurchaseVariantProduct(p)
        setPurchaseVariants(variants)
        document.getElementById('product-dialog')?.close()
        document.getElementById('purchase-variant-dialog')?.showModal()
        return
      }
    } catch {}
    function openLineDialog(form) {
      setLineForm(form)
      document.getElementById('product-dialog')?.close()
      setTimeout(() => document.getElementById('line-dialog')?.showModal(), 100)
    }

    openLineDialog({
      product_id:   p.id,
      variant_id:   '',
      variant_name: '',
      product_name: p.name,
      qty:          1,
      prix_achat:   p.prix_achat,
      prix_vente_1: p.prix_vente_1,
      prix_vente_2: p.prix_vente_2,
      prix_vente_3: p.prix_vente_3,
      lot:          '',
      expiry_date:  '',
    })
  }

  function openLineDialogWith(form) {
    setLineForm(form)
    setTimeout(() => document.getElementById('line-dialog')?.showModal(), 100)
  }

  function selectPurchaseVariant(v) {
    const attrStr = v.attributes ? Object.values(v.attributes).join(', ') : ''
    document.getElementById('purchase-variant-dialog')?.close()
    setPurchaseVariantProduct(null)
    setPurchaseVariants([])
    openLineDialogWith({
      product_id:   purchaseVariantProduct.id,
      variant_id:   v.id,
      variant_name: attrStr,
      product_name: `${purchaseVariantProduct.name} (${attrStr})`,
      qty:          1,
      prix_achat:   v.prix_achat || purchaseVariantProduct.prix_achat,
      prix_vente_1: v.prix_vente_1 || purchaseVariantProduct.prix_vente_1,
      prix_vente_2: v.prix_vente_2 || purchaseVariantProduct.prix_vente_2,
      prix_vente_3: v.prix_vente_3 || purchaseVariantProduct.prix_vente_3,
      lot:          '',
      expiry_date:  '',
    })
  }

  function selectPurchaseNoVariant() {
    const p = purchaseVariantProduct
    document.getElementById('purchase-variant-dialog')?.close()
    setPurchaseVariantProduct(null)
    setPurchaseVariants([])
    openLineDialogWith({
      product_id:   p.id,
      variant_id:   '',
      variant_name: '',
      product_name: p.name,
      qty:          1,
      prix_achat:   p.prix_achat,
      prix_vente_1: p.prix_vente_1,
      prix_vente_2: p.prix_vente_2,
      prix_vente_3: p.prix_vente_3,
      lot:          '',
      expiry_date:  '',
    })
  }

  function confirmLineDialog() {
    if (!lineForm.product_id || lineForm.qty <= 0) return
    addLine()
    document.getElementById('line-dialog')?.close()
  }

  function addLine() {
    if (!lineForm.product_id || lineForm.qty <= 0) return
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.product_id === lineForm.product_id && (l.variant_id || '') === (lineForm.variant_id || ''))
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = { ...lineForm }
        return updated
      }
      return [...prev, { ...lineForm }]
    })
    setLineForm(emptyLine)
  }

  function removeLine(idx) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  function addExpense() {
    setExpenses(prev => [...prev, { label: '', amount: 0 }])
  }

  function removeExpense(idx) {
    setExpenses(prev => prev.filter((_, i) => i !== idx))
  }

  function updateExpense(idx, field, value) {
    setExpenses(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  const subtotalAfterLineDiscount = lines.reduce((s, l) => s + l.qty * l.prix_achat * (1 - (l.remise || 0) / 100), 0)
  const globalDiscountAmt = globalRemiseType === 'flat'
    ? Math.min(globalRemise || 0, subtotalAfterLineDiscount)
    : subtotalAfterLineDiscount * (globalRemise || 0) / 100
  const lineDiscountAmt = lines.reduce((s, l) => s + l.qty * l.prix_achat * (l.remise || 0) / 100, 0)
  const discountTotal = lineDiscountAmt + globalDiscountAmt
  const total = subtotalAfterLineDiscount - globalDiscountAmt
  const expensesTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const grandTotal = total + expensesTotal
  const hasDiscount = globalDiscountAmt > 0 || lineDiscountAmt > 0
  const showEffective = hasDiscount || (distributeExpenses && expensesTotal > 0)

  // Compute effective unit price: discounts always applied, expenses only when distribute ON
  function effectiveUnitPrice(line) {
    let price = line.prix_achat * (1 - (line.remise || 0) / 100)
    // Deduct global discount proportionally (always)
    if (globalDiscountAmt > 0 && subtotalAfterLineDiscount > 0) {
      const lineNet = line.qty * price
      const lineDiscountShare = (lineNet / subtotalAfterLineDiscount) * globalDiscountAmt
      price = (lineNet - lineDiscountShare) / line.qty
    }
    // Add expenses proportionally (only when checkbox ON)
    if (distributeExpenses && expensesTotal > 0 && total > 0) {
      const lineNet = line.qty * price
      const lineShare = (lineNet / total) * expensesTotal
      price = (lineNet + lineShare) / line.qty
    }
    return Math.round(price * 100) / 100
  }

  function openSupplierDialog() {
    setSupplierDialogQ('')
    setSupplierDialogResults(suppliers.slice(0, 20))
    document.getElementById('supplier-dialog')?.showModal()
  }

  function doSupplierSearch() {
    const q = supplierDialogQ.trim().toLowerCase()
    const filtered = q
      ? suppliers.filter((s) =>
          s.name.toLowerCase().includes(q) ||
          (s.phone || '').toLowerCase().includes(q) ||
          (s.address || '').toLowerCase().includes(q)
        ).slice(0, 20)
      : suppliers.slice(0, 20)
    setSupplierDialogResults(filtered)
  }

  function selectSupplier(s) {
    setSupplierID(s.id)
    setSupplierName(s.name)
    document.getElementById('supplier-dialog')?.close()
  }

  function openCreate() {
    setEditingId(null)
    setFormTitle(t('newPurchaseTitle'))
    setSupplierID('')
    setSupplierName('')
    setSupplierInvoice('')
    setExpectedDelivery('')
    setNote('')
    setLines([])
    setExpenses([])
    setDistributeExpenses(false)
    setGlobalRemise(0)
    setGlobalRemiseType('percent')
    setLineForm(emptyLine)
    setFormError('')
    setFormOpen(true)
  }

  async function openEdit(id) {
    try {
      const p = await api.getPurchase(id)
      setEditingId(id)
      setFormTitle(t('editPurchase'))
      setSupplierID(p.supplier_id)
      setSupplierName(p.supplier_name || '')
      setSupplierInvoice(p.supplier_invoice || '')
      setExpectedDelivery(p.expected_delivery ? p.expected_delivery.slice(0, 10) : '')
      setNote(p.note || '')
      setLines(p.lines || [])
      setExpenses(p.expenses || [])
      setDistributeExpenses(p.distribute_expenses || false)
      setGlobalRemise(p.global_remise || 0)
      setGlobalRemiseType(p.global_remise_type || 'percent')
      setLineForm(emptyLine)
      setFormError('')
      setFormOpen(true)
    } catch {}
  }

  async function handleSave() {
    setFormError('')
    if (!supplierID) { setFormError(t('selectSupplier')); return }
    const body = {
      supplier_id: supplierID,
      supplier_invoice: supplierInvoice,
      expected_delivery: expectedDelivery,
      note,
      lines: lines.map((l) => ({
        product_id:   l.product_id,
        variant_id:   l.variant_id || '',
        qty:          l.qty,
        prix_achat:   l.prix_achat,
        remise:       l.remise || 0,
        prix_vente_1: l.prix_vente_1,
        prix_vente_2: l.prix_vente_2,
        prix_vente_3: l.prix_vente_3,
        lot:          l.lot || '',
        expiry_date:  l.expiry_date ? (typeof l.expiry_date === 'string' ? l.expiry_date.slice(0, 10) : new Date(l.expiry_date).toISOString().slice(0, 10)) : '',
      })),
      expenses: expenses.filter(e => e.label && e.amount > 0),
      global_remise: globalRemise || 0,
      global_remise_type: globalRemiseType,
      distribute_expenses: distributeExpenses,
    }
    try {
      if (editingId) {
        await api.updatePurchase(editingId, body)
      } else {
        await api.createPurchase(body)
      }
      setFormOpen(false)
      load()
    } catch (e) { setFormError(e.message) }
  }

  // Validate with preview
  async function openPreview(item) {
    try {
      const preview = await api.previewValidation(item.id)
      setPreviewData(preview)
      setPreviewTarget(item)
      openModal('preview-modal')
    } catch (e) { alert(e.message) }
  }

  async function handleValidate(id, partial) {
    try {
      const body = partial ? { lines: partial } : undefined
      await api.validatePurchase(id, body)
      closeModal('preview-modal')
      setPreviewData(null)
      load()
    } catch (e) { alert(e.message) }
  }

  // Payment
  function openPay(item) {
    setPayTarget(item)
    setPayAmount(+(item.total - item.paid_amount).toFixed(2))
    setPayNote('')
    setPayError('')
    openModal('pay-modal')
  }

  async function handlePay() {
    setPayError('')
    try {
      await api.payPurchase(payTarget.id, { amount: Number(payAmount), note: payNote })
      closeModal('pay-modal')
      load()
    } catch (e) { setPayError(e.message) }
  }

  // Payment history
  async function openPayHistory(item) {
    setPayHistoryTarget(item)
    try {
      const data = await api.listPurchasePayments(item.id, { limit: 50 })
      setPayHistory(data.items || [])
    } catch {
      setPayHistory([])
    }
    openModal('pay-history-modal')
  }

  // Delete
  function openDelete(item) {
    setDeleteTarget(item)
    openModal('delete-modal')
  }

  async function confirmDelete() {
    try { await api.deletePurchase(deleteTarget.id); closeModal('delete-modal'); load() } catch {}
  }

  // Duplicate
  async function handleDuplicate(id) {
    try {
      await api.duplicatePurchase(id)
      load()
    } catch (e) { alert(e.message) }
  }

  // Return
  async function openReturn(item) {
    try {
      const [p, returnable] = await Promise.all([
        api.getPurchase(item.id),
        api.getReturnableLines(item.id),
      ])
      setReturnTarget(p)
      setReturnLines(returnable.map(l => ({
        product_id: l.product_id,
        product_name: l.product_name,
        received_qty: l.received_qty || 0,
        returned_qty: l.returned_qty || 0,
        returnable: l.returnable || 0,
        return_qty: 0,
      })))
      setReturnError('')
      openModal('return-modal')
    } catch (e) { alert(e.message) }
  }

  async function handleReturn() {
    setReturnError('')
    const toReturn = returnLines
      .filter(l => l.return_qty > 0)
      .map(l => ({ product_id: l.product_id, received_qty: l.return_qty }))
    if (toReturn.length === 0) {
      setReturnError(t('noReturnQty'))
      return
    }
    try {
      await api.returnPurchase(returnTarget.id, { lines: toReturn })
      closeModal('return-modal')
      load()
    } catch (e) { setReturnError(e.message) }
  }

  // Low stock
  async function openLowStock() {
    try {
      const items = await api.getLowStock({ limit: 50 })
      setLowStockItems(items)
      setLowStockOpen(true)
    } catch {}
  }

  function addLowStockToForm(p) {
    const exists = lines.find(l => l.product_id === p.id && !l.variant_id)
    if (exists) return
    setLines(prev => [...prev, {
      product_id: p.id,
      variant_id: '',
      variant_name: '',
      product_name: p.name,
      qty: Math.max(1, p.qty_min - p.qty_available),
      prix_achat: p.prix_achat,
      remise: 0,
      prix_vente_1: p.prix_vente_1,
      prix_vente_2: 0,
      prix_vente_3: 0,
      lot: '',
      expiry_date: '',
    }])
  }

  // Print
  function handlePrint(item) {
    const w = window.open('', '_blank', 'width=800,height=600')
    if (!w) return
    const linesHtml = (item.lines || []).map(l => {
      const lotCell = canBatches ? `<td>${l.lot || '-'}</td>` : ''
      const expiryCell = canBatches ? `<td>${l.expiry_date ? new Date(l.expiry_date).toLocaleDateString() : '-'}</td>` : ''
      return `<tr><td>${l.product_name}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right">${l.received_qty || 0}</td><td style="text-align:right">${l.prix_achat.toFixed(2)}</td><td style="text-align:right">${l.remise ? l.remise + '%' : '-'}</td>${lotCell}${expiryCell}<td style="text-align:right">${(l.qty * l.prix_achat * (1 - (l.remise || 0) / 100)).toFixed(2)}</td></tr>`
    }).join('')
    const discountHtml = (item.discount_total || 0) > 0
      ? `<p style="color:red"><strong>${t('totalDiscount')}:</strong> -${item.discount_total.toFixed(2)}${item.global_remise ? ` (${t('globalDiscount')}: ${item.global_remise}%)` : ''}</p>`
      : ''
    const expensesHtml = (item.expenses || []).length > 0
      ? `<h3>${t('purchaseExpenses')}</h3><table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>${t('expenseLabel')}</th><th style="text-align:right">${t('expenseAmountShort')}</th></tr></thead><tbody>${item.expenses.map(e => `<tr><td>${e.label}</td><td style="text-align:right">${e.amount.toFixed(2)}</td></tr>`).join('')}</tbody></table>`
      : ''
    w.document.write(`<html><head><title>${item.ref}</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 8px}th{background:#f5f5f5;text-align:left}</style></head><body>
      <h2>${t('purchaseRef')}: ${item.ref}</h2>
      <p><strong>${t('purchaseSupplier')}:</strong> ${item.supplier_name}</p>
      ${item.supplier_invoice ? `<p><strong>${t('supplierInvoice')}:</strong> ${item.supplier_invoice}</p>` : ''}
      <p><strong>${t('purchaseDate')}:</strong> ${new Date(item.created_at).toLocaleDateString()}</p>
      <p><strong>${t('purchaseStatus')}:</strong> ${item.status}</p>
      ${item.created_by_email ? `<p><strong>${t('createdBy')}:</strong> ${item.created_by_email}</p>` : ''}
      ${item.validated_by_email ? `<p><strong>${t('validatedBy')}:</strong> ${item.validated_by_email}</p>` : ''}
      ${item.note ? `<p><strong>${t('purchaseNote')}:</strong> ${item.note}</p>` : ''}
      <table><thead><tr><th>${t('productName')}</th><th style="text-align:right">${t('orderedQty')}</th><th style="text-align:right">${t('receivedQty')}</th><th style="text-align:right">${t('prixAchat')}</th><th style="text-align:right">${t('remise')}</th>${canBatches ? `<th>${t('batchNumber')}</th><th>${t('expiryDate')}</th>` : ''}<th style="text-align:right">Total</th></tr></thead><tbody>${linesHtml}</tbody>
      <tfoot><tr><td colspan="${canBatches ? 7 : 5}" style="text-align:right;font-weight:bold">${t('purchaseTotal')}</td><td style="text-align:right;font-weight:bold">${item.total.toFixed(2)}</td></tr></tfoot></table>
      ${discountHtml}
      ${expensesHtml}
      <p style="margin-top:16px"><strong>${t('purchaseTotal')}:</strong> ${item.total.toFixed(2)} | <strong>${t('purchasePaid2')}:</strong> ${item.paid_amount.toFixed(2)} | <strong>${t('purchaseRemaining')}:</strong> ${(item.total - item.paid_amount).toFixed(2)}</p>
    </body></html>`)
    w.document.close()
    w.print()
  }

  const { items, pages } = result

  // Keyboard shortcuts for purchase form
  useEffect(() => {
    if (!formOpen) return
    function handleKey(e) {
      const lineDialog = document.getElementById('line-dialog')
      const lineDialogOpen = lineDialog?.open

      // F3 works inside line dialog to confirm
      if (e.key === 'F3' && lineDialogOpen && lineForm.product_id) {
        e.preventDefault()
        confirmLineDialog()
        return
      }

      // Block other shortcuts when any dialog is open
      const dialog = document.querySelector('dialog[open]')
      if (dialog) return

      const tag = e.target.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (e.key === 'F2') {
        e.preventDefault()
        openProductDialog()
      } else if (e.key === 'F4') {
        e.preventDefault()
        handleSave()
      } else if (e.key === 'F5') {
        e.preventDefault()
        openSupplierDialog()
      } else if (e.key === 'F6') {
        e.preventDefault()
        openLowStock()
      } else if (e.key === 'Escape' && !isInput) {
        e.preventDefault()
        setFormOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [formOpen, lineForm.product_id])

  // Shortcuts help toggle
  const [showKbHelp, setShowKbHelp] = useState(false)

  // ── Purchase form view ──────────────────────────────────────────────────────
  if (formOpen) {
    const pvCount = (visiblePrices.pv1 ? 1 : 0) + (visiblePrices.pv2 ? 1 : 0) + (visiblePrices.pv3 ? 1 : 0)
    const colCount = 5 + pvCount + (showEffective ? 1 : 0) + (canBatches ? 2 : 0)
    return (
      <Layout currentPath={path}>
        <div class="flex flex-col h-[calc(100vh-80px)]">

          {/* ── Top bar ── */}
          <div class="flex items-center justify-between pb-3 border-b border-base-200 mb-3 flex-shrink-0">
            <div class="flex items-center gap-3">
              <button class="btn btn-sm btn-ghost" onClick={() => setFormOpen(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
              </button>
              <h2 class="text-lg font-bold">{formTitle}</h2>
              {supplierName && <span class="badge badge-outline badge-sm">{supplierName}</span>}
            </div>
            <div class="flex items-center gap-2">
              <button class="btn btn-xs btn-ghost text-base-content/75" onClick={() => setShowKbHelp(v => !v)} title="Keyboard shortcuts">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M7.5 6.75h9a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25h-9A2.25 2.25 0 015.25 15V9a2.25 2.25 0 012.25-2.25zm1.5 3h.008v.008H9V9.75zm0 3h.008v.008H9v-.008zm3-3h.008v.008H12V9.75zm0 3h.008v.008H12v-.008zm3-3h.008v.008H15V9.75zm0 3h.008v.008H15v-.008z" /></svg>
              </button>
              <button class="btn btn-primary btn-sm gap-1" onClick={handleSave}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                {t('saveChanges')} <KBD>F4</KBD>
              </button>
            </div>
          </div>

          {/* ── Shortcuts help popover ── */}
          {showKbHelp && (
            <div class="bg-base-200 rounded-lg p-3 mb-3 flex-shrink-0 animate-fadeIn">
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
                <div class="flex justify-between gap-2"><span>{t('searchAddProduct')}</span> <KBD>F2</KBD></div>
                <div class="flex justify-between gap-2"><span>{t('addToList')}</span> <KBD>F3</KBD></div>
                <div class="flex justify-between gap-2"><span>{t('saveChanges')}</span> <KBD>F4</KBD></div>
                <div class="flex justify-between gap-2"><span>{t('purchaseSupplier')}</span> <KBD>F5</KBD></div>
                <div class="flex justify-between gap-2"><span>{t('lowStockSuggest')}</span> <KBD>F6</KBD></div>
                <div class="flex justify-between gap-2"><span>{t('back')}</span> <KBD>Esc</KBD></div>
              </div>
            </div>
          )}

          {formError && (
            <div class="alert alert-error py-2 text-sm mb-3 flex-shrink-0">{formError}</div>
          )}

          {/* ── Header fields (compact row) ── */}
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 flex-shrink-0">
            <div class="form-control" onClick={openSupplierDialog}>
              <span class="label-text text-[11px] text-base-content/80 uppercase tracking-wide">{t('purchaseSupplier')} * <KBD>F5</KBD></span>
              <input class="input input-bordered input-sm cursor-pointer" readOnly
                value={supplierName} placeholder={t('selectSupplier')} />
            </div>
            <label class="form-control">
              <span class="label-text text-[11px] text-base-content/80 uppercase tracking-wide">{t('supplierInvoice')}</span>
              <input class="input input-bordered input-sm" value={supplierInvoice}
                onInput={(e) => setSupplierInvoice(e.target.value)} />
            </label>
            <label class="form-control">
              <span class="label-text text-[11px] text-base-content/80 uppercase tracking-wide">{t('expectedDelivery')}</span>
              <input type="date" class="input input-bordered input-sm" value={expectedDelivery}
                onInput={(e) => setExpectedDelivery(e.target.value)} />
            </label>
            <label class="form-control">
              <span class="label-text text-[11px] text-base-content/80 uppercase tracking-wide">{t('purchaseNote')}</span>
              <input class="input input-bordered input-sm" value={note}
                onInput={(e) => setNote(e.target.value)} />
            </label>
          </div>

          {/* ── Product search bar (single line) ── */}
          <div class="flex gap-2 items-center mb-3 flex-shrink-0">
            <button class="btn btn-sm btn-outline flex-1 justify-start gap-2 font-normal text-base-content/80" onClick={openProductDialog}>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              {t('searchAddProduct')}
              <KBD>F2</KBD>
            </button>
            {!editingId && canAdd && (
              <button class="btn btn-xs btn-ghost text-warning" onClick={openLowStock}>
                {t('lowStockSuggest')} <KBD>F6</KBD>
              </button>
            )}
          </div>

          {/* ── Lines table (scrollable middle area) ── */}
          <div class="flex-1 overflow-auto min-h-0 rounded-lg border border-base-200 bg-base-100 mb-3">
            <table class="table table-sm table-pin-rows">
              <thead>
                <tr class="bg-base-200/60 text-[11px] uppercase tracking-wide text-base-content/80">
                  <th class="font-semibold">{t('productName')}</th>
                  <th class="font-semibold text-end w-16">{t('qty')}</th>
                  <th class="font-semibold text-end w-20">{t('prixAchat')}</th>
                  <th class="font-semibold text-end w-16">{t('remise')} %</th>
                  {showEffective && <th class="font-semibold text-end w-20">{t('effectivePrice')}</th>}
                  {visiblePrices.pv1 && <th class="font-semibold text-end w-20">{t('prixVente1')}</th>}
                  {visiblePrices.pv2 && <th class="font-semibold text-end w-20">{t('prixVente2')}</th>}
                  {visiblePrices.pv3 && <th class="font-semibold text-end w-20">{t('prixVente3')}</th>}
                  {canBatches && <th class="font-semibold w-20">{t('batchNumber')}</th>}
                  {canBatches && <th class="font-semibold w-24">{t('expiryDate')}</th>}
                  <th class="font-semibold text-end w-24">Total</th>
                  <th class="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={colCount} class="text-center py-12">
                      <div class="flex flex-col items-center gap-2 text-base-content/80">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                        <p class="text-xs">{t('noLines')}</p>
                        <p class="text-[11px]">{t('searchAddProduct')} <KBD>F2</KBD></p>
                      </div>
                    </td>
                  </tr>
                )}
                {lines.map((l, i) => {
                  const updateLine = (field, val) => setLines(prev => prev.map((ll, j) => j === i ? { ...ll, [field]: val } : ll))
                  const lineTotal = showEffective ? l.qty * effectiveUnitPrice(l) : l.qty * l.prix_achat * (1 - (l.remise || 0) / 100)
                  return (
                    <tr key={`${l.product_id}-${l.variant_id || ''}`} class="hover:bg-base-50 transition-colors group">
                      <td class="font-medium text-sm">{l.product_name}</td>
                      <td class="text-end"><input type="number" min="1" step="1" class="input input-bordered input-xs w-16 font-mono text-end" value={l.qty} onInput={(e) => updateLine('qty', Math.max(1, parseInt(e.target.value) || 1))} /></td>
                      <td class="text-end"><input type="number" min="0" step="any" class="input input-bordered input-xs w-20 font-mono text-end" value={l.prix_achat} onInput={(e) => updateLine('prix_achat', parseFloat(e.target.value) || 0)} /></td>
                      <td class="text-end"><input type="number" min="0" max="100" step="any" class="input input-bordered input-xs w-16 font-mono text-end" value={l.remise || 0} onInput={(e) => updateLine('remise', parseFloat(e.target.value) || 0)} /></td>
                      {showEffective && <td class="text-end font-mono text-sm text-primary font-semibold">{effectiveUnitPrice(l).toFixed(2)}</td>}
                      {visiblePrices.pv1 && <td class="text-end"><input type="number" min="0" step="any" class="input input-bordered input-xs w-20 font-mono text-end" value={l.prix_vente_1} onInput={(e) => updateLine('prix_vente_1', parseFloat(e.target.value) || 0)} /></td>}
                      {visiblePrices.pv2 && <td class="text-end"><input type="number" min="0" step="any" class="input input-bordered input-xs w-20 font-mono text-end" value={l.prix_vente_2} onInput={(e) => updateLine('prix_vente_2', parseFloat(e.target.value) || 0)} /></td>}
                      {visiblePrices.pv3 && <td class="text-end"><input type="number" min="0" step="any" class="input input-bordered input-xs w-20 font-mono text-end" value={l.prix_vente_3} onInput={(e) => updateLine('prix_vente_3', parseFloat(e.target.value) || 0)} /></td>}
                      {canBatches && <td><input type="text" class="input input-bordered input-xs w-20 text-sm" value={l.lot || ''} onInput={(e) => updateLine('lot', e.target.value)} /></td>}
                      {canBatches && <td><input type="date" class="input input-bordered input-xs w-28 text-sm" value={l.expiry_date ? (typeof l.expiry_date === 'string' ? l.expiry_date.slice(0, 10) : new Date(l.expiry_date).toISOString().slice(0, 10)) : ''} onInput={(e) => updateLine('expiry_date', e.target.value)} /></td>}
                      <td class="text-end font-mono text-sm font-semibold">{lineTotal.toFixed(2)}</td>
                      <td class="text-end">
                        <button class="btn btn-xs btn-ghost text-error opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeLine(i)}>
                          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Bottom: discount, expenses, total ── */}
          <div class="flex-shrink-0 border-t border-base-200 pt-3">
            {lines.length > 0 && (
              <div class="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-3 items-start">
                {/* Global discount */}
                <div class="flex items-center gap-2">
                  <span class="text-xs text-base-content/80 uppercase tracking-wide whitespace-nowrap">{t('globalDiscount')}</span>
                  <select class="select select-bordered select-xs w-16"
                    value={globalRemiseType}
                    onChange={(e) => { setGlobalRemiseType(e.target.value); setGlobalRemise(0) }}>
                    <option value="percent">%</option>
                    <option value="flat">{t('flat')}</option>
                  </select>
                  <input type="number" min="0" max={globalRemiseType === 'percent' ? 100 : undefined} step="any"
                    class="input input-bordered input-xs w-20 font-mono"
                    value={globalRemise}
                    onInput={(e) => setGlobalRemise(Number(e.target.value))} />
                  {globalRemise > 0 && <span class="text-xs text-error font-mono font-bold">-{globalDiscountAmt.toFixed(2)}</span>}
                </div>

                {/* Expenses inline */}
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs text-base-content/80 uppercase tracking-wide">{t('purchaseExpenses')}</span>
                    <button class="btn btn-xs btn-ghost text-primary py-0 h-auto min-h-0" onClick={addExpense}>+</button>
                    {expensesTotal > 0 && (
                      <label class="flex items-center gap-1 cursor-pointer ms-auto">
                        <input type="checkbox" class="checkbox checkbox-xs checkbox-primary"
                          checked={distributeExpenses}
                          onChange={(e) => setDistributeExpenses(e.target.checked)} />
                        <span class="text-[11px] text-base-content/80">{t('distributeExpensesLabel')}</span>
                      </label>
                    )}
                  </div>
                  {expenses.map((e, i) => (
                    <div key={i} class="flex gap-1 items-center mb-1">
                      <input class="input input-bordered input-xs flex-1" placeholder={t('expenseLabel')}
                        value={e.label} onInput={(ev) => updateExpense(i, 'label', ev.target.value)} />
                      <input type="number" min="0" step="any" class="input input-bordered input-xs w-24 font-mono"
                        placeholder={t('expenseAmountShort')}
                        value={e.amount} onInput={(ev) => updateExpense(i, 'amount', Number(ev.target.value))} />
                      <button class="btn btn-xs btn-ghost text-error py-0 h-auto min-h-0" onClick={() => removeExpense(i)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Grand total */}
                <div class="flex flex-col items-end gap-1">
                  {hasDiscount && (
                    <div class="text-xs text-base-content/80">
                      {t('totalDiscount')}: <span class="font-mono text-error font-bold">-{discountTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {expensesTotal > 0 && (
                    <div class="text-xs text-base-content/80">
                      {t('purchaseExpenses')}: <span class="font-mono font-bold">+{expensesTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div class="text-xl font-bold font-mono text-primary">
                    {grandTotal.toFixed(2)}
                  </div>
                  <div class="text-[11px] text-base-content/75">{lines.length} {t('productName').toLowerCase()}</div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── Product search dialog ── */}
        <dialog id="product-dialog" class="modal modal-bottom sm:modal-middle">
          <div class="modal-box w-full sm:max-w-4xl">
            <h3 class="font-bold text-lg mb-4">{t('searchAddProduct')}</h3>

            <div class="flex gap-2 mb-4">
              <input
                class="input input-bordered input-sm flex-1"
                placeholder={t('searchProducts')}
                value={dialogQ}
                onInput={(e) => { setDialogQ(e.target.value); lastDialogSearchRef.current = '' }}
                onKeyDown={(e) => e.key === 'Enter' && doProductDialogSearch()}
                autoFocus
              />
              <button class="btn btn-primary btn-sm" onClick={doProductDialogSearch} disabled={dialogLoading}>
                {dialogLoading
                  ? <span class="loading loading-spinner loading-xs" />
                  : t('search')}
              </button>
              {canAddProduct && (
                <button class="btn btn-accent btn-sm" onClick={() => setQuickAddOpen(true)}>
                  + {t('quickAddProduct')}
                </button>
              )}
            </div>

            <div class="overflow-x-auto" style="max-height: 320px; overflow-y: auto">
              <table class="table table-sm">
                <thead class="sticky top-0 bg-base-100 z-10">
                  <tr>
                    <th>{t('productName')}</th>
                    <th>{t('barcodes')}</th>
                    <th>{t('brand')}</th>
                    <th>{t('category')}</th>
                    <th class="text-end">{t('qtyAvailable')}</th>
                    <th class="text-end">{t('prixAchat')}</th>
                    <th class="text-end">{t('prixVente1')}</th>
                    <th class="text-end">{t('vat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dialogResults.length === 0 && !dialogLoading && (
                    <tr>
                      <td colSpan={8} class="text-center text-base-content/80 py-8">
                        {dialogQ.trim() ? t('noProducts') : t('searchAddProduct')}
                      </td>
                    </tr>
                  )}
                  {dialogResults.map((p) => (
                    <tr key={p.id} class="cursor-pointer hover" onClick={() => selectProduct(p)}>
                      <td class="font-medium">{p.name}</td>
                      <td class="text-sm text-base-content/80">{p.barcodes?.slice(0, 2).join(', ') || '—'}</td>
                      <td class="text-sm">{brandMap.get(p.brand_id) || '—'}</td>
                      <td class="text-sm">{catMap.get(p.category_id) || '—'}</td>
                      <td class={`text-end text-sm font-mono ${p.qty_available <= p.qty_min ? 'text-error' : ''}`}>
                        {p.qty_available}
                      </td>
                      <td class="text-end text-sm font-mono">{p.prix_achat}</td>
                      <td class="text-end text-sm font-mono">{p.prix_vente_1}</td>
                      <td class="text-end text-sm">
                        {p.vat > 0 ? <span class="badge badge-warning badge-xs">{p.vat}%</span> : '0%'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div class="modal-action">
              <form method="dialog">
                <button class="btn btn-sm btn-ghost">{t('back')}</button>
              </form>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button>close</button>
          </form>
        </dialog>

        {/* ── Add Line dialog ── */}
        <dialog id="line-dialog" class="modal modal-bottom sm:modal-middle">
          <div class="modal-box w-full sm:max-w-lg">
            <h3 class="font-bold text-base mb-4">{lineForm.product_name}</h3>
            <div class="grid grid-cols-3 gap-3">
              <label class="form-control">
                <span class="label-text text-xs">{t('qty')}</span>
                <input type="number" min="0" step="any" autoFocus
                  class="input input-bordered input-sm font-mono"
                  value={lineForm.qty}
                  onInput={(e) => setLineForm(f => ({ ...f, qty: Number(e.target.value) }))}
                  onKeyDown={(e) => e.key === 'Enter' && confirmLineDialog()} />
              </label>
              <label class="form-control">
                <span class="label-text text-xs">{t('prixAchat')}</span>
                <input type="number" min="0" step="any"
                  class="input input-bordered input-sm font-mono"
                  value={lineForm.prix_achat}
                  onInput={(e) => setLineForm(f => ({ ...f, prix_achat: Number(e.target.value) }))}
                  onKeyDown={(e) => e.key === 'Enter' && confirmLineDialog()} />
              </label>
              <label class="form-control">
                <span class="label-text text-xs">{t('remise')} %</span>
                <input type="number" min="0" max="100" step="any"
                  class="input input-bordered input-sm font-mono"
                  value={lineForm.remise}
                  onInput={(e) => setLineForm(f => ({ ...f, remise: Number(e.target.value) }))}
                  onKeyDown={(e) => e.key === 'Enter' && confirmLineDialog()} />
              </label>
              {visiblePrices.pv1 && <label class="form-control">
                <span class="label-text text-xs">{t('prixVente1')}</span>
                <input type="number" min="0" step="any"
                  class="input input-bordered input-sm font-mono"
                  value={lineForm.prix_vente_1}
                  onInput={(e) => setLineForm(f => ({ ...f, prix_vente_1: Number(e.target.value) }))}
                  onKeyDown={(e) => e.key === 'Enter' && confirmLineDialog()} />
              </label>}
              {visiblePrices.pv2 && <label class="form-control">
                <span class="label-text text-xs">{t('prixVente2')}</span>
                <input type="number" min="0" step="any"
                  class="input input-bordered input-sm font-mono"
                  value={lineForm.prix_vente_2}
                  onInput={(e) => setLineForm(f => ({ ...f, prix_vente_2: Number(e.target.value) }))}
                  onKeyDown={(e) => e.key === 'Enter' && confirmLineDialog()} />
              </label>}
              {visiblePrices.pv3 && <label class="form-control">
                <span class="label-text text-xs">{t('prixVente3')}</span>
                <input type="number" min="0" step="any"
                  class="input input-bordered input-sm font-mono"
                  value={lineForm.prix_vente_3}
                  onInput={(e) => setLineForm(f => ({ ...f, prix_vente_3: Number(e.target.value) }))}
                  onKeyDown={(e) => e.key === 'Enter' && confirmLineDialog()} />
              </label>}
              {canBatches && (
                <>
                  <label class="form-control">
                    <span class="label-text text-xs">{t('batchNumber')}</span>
                    <input type="text" class="input input-bordered input-sm"
                      value={lineForm.lot || ''}
                      onInput={(e) => setLineForm(f => ({ ...f, lot: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && confirmLineDialog()} />
                  </label>
                  <label class="form-control col-span-2">
                    <span class="label-text text-xs">{t('expiryDate')}</span>
                    <input type="date" class="input input-bordered input-sm"
                      value={lineForm.expiry_date || ''}
                      onInput={(e) => setLineForm(f => ({ ...f, expiry_date: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && confirmLineDialog()} />
                  </label>
                </>
              )}
            </div>
            {lineForm.prix_achat > 0 && (
              <div class="mt-3 text-end text-sm text-base-content/80">
                {t('purchaseTotal')}: <span class="font-mono font-bold text-primary">{(lineForm.qty * lineForm.prix_achat * (1 - (lineForm.remise || 0) / 100)).toFixed(2)}</span>
              </div>
            )}
            <div class="modal-action">
              <button class="btn btn-primary btn-sm" onClick={confirmLineDialog}>
                {t('addToList')} <KBD>F3</KBD>
              </button>
              <form method="dialog">
                <button class="btn btn-sm btn-ghost" onClick={() => setLineForm(emptyLine)}>{t('back')}</button>
              </form>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button onClick={() => setLineForm(emptyLine)}>close</button>
          </form>
        </dialog>

        {/* ── Quick add product modal ── */}
        <QuickAddProductModal
          open={quickAddOpen}
          onClose={() => setQuickAddOpen(false)}
          onCreated={(p) => {
            selectProduct(p)
            document.getElementById('product-dialog')?.close()
          }}
        />

        {/* ── Purchase variant picker dialog ── */}
        <dialog id="purchase-variant-dialog" class="modal modal-bottom sm:modal-middle">
          <div class="modal-box max-w-md">
            <h3 class="font-bold text-base mb-3">{purchaseVariantProduct?.name} — {t('variants')}</h3>
            <div class="flex flex-col gap-2 max-h-64 overflow-y-auto">
              <button
                class="btn btn-outline btn-sm justify-between"
                onClick={selectPurchaseNoVariant}
              >
                <span>{purchaseVariantProduct?.name} ({t('noVariant')})</span>
                <span class="font-mono">{purchaseVariantProduct?.prix_achat?.toFixed(2)}</span>
              </button>
              {purchaseVariants.map(v => {
                const attrStr = v.attributes ? Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(', ') : ''
                return (
                  <button
                    key={v.id}
                    class="btn btn-sm justify-between"
                    onClick={() => selectPurchaseVariant(v)}
                  >
                    <span class="text-left">{attrStr || '—'}</span>
                    <span class="flex items-center gap-2">
                      <span class="badge badge-ghost badge-sm">{t('qty')}: {v.qty_available}</span>
                      <span class="font-mono font-bold">{v.prix_achat?.toFixed(2)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div class="modal-action mt-3">
              <form method="dialog"><button class="btn btn-sm btn-ghost">{t('back')}</button></form>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop"><button>close</button></form>
        </dialog>

        {/* ── Supplier search dialog ── */}
        <dialog id="supplier-dialog" class="modal modal-bottom sm:modal-middle">
          <div class="modal-box w-full sm:max-w-2xl">
            <h3 class="font-bold text-lg mb-4">{t('purchaseSupplier')}</h3>

            <div class="flex gap-2 mb-4">
              <input
                class="input input-bordered input-sm flex-1"
                placeholder={t('search')}
                value={supplierDialogQ}
                onInput={(e) => setSupplierDialogQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSupplierSearch()}
                autoFocus
              />
              <button class="btn btn-primary btn-sm" onClick={doSupplierSearch}>{t('search')}</button>
            </div>

            <div class="overflow-x-auto" style="max-height: 320px; overflow-y: auto">
              <table class="table table-sm">
                <thead class="sticky top-0 bg-base-100 z-10">
                  <tr>
                    <th>{t('supplierName')}</th>
                    <th>{t('supplierPhone')}</th>
                    <th>{t('supplierAddress')}</th>
                    <th class="text-end">{t('supplierBalance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierDialogResults.length === 0 && (
                    <tr>
                      <td colSpan={4} class="text-center text-base-content/80 py-8">{t('noSuppliers')}</td>
                    </tr>
                  )}
                  {supplierDialogResults.map((s) => (
                    <tr key={s.id} class="cursor-pointer hover" onClick={() => selectSupplier(s)}>
                      <td class="font-medium">{s.name}</td>
                      <td class="text-sm">{s.phone || '—'}</td>
                      <td class="text-sm">{s.address || '—'}</td>
                      <td class={`text-end text-sm font-mono ${s.balance > 0 ? 'text-error' : 'text-success'}`}>
                        {s.balance.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div class="modal-action">
              <form method="dialog">
                <button class="btn btn-sm btn-ghost">{t('back')}</button>
              </form>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button>close</button>
          </form>
        </dialog>

        {/* ── Low stock dialog ── */}
        {lowStockOpen && (
          <dialog class="modal modal-bottom sm:modal-middle" open>
            <div class="modal-box w-full sm:max-w-3xl">
              <h3 class="font-bold text-lg mb-4">{t('lowStockSuggest')}</h3>
              <div class="overflow-x-auto" style="max-height: 400px; overflow-y: auto">
                {lowStockItems.length === 0 ? (
                  <p class="text-center text-base-content/80 py-8">{t('noLowStock')}</p>
                ) : (
                  <table class="table table-sm">
                    <thead class="sticky top-0 bg-base-100 z-10">
                      <tr>
                        <th>{t('productName')}</th>
                        <th class="text-end">{t('qtyAvailable')}</th>
                        <th class="text-end">Min</th>
                        <th class="text-end">{t('prixAchat')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockItems.map((p) => (
                        <tr key={p.id}>
                          <td class="font-medium">{p.name}</td>
                          <td class="text-end font-mono text-error">{p.qty_available}</td>
                          <td class="text-end font-mono">{p.qty_min}</td>
                          <td class="text-end font-mono">{p.prix_achat}</td>
                          <td class="text-end">
                            <button class="btn btn-xs btn-primary" onClick={() => addLowStockToForm(p)}
                              disabled={lines.some(l => l.product_id === p.id)}>
                              {t('addToOrder')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div class="modal-action">
                <button class="btn btn-sm btn-ghost" onClick={() => setLowStockOpen(false)}>{t('back')}</button>
              </div>
            </div>
            <div class="modal-backdrop" onClick={() => setLowStockOpen(false)} />
          </dialog>
        )}
      </Layout>
    )
  }

  // ── Purchase list view ──────────────────────────────────────────────────────
  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('purchasesPage')}</h2>
        {canAdd && (
          <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newPurchase')}</button>
        )}
      </div>

      {/* Filters */}
      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex flex-wrap gap-2">
        <input
          class="input input-bordered input-sm flex-1 min-w-40"
          placeholder={`${t('purchaseSupplier')} / ${t('purchaseRef')} / ${t('supplierInvoice')}`}
          value={filterQ}
          onInput={(e) => setFilterQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
        />
        <select class="select select-bordered select-sm"
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}>
          <option value="">{t('allStatuses')}</option>
          <option value="draft">{t('purchaseDraft')}</option>
          <option value="partially_validated">{t('purchasePartially_validated')}</option>
          <option value="validated">{t('purchaseValidated')}</option>
          <option value="paid">{t('purchasePaid')}</option>
        </select>
        <label class="flex items-center gap-1 text-sm">
          <span class="text-base-content/80">{t('dateFrom')}</span>
          <input type="date" class="input input-bordered input-sm"
            value={filterDateFrom}
            onInput={(e) => { setFilterDateFrom(e.target.value); setPage(1) }} />
        </label>
        <label class="flex items-center gap-1 text-sm">
          <span class="text-base-content/80">{t('dateTo')}</span>
          <input type="date" class="input input-bordered input-sm"
            value={filterDateTo}
            onInput={(e) => { setFilterDateTo(e.target.value); setPage(1) }} />
        </label>
        <button class="btn btn-sm btn-primary btn-outline" onClick={doSearch}>{t('search')}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
        <table class="table table-sm w-full">
          <thead class="bg-base-200/60">
            <tr>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/80">{t('ref')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/80 whitespace-nowrap">{t('purchaseDate')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/80">{t('purchaseSupplier')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/80">{t('supplierInvoice')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/80">{t('purchaseStatus')}</th>
              {useVAT && <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/80 text-end">{t('htLabel')}</th>}
              {useVAT && <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/80 text-end">TVA</th>}
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/80 text-end">{useVAT ? t('ttcLabel') : t('purchaseTotal')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/80 text-end">{t('purchasePaid2')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/80 text-end">{t('purchaseRemaining')}</th>
              {canWrite && <th class="px-3 py-2.5 w-28"></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={(canWrite ? 9 : 8) + (useVAT ? 2 : 0)} class="px-3 py-12 text-center">
                  <div class="flex flex-col items-center gap-2 text-base-content/80">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                    </svg>
                    <p class="text-sm">{t('noPurchases')}</p>
                  </div>
                </td>
              </tr>
            )}
            {items.map((p) => {
              const remaining = p.total - p.paid_amount
              return (
                <tr key={p.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                  <td class="px-3 py-2.5 font-mono text-xs text-base-content/80">{p.ref || '—'}</td>
                  <td class="px-3 py-2.5 text-sm">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td class="px-3 py-2.5 font-medium">{p.supplier_name}</td>
                  <td class="px-3 py-2.5 text-sm text-base-content/80">{p.supplier_invoice || '—'}</td>
                  <td class="px-3 py-2.5">
                    <span class={`badge badge-xs ${STATUS_BADGE[p.status] || 'badge-ghost'}`}>
                      {t('purchase' + p.status.charAt(0).toUpperCase() + p.status.slice(1))}
                    </span>
                  </td>
                  {useVAT && <td class="px-3 py-2.5 text-end font-mono text-sm">{(p.total_ht || 0).toFixed(2)}</td>}
                  {useVAT && <td class="px-3 py-2.5 text-end font-mono text-sm text-warning">{(p.total_vat || 0).toFixed(2)}</td>}
                  <td class="px-3 py-2.5 text-end font-mono text-sm">{p.total.toFixed(2)}</td>
                  <td class="px-3 py-2.5 text-end font-mono text-sm">{p.paid_amount.toFixed(2)}</td>
                  <td class={`px-3 py-2.5 text-end font-mono text-sm ${remaining > 0 ? 'text-error' : 'text-success'}`}>
                    {remaining.toFixed(2)}
                  </td>
                  {canWrite && (
                    <td class="px-3 py-2.5 text-end">
                      <div class="flex gap-1 justify-end flex-wrap">
                        {/* Print — always available */}
                        <div class="tooltip tooltip-left" data-tip={t('printPurchase')}>
                          <button class="btn btn-sm btn-ghost btn-square" onClick={async () => {
                            const full = await api.getPurchase(p.id)
                            handlePrint(full)
                          }}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                            </svg>
                          </button>
                        </div>

                        {/* Duplicate — always available with add perm */}
                        {canAdd && (
                          <div class="tooltip tooltip-left" data-tip={t('duplicatePurchase')}>
                            <button class="btn btn-sm btn-ghost btn-square" onClick={() => handleDuplicate(p.id)}>
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.5a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {p.status === 'draft' && (
                          <>
                            {canEdit && (
                              <div class="tooltip tooltip-left" data-tip={t('edit')}>
                                <button class="btn btn-sm btn-ghost btn-square" onClick={() => openEdit(p.id)}>
                                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                  </svg>
                                </button>
                              </div>
                            )}
                            {canValidate && (
                              <div class="tooltip tooltip-left" data-tip={t('validatePurchase')}>
                                <button class="btn btn-sm btn-ghost btn-square text-success" onClick={() => openPreview(p)}>
                                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </button>
                              </div>
                            )}
                            {canDelete && (
                              <div class="tooltip tooltip-left" data-tip={t('disable')}>
                                <button class="btn btn-sm btn-ghost btn-square text-error" onClick={() => openDelete(p)}>
                                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </>
                        )}

                        {p.status === 'partially_validated' && canValidate && (
                          <div class="tooltip tooltip-left" data-tip={t('validatePurchase')}>
                            <button class="btn btn-sm btn-ghost btn-square text-success" onClick={() => openPreview(p)}>
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {(p.status === 'validated' || p.status === 'partially_validated') && canPay && (
                          <>
                            <div class="tooltip tooltip-left" data-tip={t('recordPayment')}>
                              <button class="btn btn-sm btn-ghost btn-square text-primary" onClick={() => openPay(p)}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                                </svg>
                              </button>
                            </div>
                            <div class="tooltip tooltip-left" data-tip={t('purchasePayments')}>
                              <button class="btn btn-sm btn-ghost btn-square" onClick={() => openPayHistory(p)}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            </div>
                          </>
                        )}

                        {/* Return — for validated/paid purchases */}
                        {(p.status === 'validated' || p.status === 'paid' || p.status === 'partially_validated') && canValidate && !(p.ref || '').startsWith('RET-') && (
                          <div class="tooltip tooltip-left" data-tip={t('returnPurchase')}>
                            <button class="btn btn-sm btn-ghost btn-square text-warning" onClick={() => openReturn(p)}>
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {p.status === 'paid' && canPay && (
                          <div class="tooltip tooltip-left" data-tip={t('purchasePayments')}>
                            <button class="btn btn-sm btn-ghost btn-square" onClick={() => openPayHistory(p)}>
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        {pages > 1 && (
          <div class="flex items-center justify-between px-4 py-3 border-t border-base-200 bg-base-50">
            <span class="text-xs text-base-content/80">{page} / {pages}</span>
            <div class="join">
              <button class="join-item btn btn-sm btn-ghost border border-base-300" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              <button class="join-item btn btn-sm btn-ghost border border-base-300" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      <Modal id="pay-modal" title={t('recordPayment')}>
        <p class="text-sm mb-1">{payTarget?.supplier_name}</p>
        <p class="text-xs text-base-content/80 mb-3">
          {t('purchaseRemaining')}: <span class="font-mono">{payTarget ? (payTarget.total - payTarget.paid_amount).toFixed(2) : 0}</span>
        </p>
        <label class="form-control mb-3">
          <span class="label-text">{t('paymentAmount')}</span>
          <input type="number" min="0" step="any" class="input input-bordered input-sm"
            value={payAmount} onInput={(e) => setPayAmount(e.target.value)} />
        </label>
        <label class="form-control mb-3">
          <span class="label-text">{t('paymentNote')}</span>
          <input class="input input-bordered input-sm"
            value={payNote} onInput={(e) => setPayNote(e.target.value)} />
        </label>
        {payError && <p class="text-error text-sm mb-2">{payError}</p>}
        <div class="modal-action">
          <button class="btn btn-primary btn-sm" onClick={handlePay}>{t('saveChanges')}</button>
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('pay-modal')}>{t('back')}</button>
        </div>
      </Modal>

      {/* Payment History Modal */}
      <Modal id="pay-history-modal" title={t('purchasePayments')}>
        <p class="text-sm mb-3">{payHistoryTarget?.supplier_name} — {payHistoryTarget?.ref}</p>
        {payHistory.length === 0 ? (
          <p class="text-base-content/80 text-sm py-4 text-center">{t('noPurchasePayments')}</p>
        ) : (
          <div class="overflow-x-auto" style="max-height: 300px; overflow-y: auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>{t('purchaseDate')}</th>
                  <th class="text-end">{t('paymentAmount')}</th>
                  <th>{t('paymentNote')}</th>
                </tr>
              </thead>
              <tbody>
                {payHistory.map((ph) => (
                  <tr key={ph.id}>
                    <td class="text-sm">{new Date(ph.created_at).toLocaleString()}</td>
                    <td class="text-end font-mono text-sm">{ph.amount.toFixed(2)}</td>
                    <td class="text-sm text-base-content/80">{ph.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div class="modal-action">
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('pay-history-modal')}>{t('back')}</button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal id="delete-modal" title={t('deletePurchase')}>
        <p class="text-sm mb-4">{deleteTarget?.supplier_name}</p>
        <div class="modal-action">
          <button class="btn btn-error btn-sm" onClick={confirmDelete}>{t('deleteConfirm')}</button>
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('delete-modal')}>{t('back')}</button>
        </div>
      </Modal>

      {/* Preview Validation Modal */}
      <Modal id="preview-modal" title={t('previewTitle')}>
        {previewData && previewData.length > 0 ? (
          <div class="overflow-x-auto" style="max-height: 400px; overflow-y: auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>{t('productName')}</th>
                  <th class="text-end">{t('currentStock')}</th>
                  <th class="text-end">{t('currentPrice')}</th>
                  <th class="text-end">{t('incoming')}</th>
                  <th class="text-end">{t('newPrice')}</th>
                </tr>
              </thead>
              <tbody>
                {previewData.map((pl) => (
                  <tr key={pl.product_id}>
                    <td class="font-medium">{pl.product_name}</td>
                    <td class="text-end font-mono">{pl.current_qty}</td>
                    <td class="text-end font-mono">{pl.current_prix_achat.toFixed(2)}</td>
                    <td class="text-end font-mono">{pl.incoming_qty} x {pl.incoming_prix_achat.toFixed(2)}</td>
                    <td class={`text-end font-mono font-bold ${pl.new_prix_achat !== pl.current_prix_achat ? 'text-warning' : ''}`}>
                      {pl.new_prix_achat.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="text-center text-base-content/80 py-4">{t('noLines')}</p>
        )}
        <div class="modal-action">
          <button class="btn btn-primary btn-sm" onClick={() => handleValidate(previewTarget?.id)}>
            {t('confirmValidation')}
          </button>
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('preview-modal')}>{t('back')}</button>
        </div>
      </Modal>

      {/* Return Modal */}
      <Modal id="return-modal" title={t('returnPurchaseTitle')}>
        <p class="text-sm mb-3">{returnTarget?.supplier_name} — {returnTarget?.ref}</p>
        {returnLines.length > 0 && (
          <div class="overflow-x-auto" style="max-height: 300px; overflow-y: auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>{t('productName')}</th>
                  <th class="text-end">{t('receivedQty')}</th>
                  <th class="text-end">{t('alreadyReturned')}</th>
                  <th class="text-end">{t('returnQty')}</th>
                </tr>
              </thead>
              <tbody>
                {returnLines.filter(rl => rl.returnable > 0).map((rl, i) => (
                  <tr key={rl.product_id}>
                    <td class="font-medium">{rl.product_name}</td>
                    <td class="text-end font-mono">{rl.received_qty}</td>
                    <td class="text-end font-mono text-warning">{rl.returned_qty > 0 ? rl.returned_qty : '—'}</td>
                    <td class="text-end">
                      <input type="number" min="0" max={rl.returnable} step="1"
                        class="input input-bordered input-xs w-20 text-end"
                        value={rl.return_qty}
                        onInput={(e) => {
                          const v = Math.min(Math.max(0, Number(e.target.value)), rl.returnable)
                          setReturnLines(prev => prev.map((r, j) => r.product_id === rl.product_id ? { ...r, return_qty: v } : r))
                        }} />
                      <span class="text-xs text-base-content/80 ml-1">/ {rl.returnable}</span>
                    </td>
                  </tr>
                ))}
                {returnLines.every(rl => rl.returnable <= 0) && (
                  <tr><td colSpan={4} class="text-center text-base-content/80 py-4">{t('noReturnQty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {returnError && <p class="text-error text-sm mt-2">{returnError}</p>}
        <div class="modal-action">
          <button class="btn btn-warning btn-sm" onClick={handleReturn}>{t('confirmReturn')}</button>
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('return-modal')}>{t('back')}</button>
        </div>
      </Modal>
    </Layout>
  )
}
