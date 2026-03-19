import { useState, useEffect } from 'preact/hooks'
import { useI18n } from '../lib/i18n'
import { saveMode, validateUrl } from '../lib/config'
import { LangSwitcher } from '../components/LangSwitcher'

export default function ModeSelect({ onReady }) {
  const { t } = useI18n()
  const [mode, setMode] = useState(null) // 'server' | 'client'
  const [lanIp, setLanIp] = useState('')
  const [clientIp, setClientIp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Get LAN IP from Tauri
  useEffect(() => {
    if (window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('get_lan_ip').then(ip => setLanIp(ip))
      })
    }
  }, [])

  async function startServer() {
    setLoading(true)
    setError('')
    try {
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('start_server')
      }
      // Wait for server to be ready
      for (let i = 0; i < 30; i++) {
        try {
          await fetch('http://localhost:3000/healthz', { signal: AbortSignal.timeout(1000) })
          await saveMode('server', 'http://localhost:3000')
          onReady()
          return
        } catch {
          await new Promise(r => setTimeout(r, 500))
        }
      }
      setError(t('serverStartFailed') || 'Server failed to start. Make sure MongoDB is running.')
    } catch (err) {
      setError(err.message || 'Failed to start server')
    } finally {
      setLoading(false)
    }
  }

  async function connectClient() {
    setLoading(true)
    setError('')
    const ip = clientIp.trim().replace(/\/+$/, '')
    const url = ip.startsWith('http') ? ip : `http://${ip}:3000`
    const { valid, error: urlError } = validateUrl(url)
    if (!valid) { setError(urlError); setLoading(false); return }
    try {
      await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(5000) })
      await saveMode('client', url)
      onReady()
    } catch {
      setError(t('serverUnreachable') || 'Cannot reach server. Check the IP and make sure the server is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5">
      <div class="card bg-base-100 shadow-xl w-full max-w-lg">
        <div class="card-body">
          {/* Header */}
          <div class="flex justify-between items-start">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <div class="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <div>
                  <h1 class="text-2xl font-bold">Kerty POS</h1>
                  <p class="text-xs text-base-content/40">v1.0.0</p>
                </div>
              </div>
            </div>
            <LangSwitcher />
          </div>

          <p class="text-base-content/60 text-sm mb-4">
            {t('modeSelectDesc') || 'Choose how to use this POS terminal'}
          </p>

          {error && (
            <div class="alert alert-error text-sm py-2 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div class="grid gap-3">
            {/* Server Mode */}
            <div
              class={`card border-2 cursor-pointer transition-all ${mode === 'server' ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/40'}`}
              onClick={() => setMode('server')}
            >
              <div class="card-body p-4">
                <div class="flex items-start gap-3">
                  <div class={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${mode === 'server' ? 'bg-primary text-primary-content' : 'bg-base-200'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                  </div>
                  <div class="flex-1">
                    <h3 class="font-bold text-sm">{t('serverMode') || 'Server Mode'}</h3>
                    <p class="text-xs text-base-content/60 mt-0.5">
                      {t('serverModeDesc') || 'Run the database and POS on this machine. Other POS terminals on the network can connect to it.'}
                    </p>
                    {mode === 'server' && lanIp && (
                      <div class="mt-2 p-2 bg-base-200 rounded-lg">
                        <p class="text-xs text-base-content/50">{t('otherCanConnect') || 'Other terminals can connect to:'}</p>
                        <p class="font-mono text-sm font-bold text-primary">{lanIp}:3000</p>
                      </div>
                    )}
                  </div>
                  <input type="radio" name="mode" class="radio radio-primary" checked={mode === 'server'} />
                </div>
              </div>
            </div>

            {/* Client Mode */}
            <div
              class={`card border-2 cursor-pointer transition-all ${mode === 'client' ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/40'}`}
              onClick={() => setMode('client')}
            >
              <div class="card-body p-4">
                <div class="flex items-start gap-3">
                  <div class={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${mode === 'client' ? 'bg-primary text-primary-content' : 'bg-base-200'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div class="flex-1">
                    <h3 class="font-bold text-sm">{t('clientMode') || 'Client Mode'}</h3>
                    <p class="text-xs text-base-content/60 mt-0.5">
                      {t('clientModeDesc') || 'Connect to a server running on another machine on the local network.'}
                    </p>
                    {mode === 'client' && (
                      <div class="mt-2">
                        <input
                          type="text"
                          class="input input-bordered input-sm w-full font-mono"
                          placeholder="192.168.1.100"
                          value={clientIp}
                          onInput={e => setClientIp(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && clientIp && connectClient()}
                          onClick={e => e.stopPropagation()}
                        />
                        <p class="text-xs text-base-content/40 mt-1">
                          {t('enterServerIp') || 'Enter the IP shown on the server machine'}
                        </p>
                      </div>
                    )}
                  </div>
                  <input type="radio" name="mode" class="radio radio-primary" checked={mode === 'client'} />
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            class={`btn btn-primary w-full mt-4 ${loading ? 'loading' : ''}`}
            disabled={!mode || loading || (mode === 'client' && !clientIp.trim())}
            onClick={() => mode === 'server' ? startServer() : connectClient()}
          >
            {loading
              ? (mode === 'server' ? (t('startingServer') || 'Starting server...') : (t('connecting') || 'Connecting...'))
              : (mode === 'server' ? (t('startServer') || 'Start Server') : (t('connect') || 'Connect'))
            }
          </button>
        </div>
      </div>
    </div>
  )
}
