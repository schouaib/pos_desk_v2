import { signal, computed } from '@preact/signals'

// Use sessionStorage — auto-cleared when app closes
export const authToken = signal(sessionStorage.getItem('tenant_token') || '')
export const authUser = signal(JSON.parse(sessionStorage.getItem('tenant_user') || 'null'))

// Batch expiry alerts — fetched once on login, not polled
export const batchAlerts = signal([])

// Cached JWT payload — recomputed only when token changes
const jwtPayload = computed(() => {
  const tok = authToken.value
  if (!tok) return null
  try { return JSON.parse(atob(tok.split('.')[1])) } catch { return null }
})

export function setAuth(token, user) {
  authToken.value = token
  authUser.value = user
  sessionStorage.setItem('tenant_token', token)
  sessionStorage.setItem('tenant_user', JSON.stringify(user))
}

export function clearAuth() {
  authToken.value = ''
  authUser.value = null
  batchAlerts.value = []
  sessionStorage.removeItem('tenant_token')
  sessionStorage.removeItem('tenant_user')
  // Clean up old localStorage tokens from previous versions
  localStorage.removeItem('tenant_token')
  localStorage.removeItem('tenant_user')
}

export const isLoggedIn = () => !!authToken.value
export const isTenantAdmin = () => authUser.value?.role === 'tenant_admin'
export const mustChangePassword = () => !!authUser.value?.must_change_password

export function hasPerm(module, action) {
  const user = authUser.value
  if (!user) return false
  if (user.role === 'tenant_admin') return true
  return !!user.permissions?.[module]?.[action]
}

export function hasFeature(feature) {
  return !!jwtPayload.value?.features?.[feature]
}
