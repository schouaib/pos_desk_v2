import { signal } from '@preact/signals'

export const authToken = signal(localStorage.getItem('sa_token') || '')
export const authUser = signal(JSON.parse(localStorage.getItem('sa_user') || 'null'))

export function setAuth(token, user) {
  authToken.value = token
  authUser.value = user
  localStorage.setItem('sa_token', token)
  localStorage.setItem('sa_user', JSON.stringify(user))
}

export function clearAuth() {
  authToken.value = ''
  authUser.value = null
  localStorage.removeItem('sa_token')
  localStorage.removeItem('sa_user')
}

export const isLoggedIn = () => !!authToken.value
