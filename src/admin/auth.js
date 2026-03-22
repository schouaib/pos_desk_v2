import { signal } from '@preact/signals'

// Separate auth state for super admin — completely independent from POS user auth
export const saToken = signal('')
export const saUser = signal(null)

// Restore from sessionStorage (survives reload, cleared on tab close)
const savedToken = sessionStorage.getItem('sa_panel_token')
const savedUser = sessionStorage.getItem('sa_panel_user')
if (savedToken) saToken.value = savedToken
if (savedUser) {
  try { saUser.value = JSON.parse(savedUser) } catch {}
}

export function setSaAuth(token, user) {
  saToken.value = token
  saUser.value = user
  sessionStorage.setItem('sa_panel_token', token)
  sessionStorage.setItem('sa_panel_user', JSON.stringify(user))
}

export function clearSaAuth() {
  saToken.value = ''
  saUser.value = null
  sessionStorage.removeItem('sa_panel_token')
  sessionStorage.removeItem('sa_panel_user')
}

export const isSaLoggedIn = () => !!saToken.value
