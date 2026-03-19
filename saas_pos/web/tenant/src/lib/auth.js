import { signal, computed } from '@preact/signals'

export const authToken = signal(localStorage.getItem('tenant_token') || '')
export const authUser = signal(JSON.parse(localStorage.getItem('tenant_user') || 'null'))

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
  localStorage.setItem('tenant_token', token)
  localStorage.setItem('tenant_user', JSON.stringify(user))
}

export function clearAuth() {
  authToken.value = ''
  authUser.value = null
  batchAlerts.value = []
  localStorage.removeItem('tenant_token')
  localStorage.removeItem('tenant_user')
}

export const isLoggedIn = () => !!authToken.value
export const isTenantAdmin = () => authUser.value?.role === 'tenant_admin'

export function hasPerm(module, action) {
  const user = authUser.value
  if (!user) return false
  if (user.role === 'tenant_admin') return true
  return !!user.permissions?.[module]?.[action]
}

export function hasFeature(feature) {
  return !!jwtPayload.value?.features?.[feature]
}
