import { getServerUrl } from './config'
import { clearAuth } from './auth'

function token() {
  return sessionStorage.getItem('sa_token')
}

// Activation headers — cached from Tauri invoke at startup
let _machineId = ''
let _activationKey = ''
export function setActivationHeaders(machineId, key) {
  _machineId = machineId || ''
  _activationKey = key || ''
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (token()) headers['Authorization'] = `Bearer ${token()}`
  if (_machineId) headers['X-Machine-ID'] = _machineId
  if (_activationKey) headers['X-Activation-Key'] = _activationKey

  const res = await fetch(`${getServerUrl()}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

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
  listAdmins: (page = 1) => request('GET', `/super-admin/admins?page=${encodeURIComponent(page)}`),
  setAdminActive: (id, active) => request('PATCH', `/super-admin/admins/${encodeURIComponent(id)}/active`, { active }),

  // Plans
  listPlans: () => request('GET', '/super-admin/plans'),
  createPlan: (body) => request('POST', '/super-admin/plans', body),
  updatePlan: (id, body) => request('PUT', `/super-admin/plans/${encodeURIComponent(id)}`, body),
  setPlanActive: (id, active) => request('PATCH', `/super-admin/plans/${encodeURIComponent(id)}/active`, { active }),

  // Tenants
  listTenants: (page = 1) => request('GET', `/super-admin/tenants?page=${encodeURIComponent(page)}`),
  createTenant: (body) => request('POST', '/super-admin/tenants', body),
  updateTenant: (id, body) => request('PUT', `/super-admin/tenants/${encodeURIComponent(id)}`, body),
  setTenantActive: (id, active) => request('PATCH', `/super-admin/tenants/${encodeURIComponent(id)}/active`, { active }),

  // Tenant users (super-admin view)
  listTenantUsers: (tenantId) => request('GET', `/super-admin/tenants/${encodeURIComponent(tenantId)}/users`),
  setTenantUserActive: (tenantId, id, active) =>
    request('PATCH', `/super-admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(id)}/active`, { active }),

  // Folder requests
  listPendingFolders: () => request('GET', '/super-admin/folders/pending'),
  approveFolder: (id) => request('PATCH', `/super-admin/folders/${encodeURIComponent(id)}/approve`),
  rejectFolder: (id) => request('PATCH', `/super-admin/folders/${encodeURIComponent(id)}/reject`),

  // Storage usage
  getStorageUsage: () => request('GET', '/super-admin/tenants/storage'),

  // API Metrics
  getMetrics: (period) => request('GET', `/super-admin/metrics?period=${encodeURIComponent(period)}`),

  // Chat
  listChatConversations: () => request('GET', '/super-admin/chat/conversations'),
  listChatMessages: (tenantId, params) => {
    const safeParams = new URLSearchParams()
    for (const [k, v] of Object.entries(params || {})) {
      safeParams.set(k, v)
    }
    return request('GET', `/super-admin/chat/messages/${encodeURIComponent(tenantId)}?${safeParams}`)
  },
  sendChatMessage: (tenantId, body) => request('POST', `/super-admin/chat/messages/${encodeURIComponent(tenantId)}`, body),
  markChatRead: (tenantId) => request('PUT', `/super-admin/chat/read/${encodeURIComponent(tenantId)}`),
  getChatUnread: () => request('GET', '/super-admin/chat/unread'),

  // Product import (file upload) — with size limit
  importProducts: async (tenantId, file, conflictMode) => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('File too large. Maximum size is 10MB.')
    }
    const form = new FormData()
    form.append('file', file)
    form.append('conflict_mode', conflictMode)
    const headers = {}
    if (token()) headers['Authorization'] = `Bearer ${token()}`
    if (_machineId) headers['X-Machine-ID'] = _machineId
    if (_activationKey) headers['X-Activation-Key'] = _activationKey
    const res = await fetch(`${getServerUrl()}/api/super-admin/tenants/${encodeURIComponent(tenantId)}/products/import`, {
      method: 'POST',
      headers,
      body: form,
    })
    let json
    try {
      json = await res.json()
    } catch {
      throw new Error('Server returned an invalid response')
    }
    if (!res.ok) throw new Error(json.error || 'Request failed')
    return json.data
  },
}
