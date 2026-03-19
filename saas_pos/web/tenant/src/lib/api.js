const BASE = '/api'

function token() {
  return localStorage.getItem('tenant_token')
}

// Session-level cache for reference data (categories, brands, units).
// Promises are cached so concurrent callers share one in-flight request.
// Max 50 entries — oldest entry evicted first (FIFO) to prevent unbounded growth.
const _refCache = new Map()
const CACHE_MAX = 50
function cachedGet(path) {
  if (!_refCache.has(path)) {
    if (_refCache.size >= CACHE_MAX) {
      _refCache.delete(_refCache.keys().next().value)
    }
    _refCache.set(path, request('GET', path).catch(e => { _refCache.delete(path); throw e }))
  }
  return _refCache.get(path)
}
function bust(path) { _refCache.delete(path) }

async function request(method, path, body, { timeout = 15000 } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token()) headers['Authorization'] = `Bearer ${token()}`

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
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 402) {
    window.dispatchEvent(new CustomEvent('plan-expired'))
    throw new Error('plan_expired')
  }

  const json = await res.json()
  if (res.status === 401 && json.error === 'session_replaced') {
    window.dispatchEvent(new CustomEvent('session-replaced'))
    throw new Error('session_replaced')
  }
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json.data
}

export const api = {
  // Public
  listPublicPlans: () => request('GET', '/plans'),
  signup: (body) => request('POST', '/signup', body),

  login: (body) => request('POST', '/tenant/auth/login', body),
  logout: () => request('POST', '/tenant/auth/logout'),
  me: () => request('GET', '/tenant/auth/me'),

  // Users
  listUsers: (page = 1) => request('GET', `/tenant/users/?page=${page}`),
  createUser: (body) => request('POST', '/tenant/users/', body),
  updateUser: (id, body) => request('PUT', `/tenant/users/${id}`, body),
  setUserActive: (id, active) => request('PATCH', `/tenant/users/${id}/active`, { active }),

  // Units
  listUnits: () => cachedGet('/tenant/units?limit=500').then(r => r.items || []),
  listUnitsPage: (params) => request('GET', `/tenant/units?${new URLSearchParams(params)}`),
  createUnit: (body) => request('POST', '/tenant/units/', body).then(r => { bust('/tenant/units?limit=500'); return r }),
  updateUnit: (id, body) => request('PUT', `/tenant/units/${id}`, body).then(r => { bust('/tenant/units?limit=500'); return r }),
  deleteUnit: (id) => request('DELETE', `/tenant/units/${id}`).then(r => { bust('/tenant/units?limit=500'); return r }),

  // Categories
  listCategories: () => cachedGet('/tenant/categories?limit=500').then(r => r.items || []),
  listCategoriesPage: (params) => request('GET', `/tenant/categories?${new URLSearchParams(params)}`),
  createCategory: (body) => request('POST', '/tenant/categories/', body).then(r => { bust('/tenant/categories?limit=500'); return r }),
  updateCategory: (id, body) => request('PUT', `/tenant/categories/${id}`, body).then(r => { bust('/tenant/categories?limit=500'); return r }),
  deleteCategory: (id) => request('DELETE', `/tenant/categories/${id}`).then(r => { bust('/tenant/categories?limit=500'); return r }),

  // Brands
  listBrands: () => cachedGet('/tenant/brands?limit=500').then(r => r.items || []),
  listBrandsPage: (params) => request('GET', `/tenant/brands?${new URLSearchParams(params)}`),
  createBrand: (body) => request('POST', '/tenant/brands/', body).then(r => { bust('/tenant/brands?limit=500'); return r }),
  updateBrand: (id, body) => request('PUT', `/tenant/brands/${id}`, body).then(r => { bust('/tenant/brands?limit=500'); return r }),
  deleteBrand: (id) => request('DELETE', `/tenant/brands/${id}`).then(r => { bust('/tenant/brands?limit=500'); return r }),

  // Products
  uploadProductImage: async (blob) => {
    const form = new FormData()
    form.append('image', blob, 'product.webp')
    const res = await fetch(`${BASE}/tenant/products/upload-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
      body: form,
    })
    if (res.status === 402) { window.dispatchEvent(new CustomEvent('plan-expired')); throw new Error('plan_expired') }
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Upload failed')
    return json.data
  },
  listProducts: (params) => request('GET', `/tenant/products?${new URLSearchParams(params)}`),
  getProduct: (id) => request('GET', `/tenant/products/${id}`),
  listProductMovements: (id, params) => request('GET', `/tenant/products/${id}/movements?${new URLSearchParams(params)}`),
  createProduct: (body) => request('POST', '/tenant/products/', body),
  updateProduct: (id, body) => request('PUT', `/tenant/products/${id}`, body),
  deleteProduct: (id) => request('DELETE', `/tenant/products/${id}`),
  duplicateProduct: (id) => request('POST', `/tenant/products/${id}/duplicate`),
  archiveProduct: (id) => request('POST', `/tenant/products/${id}/archive`),
  unarchiveProduct: (id) => request('POST', `/tenant/products/${id}/unarchive`),
  listArchivedProducts: (params) => request('GET', `/tenant/products/archived?${new URLSearchParams(params)}`),
  listLowStockProducts: (params) => request('GET', `/tenant/products/low-stock?${new URLSearchParams(params)}`),
  getProductValuation: () => request('GET', '/tenant/products/valuation'),
  exportProducts: async () => {
    const res = await fetch(`${BASE}/tenant/products/export`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'products.csv'; a.click()
    URL.revokeObjectURL(url)
  },
  listPriceHistory: (productId, params) => request('GET', `/tenant/products/${productId}/price-history?${new URLSearchParams(params)}`),
  listProductSuppliers: (productId) => request('GET', `/tenant/products/${productId}/suppliers`),

  // Stock adjustments
  listAdjustments: (params) => request('GET', `/tenant/adjustments?${new URLSearchParams(params)}`),
  createAdjustment: (body) => request('POST', '/tenant/adjustments', body),

  // Sale returns
  createSaleReturn: (saleId, body) => request('POST', `/tenant/sales/${saleId}/return`, body),
  listSaleReturns: (params) => request('GET', `/tenant/sale-returns?${new URLSearchParams(params)}`),

  // Supplier-product mapping
  listSupplierProducts: (supplierId, params) => request('GET', `/tenant/suppliers/${supplierId}/products?${new URLSearchParams(params)}`),
  createSupplierProduct: (body) => request('POST', '/tenant/supplier-products', body),
  deleteSupplierProduct: (id) => request('DELETE', `/tenant/supplier-products/${id}`),

  // Product variants (plan-gated)
  listVariants: (productId) => request('GET', `/tenant/products/${productId}/variants`),
  createVariant: (productId, body) => request('POST', `/tenant/products/${productId}/variants`, body),
  updateVariant: (id, body) => request('PUT', `/tenant/variants/${id}`, body),
  deleteVariant: (id) => request('DELETE', `/tenant/variants/${id}`),

  // Stock transfers (plan-gated)
  listLocations: () => request('GET', '/tenant/locations'),
  createLocation: (body) => request('POST', '/tenant/locations', body),
  updateLocation: (id, body) => request('PUT', `/tenant/locations/${id}`, body),
  deleteLocation: (id) => request('DELETE', `/tenant/locations/${id}`),
  listTransfers: (params) => request('GET', `/tenant/transfers?${new URLSearchParams(params)}`),
  createTransfer: (body) => request('POST', '/tenant/transfers', body),
  completeTransfer: (id) => request('POST', `/tenant/transfers/${id}/complete`),
  deleteTransfer: (id) => request('DELETE', `/tenant/transfers/${id}`),

  // Discount rules (plan-gated)
  listProductDiscounts: (productId) => request('GET', `/tenant/products/${productId}/discounts`),
  createDiscount: (body) => request('POST', '/tenant/discounts', body),
  updateDiscount: (id, body) => request('PUT', `/tenant/discounts/${id}`, body),
  deleteDiscount: (id) => request('DELETE', `/tenant/discounts/${id}`),

  // Batch/lot tracking (plan-gated)
  listProductBatches: (productId, params) => request('GET', `/tenant/products/${productId}/batches?${new URLSearchParams(params)}`),
  createBatch: (body) => request('POST', '/tenant/batches', body),
  listExpiringBatches: (params) => request('GET', `/tenant/batches/expiring?${new URLSearchParams(params)}`),
  listExpiringBatchesPaginated: (params) => request('GET', `/tenant/batches/expiring-list?${new URLSearchParams(params)}`),
  listBatchAlerts: () => request('GET', '/tenant/batches/alerts'),
  deleteBatch: (id) => request('DELETE', `/tenant/batches/${id}`),

  // Suppliers
  listSuppliers: () => cachedGet('/tenant/suppliers?limit=500').then(r => r.items || []),
  listSuppliersPage: (params) => request('GET', `/tenant/suppliers?${new URLSearchParams(params)}`),
  createSupplier: (body) => request('POST', '/tenant/suppliers/', body).then(r => { bust('/tenant/suppliers?limit=500'); return r }),
  updateSupplier: (id, body) => request('PUT', `/tenant/suppliers/${id}`, body).then(r => { bust('/tenant/suppliers?limit=500'); return r }),
  deleteSupplier: (id) => request('DELETE', `/tenant/suppliers/${id}`).then(r => { bust('/tenant/suppliers?limit=500'); return r }),
  adjustSupplierBalance: (id, body) => request('PATCH', `/tenant/suppliers/${id}/balance`, body).then(r => { bust('/tenant/suppliers?limit=500'); return r }),
  paySupplierBalance: (id, body) => request('POST', `/tenant/suppliers/${id}/pay`, body).then(r => { bust('/tenant/suppliers?limit=500'); return r }),
  listSupplierPayments: (id, params) => request('GET', `/tenant/suppliers/${id}/payments?${new URLSearchParams(params)}`),
  listSupplierPurchases: (params) => request('GET', `/tenant/purchases?${new URLSearchParams(params)}`),

  // Store settings (cached — shared across Sales, Pos, Settings pages)
  getStoreSettings: () => cachedGet('/tenant/settings'),
  updateStoreSettings: (body) => request('PUT', '/tenant/settings', body).then(r => { bust('/tenant/settings'); return r }),
  updatePosFavorites: (productIds, colors) => request('PUT', '/tenant/settings/pos-favorites', { product_ids: productIds, colors }).then(r => { bust('/tenant/settings'); return r }),
  updatePosFavGroups: (groups) => request('PUT', '/tenant/settings/pos-fav-groups', { groups }).then(r => { bust('/tenant/settings'); return r }),
  getProductsByIds: (ids) => request('POST', '/tenant/products/by-ids', { ids }),
  uploadStoreLogo: async (blob) => {
    const form = new FormData()
    form.append('logo', blob, 'logo.webp')
    const res = await fetch(`${BASE}/tenant/settings/upload-logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
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
  updateExpense: (id, body) => request('PUT', `/tenant/expenses/${id}`, body),
  deleteExpense: (id) => request('DELETE', `/tenant/expenses/${id}`),
  getExpenseSum: (params) => request('GET', `/tenant/expenses/sum?${new URLSearchParams(params)}`),

  // Retraits (cash withdrawals)
  listRetraits: (params) => request('GET', `/tenant/retraits?${new URLSearchParams(params)}`),
  createRetrait: (body) => request('POST', '/tenant/retraits', body),
  deleteRetrait: (id) => request('DELETE', `/tenant/retraits/${id}`),
  getRetraitSum: (params) => request('GET', `/tenant/retraits/sum?${new URLSearchParams(params)}`),

  // Caisse (cash register sessions)
  openCaisse: (body) => request('POST', '/tenant/caisse/open', body),
  closeCaisse: (body) => request('POST', '/tenant/caisse/close', body),
  getCurrentCaisse: () => request('GET', '/tenant/caisse/current'),
  getCaisseHistory: (params) => request('GET', `/tenant/caisse/history?${new URLSearchParams(params)}`),
  getCaisseSum: (params) => request('GET', `/tenant/caisse/sum?${new URLSearchParams(params)}`),

  // Sales (POS)
  createSale: (body) => request('POST', '/tenant/sales', body),
  listSales: (params) => request('GET', `/tenant/sales?${new URLSearchParams(params)}`),
  getSalesStats: (params) => request('GET', `/tenant/sales/stats?${new URLSearchParams(params)}`),
  getSalesStatistics: (params) => request('GET', `/tenant/sales/statistics?${new URLSearchParams(params)}`),
  getUserSummary: (params) => request('GET', `/tenant/sales/user-summary?${new URLSearchParams(params)}`),

  // Clients
  listClients: (params) => request('GET', `/tenant/clients?${new URLSearchParams(params)}`),
  getClient: (id) => request('GET', `/tenant/clients/${id}`),
  createClient: (body) => request('POST', '/tenant/clients/', body),
  updateClient: (id, body) => request('PUT', `/tenant/clients/${id}`, body),
  deleteClient: (id) => request('DELETE', `/tenant/clients/${id}`),
  listClientPayments: (id, params) => request('GET', `/tenant/clients/${id}/payments?${new URLSearchParams(params)}`),
  addClientPayment: (id, body) => request('POST', `/tenant/clients/${id}/payments`, body),
  getClientStatement: (id) => request('GET', `/tenant/clients/${id}/statement`),
  getClientPaymentsSum: (params) => request('GET', `/tenant/clients/payments/sum?${new URLSearchParams(params)}`),
  listClientSales: (id, params) => request('GET', `/tenant/clients/${id}/sales?${new URLSearchParams(params)}`),

  // Purchases
  listPurchases: (params) => request('GET', `/tenant/purchases?${new URLSearchParams(params)}`),
  getPurchase: (id) => request('GET', `/tenant/purchases/${id}`),
  createPurchase: (body) => request('POST', '/tenant/purchases/', body),
  updatePurchase: (id, body) => request('PUT', `/tenant/purchases/${id}`, body),
  validatePurchase: (id, body) => request('POST', `/tenant/purchases/${id}/validate`, body),
  previewValidation: (id) => request('GET', `/tenant/purchases/${id}/preview`),
  payPurchase: (id, body) => request('POST', `/tenant/purchases/${id}/pay`, body),
  listPurchasePayments: (id, params) => request('GET', `/tenant/purchases/${id}/payments?${new URLSearchParams(params)}`),
  deletePurchase: (id) => request('DELETE', `/tenant/purchases/${id}`),
  duplicatePurchase: (id) => request('POST', `/tenant/purchases/${id}/duplicate`),
  getReturnableLines: (id) => request('GET', `/tenant/purchases/${id}/returnable`),
  returnPurchase: (id, body) => request('POST', `/tenant/purchases/${id}/return`, body),
  getLowStock: (params) => request('GET', `/tenant/purchases/low-stock?${new URLSearchParams(params)}`),
  getPurchaseStats: (params) => request('GET', `/tenant/purchases/stats?${new URLSearchParams(params)}`),

  // Chat
  listChatMessages: (params) => request('GET', `/tenant/chat/messages?${new URLSearchParams(params)}`),
  sendChatMessage: (body) => request('POST', '/tenant/chat/messages', body),
  markChatRead: () => request('PUT', '/tenant/chat/read'),
  getChatUnread: () => request('GET', '/tenant/chat/unread'),

  // Folders
  listFolders: () => request('GET', '/tenant/folders'),
  listFolderRequests: () => request('GET', '/tenant/folders/requests'),
  requestFolder: (body) => request('POST', '/tenant/folders', body),
  switchFolder: (body) => request('POST', '/tenant/folders/switch', body),
  copyFolderData: (body) => request('POST', '/tenant/folders/copy', body),

  // Activation keys (desktop POS management)
  listActivationKeys: () => request('GET', '/tenant/activation-keys'),
  createActivationKey: (body) => request('POST', '/tenant/activation-keys', body),
  revokeActivationKey: (id) => request('PATCH', `/tenant/activation-keys/${id}/revoke`),
  reactivateActivationKey: (id) => request('PATCH', `/tenant/activation-keys/${id}/reactivate`),
  deleteActivationKey: (id) => request('DELETE', `/tenant/activation-keys/${id}`),
  removeActivationInstall: (id, fingerprint) => request('DELETE', `/tenant/activation-keys/${id}/installs/${fingerprint}`),
}
