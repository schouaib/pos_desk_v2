import { signal } from '@preact/signals'

// App mode: null (not chosen), 'server', 'client'
export const appMode = signal(null)
export const serverUrl = signal('')
export const lanIp = signal('')
export const configLoaded = signal(false)

const isTauri = !!window.__TAURI_INTERNALS__
export const isDesktop = isTauri
export const isWindows = isTauri && navigator.userAgent.includes('Windows')

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
      const mode = await store.get('mode')
      const url = await store.get('serverUrl')
      if (mode) {
        appMode.value = mode
        serverUrl.value = url || 'http://localhost:3000'
      }
    } catch {}
  } else {
    const saved = localStorage.getItem('pos_config')
    if (saved) {
      try {
        const { mode, url } = JSON.parse(saved)
        appMode.value = mode
        serverUrl.value = url || 'http://localhost:3000'
      } catch {}
    }
  }
  configLoaded.value = true
}

export async function saveMode(mode, url) {
  appMode.value = mode
  serverUrl.value = url
  if (isTauri) {
    const store = await getStore()
    await store.set('mode', mode)
    await store.set('serverUrl', url)
    await store.save()
  } else {
    localStorage.setItem('pos_config', JSON.stringify({ mode, url }))
  }
}

export async function saveConfig(config) {
  if (isTauri) {
    const store = await getStore()
    for (const [k, v] of Object.entries(config)) {
      await store.set(k, v)
    }
    await store.save()
  } else {
    localStorage.setItem('pos_config', JSON.stringify(config))
  }
  if (config.serverUrl) serverUrl.value = config.serverUrl
}

export async function resetConfig() {
  appMode.value = null
  serverUrl.value = ''
  if (isTauri) {
    const store = await getStore()
    await store.clear()
    await store.save()
  } else {
    localStorage.removeItem('pos_config')
  }
}

export function getServerUrl() {
  return serverUrl.value || 'http://localhost:3000'
}

export { validateUrl }
