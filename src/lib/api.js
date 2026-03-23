import { getServerUrl } from './config'
import { clearAuth } from './auth'

function getBase() {
  return getServerUrl() + '/api'
}

function token() {
  return sessionStorage.getItem('tenant_token')
}

// Activation headers — cached from Tauri invoke at startup
let _machineId = ''
let _activationKey = ''
export function setActivationHeaders(machineId, key) {
  _machineId = machineId || ''
  _activationKey = key || ''
}

// Session-level cache with TTL (5 min) to prevent stale data + memory growth
const _refCache = new Map()
const CACHE_MAX = 50
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
function cachedGet(path) {
  const entry = _refCache.get(path)
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.promise
  if (_refCache.size >= CACHE_MAX) {
    _refCache.delete(_refCache.keys().next().value)
  }
  const promise = request('GET', path).catch(e => { _refCache.delete(path); throw e })
  _refCache.set(path, { promise, ts: Date.now() })
  return promise
}
function bust(path) { _refCache.delete(path) }

async function request(method, path, body, { timeout = 15000 } = {}) {
  const BASE = getBase()
  const headers = { 'Content-Type': 'application/json' }
  if (token()) headers['Authorization'] = `Bearer ${token()}`
  if (_machineId) headers['X-Machine-ID'] = _machineId
  if (_activationKey) headers['X-Activation-Key'] = _activationKey

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Request timed out')
    throw new Error('server_unreachable')
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 402) {
    window.dispatchEvent(new CustomEvent('plan-expired'))
    throw new Error('plan_expired')
  }

  let json
  try {
    json = await res.json()
  } catch {
    throw new Error('Server returned an invalid response')
  }

  if (res.status === 401 && json.error === 'session_replaced') {
    window.dispatchEvent(new CustomEvent('session-replaced'))
    throw new Error('session_replaced')
  }
  if (res.status === 401) {
    clearAuth()
    throw new Error('Session expired')
  }
  if (res.status === 400 && json.error && json.error.includes('product limit')) {
    throw new Error('product_limit')
  }
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json.data
}

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024 // 10MB

export const api = {
  // Public (no auth required)
  listPublicPlans: () => request('GET', '/plans'),
  signup: (body) => request('POST', '/signup', body),

  // Auth
  login: (body) => request('POST', '/tenant/auth/login', body),
  logout: () => request('POST', '/tenant/auth/logout'),
  me: () => request('GET', '/tenant/auth/me'),
  changePassword: (body) => request('POST', '/tenant/auth/change-password', body),

  // Users
  listUsers: (page = 1) => request('GET', `/tenant/users/?page=${encodeURIComponent(page)}`),
  createUser: (body) => request('POST', '/tenant/users/', body),
  updateUser: (id, body) => request('PUT', `/tenant/users/${encodeURIComponent(id)}`, body),
  setUserActive: (id, active) => request('PATCH', `/tenant/users/${encodeURIComponent(id)}/active`, { active }),
  resetUserPassword: (id, newPassword) => request('PATCH', `/tenant/users/${encodeURIComponent(id)}/password`, { new_password: newPassword }),

  // Units
  listUnits: () => cachedGet('/tenant/units?limit=500').then(r => r.items || []),
  listUnitsPage: (params) => request('GET', `/tenant/units?${new URLSearchParams(params)}`),
  createUnit: (body) => request('POST', '/tenant/units/', body).then(r => { bust('/tenant/units?limit=500'); return r }),
  updateUnit: (id, body) => request('PUT', `/tenant/units/${encodeURIComponent(id)}`, body).then(r => { bust('/tenant/units?limit=500'); return r }),
  deleteUnit: (id) => request('DELETE', `/tenant/units/${encodeURIComponent(id)}`).then(r => { bust('/tenant/units?limit=500'); return r }),

  // Categories
  listCategories: () => cachedGet('/tenant/categories?limit=500').then(r => r.items || []),
  listCategoriesPage: (params) => request('GET', `/tenant/categories?${new URLSearchParams(params)}`),
  createCategory: (body) => request('POST', '/tenant/categories/', body).then(r => { bust('/tenant/categories?limit=500'); return r }),
  updateCategory: (id, body) => request('PUT', `/tenant/categories/${encodeURIComponent(id)}`, body).then(r => { bust('/tenant/categories?limit=500'); return r }),
  deleteCategory: (id) => request('DELETE', `/tenant/categories/${encodeURIComponent(id)}`).then(r => { bust('/tenant/categories?limit=500'); return r }),

  // Brands
  listBrands: () => cachedGet('/tenant/brands?limit=500').then(r => r.items || []),
  listBrandsPage: (params) => request('GET', `/tenant/brands?${new URLSearchParams(params)}`),
  createBrand: (body) => request('POST', '/tenant/brands/', body).then(r => { bust('/tenant/brands?limit=500'); return r }),
  updateBrand: (id, body) => request('PUT', `/tenant/brands/${encodeURIComponent(id)}`, body).then(r => { bust('/tenant/brands?limit=500'); return r }),
  deleteBrand: (id) => request('DELETE', `/tenant/brands/${encodeURIComponent(id)}`).then(r => { bust('/tenant/brands?limit=500'); return r }),

  // Products
  uploadProductImage: async (blob) => {
    if (blob.size > MAX_UPLOAD_SIZE) throw new Error('File too large. Maximum 10MB.')
    const BASE = getBase()
    const form = new FormData()
    form.append('image', blob, 'product.webp')
    const uploadHeaders = { Authorization: `Bearer ${token()}` }
    if (_machineId) uploadHeaders['X-Machine-ID'] = _machineId
    if (_activationKey) uploadHeaders['X-Activation-Key'] = _activationKey
    const res = await fetch(`${BASE}/tenant/products/upload-image`, {
      method: 'POST',
      headers: uploadHeaders,
      body: form,
    })
    if (res.status === 402) { window.dispatchEvent(new CustomEvent('plan-expired')); throw new Error('plan_expired') }
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Upload failed')
    return json.data
  },
  listProducts: (params) => request('GET', `/tenant/products?${new URLSearchParams(params)}`),
  getProduct: (id) => request('GET', `/tenant/products/${encodeURIComponent(id)}`),
  listProductMovements: (id, params) => request('GET', `/tenant/products/${encodeURIComponent(id)}/movements?${new URLSearchParams(params)}`),
  createProduct: (body) => request('POST', '/tenant/products/', body),
  updateProduct: (id, body) => request('PUT', `/tenant/products/${encodeURIComponent(id)}`, body),
  deleteProduct: (id) => request('DELETE', `/tenant/products/${encodeURIComponent(id)}`),
  duplicateProduct: (id) => request('POST', `/tenant/products/${encodeURIComponent(id)}/duplicate`),
  archiveProduct: (id) => request('POST', `/tenant/products/${encodeURIComponent(id)}/archive`),
  unarchiveProduct: (id) => request('POST', `/tenant/products/${encodeURIComponent(id)}/unarchive`),
  listArchivedProducts: (params) => request('GET', `/tenant/products/archived?${new URLSearchParams(params)}`),
  listLowStockProducts: (params) => request('GET', `/tenant/products/low-stock?${new URLSearchParams(params)}`),
  getProductValuation: () => request('GET', '/tenant/products/valuation'),
  exportProducts: async () => {
    const BASE = getBase()
    const expHeaders = { Authorization: `Bearer ${token()}` }
    if (_machineId) expHeaders['X-Machine-ID'] = _machineId
    if (_activationKey) expHeaders['X-Activation-Key'] = _activationKey
    const res = await fetch(`${BASE}/tenant/products/export`, {
      headers: expHeaders,
    })
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'products.csv'; a.click()
    URL.revokeObjectURL(url)
  },
  listPriceHistory: (productId, params) => request('GET', `/tenant/products/${encodeURIComponent(productId)}/price-history?${new URLSearchParams(params)}`),
  listProductSuppliers: (productId) => request('GET', `/tenant/products/${encodeURIComponent(productId)}/suppliers`),

  // Stock adjustments
  listAdjustments: (params) => request('GET', `/tenant/adjustments?${new URLSearchParams(params)}`),
  createAdjustment: (body) => request('POST', '/tenant/adjustments', body),

  // Sale returns
  createSaleReturn: (saleId, body) => request('POST', `/tenant/sales/${encodeURIComponent(saleId)}/return`, body),
  listSaleReturns: (params) => request('GET', `/tenant/sale-returns?${new URLSearchParams(params)}`),

  // Supplier-product mapping
  listSupplierProducts: (supplierId, params) => request('GET', `/tenant/suppliers/${encodeURIComponent(supplierId)}/products?${new URLSearchParams(params)}`),
  createSupplierProduct: (body) => request('POST', '/tenant/supplier-products', body),
  deleteSupplierProduct: (id) => request('DELETE', `/tenant/supplier-products/${encodeURIComponent(id)}`),

  // Product variants
  listVariants: (productId) => request('GET', `/tenant/products/${encodeURIComponent(productId)}/variants`),
  createVariant: (productId, body) => request('POST', `/tenant/products/${encodeURIComponent(productId)}/variants`, body),
  updateVariant: (id, body) => request('PUT', `/tenant/variants/${encodeURIComponent(id)}`, body),
  deleteVariant: (id) => request('DELETE', `/tenant/variants/${encodeURIComponent(id)}`),
  findVariantByBarcode: (barcode) => request('GET', `/tenant/variants/barcode/${encodeURIComponent(barcode)}`),

  // Stock transfers
  listLocations: () => request('GET', '/tenant/locations'),
  createLocation: (body) => request('POST', '/tenant/locations', body),
  updateLocation: (id, body) => request('PUT', `/tenant/locations/${encodeURIComponent(id)}`, body),
  deleteLocation: (id) => request('DELETE', `/tenant/locations/${encodeURIComponent(id)}`),
  listTransfers: (params) => request('GET', `/tenant/transfers?${new URLSearchParams(params)}`),
  createTransfer: (body) => request('POST', '/tenant/transfers', body),
  completeTransfer: (id) => request('POST', `/tenant/transfers/${encodeURIComponent(id)}/complete`),
  deleteTransfer: (id) => request('DELETE', `/tenant/transfers/${encodeURIComponent(id)}`),

  // Discount rules
  listProductDiscounts: (productId) => request('GET', `/tenant/products/${encodeURIComponent(productId)}/discounts`),
  getApplicableDiscount: (productId, qty) => request('GET', `/tenant/products/${encodeURIComponent(productId)}/discount-applicable?qty=${qty}`),
  createDiscount: (body) => request('POST', '/tenant/discounts', body),
  updateDiscount: (id, body) => request('PUT', `/tenant/discounts/${encodeURIComponent(id)}`, body),
  deleteDiscount: (id) => request('DELETE', `/tenant/discounts/${encodeURIComponent(id)}`),

  // Batch/lot tracking
  listProductBatches: (productId, params) => request('GET', `/tenant/products/${encodeURIComponent(productId)}/batches?${new URLSearchParams(params)}`),
  createBatch: (body) => request('POST', '/tenant/batches', body),
  listExpiringBatches: (params) => request('GET', `/tenant/batches/expiring?${new URLSearchParams(params)}`),
  listExpiringBatchesPaginated: (params) => request('GET', `/tenant/batches/expiring-list?${new URLSearchParams(params)}`),
  listBatchAlerts: () => request('GET', '/tenant/batches/alerts'),
  deleteBatch: (id) => request('DELETE', `/tenant/batches/${encodeURIComponent(id)}`),

  // Suppliers
  listSuppliers: () => cachedGet('/tenant/suppliers?limit=500').then(r => r.items || []),
  listSuppliersPage: (params) => request('GET', `/tenant/suppliers?${new URLSearchParams(params)}`),
  createSupplier: (body) => request('POST', '/tenant/suppliers/', body).then(r => { bust('/tenant/suppliers?limit=500'); return r }),
  updateSupplier: (id, body) => request('PUT', `/tenant/suppliers/${encodeURIComponent(id)}`, body).then(r => { bust('/tenant/suppliers?limit=500'); return r }),
  deleteSupplier: (id) => request('DELETE', `/tenant/suppliers/${encodeURIComponent(id)}`).then(r => { bust('/tenant/suppliers?limit=500'); return r }),
  listArchivedSuppliers: (params) => request('GET', `/tenant/suppliers/archived?${new URLSearchParams(params)}`),
  unarchiveSupplier: (id) => request('POST', `/tenant/suppliers/${encodeURIComponent(id)}/unarchive`).then(r => { bust('/tenant/suppliers?limit=500'); return r }),
  adjustSupplierBalance: (id, body) => request('PATCH', `/tenant/suppliers/${encodeURIComponent(id)}/balance`, body).then(r => { bust('/tenant/suppliers?limit=500'); return r }),
  paySupplierBalance: (id, body) => request('POST', `/tenant/suppliers/${encodeURIComponent(id)}/pay`, body).then(r => { bust('/tenant/suppliers?limit=500'); return r }),
  listSupplierPayments: (id, params) => request('GET', `/tenant/suppliers/${encodeURIComponent(id)}/payments?${new URLSearchParams(params)}`),
  listSupplierPurchases: (params) => request('GET', `/tenant/purchases?${new URLSearchParams(params)}`),

  // Store settings
  getStoreSettings: () => cachedGet('/tenant/settings'),
  updateStoreSettings: (body) => request('PUT', '/tenant/settings', body).then(r => { bust('/tenant/settings'); return r }),
  updatePosFavorites: (productIds, colors) => request('PUT', '/tenant/settings/pos-favorites', { product_ids: productIds, colors }).then(r => { bust('/tenant/settings'); return r }),
  updatePosFavGroups: (groups) => request('PUT', '/tenant/settings/pos-fav-groups', { groups }).then(r => { bust('/tenant/settings'); return r }),
  getProductsByIds: (ids) => request('POST', '/tenant/products/by-ids', { ids }),
  uploadStoreLogo: async (blob) => {
    if (blob.size > MAX_UPLOAD_SIZE) throw new Error('File too large. Maximum 10MB.')
    const BASE = getBase()
    const form = new FormData()
    form.append('logo', blob, 'logo.webp')
    const logoHeaders = { Authorization: `Bearer ${token()}` }
    if (_machineId) logoHeaders['X-Machine-ID'] = _machineId
    if (_activationKey) logoHeaders['X-Activation-Key'] = _activationKey
    const res = await fetch(`${BASE}/tenant/settings/upload-logo`, {
      method: 'POST',
      headers: logoHeaders,
      body: form,
    })
    if (res.status === 402) { window.dispatchEvent(new CustomEvent('plan-expired')); throw new Error('plan_expired') }
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Upload failed')
    bust('/tenant/settings')
    return json.data
  },

  generateBarcode: () => request('GET', '/tenant/products/generate-barcode'),

  // Losses
  listLosses: (params) => request('GET', `/tenant/losses?${new URLSearchParams(params)}`),
  createLoss: (body) => request('POST', '/tenant/losses', body),

  // Expenses
  listExpenses: (params) => request('GET', `/tenant/expenses?${new URLSearchParams(params)}`),
  createExpense: (body) => request('POST', '/tenant/expenses', body),
  updateExpense: (id, body) => request('PUT', `/tenant/expenses/${encodeURIComponent(id)}`, body),
  deleteExpense: (id) => request('DELETE', `/tenant/expenses/${encodeURIComponent(id)}`),
  getExpenseSum: (params) => request('GET', `/tenant/expenses/sum?${new URLSearchParams(params)}`),

  // Retraits
  listRetraits: (params) => request('GET', `/tenant/retraits?${new URLSearchParams(params)}`),
  createRetrait: (body) => request('POST', '/tenant/retraits', body),
  deleteRetrait: (id) => request('DELETE', `/tenant/retraits/${encodeURIComponent(id)}`),
  getRetraitSum: (params) => request('GET', `/tenant/retraits/sum?${new URLSearchParams(params)}`),

  // Caisse
  openCaisse: (body) => request('POST', '/tenant/caisse/open', body),
  closeCaisse: (body) => request('POST', '/tenant/caisse/close', body),
  getCurrentCaisse: () => request('GET', '/tenant/caisse/current'),
  getCaisseHistory: (params) => request('GET', `/tenant/caisse/history?${new URLSearchParams(params)}`),
  getCaisseSum: (params) => request('GET', `/tenant/caisse/sum?${new URLSearchParams(params)}`),

  // Sales
  createSale: (body) => request('POST', '/tenant/sales', body),
  listSales: (params) => request('GET', `/tenant/sales?${new URLSearchParams(params)}`),
  getSalesStats: (params) => request('GET', `/tenant/sales/stats?${new URLSearchParams(params)}`),
  getSalesStatistics: (params) => request('GET', `/tenant/sales/statistics?${new URLSearchParams(params)}`),
  getUserSummary: (params) => request('GET', `/tenant/sales/user-summary?${new URLSearchParams(params)}`),

  // Clients
  listClients: (params) => request('GET', `/tenant/clients?${new URLSearchParams(params)}`),
  getClient: (id) => request('GET', `/tenant/clients/${encodeURIComponent(id)}`),
  createClient: (body) => request('POST', '/tenant/clients/', body),
  updateClient: (id, body) => request('PUT', `/tenant/clients/${encodeURIComponent(id)}`, body),
  deleteClient: (id) => request('DELETE', `/tenant/clients/${encodeURIComponent(id)}`),
  listArchivedClients: (params) => request('GET', `/tenant/clients/archived?${new URLSearchParams(params)}`),
  unarchiveClient: (id) => request('POST', `/tenant/clients/${encodeURIComponent(id)}/unarchive`),
  listClientPayments: (id, params) => request('GET', `/tenant/clients/${encodeURIComponent(id)}/payments?${new URLSearchParams(params)}`),
  addClientPayment: (id, body) => request('POST', `/tenant/clients/${encodeURIComponent(id)}/payments`, body),
  getClientStatement: (id) => request('GET', `/tenant/clients/${encodeURIComponent(id)}/statement`),
  getClientPaymentsSum: (params) => request('GET', `/tenant/clients/payments/sum?${new URLSearchParams(params)}`),
  listClientSales: (id, params) => request('GET', `/tenant/clients/${encodeURIComponent(id)}/sales?${new URLSearchParams(params)}`),

  // Purchases
  listPurchases: (params) => request('GET', `/tenant/purchases?${new URLSearchParams(params)}`),
  getPurchase: (id) => request('GET', `/tenant/purchases/${encodeURIComponent(id)}`),
  createPurchase: (body) => request('POST', '/tenant/purchases/', body),
  updatePurchase: (id, body) => request('PUT', `/tenant/purchases/${encodeURIComponent(id)}`, body),
  validatePurchase: (id, body) => request('POST', `/tenant/purchases/${encodeURIComponent(id)}/validate`, body),
  previewValidation: (id) => request('GET', `/tenant/purchases/${encodeURIComponent(id)}/preview`),
  payPurchase: (id, body) => request('POST', `/tenant/purchases/${encodeURIComponent(id)}/pay`, body),
  listPurchasePayments: (id, params) => request('GET', `/tenant/purchases/${encodeURIComponent(id)}/payments?${new URLSearchParams(params)}`),
  deletePurchase: (id) => request('DELETE', `/tenant/purchases/${encodeURIComponent(id)}`),
  duplicatePurchase: (id) => request('POST', `/tenant/purchases/${encodeURIComponent(id)}/duplicate`),
  getReturnableLines: (id) => request('GET', `/tenant/purchases/${encodeURIComponent(id)}/returnable`),
  returnPurchase: (id, body) => request('POST', `/tenant/purchases/${encodeURIComponent(id)}/return`, body),
  getLowStock: (params) => request('GET', `/tenant/purchases/low-stock?${new URLSearchParams(params)}`),
  getPurchaseStats: (params) => request('GET', `/tenant/purchases/stats?${new URLSearchParams(params)}`),

  // Tax Declarations (G50, G50A, G11, G12, G20)
  getDeclarationG50: (params) => request('GET', `/tenant/declarations/g50?${new URLSearchParams(params)}`),
  getDeclarationG50A: (params) => request('GET', `/tenant/declarations/g50a?${new URLSearchParams(params)}`),
  getDeclarationG11: (params) => request('GET', `/tenant/declarations/g11?${new URLSearchParams(params)}`),
  getDeclarationG12: (params) => request('GET', `/tenant/declarations/g12?${new URLSearchParams(params)}`),
  getDeclarationG20: (params) => request('GET', `/tenant/declarations/g20?${new URLSearchParams(params)}`),

  // Chat
  listChatMessages: (params) => request('GET', `/tenant/chat/messages?${new URLSearchParams(params)}`),
  sendChatMessage: (body) => request('POST', '/tenant/chat/messages', body),
  markChatRead: () => request('PUT', '/tenant/chat/read'),
  getChatUnread: () => request('GET', '/tenant/chat/unread'),

  // Scale (Rongta RL1000)
  scaleConnect: (body) => request('POST', '/tenant/scale/connect', body),
  scaleDisconnect: () => request('POST', '/tenant/scale/disconnect'),
  scaleGetStatus: () => request('GET', '/tenant/scale/status'),
  scaleGetWeight: () => request('GET', '/tenant/scale/weight'),
  scaleSyncPLU: () => request('POST', '/tenant/scale/plu/sync'),
  scaleClearPLU: () => request('DELETE', '/tenant/scale/plu'),
  saveScaleSettings: (body) => request('PUT', '/tenant/scale/settings', body),
  getScaleSettings: () => request('GET', '/tenant/scale/settings'),

  // Facturation (BC / Devis / Facture / Avoir)
  listFacturation: (params) => request('GET', `/tenant/facturation?${new URLSearchParams(params)}`),
  getFacturationDoc: (id) => request('GET', `/tenant/facturation/${encodeURIComponent(id)}`),
  createFacturationDoc: (body) => request('POST', '/tenant/facturation', body),
  updateFacturationDoc: (id, body) => request('PUT', `/tenant/facturation/${encodeURIComponent(id)}`, body),
  deleteFacturationDoc: (id) => request('DELETE', `/tenant/facturation/${encodeURIComponent(id)}`),
  convertFacturationDoc: (id, body) => request('POST', `/tenant/facturation/${encodeURIComponent(id)}/convert`, body),
  updateFacturationStatus: (id, body) => request('PATCH', `/tenant/facturation/${encodeURIComponent(id)}/status`, body),
  createAvoir: (id, body) => request('POST', `/tenant/facturation/${encodeURIComponent(id)}/avoir`, body),
  payFacture: (id, body) => request('POST', `/tenant/facturation/${encodeURIComponent(id)}/pay`, body),

  // Folders
  listFolders: () => request('GET', '/tenant/folders'),
  listFolderRequests: () => request('GET', '/tenant/folders/requests'),
  requestFolder: (body) => request('POST', '/tenant/folders', body),
  switchFolder: (body) => request('POST', '/tenant/folders/switch', body),
  copyFolderData: (body) => request('POST', '/tenant/folders/copy', body),

}
