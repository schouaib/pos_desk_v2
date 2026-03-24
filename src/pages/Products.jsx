import { useState, useEffect, useCallback, useMemo } from 'preact/hooks'
import { lazy, Suspense } from 'preact/compat'
import { route } from 'preact-router'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { hasPerm, hasFeature } from '../lib/auth'
import { getServerUrl, isWindows } from '../lib/config'
import { compressImage } from '../lib/imageCompress'
import { toast } from '../components/Toast'

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
  is_weighable: false, lfcode: 0, weight_unit: 4, tare: 0, shelf_life: 0,
  package_type: 0, package_weight: 0, scale_deptment: 0,
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
  const { t, lang } = useI18n()
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
  const canScale       = hasFeature('scale') && isWindows

  const [storeName, setStoreName] = useState('')
  const [storeCurrency, setStoreCurrency] = useState('DA')
  const [defaultSalePrice, setDefaultSalePrice] = useState(1)
  const [useVAT, setUseVAT] = useState(false)
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
  const [movAllItems, setMovAllItems] = useState([])
  const [movPage, setMovPage] = useState(1)
  const MOV_PER_PAGE = 10
  const movPages = Math.max(1, Math.ceil(movAllItems.length / MOV_PER_PAGE))
  const movItems = movAllItems.slice((movPage - 1) * MOV_PER_PAGE, movPage * MOV_PER_PAGE)

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
  const [variantForm, setVariantForm] = useState({ attrPairs: [{ key: '', value: '' }], barcodes: '', qty_available: 0, prix_achat: 0, prix_vente_1: 0, prix_vente_2: 0, prix_vente_3: 0 })
  const [editingVariant, setEditingVariant] = useState(null) // variant being edited
  const [variantFormOpen, setVariantFormOpen] = useState(false)
  const [variantLossTarget, setVariantLossTarget] = useState(null) // variant for loss
  const [variantLossForm, setVariantLossForm] = useState({ type: 'perte', qty: 1, remark: '' })
  const [variantAdjTarget, setVariantAdjTarget] = useState(null) // variant for adjust
  const [variantAdjForm, setVariantAdjForm] = useState({ qty_after: 0, reason: '' })
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
    api.getStoreSettings().then(d => { if (!cancelled) { setStoreName(d?.name || ''); setStoreCurrency(d?.currency === 'EUR' ? '€' : d?.currency === 'USD' ? '$' : d?.currency === 'GBP' ? '£' : d?.currency === 'TND' ? 'DT' : d?.currency === 'SAR' ? 'SR' : d?.currency || 'DA'); setDefaultSalePrice(d?.default_sale_price || 1); setUseVAT(!!d?.use_vat) } }).catch(() => {})
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
      is_weighable: p.is_weighable || false,
      lfcode: p.lfcode || 0,
      weight_unit: p.weight_unit ?? 4,
      tare: p.tare || 0,
      shelf_life: p.shelf_life || 0,
      package_type: p.package_type || 0,
      package_weight: p.package_weight || 0,
      scale_deptment: p.scale_deptment || 0,
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
      const msg = err.message || ''
      if (msg === 'product_limit' || msg.includes('product limit')) {
        setError(t('errProductLimit'))
        toast.error(t('errProductLimit'))
      } else if (msg === 'plan_expired') {
        setError(t('errPlanExpired'))
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  async function openMovements(p) {
    setMovTarget(p)
    setMovPage(1)
    const now = new Date()
    const from30 = new Date(now)
    from30.setDate(from30.getDate() - 30)
    const df = from30.toISOString().slice(0, 10)
    const dt = now.toISOString().slice(0, 10)
    setMovDateFrom(df)
    setMovDateTo(dt)
    setMovAllItems([])
    setMovLoading(true)
    document.getElementById('mov-dialog')?.showModal()
    try {
      const data = await api.listProductMovements(p.id, { limit: 10000, date_from: df, date_to: dt })
      setMovAllItems(data.items || [])
    } catch {} finally { setMovLoading(false) }
  }

  async function applyMovFilter() {
    setMovPage(1)
    setMovLoading(true)
    try {
      const params = { limit: 10000 }
      if (movDateFrom) params.date_from = movDateFrom
      if (movDateTo) params.date_to = movDateTo
      const data = await api.listProductMovements(movTarget.id, params)
      setMovAllItems(data.items || [])
    } catch {} finally { setMovLoading(false) }
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
      const res = await api.deleteProduct(deleteTarget.id)
      setDeleteTarget(null)
      closeModal('delete-modal')
      if (res?.archived) {
        alert(t('product_archived_instead'))
      }
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
    try { await api.duplicateProduct(p.id); load() } catch (err) { alert(err.message) }
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
  function newVariantForm(product) {
    return { attrPairs: [{ key: '', value: '' }], barcodes: '', qty_available: 0, prix_achat: product?.prix_achat || 0, prix_vente_1: product?.prix_vente_1 || 0, prix_vente_2: product?.prix_vente_2 || 0, prix_vente_3: product?.prix_vente_3 || 0 }
  }
  const emptyVariantForm = { attrPairs: [{ key: '', value: '' }], barcodes: '', qty_available: 0, prix_achat: 0, prix_vente_1: 0, prix_vente_2: 0, prix_vente_3: 0 }
  async function openVariants(p) {
    setVariantTarget(p)
    setVariantFormOpen(false)
    setEditingVariant(null)
    setVariantForm(newVariantForm(p))
    try { setVariantItems(await api.listVariants(p.id)) } catch { setVariantItems([]) }
    document.getElementById('variant-dialog')?.showModal()
  }
  function buildVariantPayload() {
    const attrs = {}
    variantForm.attrPairs.forEach(({ key, value }) => { const k = key.trim(); const v = value.trim(); if (k && v) attrs[k] = v })
    const barcodes = variantForm.barcodes ? variantForm.barcodes.split(',').map(s => s.trim()).filter(Boolean) : []
    return { attributes: attrs, barcodes, qty_available: variantForm.qty_available, prix_achat: variantForm.prix_achat, prix_vente_1: variantForm.prix_vente_1, prix_vente_2: variantForm.prix_vente_2, prix_vente_3: variantForm.prix_vente_3 }
  }
  async function addVariant(e) {
    e.preventDefault()
    try {
      await api.createVariant(variantTarget.id, buildVariantPayload())
      setVariantItems(await api.listVariants(variantTarget.id))
      setVariantForm(newVariantForm(variantTarget))
      setVariantFormOpen(false)
      load() // refresh product list to update synced qty
    } catch {}
  }
  function startEditVariant(v) {
    const pairs = v.attributes ? Object.entries(v.attributes).map(([k, val]) => ({ key: k, value: val })) : [{ key: '', value: '' }]
    if (pairs.length === 0) pairs.push({ key: '', value: '' })
    setEditingVariant(v.id)
    setVariantFormOpen(true)
    setVariantForm({
      attrPairs: pairs,
      barcodes: v.barcodes ? v.barcodes.join(', ') : '',
      qty_available: v.qty_available || 0,
      prix_achat: v.prix_achat || 0,
      prix_vente_1: v.prix_vente_1 || 0,
      prix_vente_2: v.prix_vente_2 || 0,
      prix_vente_3: v.prix_vente_3 || 0,
    })
  }
  async function saveEditVariant(e) {
    e.preventDefault()
    if (!editingVariant) return
    try {
      await api.updateVariant(editingVariant, { ...buildVariantPayload(), is_active: true })
      setVariantItems(await api.listVariants(variantTarget.id))
      setEditingVariant(null)
      setVariantForm(newVariantForm(variantTarget))
      setVariantFormOpen(false)
      load() // refresh product list to update synced qty
    } catch {}
  }
  function cancelEditVariant() {
    setEditingVariant(null)
    setVariantForm(newVariantForm(variantTarget))
    setVariantFormOpen(false)
  }
  async function deleteVariant(id) {
    try { await api.deleteVariant(id); setVariantItems(await api.listVariants(variantTarget.id)); load() } catch {}
  }
  function addAttrPair() { setVariantForm({ ...variantForm, attrPairs: [...variantForm.attrPairs, { key: '', value: '' }] }) }
  function removeAttrPair(i) { setVariantForm({ ...variantForm, attrPairs: variantForm.attrPairs.filter((_, idx) => idx !== i) }) }
  function updateAttrPair(i, field, val) { const pairs = [...variantForm.attrPairs]; pairs[i] = { ...pairs[i], [field]: val }; setVariantForm({ ...variantForm, attrPairs: pairs }) }

  // Variant loss
  function openVariantLoss(v) { setVariantLossTarget(v); setVariantLossForm({ type: 'perte', qty: 1, remark: '' }) }
  async function submitVariantLoss(e) {
    e.preventDefault()
    if (!variantLossTarget || !variantTarget) return
    try {
      await api.createLoss({ product_id: variantTarget.id, variant_id: variantLossTarget.id, ...variantLossForm })
      setVariantItems(await api.listVariants(variantTarget.id))
      setVariantLossTarget(null)
      load()
    } catch {}
  }
  // Variant adjust
  function openVariantAdj(v) { setVariantAdjTarget(v); setVariantAdjForm({ qty_after: v.qty_available, reason: '' }) }
  async function submitVariantAdj(e) {
    e.preventDefault()
    if (!variantAdjTarget || !variantTarget) return
    try {
      await api.createAdjustment({ product_id: variantTarget.id, variant_id: variantAdjTarget.id, ...variantAdjForm })
      setVariantItems(await api.listVariants(variantTarget.id))
      setVariantAdjTarget(null)
      load()
    } catch {}
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
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold">{t('productsPage')}</h2>
        {canAdd && (
          <button class="btn btn-primary btn-sm gap-1.5" onClick={openCreate}>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
            {t('newProduct')}
          </button>
        )}
      </div>

      {/* Search + toolbar */}
      <div class="flex items-center gap-2 mb-3 flex-wrap">
        <div class="join flex-1 min-w-48">
          <input class="input input-bordered input-sm join-item w-full"
            placeholder={t('searchProducts')} value={qInput}
            onInput={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
          <button class="btn btn-sm btn-primary join-item" onClick={doSearch}>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" /></svg>
          </button>
        </div>
        <div class="flex gap-1.5">
          {canAlert && (
            <button class="btn btn-sm btn-ghost gap-1 text-warning" onClick={() => route('/low-stock')}>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              {t('lowStockAlert')}
            </button>
          )}
          {canExport && (
            <button class="btn btn-sm btn-ghost gap-1" onClick={() => api.exportProducts().catch(() => {})}>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              {t('exportCSV')}
            </button>
          )}
          {canValuation && (
            <button class="btn btn-sm btn-ghost gap-1" onClick={openValuation}>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
              {t('valuation')}
            </button>
          )}
          {canArchive && (
            <button class="btn btn-sm btn-ghost gap-1" onClick={() => route('/archived-products')}>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
              {t('showArchived')}
            </button>
          )}
        </div>
      </div>

      <div class="card bg-base-100 shadow">
        <div class="overflow-x-auto overflow-y-auto" style="max-height: calc(100vh - 280px); min-height: 320px">
        <table class="table table-sm w-full">
          <thead class="bg-base-200/60 sticky top-0 z-10">
            <tr>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('productName')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('category')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('qtyAvailable')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('prixAchat')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{defaultSalePrice === 2 ? t('prixVente2') : defaultSalePrice === 3 ? t('prixVente3') : t('prixVente1')}</th>
              <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end w-36">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p, _idx) => (
              <tr key={p.id} class="border-b border-base-200/50 hover:bg-primary/[0.03] transition-colors group">
                {/* Product info: image + name + meta */}
                <td class="px-3 py-2">
                  <div class="flex items-center gap-3">
                    {p.image_url
                      ? <img src={`${getServerUrl()}${p.image_url}`} class="w-9 h-9 rounded-lg object-cover bg-base-200 shrink-0" alt="" />
                      : <div class="w-9 h-9 rounded-lg bg-base-200/80 flex items-center justify-center shrink-0">
                          <span class="text-xs font-bold text-base-content/30">{p.name?.charAt(0)?.toUpperCase()}</span>
                        </div>
                    }
                    <div class="min-w-0">
                      <div class="font-medium text-sm truncate">{p.name}</div>
                      <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {p.barcodes?.length > 0 && (
                          <span class="text-[10px] font-mono text-base-content/40">{p.barcodes[0]}</span>
                        )}
                        {p.ref && <span class="text-[10px] text-base-content/40">ref: {p.ref}</span>}
                        {useVAT && p.vat > 0 && <span class="badge badge-warning gap-0 text-[9px] px-1 py-0 h-3.5">{p.vat}%</span>}
                        {p.is_service && <span class="badge badge-outline gap-0 text-[9px] px-1 py-0 h-3.5">{t('isService')}</span>}
                        {canScale && p.is_weighable && <span class="badge badge-info badge-outline gap-0 text-[9px] px-1 py-0 h-3.5">{t('weighable')}</span>}
                      </div>
                    </div>
                  </div>
                </td>
                {/* Category + brand + unit */}
                <td class="px-3 py-2">
                  <div class="text-sm">{catMap.get(p.category_id) || <span class="text-base-content/20">—</span>}</div>
                  {(brandMap.get(p.brand_id) || unitMap.get(p.unit_id)) && (
                    <div class="text-[10px] text-base-content/40 mt-0.5">
                      {[brandMap.get(p.brand_id), unitMap.get(p.unit_id)].filter(Boolean).join(' / ')}
                    </div>
                  )}
                </td>
                {/* Qty */}
                <td class="px-3 py-2 text-end">
                  {p.is_service
                    ? <span class="text-base-content/30">—</span>
                    : <div class="flex flex-col items-end">
                        <span class={`text-sm font-medium tabular-nums ${p.qty_available <= (p.qty_min || 0) && p.qty_available > 0 ? 'text-warning' : ''} ${p.qty_available <= 0 ? 'text-error' : ''}`}>{p.qty_available}</span>
                        {p.has_variants && <span class="text-[9px] text-primary/50">{t('variants')}</span>}
                      </div>
                  }
                </td>
                {/* Prix achat */}
                <td class="px-3 py-2 text-end">
                  <span class="text-sm tabular-nums text-base-content/60">{p.prix_achat || <span class="text-base-content/20">—</span>}</span>
                </td>
                {/* Prix vente */}
                <td class="px-3 py-2 text-end">
                  <span class="text-sm font-semibold tabular-nums">{(defaultSalePrice === 2 ? p.prix_vente_2 : defaultSalePrice === 3 ? p.prix_vente_3 : p.prix_vente_1)?.toFixed(2)}</span>
                </td>
                {/* Actions — compact dropdown + primary actions */}
                <td class="px-3 py-2 text-end">
                  <div class="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
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
                        <button class="btn btn-xs btn-ghost btn-square text-info" onClick={() => { setPrintTarget(p); setTimeout(() => openModal(PRINT_MODAL_ID), 100) }}>
                          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
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
                    {/* More actions dropdown */}
                    <div class={`dropdown dropdown-end ${_idx >= items.length - 2 && items.length > 2 ? 'dropdown-top' : ''}`}>
                      <label tabIndex={0} class="btn btn-xs btn-ghost btn-square">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5z" />
                        </svg>
                      </label>
                      <ul tabIndex={0} class="dropdown-content menu menu-sm bg-base-100 rounded-lg shadow-lg border border-base-200 w-48 z-50 p-1">
                        {canLoss && !p.has_variants && (
                          <li><a onClick={() => openLoss(p)} class="text-warning text-xs gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                            {t('recordLoss')}
                          </a></li>
                        )}
                        {canMovement && (
                          <li><a onClick={() => openMovements(p)} class="text-xs gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
                            {t('stockMovements')}
                          </a></li>
                        )}
                        {canAdjust && !p.is_service && !p.has_variants && (
                          <li><a onClick={() => openAdjust(p)} class="text-xs gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" /></svg>
                            {t('adjustStock')}
                          </a></li>
                        )}
                        {canPriceHist && (
                          <li><a onClick={() => openPriceHistory(p)} class="text-xs gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                            {t('priceHistory')}
                          </a></li>
                        )}
                        {canAdd && (
                          <li><a onClick={() => handleDuplicate(p)} class="text-xs gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" /></svg>
                            {t('duplicate')}
                          </a></li>
                        )}
                        {canVariants && (
                          <li><a onClick={() => openVariants(p)} class="text-xs gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
                            {t('variants')}
                          </a></li>
                        )}
                        {canDiscounts && (
                          <li><a onClick={() => openDiscounts(p)} class="text-xs gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm4.5 5.25h.008v.008h-.008v-.008z" /></svg>
                            {t('discountRules')}
                          </a></li>
                        )}
                        {canBatches && !p.is_service && (
                          <li><a onClick={() => openBatches(p)} class="text-xs gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3" /></svg>
                            {t('batches')}
                          </a></li>
                        )}
                        {canArchive && (
                          <li><a onClick={() => handleArchive(p)} class="text-warning text-xs gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                            {t('archive')}
                          </a></li>
                        )}
                      </ul>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} class="py-12 text-center">
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
        <div class="flex items-center mb-4 bg-base-200/60 rounded-lg p-1 gap-1">
          {[
            { label: t('basicInfo'), icon: <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg> },
            { label: t('pricing'), icon: <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg> },
            { label: t('stock'), icon: <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg> },
          ].map(({ label, icon }, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setTab(i)}
              class={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all
                ${tab === i ? 'bg-primary text-primary-content shadow-sm' : tab > i ? 'text-success bg-success/8' : 'text-base-content/40 hover:text-base-content/60 hover:bg-base-300/50'}`}
            >
              {tab > i
                ? <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                : icon
              }
              {label}
            </button>
          ))}
        </div>

        {error && <div class="alert alert-error text-sm py-2 mb-4"><span>{error}</span></div>}

        <form onSubmit={handleSubmit}>
          {/* Tab 0: Basic Info */}
          {tab === 0 && (
            <div class="space-y-3">
              {/* Product name + image side by side */}
              <div class="flex gap-3 items-start">
                <div class="flex-1 space-y-2">
                  <div class="flex flex-col">
                    <span class="text-xs font-semibold text-base-content/50 mb-0.5">{t('productName')} *</span>
                    <input class="input input-bordered input-sm" value={form.name} required
                      onInput={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div class="flex flex-col">
                      <span class="text-xs text-base-content/50 mb-0.5">{t('ref')}</span>
                      <input class="input input-bordered input-sm" value={form.ref}
                        onInput={(e) => setForm({ ...form, ref: e.target.value })} />
                    </div>
                    <div class="flex flex-col">
                      <span class="text-xs text-base-content/50 mb-0.5">{t('abbreviation')}</span>
                      <input class="input input-bordered input-sm" value={form.abbreviation}
                        onInput={(e) => setForm({ ...form, abbreviation: e.target.value })} />
                    </div>
                  </div>
                </div>
                {/* Image */}
                <div class="shrink-0 flex flex-col items-center gap-1">
                  <div class="w-20 h-20 rounded-lg border-2 border-dashed border-base-300 flex items-center justify-center overflow-hidden bg-base-200 transition-colors hover:border-primary/40">
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
              <div class="bg-base-200/50 rounded-lg p-2.5">
                <p class="text-[10px] font-semibold text-base-content/40 uppercase tracking-wide mb-1.5">{t('categoriesPage')} / {t('brandsPage')} / {t('unitsPage')}</p>
                <div class="grid grid-cols-3 gap-2">
                  <div class="flex flex-col">
                    <span class="text-xs text-base-content/50 mb-0.5">{t('categoriesPage')}</span>
                    <select class="select select-bordered select-sm" value={form.category_id}
                      onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                      <option value="">{t('selectCategory')}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-xs text-base-content/50 mb-0.5">{t('brandsPage')}</span>
                    <select class="select select-bordered select-sm" value={form.brand_id}
                      onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
                      <option value="">{t('selectBrand')}</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-xs text-base-content/50 mb-0.5">{t('unitsPage')}</span>
                    <select class="select select-bordered select-sm" value={form.unit_id}
                      onChange={(e) => setForm({ ...form, unit_id: e.target.value })}>
                      <option value="">{t('selectUnit')}</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Barcodes */}
              <div class="bg-base-200/50 rounded-lg p-2.5 space-y-1.5">
                <p class="text-[10px] font-semibold text-base-content/40 uppercase tracking-wide">{t('barcodes')}</p>
                <div class="flex gap-1">
                  <input class="input input-bordered input-sm flex-1" value={barcodeInput}
                    placeholder={t('addBarcode')}
                    onInput={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (canMultiBarcode || form.barcodes.length === 0) addBarcode() } }} />
                  <button type="button" class="btn btn-sm btn-outline btn-secondary gap-1" onClick={async () => {
                    try { setBarcodeInput(await api.generateBarcode()) } catch {}
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" /></svg>
                    Gen
                  </button>
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
                {canScale && (
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" class="checkbox checkbox-sm checkbox-info" checked={form.is_weighable || false}
                      onChange={(e) => setForm({ ...form, is_weighable: e.target.checked })} />
                    <span class="text-sm">{t('weighable')}</span>
                  </label>
                )}
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

              {/* Scale (weighable product) — only on Windows with scale feature */}
              {canScale && form.is_weighable && (
                <div class="border border-info/30 rounded-xl p-3 space-y-2">
                  <p class="text-xs font-semibold text-info">{t('scaleSettings')}</p>
                  <div class="grid grid-cols-2 gap-2">
                    <label class="form-control">
                      <span class="label-text text-xs">{t('lfcode')}</span>
                      <input type="number" min="1" max="999999" class="input input-bordered input-xs"
                        value={form.lfcode || ''} onInput={(e) => setForm({ ...form, lfcode: parseInt(e.target.value) || 0 })} />
                    </label>
                    <label class="form-control">
                      <span class="label-text text-xs">{t('weightUnit')}</span>
                      <select class="select select-bordered select-xs" value={form.weight_unit}
                        onChange={(e) => setForm({ ...form, weight_unit: parseInt(e.target.value) })}>
                        <option value={4}>Kg</option>
                        <option value={1}>g</option>
                        <option value={5}>oz</option>
                        <option value={6}>Lb</option>
                        <option value={9}>PCS (g)</option>
                        <option value={10}>PCS (Kg)</option>
                      </select>
                    </label>
                    <label class="form-control">
                      <span class="label-text text-xs">{t('tare')}</span>
                      <input type="number" step="0.001" min="0" class="input input-bordered input-xs"
                        value={form.tare || ''} onInput={(e) => setForm({ ...form, tare: parseFloat(e.target.value) || 0 })} />
                    </label>
                    <label class="form-control">
                      <span class="label-text text-xs">{t('shelfLife')}</span>
                      <input type="number" min="0" max="365" class="input input-bordered input-xs"
                        value={form.shelf_life || ''} onInput={(e) => setForm({ ...form, shelf_life: parseInt(e.target.value) || 0 })} />
                    </label>
                    <label class="form-control">
                      <span class="label-text text-xs">{t('packageType')}</span>
                      <select class="select select-bordered select-xs" value={form.package_type}
                        onChange={(e) => setForm({ ...form, package_type: parseInt(e.target.value) })}>
                        <option value={0}>{t('pkgNormal')}</option>
                        <option value={1}>{t('pkgFixedWeight')}</option>
                        <option value={2}>{t('pkgPricing')}</option>
                        <option value={3}>{t('pkgFixedPrice')}</option>
                      </select>
                    </label>
                    <label class="form-control">
                      <span class="label-text text-xs">{t('packageWeight')}</span>
                      <input type="number" step="0.001" min="0" class="input input-bordered input-xs"
                        value={form.package_weight || ''} onInput={(e) => setForm({ ...form, package_weight: parseFloat(e.target.value) || 0 })} />
                    </label>
                    <label class="form-control">
                      <span class="label-text text-xs">{t('scaleDeptment')}</span>
                      <input type="number" min="0" max="99" class="input input-bordered input-xs"
                        value={form.scale_deptment || ''} onInput={(e) => setForm({ ...form, scale_deptment: parseInt(e.target.value) || 0 })} />
                    </label>
                  </div>
                </div>
              )}

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
              {useVAT && (
              <div class="bg-base-200/50 rounded-xl p-4">
                <div class="flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185ZM9.75 9h.008v.008H9.75V9Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 4.5h.008v.008h-.008V13.5Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                  <span class="text-xs font-semibold text-base-content/60 uppercase tracking-wide">{t('vatRate')}</span>
                  <div class="relative">
                    <input type="number" min="0" max="100" step="1" class="input input-bordered input-sm w-20 pe-6 text-end"
                      value={form.vat}
                      onInput={(e) => {
                        let v = parseInt(e.target.value) || 0
                        if (v < 0) v = 0
                        if (v > 100) v = 100
                        setForm({ ...form, vat: v })
                      }} />
                    <span class="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-base-content/30 pointer-events-none">%</span>
                  </div>
                  {form.vat === 0 && <span class="badge badge-ghost badge-sm">{t('noVat')}</span>}
                </div>
              </div>
              )}

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
              <div class="bg-base-200/50 rounded-xl p-4">
                <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-3">{t('pricing')}</p>
                <div class="space-y-3">
                  {[
                    { label: t('prixVente1'), key: 'prix_vente_1', color: 'primary' },
                    { label: t('prixVente2'), key: 'prix_vente_2', color: 'info' },
                    { label: t('prixVente3'), key: 'prix_vente_3', color: 'accent' },
                  ].map(({ label, key, color }) => {
                    const margin = form.prix_achat > 0
                      ? (((form[key] - form.prix_achat) / form.prix_achat) * 100)
                      : 0
                    const marginRounded = Math.round(margin * 100) / 100
                    return (
                      <div key={key} class={`flex items-center gap-2 p-2.5 rounded-lg bg-base-100 border border-base-300/50`}>
                        <span class={`text-xs font-bold text-${color} min-w-16`}>{label}</span>
                        <div class="flex items-center gap-1.5 flex-1">
                          <div class="relative">
                            <input type="number" step="any" min="0" class="input input-bordered input-sm w-20 pe-6 text-end"
                              value={marginRounded || ''}
                              placeholder="0"
                              onInput={(e) => {
                                const pct = parseFloat(e.target.value)
                                if (!isNaN(pct) && form.prix_achat > 0) {
                                  setForm({ ...form, [key]: Math.round(form.prix_achat * (1 + pct / 100) * 100) / 100 })
                                }
                              }} />
                            <span class="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-base-content/30 pointer-events-none">%</span>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-base-content/20 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                          <input type="number" step="any" min="0" class="input input-bordered input-sm w-28 font-mono"
                            value={form[key]}
                            onInput={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })} />
                          {useVAT && form.vat > 0 && (
                            <span class="text-xs font-mono text-warning font-semibold whitespace-nowrap">
                              TTC: {(form[key] * (1 + form.vat / 100)).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
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

          <div class="modal-action mt-6 border-t border-base-200 pt-4 flex items-center">
            {tab > 0 && (
              <button type="button" class="btn btn-sm btn-ghost gap-1.5" onClick={() => setTab(tab - 1)}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                {t('back')}
              </button>
            )}
            <div class="flex-1" />
            {tab < 2 && (
              <button type="button" class="btn btn-sm btn-outline gap-1.5 min-w-24" onClick={() => {
                  if (tab === 0 && !form.name.trim()) { setError(t('productName') + ' required'); return }
                  setError('')
                  setTab(tab + 1)
                }}>
                  {t('next')}
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </button>
            )}
            <button type="button" onClick={handleSubmit} class={`btn btn-primary btn-sm gap-1.5 min-w-28 ms-2 ${loading ? 'loading' : ''}`} disabled={loading}>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              {editing ? t('saveChanges') : t('newProduct')}
            </button>
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
          <p class="text-sm text-base-content/60 mb-3">{lossTarget?.name}</p>

          {lossError && (
            <div class="alert alert-error text-sm py-2 mb-3"><span>{lossError}</span></div>
          )}

          <form onSubmit={handleLoss}>
            <div class="flex gap-3 mb-3">
              <div class="flex flex-col flex-1">
                <span class="text-xs text-base-content/50 mb-0.5">{t('lossType')}</span>
                <select class="select select-bordered select-sm" value={lossForm.type}
                  onChange={(e) => setLossForm({ ...lossForm, type: e.target.value })}>
                  <option value="perte">{t('lossPerte')}</option>
                  <option value="casse">{t('lossCasse')}</option>
                  <option value="vol">{t('lossVol')}</option>
                </select>
              </div>
              <div class="flex flex-col w-28">
                <span class="text-xs text-base-content/50 mb-0.5">{t('lossQty')}</span>
                <input type="number" min="1" step="1" class="input input-bordered input-sm"
                  value={lossForm.qty}
                  onInput={(e) => setLossForm({ ...lossForm, qty: parseInt(e.target.value) || 1 })} />
              </div>
            </div>
            <div class="flex flex-col mb-3">
              <span class="text-xs text-base-content/50 mb-0.5">{t('lossRemark')}</span>
              <textarea class="textarea textarea-bordered textarea-sm resize-none" rows={2}
                value={lossForm.remark} placeholder={t('lossRemark')}
                onInput={(e) => setLossForm({ ...lossForm, remark: e.target.value })} />
            </div>
            <div class="modal-action">
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
        <PrintLabelModal product={printTarget} storeName={storeName} currency={storeCurrency} />
      </Suspense>

      {/* Stock Adjustment dialog */}
      <dialog id="adj-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
          <h3 class="font-bold text-lg mb-1">{t('adjustStock')}</h3>
          <p class="text-sm text-base-content/60 mb-3">{adjTarget?.name}</p>
          <form onSubmit={handleAdjust}>
            <div class="flex gap-3 items-center mb-3">
              <div class="flex flex-col flex-1">
                <span class="text-xs text-base-content/50 mb-0.5">{t('qtyBefore')}</span>
                <input type="text" class="input input-bordered input-sm bg-base-200" value={adjTarget?.qty_available ?? 0} disabled />
              </div>
              <div class={`flex items-center pt-4 text-base-content/30 ${lang === 'ar' ? 'rotate-180' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>
              <div class="flex flex-col flex-1">
                <span class="text-xs text-base-content/50 mb-0.5">{t('qtyAfter')}</span>
                <input type="number" step="any" class="input input-bordered input-sm" value={adjForm.qty_after}
                  onInput={(e) => setAdjForm({ ...adjForm, qty_after: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div class="flex flex-col mb-3">
              <span class="text-xs text-base-content/50 mb-0.5">{t('reason')}</span>
              <textarea class="textarea textarea-bordered textarea-sm resize-none" rows={2} value={adjForm.reason}
                placeholder={t('reason')}
                onInput={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} />
            </div>
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
        <div class="modal-box w-full sm:max-w-md p-0 overflow-hidden">
          {/* Header */}
          <div class="bg-primary/5 px-6 pt-5 pb-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 class="font-bold text-lg">{t('valuation')}</h3>
            </div>
            <form method="dialog">
              <button class="btn btn-sm btn-ghost btn-square opacity-60 hover:opacity-100">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </form>
          </div>
          {/* Body */}
          {valuationData && (
            <div class="px-6 py-5 space-y-4">
              {/* Total Value */}
              <div class="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div class="text-xs font-medium uppercase tracking-wider text-base-content/50 mb-1">{t('totalValue')}</div>
                <div class="text-3xl font-extrabold text-primary tabular-nums">{Number(valuationData.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              {/* Qty + Count row */}
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-xl border border-base-300 bg-base-200/40 p-4">
                  <div class="text-xs font-medium uppercase tracking-wider text-base-content/50 mb-1">{t('totalQty')}</div>
                  <div class="text-2xl font-bold tabular-nums">{Number(valuationData.total_qty || 0).toLocaleString()}</div>
                </div>
                <div class="rounded-xl border border-base-300 bg-base-200/40 p-4">
                  <div class="text-xs font-medium uppercase tracking-wider text-base-content/50 mb-1">{t('productCount')}</div>
                  <div class="text-2xl font-bold tabular-nums">{Number(valuationData.product_count || 0).toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}
          {!valuationData && (
            <div class="px-6 py-10 flex justify-center"><span class="loading loading-spinner loading-md text-primary" /></div>
          )}
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Price History dialog */}
      <dialog id="pricehist-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box w-full sm:max-w-3xl">
          <h3 class="font-bold text-lg mb-1">{t('priceHistory')}</h3>
          <p class="text-sm text-base-content/60 mb-3">{priceHistTarget?.name}</p>
          <div class="overflow-x-auto" style="max-height:350px; overflow-y:auto">
            <table class="table table-xs w-full">
              <thead class="sticky top-0 bg-base-200/60">
                <tr>
                  <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('purchaseDate')}</th>
                  <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('prixAchat')}</th>
                  <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('prixVente1')}</th>
                  <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('prixVente2')}</th>
                  <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('prixVente3')}</th>
                  <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('source')}</th>
                </tr>
              </thead>
              <tbody>
                {priceHistItems.map((r, i) => (
                  <tr key={i} class="border-b border-base-200">
                    <td class="text-sm whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td class="font-mono text-sm text-end">{r.prix_achat?.toFixed(2)}</td>
                    <td class="font-mono text-sm text-end">{r.prix_vente_1?.toFixed(2)}</td>
                    <td class="font-mono text-sm text-end">{r.prix_vente_2?.toFixed(2)}</td>
                    <td class="font-mono text-sm text-end">{r.prix_vente_3?.toFixed(2)}</td>
                    <td class="text-xs">
                      <span class="badge badge-xs badge-ghost">{r.source === 'purchase_validation' ? t('sourcePurchase') : r.source === 'manual' ? t('sourceManual') : r.source}</span>
                    </td>
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
        <div class="modal-box p-0 overflow-hidden flex flex-col" style="width: 90vw; max-width: 900px; height: 85vh; max-height: 85vh">
          {/* Header */}
          <div class="flex items-center justify-between px-6 py-4 border-b border-base-200 bg-base-100 shrink-0">
            <div>
              <h3 class="font-bold text-lg">{t('variants')}</h3>
              <p class="text-sm text-base-content/50">{variantTarget?.name}</p>
            </div>
            <div class="flex items-center gap-2">
              {canAdd && !variantFormOpen && (
                <button class="btn btn-primary btn-sm gap-1.5" onClick={() => { setEditingVariant(null); setVariantForm(newVariantForm(variantTarget)); setVariantFormOpen(true) }}>
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  {t('add')}
                </button>
              )}
              <form method="dialog"><button class="btn btn-sm btn-ghost btn-square" onClick={cancelEditVariant}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button></form>
            </div>
          </div>

          {/* Content */}
          <div class="flex-1 overflow-y-auto px-6 py-4">
            {/* Add / Edit variant form */}
            {variantFormOpen && canAdd && (
              <form onSubmit={editingVariant ? saveEditVariant : addVariant} class="bg-base-200/40 rounded-xl p-4 mb-5 border border-base-200">
                <p class="text-sm font-semibold mb-3">{editingVariant ? t('edit') : t('add')} {t('variants')}</p>

                {/* Attributes as key/value pairs */}
                <div class="mb-3">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-xs font-medium text-base-content/70">{t('attributes')}</span>
                    <button type="button" class="btn btn-xs btn-ghost gap-1 text-primary" onClick={addAttrPair}>
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      {t('add')}
                    </button>
                  </div>
                  <div class="space-y-1.5">
                    {variantForm.attrPairs.map((pair, i) => (
                      <div key={i} class="flex items-center gap-2">
                        <input class="input input-bordered input-sm flex-1" placeholder="size, color..." value={pair.key}
                          onInput={(e) => updateAttrPair(i, 'key', e.target.value)} />
                        <span class="text-base-content/30">:</span>
                        <input class="input input-bordered input-sm flex-1" placeholder="L, Red..." value={pair.value}
                          onInput={(e) => updateAttrPair(i, 'value', e.target.value)} />
                        {variantForm.attrPairs.length > 1 && (
                          <button type="button" class="btn btn-sm btn-ghost btn-square text-error/60 hover:text-error" onClick={() => removeAttrPair(i)}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Barcodes */}
                <label class="form-control mb-3">
                  <span class="label-text text-xs font-medium text-base-content/70 mb-1">{t('barcodes')}</span>
                  <input class="input input-bordered input-sm" placeholder={t('barcodes') + ' (comma-separated)'} value={variantForm.barcodes}
                    onInput={(e) => setVariantForm({ ...variantForm, barcodes: e.target.value })} />
                </label>

                {/* Qty + Prices grid */}
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  <label class="form-control">
                    <span class="label-text text-xs font-medium text-base-content/70 mb-1">{t('qtyAvailable')}</span>
                    <input type="number" step="any" class="input input-bordered input-sm" value={variantForm.qty_available}
                      onInput={(e) => setVariantForm({ ...variantForm, qty_available: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs font-medium text-base-content/70 mb-1">{t('prixAchat')}</span>
                    <input type="number" step="any" class="input input-bordered input-sm" value={variantForm.prix_achat}
                      onInput={(e) => setVariantForm({ ...variantForm, prix_achat: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs font-medium text-base-content/70 mb-1">{t('prixVente1')}</span>
                    <input type="number" step="any" class="input input-bordered input-sm" value={variantForm.prix_vente_1}
                      onInput={(e) => setVariantForm({ ...variantForm, prix_vente_1: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs font-medium text-base-content/70 mb-1">{t('prixVente2')}</span>
                    <input type="number" step="any" class="input input-bordered input-sm" value={variantForm.prix_vente_2}
                      onInput={(e) => setVariantForm({ ...variantForm, prix_vente_2: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs font-medium text-base-content/70 mb-1">{t('prixVente3')}</span>
                    <input type="number" step="any" class="input input-bordered input-sm" value={variantForm.prix_vente_3}
                      onInput={(e) => setVariantForm({ ...variantForm, prix_vente_3: parseFloat(e.target.value) || 0 })} />
                  </label>
                </div>

                <div class="flex gap-2 justify-end">
                  <button type="button" class="btn btn-sm btn-ghost" onClick={cancelEditVariant}>{t('back')}</button>
                  <button type="submit" class="btn btn-sm btn-primary gap-1">
                    {editingVariant ? t('save') : t('add')}
                  </button>
                </div>
              </form>
            )}

            {/* Existing variants list */}
            {variantItems.length === 0 && !variantFormOpen ? (
              <div class="flex flex-col items-center justify-center py-16 text-base-content/30">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
                <p class="text-sm">{t('noVariant')}</p>
              </div>
            ) : (
              <div class="space-y-2">
                {variantItems.map(v => (
                  <div key={v.id} class={`rounded-xl border bg-base-100 p-4 transition-all hover:shadow-sm ${editingVariant === v.id ? 'border-primary/40 ring-1 ring-primary/20' : 'border-base-200'}`}>
                    <div class="flex items-start justify-between gap-3">
                      {/* Attributes tags */}
                      <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap gap-1.5 mb-2">
                          {Object.entries(v.attributes || {}).map(([k, val]) => (
                            <span key={k} class="badge badge-sm bg-primary/10 text-primary border-0 gap-1">
                              <span class="font-medium">{k}:</span> {val}
                            </span>
                          ))}
                          {(!v.attributes || Object.keys(v.attributes).length === 0) && (
                            <span class="text-xs text-base-content/40">—</span>
                          )}
                        </div>
                        {/* Barcodes */}
                        {v.barcodes?.length > 0 && (
                          <div class="flex items-center gap-1.5 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-base-content/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5z" /></svg>
                            <span class="text-[11px] font-mono text-base-content/40">{v.barcodes.join(', ')}</span>
                          </div>
                        )}
                        {/* Prices row */}
                        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60">
                          <span>{t('qtyAvailable')}: <span class="font-semibold text-base-content">{v.qty_available}</span></span>
                          <span>{t('prixAchat')}: <span class="font-mono">{v.prix_achat}</span></span>
                          <span>{t('prixVente1')}: <span class="font-mono">{v.prix_vente_1}</span></span>
                          <span>{t('prixVente2')}: <span class="font-mono">{v.prix_vente_2}</span></span>
                          <span>{t('prixVente3')}: <span class="font-mono">{v.prix_vente_3}</span></span>
                        </div>
                      </div>
                      {/* Actions */}
                      <div class="flex items-center gap-1 shrink-0">
                        {canAdjust && (
                          <div class="tooltip tooltip-bottom" data-tip={t('adjustStock')}>
                            <button class="btn btn-sm btn-ghost btn-square text-base-content/50" onClick={() => openVariantAdj(v)}>
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" /></svg>
                            </button>
                          </div>
                        )}
                        {canLoss && (
                          <div class="tooltip tooltip-bottom" data-tip={t('recordLoss')}>
                            <button class="btn btn-sm btn-ghost btn-square text-warning" onClick={() => openVariantLoss(v)}>
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                            </button>
                          </div>
                        )}
                        <button class="btn btn-sm btn-ghost btn-square text-info" onClick={() => startEditVariant(v)}>
                          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931z" /></svg>
                        </button>
                        <button class="btn btn-sm btn-ghost btn-square text-error" onClick={() => deleteVariant(v.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                      </div>
                    </div>
                    {/* Inline adjust form */}
                    {variantAdjTarget?.id === v.id && (
                      <form onSubmit={submitVariantAdj} class="flex items-end gap-2 mt-2 pt-2 border-t border-base-200">
                        <label class="form-control flex-1">
                          <span class="label-text text-xs">{t('qtyAvailable')}</span>
                          <input type="number" step="any" class="input input-bordered input-sm" value={variantAdjForm.qty_after}
                            onInput={(e) => setVariantAdjForm({ ...variantAdjForm, qty_after: parseFloat(e.target.value) || 0 })} />
                        </label>
                        <label class="form-control flex-1">
                          <span class="label-text text-xs">{t('reason') || 'Reason'}</span>
                          <input class="input input-bordered input-sm" value={variantAdjForm.reason}
                            onInput={(e) => setVariantAdjForm({ ...variantAdjForm, reason: e.target.value })} />
                        </label>
                        <button type="submit" class="btn btn-sm btn-primary">{t('save')}</button>
                        <button type="button" class="btn btn-sm btn-ghost" onClick={() => setVariantAdjTarget(null)}>{t('back')}</button>
                      </form>
                    )}
                    {/* Inline loss form */}
                    {variantLossTarget?.id === v.id && (
                      <form onSubmit={submitVariantLoss} class="flex items-end gap-2 mt-2 pt-2 border-t border-base-200">
                        <label class="form-control">
                          <span class="label-text text-xs">{t('type')}</span>
                          <select class="select select-bordered select-sm" value={variantLossForm.type}
                            onChange={(e) => setVariantLossForm({ ...variantLossForm, type: e.target.value })}>
                            <option value="perte">{t('lossPerte')}</option>
                            <option value="casse">{t('lossCasse')}</option>
                            <option value="vol">{t('lossVol')}</option>
                          </select>
                        </label>
                        <label class="form-control w-20">
                          <span class="label-text text-xs">{t('qty')}</span>
                          <input type="number" min="1" class="input input-bordered input-sm" value={variantLossForm.qty}
                            onInput={(e) => setVariantLossForm({ ...variantLossForm, qty: parseInt(e.target.value) || 1 })} />
                        </label>
                        <label class="form-control flex-1">
                          <span class="label-text text-xs">{t('remark') || 'Remark'}</span>
                          <input class="input input-bordered input-sm" value={variantLossForm.remark}
                            onInput={(e) => setVariantLossForm({ ...variantLossForm, remark: e.target.value })} />
                        </label>
                        <button type="submit" class="btn btn-sm btn-warning">{t('save')}</button>
                        <button type="button" class="btn btn-sm btn-ghost" onClick={() => setVariantLossTarget(null)}>{t('back')}</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Discount Rules dialog */}
      <dialog id="discount-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box w-full sm:max-w-2xl p-0">
          {/* Header */}
          <div class="px-6 pt-5 pb-4 border-b border-base-200">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <div>
                <h3 class="font-bold text-lg">{t('discountRules')}</h3>
                <p class="text-sm text-base-content/50">{discountTarget?.name}</p>
              </div>
            </div>
            <p class="text-xs text-success mt-2 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              {t('autoAppliedInPos')}
            </p>
          </div>

          <div class="px-6 py-4" style="max-height:400px;overflow-y:auto">
            {/* Existing rules as cards */}
            {discountItems.length === 0 && (
              <div class="text-center py-8">
                <div class="w-14 h-14 mx-auto rounded-full bg-base-200 flex items-center justify-center mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <p class="text-sm text-base-content/40">{t('noDiscountRules')}</p>
              </div>
            )}

            {discountItems.length > 0 && (
              <div class="space-y-2">
                {discountItems.map(d => {
                  const isExpired = d.end_date && new Date(d.end_date) < new Date()
                  const isActive = d.active && !isExpired
                  return (
                    <div key={d.id} class={`border rounded-xl p-3 transition-all ${isActive ? 'border-success/30 bg-success/5' : 'border-base-200 bg-base-200/30 opacity-60'}`}>
                      <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-3 flex-1 min-w-0">
                          {/* Value badge */}
                          <div class={`flex-shrink-0 px-3 py-1.5 rounded-lg font-bold font-mono text-sm ${isActive ? 'bg-success/15 text-success' : 'bg-base-300 text-base-content/40'}`}>
                            {d.type === 'percentage' ? `${d.value}%` : d.value}
                          </div>
                          <div class="min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap">
                              <span class={`badge badge-sm ${d.type === 'percentage' ? 'badge-primary badge-outline' : 'badge-secondary badge-outline'}`}>
                                {d.type === 'percentage' ? t('percentage') : t('fixed')}
                              </span>
                              {d.min_qty > 0 && (
                                <span class="badge badge-sm badge-ghost">{t('minQty')}: {d.min_qty}</span>
                              )}
                              {isExpired && <span class="badge badge-sm badge-error">{t('expired')}</span>}
                              {!isExpired && <span class={`badge badge-sm ${d.active ? 'badge-success' : 'badge-ghost'}`}>{d.active ? t('active') : t('disabled')}</span>}
                            </div>
                            <div class="flex items-center gap-2 mt-1 text-xs text-base-content/40">
                              {d.start_date && (
                                <span>{t('dateFrom')}: {new Date(d.start_date).toLocaleDateString()}</span>
                              )}
                              {d.end_date && (
                                <span>{t('dateTo')}: {new Date(d.end_date).toLocaleDateString()}</span>
                              )}
                              {!d.start_date && !d.end_date && <span>—</span>}
                            </div>
                          </div>
                        </div>
                        {canEdit && (
                          <button class="btn btn-sm btn-ghost btn-square text-base-content/30 hover:text-error flex-shrink-0" onClick={() => deleteDiscount(d.id)}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Add form */}
          {canEdit && (
            <div class="px-6 py-4 border-t border-base-200 bg-base-200/30">
              <form onSubmit={addDiscount}>
                <p class="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                  {t('addNewRule')}
                </p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <label class="form-control">
                    <span class="label-text text-xs font-medium mb-1">{t('discountType')}</span>
                    <select class="select select-bordered select-sm" value={discountForm.type}
                      onChange={(e) => setDiscountForm({ ...discountForm, type: e.target.value })}>
                      <option value="percentage">{t('percentage')}</option>
                      <option value="fixed">{t('fixed')}</option>
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs font-medium mb-1">{t('discountValue')}</span>
                    <input type="number" step="any" min="0" class="input input-bordered input-sm font-mono" value={discountForm.value}
                      onInput={(e) => setDiscountForm({ ...discountForm, value: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs font-medium mb-1">{t('minQty')}</span>
                    <input type="number" step="any" min="0" class="input input-bordered input-sm font-mono" value={discountForm.min_qty}
                      onInput={(e) => setDiscountForm({ ...discountForm, min_qty: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs font-medium mb-1">{t('dateFrom')}</span>
                    <input type="date" class="input input-bordered input-sm" value={discountForm.start_date}
                      onInput={(e) => setDiscountForm({ ...discountForm, start_date: e.target.value })} />
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs font-medium mb-1">{t('dateTo')}</span>
                    <input type="date" class="input input-bordered input-sm" value={discountForm.end_date}
                      onInput={(e) => setDiscountForm({ ...discountForm, end_date: e.target.value })} />
                  </label>
                  <label class="form-control justify-end">
                    <button type="submit" class="btn btn-sm btn-primary gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                      {t('add')}
                    </button>
                  </label>
                </div>
              </form>
            </div>
          )}

          <div class="px-6 py-3 border-t border-base-200">
            <form method="dialog" class="flex justify-end"><button class="btn btn-sm btn-ghost">{t('back')}</button></form>
          </div>
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
        <div class="modal-box p-0 overflow-hidden flex flex-col" style="width: 80vw; max-width: 80vw; height: 80vh; max-height: 80vh">
          {/* Header */}
          <div class="bg-base-200/50 px-6 pt-5 pb-4 border-b border-base-300 shrink-0">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </div>
                <div>
                  <h3 class="font-bold text-lg leading-tight">{t('stockMovements')}</h3>
                  <p class="text-sm text-base-content/50 mt-0.5">{movTarget?.name}</p>
                </div>
              </div>
              <form method="dialog">
                <button class="btn btn-sm btn-ghost btn-square opacity-60 hover:opacity-100">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </form>
            </div>

            {/* Date filter */}
            <div class="flex items-center gap-2 mt-4">
              <span class="text-xs font-medium text-base-content/50">{t('dateFrom')}</span>
              <input type="date" class="input input-bordered input-sm w-auto"
                value={movDateFrom} onInput={(e) => setMovDateFrom(e.target.value)} />
              <span class="text-xs font-medium text-base-content/50">{t('dateTo')}</span>
              <input type="date" class="input input-bordered input-sm w-auto"
                value={movDateTo} onInput={(e) => setMovDateTo(e.target.value)} />
              <button class="btn btn-sm btn-primary gap-1.5" onClick={applyMovFilter}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                {t('search')}
              </button>
            </div>
          </div>

          {/* Body */}
          <div class="flex-1 overflow-y-auto px-6 py-4">
            {movLoading ? (
              <div class="flex justify-center py-16"><span class="loading loading-spinner loading-lg text-primary" /></div>
            ) : (
              <table class="table table-sm w-full">
                <thead class="sticky top-0 bg-base-100 z-10">
                  <tr>
                    <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('purchaseDate')}</th>
                    <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('movementType')}</th>
                    <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('purchaseSupplier')}</th>
                    <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('qty')}</th>
                    <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('prixAchat')}</th>
                    <th class="text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {movAllItems.length === 0 && (
                    <tr>
                      <td colSpan={6} class="text-center text-base-content/30 py-16">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        {t('noMovements')}
                      </td>
                    </tr>
                  )}
                  {movItems.map((m, i) => (
                    <tr key={i} class="hover:bg-base-200/40 transition-colors">
                      <td class="text-sm tabular-nums">{new Date(m.date).toLocaleDateString()}</td>
                      <td>
                        <div class="flex flex-col gap-0.5">
                          {m.type === 'loss'
                            ? <span class="badge badge-sm badge-error gap-1">{t('loss' + (m.reference?.charAt(0).toUpperCase() + m.reference?.slice(1)) || 'loss')}</span>
                            : m.type === 'sale'
                            ? <span class="badge badge-sm badge-success gap-1">{t('movementSale')}</span>
                            : m.type === 'return' || m.type === 'sale_return'
                            ? <span class="badge badge-sm badge-warning gap-1">{t('movementReturn')}</span>
                            : m.type === 'adjustment' || m.type === 'adjust'
                            ? <span class="badge badge-sm badge-ghost gap-1">{t('movementAdjust')}</span>
                            : m.type === 'transfer'
                            ? <span class="badge badge-sm badge-accent gap-1">{t('movementTransfer')}</span>
                            : m.type === 'purchase'
                            ? <span class="badge badge-sm badge-info gap-1">{t('movementPurchase')}</span>
                            : m.qty < 0
                            ? <span class="badge badge-sm badge-success gap-1">{t('movementSale')}</span>
                            : <span class="badge badge-sm badge-info gap-1">{t('movementPurchase')}</span>
                          }
                          {m.variant_label && <span class="text-[10px] text-primary/60">{m.variant_label}</span>}
                        </div>
                      </td>
                      <td class="text-sm text-base-content/70">{m.supplier_name || '—'}</td>
                      <td class={`text-end font-mono text-sm font-semibold ${m.qty < 0 ? 'text-error' : 'text-success'}`}>
                        {m.qty >= 0 ? '+' : ''}{m.qty}
                      </td>
                      <td class="text-end font-mono text-sm tabular-nums">{m.prix_achat?.toFixed(2) ?? '—'}</td>
                      <td class="text-end font-mono text-sm font-semibold tabular-nums">{m.prix_achat ? (Math.abs(m.qty) * m.prix_achat).toFixed(2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {movPages > 1 && (
            <div class="flex items-center justify-between px-6 py-3 border-t border-base-300 shrink-0 bg-base-200/30">
              <span class="text-xs text-base-content/50 tabular-nums">{movAllItems.length} {t('results')}</span>
              <div class="join">
                <button class="join-item btn btn-sm" disabled={movPage <= 1}
                  onClick={() => setMovPage(1)}>«</button>
                <button class="join-item btn btn-sm" disabled={movPage <= 1}
                  onClick={() => setMovPage(movPage - 1)}>‹</button>
                {Array.from({ length: movPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === movPages || Math.abs(p - movPage) <= 1)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    p === '...'
                      ? <span key={`e${i}`} class="join-item btn btn-sm btn-disabled">…</span>
                      : <button key={p} class={`join-item btn btn-sm ${p === movPage ? 'btn-primary' : ''}`}
                          onClick={() => setMovPage(p)}>{p}</button>
                  )}
                <button class="join-item btn btn-sm" disabled={movPage >= movPages}
                  onClick={() => setMovPage(movPage + 1)}>›</button>
                <button class="join-item btn btn-sm" disabled={movPage >= movPages}
                  onClick={() => setMovPage(movPages)}>»</button>
              </div>
            </div>
          )}
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>
    </Layout>
  )
}
