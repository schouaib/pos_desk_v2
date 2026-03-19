const BASE = '/api'

function token() {
  return localStorage.getItem('sa_token')
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (token()) headers['Authorization'] = `Bearer ${token()}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const json = await res.json()
  if (res.status === 401 && json.error === 'session_replaced') {
    window.dispatchEvent(new CustomEvent('session-replaced'))
    throw new Error('session_replaced')
  }
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json.data
}

export const api = {
  // Auth & Setup
  setupStatus: () => request('GET', '/super-admin/setup-status'),
  setup: (body) => request('POST', '/super-admin/setup', body),
  login: (body) => request('POST', '/super-admin/login', body),
  logout: () => request('POST', '/super-admin/logout'),

  // Admins
  createAdmin: (body) => request('POST', '/super-admin/admins', body),
  listAdmins: (page = 1) => request('GET', `/super-admin/admins?page=${page}`),
  setAdminActive: (id, active) => request('PATCH', `/super-admin/admins/${id}/active`, { active }),

  // Plans
  listPlans: () => request('GET', '/super-admin/plans'),
  createPlan: (body) => request('POST', '/super-admin/plans', body),
  updatePlan: (id, body) => request('PUT', `/super-admin/plans/${id}`, body),
  setPlanActive: (id, active) => request('PATCH', `/super-admin/plans/${id}/active`, { active }),

  // Tenants
  listTenants: (page = 1) => request('GET', `/super-admin/tenants?page=${page}`),
  createTenant: (body) => request('POST', '/super-admin/tenants', body),
  updateTenant: (id, body) => request('PUT', `/super-admin/tenants/${id}`, body),
  setTenantActive: (id, active) => request('PATCH', `/super-admin/tenants/${id}/active`, { active }),

  // Tenant users (super-admin view)
  listTenantUsers: (tenantId) => request('GET', `/super-admin/tenants/${tenantId}/users`),
  setTenantUserActive: (tenantId, id, active) =>
    request('PATCH', `/super-admin/tenants/${tenantId}/users/${id}/active`, { active }),

  // Folder requests
  listPendingFolders: () => request('GET', '/super-admin/folders/pending'),
  approveFolder: (id) => request('PATCH', `/super-admin/folders/${id}/approve`),
  rejectFolder: (id) => request('PATCH', `/super-admin/folders/${id}/reject`),

  // Storage usage
  getStorageUsage: () => request('GET', '/super-admin/tenants/storage'),

  // API Metrics
  getMetrics: (period) => request('GET', `/super-admin/metrics?period=${period}`),

  // Chat
  listChatConversations: () => request('GET', '/super-admin/chat/conversations'),
  listChatMessages: (tenantId, params) => request('GET', `/super-admin/chat/messages/${tenantId}?${new URLSearchParams(params)}`),
  sendChatMessage: (tenantId, body) => request('POST', `/super-admin/chat/messages/${tenantId}`, body),
  markChatRead: (tenantId) => request('PUT', `/super-admin/chat/read/${tenantId}`),
  getChatUnread: () => request('GET', '/super-admin/chat/unread'),

  // Product import (file upload)
  importProducts: async (tenantId, file, conflictMode) => {
    const form = new FormData()
    form.append('file', file)
    form.append('conflict_mode', conflictMode)
    const headers = {}
    if (token()) headers['Authorization'] = `Bearer ${token()}`
    const res = await fetch(`${BASE}/super-admin/tenants/${tenantId}/products/import`, {
      method: 'POST',
      headers,
      body: form,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Request failed')
    return json.data
  },
}
