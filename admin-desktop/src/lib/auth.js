import { signal } from '@preact/signals'

// In-memory only — never persisted to localStorage
export const authToken = signal('')
export const authUser = signal(null)

// Restore from sessionStorage (survives page reload, cleared on tab close)
const savedToken = sessionStorage.getItem('sa_token')
const savedUser = sessionStorage.getItem('sa_user')
if (savedToken) authToken.value = savedToken
if (savedUser) {
  try { authUser.value = JSON.parse(savedUser) } catch {}
}

export function setAuth(token, user) {
  authToken.value = token
  authUser.value = user
  // Use sessionStorage instead of localStorage — auto-cleared when window closes
  sessionStorage.setItem('sa_token', token)
  sessionStorage.setItem('sa_user', JSON.stringify(user))
}

export function clearAuth() {
  authToken.value = ''
  authUser.value = null
  sessionStorage.removeItem('sa_token')
  sessionStorage.removeItem('sa_user')
  // Also clean up any old localStorage tokens from previous versions
  localStorage.removeItem('sa_token')
  localStorage.removeItem('sa_user')
}

export const isLoggedIn = () => !!authToken.value
