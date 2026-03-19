import { signal } from '@preact/signals'

export const serverUrl = signal('')
export const configLoaded = signal(false)

const isTauri = !!window.__TAURI_INTERNALS__

let _store = null
async function getStore() {
  if (_store) return _store
  if (!isTauri) return null
  const { LazyStore } = await import('@tauri-apps/plugin-store')
  _store = new LazyStore('config.json')
  return _store
}

function validateUrl(url) {
  try {
    const parsed = new URL(url)
    // Allow http for localhost and LAN IPs (local network)
    const isLocal = parsed.hostname === 'localhost'
      || parsed.hostname === '127.0.0.1'
      || parsed.hostname.startsWith('192.168.')
      || parsed.hostname.startsWith('10.')
      || parsed.hostname.startsWith('172.')
    if (parsed.protocol === 'http:' && !isLocal) {
      return { valid: false, error: 'HTTPS is required for non-local servers' }
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTP/HTTPS protocols are allowed' }
    }
    return { valid: true, error: null }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}

export async function loadConfig() {
  if (isTauri) {
    try {
      const store = await getStore()
      const url = await store.get('serverUrl')
      if (url) serverUrl.value = url
    } catch {}
  } else {
    const saved = localStorage.getItem('admin_config')
    if (saved) {
      try {
        const { url } = JSON.parse(saved)
        serverUrl.value = url || ''
      } catch {}
    }
  }
  configLoaded.value = true
}

export async function saveServerUrl(url) {
  const { valid, error } = validateUrl(url)
  if (!valid) throw new Error(error)

  serverUrl.value = url
  if (isTauri) {
    const store = await getStore()
    await store.set('serverUrl', url)
    await store.save()
  } else {
    localStorage.setItem('admin_config', JSON.stringify({ url }))
  }
}

export async function resetConfig() {
  serverUrl.value = ''
  if (isTauri) {
    const store = await getStore()
    await store.clear()
    await store.save()
  } else {
    localStorage.removeItem('admin_config')
  }
}

export function getServerUrl() {
  return serverUrl.value || 'https://localhost:3000'
}

export { validateUrl }
