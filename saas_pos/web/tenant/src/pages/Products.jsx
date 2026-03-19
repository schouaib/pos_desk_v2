import { useState, useEffect, useCallback, useMemo } from 'preact/hooks'
import { lazy, Suspense } from 'preact/compat'
import { route } from 'preact-router'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { hasPerm, hasFeature } from '../lib/auth'
import { compressImage } from '../lib/imageCompress'

const PRINT_MODAL_ID = 'print-label-modal'
const PrintLabelModal = lazy(() =>
  import('../components/PrintLabelModal').then(m => ({ default: m.PrintLabelModal }))
)

const emptyForm = {
  name: '', barcodes: [], category_id: '', brand_id: '', unit_id: '', ref: '', abbreviation: '',
  qty_available: 0, qty_min: 0,
  prix_achat: 0, prix_vente_1: 0, prix_vente_2: 0, prix_vente_3: 0, prix_minimum: 0,
  vat: 0,
  is_service: false, expiry_alert_days: 0, image_url: '',
}

function NumInput({ label, value, onChange }) {
  return (
    <label class="form-control">
      <span class="label-text text-xs">{label}</span>
      <input type="number" step="any" min="0" class="input input-bordered input-sm"
        value={value}
        onInput={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </label>
  )
}

export default function Products({ path }) {
  const { t } = useI18n()
  const canAdd      = hasPerm('products', 'add')
  const canEdit     = hasPerm('products', 'edit')
  const canDelete   = hasPerm('products', 'delete')
  const canMovement    = hasPerm('products', 'movement') && hasFeature('product_history')
  const canLoss        = hasPerm('products', 'loss')
  const canMultiBarcode = hasFeature('multi_barcodes')
  const canAdjust      = hasPerm('products', 'adjustment')
  const canAlert       = hasPerm('products', 'alert')
  const canExport      = hasPerm('products', 'export')
  const canArchive     = hasPerm('products', 'archive')
  const canValuation   = hasPerm('products', 'valuation')
  const canPriceHist   = hasPerm('products', 'price_history')
  const canVariants    = hasFeature('product_variants')
  const canDiscounts   = hasFeature('product_discounts')
  const canBundles     = hasFeature('product_bundles')
  const canBatches     = hasFeature('batch_tracking')

  const [categories, setCategories] = useState([])
  const [brands, setBrands] = useState([])
  const [units, setUnits] = useState([])
  const [result, setResult] = useState({ items: [], total: 0, page: 1, limit: 10, pages: 0 })
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  function doSearch() {
    setPage(1)
    setQ(qInput)
  }

  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [printTarget, setPrintTarget] = useState(null)

  // Stock movements
  const [movTarget, setMovTarget] = useState(null)
  const [movResult, setMovResult] = useState({ items: [], total: 0, page: 1, limit: 20, pages: 1 })
  const [movPage, setMovPage] = useState(1)
  const [movLoading, setMovLoading] = useState(false)
  const [movDateFrom, setMovDateFrom] = useState('')
  const [movDateTo, setMovDateTo] = useState('')
  const [tab, setTab] = useState(0)
  const [imagePreview, setImagePreview] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState('')

  // Stock loss
  const [lossTarget, setLossTarget] = useState(null)
  const [lossForm, setLossForm] = useState({ type: 'perte', qty: 1, remark: '' })
  const [lossLoading, setLossLoading] = useState(false)
  const [lossError, setLossError] = useState('')

  // New features state
  const [adjTarget, setAdjTarget] = useState(null)
  const [adjForm, setAdjForm] = useState({ qty_after: 0, reason: '' })
  const [adjLoading, setAdjLoading] = useState(false)
  const [valuationData, setValuationData] = useState(null)
  const [priceHistTarget, setPriceHistTarget] = useState(null)
  const [priceHistItems, setPriceHistItems] = useState([])

  // Plan-gated features state
  const [variantTarget, setVariantTarget] = useState(null)
  const [variantItems, setVariantItems] = useState([])
  const [variantForm, setVariantForm] = useState({ attributes: '', barcodes: '', qty_available: 0, prix_achat: 0, prix_vente_1: 0, prix_vente_2: 0, prix_vente_3: 0 })
  const [discountTarget, setDiscountTarget] = useState(null)
  const [discountItems, setDiscountItems] = useState([])
  const [discountForm, setDiscountForm] = useState({ type: 'percentage', value: 0, min_qty: 0, start_date: '', end_date: '' })
  const [batchTarget, setBatchTarget] = useState(null)
  const [batchItems, setBatchItems] = useState([])
  const [batchForm, setBatchForm] = useState({ batch_number: '', expiry_date: '', qty: 0, prix_achat: 0 })
  const [bundleItems, setBundleItems] = useState([])
  const [bundleSearch, setBundleSearch] = useState('')
  const [bundleResults, setBundleResults] = useState([])

  useEffect(() => {
    let cancelled = false
    api.listCategories().then(d => { if (!cancelled) setCategories(d) }).catch(() => {})
    api.listBrands().then(d => { if (!cancelled) setBrands(d) }).catch(() => {})
    api.listUnits().then(d => { if (!cancelled) setUnits(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const load = useCallback(async () => {
    try {
      const data = await api.listProducts({ q, page, limit })
      setResult(data)
    } catch {}
  }, [q, page, limit])

  useEffect(() => {
    let cancelled = false
    api.listProducts({ q, page, limit })
      .then(data => { if (!cancelled) setResult(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [q, page, limit])

  // Revoke blob URL when it changes or on unmount to avoid memory leaks
  useEffect(() => () => { URL.revokeObjectURL(imagePreview) }, [imagePreview])

  function resetImageState() {
    setImagePreview(prev => { if (prev) URL.revokeObjectURL(prev); return '' })
    setImageError('')
    setImageUploading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setBarcodeInput('')
    setError('')
    setTab(0)
    resetImageState()
    openModal('product-modal')
  }

  function openEdit(p) {
    setEditing(p)
    setForm({
      name: p.name,
      barcodes: p.barcodes || [],
      category_id: p.category_id || '',
      brand_id: p.brand_id || '',
      unit_id: p.unit_id || '',
      ref: p.ref,
      abbreviation: p.abbreviation,
      qty_min: p.qty_min,
      prix_achat: p.prix_achat, prix_vente_1: p.prix_vente_1, prix_vente_2: p.prix_vente_2,
      prix_vente_3: p.prix_vente_3, prix_minimum: p.prix_minimum,
      vat: p.vat ?? 0,
      is_service: p.is_service,
      expiry_alert_days: p.expiry_alert_days || 0,
      image_url: p.image_url || '',
    })
    setBarcodeInput('')
    setError('')
    setTab(0)
    resetImageState()
    setBundleItems(p.bundle_items || [])
    openModal('product-modal')
  }

  async function handleImageSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageError('')
    setImageUploading(true)
    try {
      const blob = await compressImage(file)
      setImagePreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob) })
      const result = await api.uploadProductImage(blob)
      setForm((f) => ({ ...f, image_url: result.url }))
    } catch (err) {
      setImageError(err.message || 'Upload failed')
      setImagePreview('')
    } finally {
      setImageUploading(false)
    }
  }

  function removeImage() {
    setImagePreview(prev => { if (prev) URL.revokeObjectURL(prev); return '' })
    setForm((f) => ({ ...f, image_url: '' }))
  }

  function addBarcode() {
    const v = barcodeInput.trim()
    if (!v || form.barcodes.includes(v)) return
    setForm({ ...form, barcodes: [...form.barcodes, v] })
    setBarcodeInput('')
  }

  function removeBarcode(b) {
    setForm({ ...form, barcodes: form.barcodes.filter((x) => x !== b) })
  }

  async function handleSubmit(e) {
    if (e?.preventDefault) e.preventDefault()
    if (tab !== 2) return
    setError('')
    setLoading(true)
    try {
      const payload = { ...form }
      if (canBundles && form.is_bundle) {
        payload.bundle_items = bundleItems
      }
      if (editing) {
        const { qty_available, ...rest } = payload
        await api.updateProduct(editing.id, rest)
      } else {
        await api.createProduct(payload)
      }
      closeModal('product-modal')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function openMovements(p) {
    setMovTarget(p)
    setMovPage(1)
    setMovDateFrom('')
    setMovDateTo('')
    setMovResult({ items: [], total: 0, page: 1, limit: 20, pages: 1 })
    setMovLoading(true)
    document.getElementById('mov-dialog')?.showModal()
    try {
      const data = await api.listProductMovements(p.id, { page: 1, limit: 20 })
      setMovResult(data)
    } catch {} finally { setMovLoading(false) }
  }

  async function loadMovPage(p, pg, dateFrom, dateTo) {
    setMovPage(pg)
    setMovLoading(true)
    try {
      const params = { page: pg, limit: 20 }
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const data = await api.listProductMovements(p.id, params)
      setMovResult(data)
    } catch {} finally { setMovLoading(false) }
  }

  async function applyMovFilter() {
    await loadMovPage(movTarget, 1, movDateFrom, movDateTo)
    setMovPage(1)
  }

  function openLoss(p) {
    setLossTarget(p)
    setLossForm({ type: 'perte', qty: 1, remark: '' })
    setLossError('')
    document.getElementById('loss-dialog')?.showModal()
  }

  async function handleLoss(e) {
    e.preventDefault()
    if (lossForm.qty < 1) return
    setLossLoading(true)
    setLossError('')
    try {
      await api.createLoss({ product_id: lossTarget.id, ...lossForm })
      document.getElementById('loss-dialog')?.close()
      load()
    } catch (err) {
      setLossError(err.message)
    } finally {
      setLossLoading(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await api.deleteProduct(deleteTarget.id)
      setDeleteTarget(null)
      closeModal('delete-modal')
      load()
    } catch {}
  }

  // Stock Adjustment
  function openAdjust(p) {
    setAdjTarget(p)
    setAdjForm({ qty_after: p.qty_available, reason: '' })
    setAdjLoading(false)
    document.getElementById('adj-dialog')?.showModal()
  }
  async function handleAdjust(e) {
    e.preventDefault()
    setAdjLoading(true)
    try {
      await api.createAdjustment({ product_id: adjTarget.id, qty_after: adjForm.qty_after, reason: adjForm.reason })
      document.getElementById('adj-dialog')?.close()
      load()
    } catch {} finally { setAdjLoading(false) }
  }

  // Duplicate
  async function handleDuplicate(p) {
    try { await api.duplicateProduct(p.id); load() } catch {}
  }

  // Archive / Unarchive
  async function handleArchive(p) {
    try { await api.archiveProduct(p.id); load() } catch {}
  }

  // Valuation
  async function openValuation() {
    try { const data = await api.getProductValuation(); setValuationData(data) } catch {}
    document.getElementById('valuation-dialog')?.showModal()
  }

  // Price history
  async function openPriceHistory(p) {
    setPriceHistTarget(p)
    try { const r = await api.listPriceHistory(p.id, { page: 1, limit: 50 }); setPriceHistItems(r.items || []) } catch {}
    document.getElementById('pricehist-dialog')?.showModal()
  }

  // Variants
  async function openVariants(p) {
    setVariantTarget(p)
    try { setVariantItems(await api.listVariants(p.id)) } catch { setVariantItems([]) }
    document.getElementById('variant-dialog')?.showModal()
  }
  async function addVariant(e) {
    e.preventDefault()
    try {
      const attrs = {}
      variantForm.attributes.split(',').forEach(s => { const [k, v] = s.split(':').map(x => x.trim()); if (k && v) attrs[k] = v })
      const barcodes = variantForm.barcodes ? variantForm.barcodes.split(',').map(s => s.trim()).filter(Boolean) : []
      await api.createVariant(variantTarget.id, { attributes: attrs, barcodes, qty_available: variantForm.qty_available, prix_achat: variantForm.prix_achat, prix_vente_1: variantForm.prix_vente_1, prix_vente_2: variantForm.prix_vente_2, prix_vente_3: variantForm.prix_vente_3 })
      setVariantItems(await api.listVariants(variantTarget.id))
      setVariantForm({ attributes: '', barcodes: '', qty_available: 0, prix_achat: 0, prix_vente_1: 0, prix_vente_2: 0, prix_vente_3: 0 })
    } catch {}
  }
  async function deleteVariant(id) {
    try { await api.deleteVariant(id); setVariantItems(await api.listVariants(variantTarget.id)) } catch {}
  }

  // Discounts
  async function openDiscounts(p) {
    setDiscountTarget(p)
    try { setDiscountItems(await api.listProductDiscounts(p.id)) } catch { setDiscountItems([]) }
    document.getElementById('discount-dialog')?.showModal()
  }
  async function addDiscount(e) {
    e.preventDefault()
    try {
      await api.createDiscount({ product_id: discountTarget.id, type: discountForm.type, value: discountForm.value, min_qty: discountForm.min_qty, start_date: discountForm.start_date || undefined, end_date: discountForm.end_date || undefined })
      setDiscountItems(await api.listProductDiscounts(discountTarget.id))
      setDiscountForm({ type: 'percentage', value: 0, min_qty: 0, start_date: '', end_date: '' })
    } catch {}
  }
  async function deleteDiscount(id) {
    try { await api.deleteDiscount(id); setDiscountItems(await api.listProductDiscounts(discountTarget.id)) } catch {}
  }

  // Batches
  async function openBatches(p) {
    setBatchTarget(p)
    try { const r = await api.listProductBatches(p.id, { page: 1, limit: 50 }); setBatchItems(r.items || []) } catch { setBatchItems([]) }
    document.getElementById('batch-dialog')?.showModal()
  }
  function openAddBatch() {
    setBatchForm({ batch_number: '', expiry_date: '', qty: 0, prix_achat: 0 })
    document.getElementById('batch-add-dialog')?.showModal()
  }
  async function addBatch(e) {
    e.preventDefault()
    try {
      await api.createBatch({ product_id: batchTarget.id, batch_number: batchForm.batch_number, expiry_date: batchForm.expiry_date || undefined, qty: batchForm.qty, prix_achat: batchForm.prix_achat })
      const r = await api.listProductBatches(batchTarget.id, { page: 1, limit: 50 })
      setBatchItems(r.items || [])
      document.getElementById('batch-add-dialog')?.close()
      load()
    } catch {}
  }
  async function deleteBatch(id) {
    try {
      await api.deleteBatch(id)
      const r = await api.listProductBatches(batchTarget.id, { page: 1, limit: 50 })
      setBatchItems(r.items || [])
      load()
    } catch {}
  }
  // Bundle items for product form
  async function searchBundleProduct() {
    if (!bundleSearch.trim()) return
    try { const r = await api.listProducts({ q: bundleSearch, limit: 5 }); setBundleResults(r.items || []) } catch {}
  }
  function addBundleItem(p) {
    if (bundleItems.find(b => b.product_id === p.id)) return
    setBundleItems([...bundleItems, { product_id: p.id, product_name: p.name, qty: 1 }])
    setBundleResults([])
    setBundleSearch('')
  }
  function removeBundleItem(pid) { setBundleItems(bundleItems.filter(b => b.product_id !== pid)) }

  const { items, total, pages } = result
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)

  const catMap   = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories])
  const brandMap = useMemo(() => new Map(brands.map(b => [b.id, b.name])), [brands])
  const unitMap  = useMemo(() => new Map(units.map(u => [u.id, u.name])), [units])

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('productsPage')}</h2>
        {canAdd && (
          <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newProduct')}</button>
        )}
      </div>

      {/* Search + page size + feature buttons */}
      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-2 flex-wrap">
        <input class="input input-bordered input-sm flex-1 min-w-40"
          placeholder={t('searchProducts')} value={qInput}
          onInput={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        <button class="btn btn-sm btn-primary btn-outline" onClick={doSearch}>{t('search')}</button>
        {canAlert && (
          <button class="btn btn-sm btn-warning btn-outline" onClick={() => route('/low-stock')}>{t('lowStockAlert')}</button>
        )}
        {canExport && (
          <button class="btn btn-sm btn-accent btn-outline" onClick={() => api.exportProducts().catch(() => {})}>{t('exportCSV')}</button>
        )}
        {canValuation && (
          <button class="btn btn-sm btn-info btn-outline" onClick={openValuation}>{t('valuation')}</button>
        )}
        {canArchive && (
          <button class="btn btn-sm btn-ghost btn-outline" onClick={() => route('/archived-products')}>
            {t('showArchived')}
          </button>
        )}
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
        <table class="table table-sm w-full">
          <thead class="bg-base-200/60">
            <tr>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('productName')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('categoriesPage')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('brandsPage')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('unitsPage')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('ref')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('qtyAvailable')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('prixVente1')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('vat')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 w-28">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                <td class="px-3 py-2.5">
                  <div class="font-medium">{p.name}</div>
                  {p.barcodes?.length > 0 && (
                    <div class="text-xs text-base-content/50">{p.barcodes.slice(0, 2).join(', ')}{p.barcodes.length > 2 ? '…' : ''}</div>
                  )}
                </td>
                <td class="px-3 py-2.5 text-sm">{catMap.get(p.category_id) || '—'}</td>
                <td class="px-3 py-2.5 text-sm">{brandMap.get(p.brand_id) || '—'}</td>
                <td class="px-3 py-2.5 text-sm">{unitMap.get(p.unit_id) || '—'}</td>
                <td class="px-3 py-2.5 text-sm">{p.ref || '—'}</td>
                <td class="px-3 py-2.5 text-sm">
                  {p.is_service
                    ? <span class="badge badge-outline badge-xs">{t('isService')}</span>
                    : p.qty_available}
                </td>
                <td class="px-3 py-2.5 text-sm">{p.prix_vente_1}</td>
                <td class="px-3 py-2.5 text-sm">
                  {p.vat > 0
                    ? <span class="badge badge-warning badge-xs">{p.vat}%</span>
                    : '—'}
                </td>
                <td class="px-3 py-2.5">
                  <div class="flex gap-1 flex-wrap">
                  {canLoss && (
                    <div class="tooltip tooltip-left" data-tip={t('recordLoss')}>
                      <button class="btn btn-xs btn-ghost btn-square text-warning" onClick={() => openLoss(p)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {canMovement && (
                    <div class="tooltip tooltip-left" data-tip={t('stockMovements')}>
                      <button class="btn btn-xs btn-ghost btn-square text-accent" onClick={() => openMovements(p)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {canEdit && (
                    <div class="tooltip tooltip-left" data-tip={t('edit')}>
                      <button class="btn btn-xs btn-ghost btn-square" onClick={() => openEdit(p)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {canEdit && (
                    <div class="tooltip tooltip-left" data-tip={t('printLabel')}>
                      <button class="btn btn-xs btn-ghost btn-square text-info" onClick={() => { setPrintTarget(p); openModal(PRINT_MODAL_ID) }}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {canAdjust && !p.is_service && (
                    <div class="tooltip tooltip-left" data-tip={t('adjustStock')}>
                      <button class="btn btn-xs btn-ghost btn-square text-secondary" onClick={() => openAdjust(p)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {canPriceHist && (
                    <div class="tooltip tooltip-left" data-tip={t('priceHistory')}>
                      <button class="btn btn-xs btn-ghost btn-square text-info" onClick={() => openPriceHistory(p)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {canAdd && (
                    <div class="tooltip tooltip-left" data-tip={t('duplicate')}>
                      <button class="btn btn-xs btn-ghost btn-square" onClick={() => handleDuplicate(p)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {canVariants && (
                    <div class="tooltip tooltip-left" data-tip={t('variants')}>
                      <button class="btn btn-xs btn-ghost btn-square text-primary" onClick={() => openVariants(p)}>V</button>
                    </div>
                  )}
                  {canDiscounts && (
                    <div class="tooltip tooltip-left" data-tip={t('discountRules')}>
                      <button class="btn btn-xs btn-ghost btn-square text-accent" onClick={() => openDiscounts(p)}>%</button>
                    </div>
                  )}
                  {canBatches && !p.is_service && (
                    <div class="tooltip tooltip-left" data-tip={t('batches')}>
                      <button class="btn btn-xs btn-ghost btn-square text-info" onClick={() => openBatches(p)}>L</button>
                    </div>
                  )}
                  {canArchive && (
                    <div class="tooltip tooltip-left" data-tip={t('archive')}>
                      <button class="btn btn-xs btn-ghost btn-square text-warning" onClick={() => handleArchive(p)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {canDelete && (
                    <div class="tooltip tooltip-left" data-tip={t('disable')}>
                      <button class="btn btn-xs btn-ghost btn-square text-error" onClick={() => { setDeleteTarget(p); openModal('delete-modal') }}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} class="py-12 text-center">
                  <div class="flex flex-col items-center gap-2 text-base-content/30">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                    <p class="text-sm">{t('noProducts')}</p>
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
                  ? <button key={`d${i}`} class="join-item btn btn-sm btn-disabled">…</button>
                  : <button key={b} class={`join-item btn btn-sm ${b === page ? 'btn-active' : ''}`} onClick={() => setPage(b)}>{b}</button>
              )
            })()}
            <button class="join-item btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>»</button>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal id="product-modal" title={editing ? t('editProduct') : t('newProductTitle')} size="xl">
        {/* Step indicator */}
        <div class="flex items-center mb-6 bg-base-200 rounded-xl p-2">
          {[t('basicInfo'), t('pricing'), t('stock')].map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setTab(i)}
              class={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all
                ${tab === i ? 'bg-primary text-primary-content shadow-sm' : tab > i ? 'text-success' : 'text-base-content/40 hover:text-base-content/60'}`}
            >
              <span class={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors
                ${tab === i ? 'border-primary-content bg-primary-content/20 text-primary-content' : tab > i ? 'border-success bg-success text-success-content' : 'border-current'}`}>
                {tab > i ? '✓' : i + 1}
              </span>
              {label}
            </button>
          ))}
        </div>

        {error && <div class="alert alert-error text-sm py-2 mb-4"><span>{error}</span></div>}

        <form onSubmit={handleSubmit}>
          {/* Tab 0: Basic Info */}
          {tab === 0 && (
            <div class="space-y-5">
              {/* Product name + image side by side */}
              <div class="flex gap-4 items-start">
                <div class="flex-1 space-y-3">
                  <label class="form-control">
                    <span class="label-text text-xs font-semibold">{t('productName')} *</span>
                    <input class="input input-bordered input-sm" value={form.name} required
                      onInput={(e) => setForm({ ...form, name: e.target.value })} />
                  </label>
                  <div class="grid grid-cols-2 gap-2">
                    <label class="form-control">
                      <span class="label-text text-xs">{t('ref')}</span>
                      <input class="input input-bordered input-sm" value={form.ref}
                        onInput={(e) => setForm({ ...form, ref: e.target.value })} />
                    </label>
                    <label class="form-control">
                      <span class="label-text text-xs">{t('abbreviation')}</span>
                      <input class="input input-bordered input-sm" value={form.abbreviation}
                        onInput={(e) => setForm({ ...form, abbreviation: e.target.value })} />
                    </label>
                  </div>
                </div>
                {/* Image */}
                <div class="shrink-0 flex flex-col items-center gap-1.5">
                  <div class="w-20 h-20 rounded-xl border-2 border-dashed border-base-300 flex items-center justify-center overflow-hidden bg-base-200">
                    {(imagePreview || form.image_url)
                      ? <img src={imagePreview || form.image_url} alt="product" class="w-full h-full object-cover" />
                      : <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-base-content/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
                    }
                  </div>
                  <div class="flex gap-1">
                    <label class="btn btn-xs btn-ghost cursor-pointer">
                      {imageUploading ? <span class="loading loading-spinner loading-xs" /> : (imagePreview || form.image_url) ? t('changeImage') : t('addImage')}
                      <input type="file" accept="image/*" class="hidden" onChange={handleImageSelect} />
                    </label>
                    {(imagePreview || form.image_url) && !imageUploading && (
                      <button type="button" class="btn btn-xs btn-ghost text-error" onClick={removeImage}>✕</button>
                    )}
                  </div>
                  {imageError && <p class="text-[10px] text-error">{imageError}</p>}
                </div>
              </div>

              {/* Classification */}
              <div class="bg-base-200/50 rounded-xl p-3 space-y-2">
                <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">{t('categoriesPage')} / {t('brandsPage')} / {t('unitsPage')}</p>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label class="form-control">
                    <span class="label-text text-xs">{t('categoriesPage')}</span>
                    <select class="select select-bordered select-sm" value={form.category_id}
                      onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                      <option value="">{t('selectCategory')}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs">{t('brandsPage')}</span>
                    <select class="select select-bordered select-sm" value={form.brand_id}
                      onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
                      <option value="">{t('selectBrand')}</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs">{t('unitsPage')}</span>
                    <select class="select select-bordered select-sm" value={form.unit_id}
                      onChange={(e) => setForm({ ...form, unit_id: e.target.value })}>
                      <option value="">{t('selectUnit')}</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Barcodes */}
              <div class="bg-base-200/50 rounded-xl p-3 space-y-2">
                <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">{t('barcodes')}</p>
                <div class="flex gap-1">
                  <input class="input input-bordered input-sm flex-1" value={barcodeInput}
                    placeholder={t('addBarcode')}
                    onInput={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (canMultiBarcode || form.barcodes.length === 0) addBarcode() } }} />
                  <button type="button" class="btn btn-sm btn-outline btn-secondary" onClick={async () => {
                    try { setBarcodeInput(await api.generateBarcode()) } catch {}
                  }}>Gen</button>
                  {(canMultiBarcode || form.barcodes.length === 0) && (
                    <button type="button" class="btn btn-sm btn-outline" onClick={addBarcode}>+</button>
                  )}
                </div>
                {form.barcodes.length > 0 && (
                  <div class="flex flex-wrap gap-1.5">
                    {form.barcodes.map((b) => (
                      <span key={b} class="badge badge-outline badge-sm gap-1 font-mono">
                        {b}
                        <button type="button" class="text-error" onClick={() => removeBarcode(b)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Options row */}
              <div class="flex flex-wrap gap-4 items-center">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" class="checkbox checkbox-sm" checked={form.is_service}
                    onChange={(e) => setForm({ ...form, is_service: e.target.checked })} />
                  <span class="text-sm">{t('isService')}</span>
                </label>
                {canBundles && (
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" class="checkbox checkbox-sm checkbox-accent" checked={form.is_bundle || false}
                      onChange={(e) => setForm({ ...form, is_bundle: e.target.checked })} />
                    <span class="text-sm">{t('bundle')}</span>
                  </label>
                )}
                {canBatches && !form.is_service && (
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-base-content/60">{t('expiryAlertDays')}:</span>
                    <input type="number" min="0" step="1" class="input input-bordered input-xs w-16"
                      value={form.expiry_alert_days || 0}
                      onInput={(e) => setForm({ ...form, expiry_alert_days: parseInt(e.target.value) || 0 })} />
                  </div>
                )}
              </div>

              {/* Bundle composition */}
              {canBundles && form.is_bundle && (
                <div class="border border-accent/30 rounded-xl p-3 space-y-2">
                  <p class="text-xs font-semibold text-accent">{t('bundleComposition')}</p>
                  <div class="flex gap-1">
                    <input class="input input-bordered input-xs flex-1" placeholder={t('searchProducts')} value={bundleSearch}
                      onInput={(e) => setBundleSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchBundleProduct())} />
                    <button type="button" class="btn btn-xs btn-accent btn-outline" onClick={searchBundleProduct}>{t('search')}</button>
                  </div>
                  {bundleResults.length > 0 && (
                    <div class="bg-base-200 rounded-lg p-1 max-h-24 overflow-y-auto">
                      {bundleResults.map(p => (
                        <div key={p.id} class="text-xs cursor-pointer hover:bg-base-300 p-1 rounded" onClick={() => addBundleItem(p)}>{p.name}</div>
                      ))}
                    </div>
                  )}
                  {(form.bundle_items || bundleItems).length > 0 && (
                    <table class="table table-xs">
                      <thead><tr><th>{t('productName')}</th><th class="w-16">{t('qty')}</th><th class="w-8"></th></tr></thead>
                      <tbody>
                        {(form.bundle_items || bundleItems).map((b, i) => (
                          <tr key={i}>
                            <td class="text-xs">{b.product_name}</td>
                            <td><input type="number" min="1" step="any" class="input input-bordered input-xs w-16" value={b.qty}
                              onInput={(e) => {
                                const v = parseFloat(e.target.value) || 1
                                setBundleItems(prev => prev.map((x, j) => j === i ? { ...x, qty: v } : x))
                              }} /></td>
                            <td><button type="button" class="btn btn-xs btn-ghost text-error" onClick={() => removeBundleItem(b.product_id)}>x</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 1: Pricing */}
          {tab === 1 && (
            <div class="space-y-5">
              {/* VAT */}
              <div class="bg-base-200/50 rounded-xl p-3">
                <div class="flex items-center gap-3">
                  <span class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">{t('vatRate')}</span>
                  <input type="number" min="0" max="100" step="1" class="input input-bordered input-sm w-20"
                    value={form.vat}
                    onInput={(e) => {
                      let v = parseInt(e.target.value) || 0
                      if (v < 0) v = 0
                      if (v > 100) v = 100
                      setForm({ ...form, vat: v })
                    }} />
                  <span class="text-sm text-base-content/60">%</span>
                  {form.vat === 0 && <span class="badge badge-ghost badge-sm">{t('noVat')}</span>}
                </div>
              </div>

              {/* Purchase & minimum prices */}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="bg-base-200/50 rounded-xl p-3">
                  <NumInput label={t('prixAchat')} value={form.prix_achat} onChange={(v) => setForm({ ...form, prix_achat: v })} />
                </div>
                <div class="bg-base-200/50 rounded-xl p-3">
                  <NumInput label={t('prixMinimum')} value={form.prix_minimum} onChange={(v) => setForm({ ...form, prix_minimum: v })} />
                </div>
              </div>

              {/* Sale prices */}
              <div class="bg-base-200/50 rounded-xl p-3">
                <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">{t('pricing')}</p>
                <div class="overflow-x-auto">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th class="ps-0"></th>
                        <th>HT</th>
                        {form.vat > 0 && <th class="text-warning">{t('ttcLabel')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: t('prixVente1'), key: 'prix_vente_1' },
                        { label: t('prixVente2'), key: 'prix_vente_2' },
                        { label: t('prixVente3'), key: 'prix_vente_3' },
                      ].map(({ label, key }) => (
                        <tr key={key}>
                          <td class="ps-0 text-sm text-base-content/70">{label}</td>
                          <td class="py-1">
                            <input type="number" step="any" min="0" class="input input-bordered input-sm w-28"
                              value={form[key]}
                              onInput={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })} />
                        </td>
                        {form.vat > 0 && (
                          <td class="font-mono text-sm text-warning font-medium">
                            {(form[key] * (1 + form.vat / 100)).toFixed(2)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </div>
          )}

          {/* Tab 2: Stock */}
          {tab === 2 && (
            form.is_service
              ? <div class="flex flex-col items-center justify-center py-10 text-base-content/40">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" /></svg>
                  <p class="text-sm font-medium">{t('isService')}</p>
                </div>
              : <div class="space-y-4">
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {!editing && (
                      <div class="bg-base-200/50 rounded-xl p-4">
                        <NumInput label={t('qtyAvailable')} value={form.qty_available} onChange={(v) => setForm({ ...form, qty_available: v })} />
                      </div>
                    )}
                    <div class="bg-base-200/50 rounded-xl p-4">
                      <NumInput label={t('qtyMin')} value={form.qty_min} onChange={(v) => setForm({ ...form, qty_min: v })} />
                    </div>
                  </div>
                </div>
          )}

          <div class="modal-action mt-6 border-t border-base-200 pt-4">
            {tab > 0 && (
              <button type="button" class="btn btn-sm btn-ghost gap-1" onClick={() => setTab(tab - 1)}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                {t('back')}
              </button>
            )}
            <div class="flex-1" />
            {tab < 2
              ? <button type="button" class="btn btn-sm btn-primary gap-1" onClick={() => {
                  if (tab === 0 && !form.name.trim()) { setError(t('productName') + ' required'); return }
                  setError('')
                  setTab(tab + 1)
                }}>
                  {t('next')}
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                </button>
              : <button type="button" onClick={handleSubmit} class={`btn btn-primary btn-sm gap-1 ${loading ? 'loading' : ''}`} disabled={loading}>
                  {editing ? t('saveChanges') : t('newProduct')}
                </button>
            }
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal id="delete-modal" title={t('deleteConfirm')}>
        <p class="text-sm mb-4">{deleteTarget?.name}</p>
        <div class="modal-action">
          <button class="btn btn-error btn-sm" onClick={confirmDelete}>{t('deleteConfirm')}</button>
          <button class="btn btn-sm btn-ghost" onClick={() => closeModal('delete-modal')}>{t('saveChanges')}</button>
        </div>
      </Modal>

      {/* Stock Loss dialog */}
      <dialog id="loss-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
          <h3 class="font-bold text-lg mb-1">{t('recordLoss')}</h3>
          <p class="text-sm text-base-content/60 mb-4">{lossTarget?.name}</p>

          {lossError && (
            <div class="alert alert-error text-sm py-2 mb-3"><span>{lossError}</span></div>
          )}

          <form onSubmit={handleLoss} class="space-y-3">
            <label class="form-control">
              <span class="label-text text-xs">{t('lossType')}</span>
              <select class="select select-bordered select-sm" value={lossForm.type}
                onChange={(e) => setLossForm({ ...lossForm, type: e.target.value })}>
                <option value="perte">{t('lossPerte')}</option>
                <option value="casse">{t('lossCasse')}</option>
                <option value="vol">{t('lossVol')}</option>
              </select>
            </label>

            <label class="form-control">
              <span class="label-text text-xs">{t('lossQty')}</span>
              <input type="number" min="1" step="1" class="input input-bordered input-sm"
                value={lossForm.qty}
                onInput={(e) => setLossForm({ ...lossForm, qty: parseInt(e.target.value) || 1 })} />
            </label>

            <label class="form-control">
              <span class="label-text text-xs">{t('lossRemark')}</span>
              <textarea class="textarea textarea-bordered textarea-sm resize-none" rows={2}
                value={lossForm.remark}
                onInput={(e) => setLossForm({ ...lossForm, remark: e.target.value })} />
            </label>

            <div class="modal-action mt-4">
              <button type="button" class="btn btn-sm btn-ghost"
                onClick={() => document.getElementById('loss-dialog')?.close()}>
                {t('back')}
              </button>
              <button type="submit" class={`btn btn-warning btn-sm ${lossLoading ? 'loading' : ''}`}
                disabled={lossLoading}>
                {t('recordLoss')}
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Print label — lazy-loaded so JsBarcode is excluded from initial bundle */}
      <Suspense fallback={null}>
        <PrintLabelModal product={printTarget} />
      </Suspense>

      {/* Stock Adjustment dialog */}
      <dialog id="adj-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
          <h3 class="font-bold text-lg mb-1">{t('adjustStock')}</h3>
          <p class="text-sm text-base-content/60 mb-2">{adjTarget?.name} — {t('qtyBefore')}: {adjTarget?.qty_available}</p>
          <form onSubmit={handleAdjust} class="space-y-3">
            <label class="form-control">
              <span class="label-text text-xs">{t('qtyAfter')}</span>
              <input type="number" step="any" class="input input-bordered input-sm" value={adjForm.qty_after}
                onInput={(e) => setAdjForm({ ...adjForm, qty_after: parseFloat(e.target.value) || 0 })} />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">{t('reason')}</span>
              <textarea class="textarea textarea-bordered textarea-sm resize-none" rows={2} value={adjForm.reason}
                onInput={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} />
            </label>
            <div class="modal-action">
              <button type="button" class="btn btn-sm btn-ghost" onClick={() => document.getElementById('adj-dialog')?.close()}>{t('back')}</button>
              <button type="submit" class={`btn btn-secondary btn-sm ${adjLoading ? 'loading' : ''}`} disabled={adjLoading}>{t('adjustStock')}</button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Valuation dialog */}
      <dialog id="valuation-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
          <h3 class="font-bold text-lg mb-3">{t('valuation')}</h3>
          {valuationData && (
            <div class="stats stats-vertical shadow w-full">
              <div class="stat"><div class="stat-title">{t('totalValue')}</div><div class="stat-value text-primary">{valuationData.total_value?.toFixed(2)}</div></div>
              <div class="stat"><div class="stat-title">{t('totalQty')}</div><div class="stat-value">{valuationData.total_qty}</div></div>
              <div class="stat"><div class="stat-title">{t('productCount')}</div><div class="stat-value">{valuationData.product_count}</div></div>
            </div>
          )}
          <div class="modal-action"><form method="dialog"><button class="btn btn-sm btn-ghost">{t('back')}</button></form></div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Price History dialog */}
      <dialog id="pricehist-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box w-full sm:max-w-2xl">
          <h3 class="font-bold text-lg mb-1">{t('priceHistory')}</h3>
          <p class="text-sm text-base-content/60 mb-3">{priceHistTarget?.name}</p>
          <div class="overflow-x-auto" style="max-height:350px; overflow-y:auto">
            <table class="table table-sm">
              <thead class="sticky top-0 bg-base-100"><tr><th>{t('purchaseDate')}</th><th>{t('prixAchat')}</th><th>{t('prixVente1')}</th><th>{t('prixVente2')}</th><th>{t('prixVente3')}</th><th>Source</th></tr></thead>
              <tbody>
                {priceHistItems.map((r, i) => (
                  <tr key={i}>
                    <td class="text-sm">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td class="font-mono text-sm">{r.prix_achat?.toFixed(2)}</td>
                    <td class="font-mono text-sm">{r.prix_vente_1?.toFixed(2)}</td>
                    <td class="font-mono text-sm">{r.prix_vente_2?.toFixed(2)}</td>
                    <td class="font-mono text-sm">{r.prix_vente_3?.toFixed(2)}</td>
                    <td class="text-xs">{r.source}</td>
                  </tr>
                ))}
                {priceHistItems.length === 0 && (
                  <tr><td colSpan={6} class="text-center py-8 text-base-content/40">{t('noProducts')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div class="modal-action"><form method="dialog"><button class="btn btn-sm btn-ghost">{t('back')}</button></form></div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Variants dialog */}
      <dialog id="variant-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box w-full sm:max-w-3xl">
          <h3 class="font-bold text-lg mb-1">{t('variants')}</h3>
          <p class="text-sm text-base-content/60 mb-3">{variantTarget?.name}</p>

          {/* Existing variants */}
          {variantItems.length > 0 && (
            <div class="overflow-x-auto mb-4" style="max-height:200px; overflow-y:auto">
              <table class="table table-xs">
                <thead class="sticky top-0 bg-base-100"><tr><th>{t('attributes')}</th><th>{t('barcodes')}</th><th>{t('qtyAvailable')}</th><th>{t('prixAchat')}</th><th>{t('prixVente1')}</th><th></th></tr></thead>
                <tbody>
                  {variantItems.map(v => (
                    <tr key={v.id}>
                      <td class="text-xs">{Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(', ') || '—'}</td>
                      <td class="text-xs">{(v.barcodes || []).join(', ') || '—'}</td>
                      <td class="font-mono text-xs">{v.qty_available}</td>
                      <td class="font-mono text-xs">{v.prix_achat}</td>
                      <td class="font-mono text-xs">{v.prix_vente_1}</td>
                      <td><button class="btn btn-xs btn-ghost text-error" onClick={() => deleteVariant(v.id)}>x</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add variant form */}
          {canAdd && (
            <form onSubmit={addVariant} class="space-y-2 border-t pt-3">
              <p class="text-xs font-semibold">{t('add')} {t('variants')}</p>
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control col-span-2">
                  <span class="label-text text-xs">{t('attributes')} (size:L, color:Red)</span>
                  <input class="input input-bordered input-xs" value={variantForm.attributes}
                    onInput={(e) => setVariantForm({ ...variantForm, attributes: e.target.value })} />
                </label>
                <label class="form-control col-span-2">
                  <span class="label-text text-xs">{t('barcodes')} (comma-separated)</span>
                  <input class="input input-bordered input-xs" value={variantForm.barcodes}
                    onInput={(e) => setVariantForm({ ...variantForm, barcodes: e.target.value })} />
                </label>
                <label class="form-control"><span class="label-text text-xs">{t('qtyAvailable')}</span>
                  <input type="number" step="any" class="input input-bordered input-xs" value={variantForm.qty_available}
                    onInput={(e) => setVariantForm({ ...variantForm, qty_available: parseFloat(e.target.value) || 0 })} /></label>
                <label class="form-control"><span class="label-text text-xs">{t('prixAchat')}</span>
                  <input type="number" step="any" class="input input-bordered input-xs" value={variantForm.prix_achat}
                    onInput={(e) => setVariantForm({ ...variantForm, prix_achat: parseFloat(e.target.value) || 0 })} /></label>
                <label class="form-control"><span class="label-text text-xs">{t('prixVente1')}</span>
                  <input type="number" step="any" class="input input-bordered input-xs" value={variantForm.prix_vente_1}
                    onInput={(e) => setVariantForm({ ...variantForm, prix_vente_1: parseFloat(e.target.value) || 0 })} /></label>
                <label class="form-control"><span class="label-text text-xs">{t('prixVente2')}</span>
                  <input type="number" step="any" class="input input-bordered input-xs" value={variantForm.prix_vente_2}
                    onInput={(e) => setVariantForm({ ...variantForm, prix_vente_2: parseFloat(e.target.value) || 0 })} /></label>
              </div>
              <button type="submit" class="btn btn-xs btn-primary">{t('add')}</button>
            </form>
          )}

          <div class="modal-action"><form method="dialog"><button class="btn btn-sm btn-ghost">{t('back')}</button></form></div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Discount Rules dialog */}
      <dialog id="discount-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box w-full sm:max-w-2xl">
          <h3 class="font-bold text-lg mb-1">{t('discountRules')}</h3>
          <p class="text-sm text-base-content/60 mb-3">{discountTarget?.name}</p>

          {discountItems.length > 0 && (
            <div class="overflow-x-auto mb-4">
              <table class="table table-xs">
                <thead><tr><th>{t('discountType')}</th><th>{t('discountValue')}</th><th>{t('minQty')}</th><th>{t('dateFrom')}</th><th>{t('dateTo')}</th><th>{t('status')}</th><th></th></tr></thead>
                <tbody>
                  {discountItems.map(d => (
                    <tr key={d.id}>
                      <td class="text-xs">{d.type === 'percentage' ? t('percentage') : t('fixed')}</td>
                      <td class="font-mono text-xs">{d.value}{d.type === 'percentage' ? '%' : ''}</td>
                      <td class="font-mono text-xs">{d.min_qty}</td>
                      <td class="text-xs">{d.start_date ? new Date(d.start_date).toLocaleDateString() : '—'}</td>
                      <td class="text-xs">{d.end_date ? new Date(d.end_date).toLocaleDateString() : '—'}</td>
                      <td><span class={`badge badge-xs ${d.active ? 'badge-success' : 'badge-ghost'}`}>{d.active ? t('active') : t('disabled')}</span></td>
                      <td><button class="btn btn-xs btn-ghost text-error" onClick={() => deleteDiscount(d.id)}>x</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canEdit && (
            <form onSubmit={addDiscount} class="space-y-2 border-t pt-3">
              <p class="text-xs font-semibold">{t('add')} {t('discountRules')}</p>
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">{t('discountType')}</span>
                  <select class="select select-bordered select-xs" value={discountForm.type}
                    onChange={(e) => setDiscountForm({ ...discountForm, type: e.target.value })}>
                    <option value="percentage">{t('percentage')}</option>
                    <option value="fixed">{t('fixed')}</option>
                  </select></label>
                <label class="form-control"><span class="label-text text-xs">{t('discountValue')}</span>
                  <input type="number" step="any" min="0" class="input input-bordered input-xs" value={discountForm.value}
                    onInput={(e) => setDiscountForm({ ...discountForm, value: parseFloat(e.target.value) || 0 })} /></label>
                <label class="form-control"><span class="label-text text-xs">{t('minQty')}</span>
                  <input type="number" step="any" min="0" class="input input-bordered input-xs" value={discountForm.min_qty}
                    onInput={(e) => setDiscountForm({ ...discountForm, min_qty: parseFloat(e.target.value) || 0 })} /></label>
                <label class="form-control"><span class="label-text text-xs">{t('dateFrom')}</span>
                  <input type="date" class="input input-bordered input-xs" value={discountForm.start_date}
                    onInput={(e) => setDiscountForm({ ...discountForm, start_date: e.target.value })} /></label>
                <label class="form-control"><span class="label-text text-xs">{t('dateTo')}</span>
                  <input type="date" class="input input-bordered input-xs" value={discountForm.end_date}
                    onInput={(e) => setDiscountForm({ ...discountForm, end_date: e.target.value })} /></label>
              </div>
              <button type="submit" class="btn btn-xs btn-primary">{t('add')}</button>
            </form>
          )}

          <div class="modal-action"><form method="dialog"><button class="btn btn-sm btn-ghost">{t('back')}</button></form></div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Batch/Lot Tracking dialog — list only */}
      <dialog id="batch-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box w-full sm:max-w-2xl">
          <h3 class="font-bold text-lg mb-1">{t('batches')}</h3>
          <p class="text-sm text-base-content/60 mb-3">{batchTarget?.name}</p>

          <div class="overflow-x-auto mb-4" style="max-height:300px; overflow-y:auto">
            <table class="table table-xs">
              <thead class="sticky top-0 bg-base-100"><tr><th>{t('batchNumber')}</th><th>{t('expiryDate')}</th><th>{t('qty')}</th><th>{t('prixAchat')}</th><th></th></tr></thead>
              <tbody>
                {batchItems.length === 0 && (
                  <tr><td colSpan={5} class="text-center text-base-content/40 py-4">{t('noBatches')}</td></tr>
                )}
                {batchItems.map(b => (
                  <tr key={b.id} class={b.qty <= 0 ? 'opacity-40' : ''}>
                    <td class="text-xs font-mono">{b.batch_number}</td>
                    <td class="text-xs">{b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : '—'}</td>
                    <td class="font-mono text-xs">{b.qty}</td>
                    <td class="font-mono text-xs">{b.prix_achat}</td>
                    <td><button class="btn btn-xs btn-ghost text-error" onClick={() => deleteBatch(b.id)}>x</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div class="modal-action">
            {canAdd && <button class="btn btn-sm btn-primary" onClick={openAddBatch}>{t('add')}</button>}
            <form method="dialog"><button class="btn btn-sm btn-ghost">{t('back')}</button></form>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Batch Add dialog — separate panel */}
      <dialog id="batch-add-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box w-full sm:max-w-md">
          <h3 class="font-bold text-lg mb-3">{t('add')} {t('batches')}</h3>
          <form onSubmit={addBatch} class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <label class="form-control">
                <span class="label-text text-xs">{t('batchNumber')}</span>
                <input class="input input-bordered input-sm" value={batchForm.batch_number} required
                  onInput={(e) => setBatchForm({ ...batchForm, batch_number: e.target.value })} />
              </label>
              <label class="form-control">
                <span class="label-text text-xs">{t('expiryDate')}</span>
                <input type="date" class="input input-bordered input-sm" value={batchForm.expiry_date}
                  onInput={(e) => setBatchForm({ ...batchForm, expiry_date: e.target.value })} />
              </label>
              <label class="form-control">
                <span class="label-text text-xs">{t('qty')}</span>
                <input type="number" step="any" min="0" class="input input-bordered input-sm" value={batchForm.qty}
                  onInput={(e) => setBatchForm({ ...batchForm, qty: parseFloat(e.target.value) || 0 })} />
              </label>
              <label class="form-control">
                <span class="label-text text-xs">{t('prixAchat')}</span>
                <input type="number" step="any" min="0" class="input input-bordered input-sm" value={batchForm.prix_achat}
                  onInput={(e) => setBatchForm({ ...batchForm, prix_achat: parseFloat(e.target.value) || 0 })} />
              </label>
            </div>
            <div class="modal-action">
              <button type="submit" class="btn btn-sm btn-primary">{t('add')}</button>
              <button type="button" class="btn btn-sm btn-ghost" onClick={() => document.getElementById('batch-add-dialog')?.close()}>{t('back')}</button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Stock Movements dialog */}
      <dialog id="mov-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box w-full sm:max-w-3xl">
          <h3 class="font-bold text-lg mb-1">{t('stockMovements')}</h3>
          <p class="text-sm text-base-content/60 mb-3">{movTarget?.name}</p>

          {/* Date filter */}
          <div class="flex gap-2 mb-4 flex-wrap items-end">
            <label class="form-control">
              <span class="label-text text-xs">{t('dateFrom')}</span>
              <input type="date" class="input input-bordered input-sm"
                value={movDateFrom} onInput={(e) => setMovDateFrom(e.target.value)} />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">{t('dateTo')}</span>
              <input type="date" class="input input-bordered input-sm"
                value={movDateTo} onInput={(e) => setMovDateTo(e.target.value)} />
            </label>
            <button class="btn btn-sm btn-primary btn-outline" onClick={applyMovFilter}>{t('search')}</button>
          </div>

          {movLoading ? (
            <div class="flex justify-center py-8"><span class="loading loading-spinner loading-md" /></div>
          ) : (
            <>
              <div class="overflow-x-auto" style="max-height: 320px; overflow-y: auto">
                <table class="table table-sm">
                  <thead class="sticky top-0 bg-base-100 z-10">
                    <tr>
                      <th>{t('purchaseDate')}</th>
                      <th>{t('movementType')}</th>
                      <th>{t('purchaseSupplier')}</th>
                      <th class="text-end">{t('qty')}</th>
                      <th class="text-end">{t('prixAchat')}</th>
                      <th class="text-end">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movResult.items.length === 0 && (
                      <tr>
                        <td colSpan={6} class="text-center text-base-content/40 py-8">{t('noMovements')}</td>
                      </tr>
                    )}
                    {movResult.items.map((m, i) => (
                      <tr key={i}>
                        <td class="text-sm">{new Date(m.date).toLocaleDateString()}</td>
                        <td>
                          {m.type === 'loss'
                            ? <span class="badge badge-xs badge-error">{t('loss' + (m.reference?.charAt(0).toUpperCase() + m.reference?.slice(1)) || 'loss')}</span>
                            : <span class="badge badge-xs badge-info">{t('movementPurchase')}</span>
                          }
                        </td>
                        <td class="text-sm">{m.supplier_name || '—'}</td>
                        <td class={`text-end font-mono text-sm ${m.qty < 0 ? 'text-error' : 'text-success'}`}>
                          {m.qty >= 0 ? '+' : ''}{m.qty}
                        </td>
                        <td class="text-end font-mono text-sm">{m.prix_achat?.toFixed(2) ?? '—'}</td>
                        <td class="text-end font-mono text-sm">{m.prix_achat ? (Math.abs(m.qty) * m.prix_achat).toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {movResult.pages > 1 && (
                <div class="flex justify-center gap-2 mt-3">
                  <button class="btn btn-sm btn-ghost" disabled={movPage <= 1}
                    onClick={() => loadMovPage(movTarget, movPage - 1, movDateFrom, movDateTo)}>‹</button>
                  <span class="btn btn-sm btn-ghost no-animation">{movPage} / {movResult.pages}</span>
                  <button class="btn btn-sm btn-ghost" disabled={movPage >= movResult.pages}
                    onClick={() => loadMovPage(movTarget, movPage + 1, movDateFrom, movDateTo)}>›</button>
                </div>
              )}
            </>
          )}

          <div class="modal-action">
            <form method="dialog">
              <button class="btn btn-sm btn-ghost">{t('back')}</button>
            </form>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>
    </Layout>
  )
}
