import { useState, useEffect } from 'preact/hooks'
import { useI18n } from '../lib/i18n'
import { saveServerUrl, validateUrl } from '../lib/config'
import { LangSwitcher } from '../components/LangSwitcher'

export default function ServerSetup({ onConnected }) {
  const { t } = useI18n()
  const [url, setUrl] = useState('http://localhost:3000')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [machineId, setMachineId] = useState('')
  const [activationKey, setActivationKey] = useState('')

  // Load activation headers from Tauri
  useEffect(() => {
    if (window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('get_machine_id').then(id => setMachineId(id)).catch(() => {})
        invoke('get_stored_activation_key').then(k => setActivationKey(k)).catch(() => {})
      })
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      let cleanUrl = url.trim().replace(/\/+$/, '')
      // Auto-prepend http:// if no protocol specified
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'http://' + cleanUrl
      }

      // Validate URL format and HTTPS requirement
      const { valid, error: urlError } = validateUrl(cleanUrl)
      if (!valid) {
        setError(urlError)
        setLoading(false)
        return
      }

      const headers = {}
      if (machineId) headers['X-Machine-ID'] = machineId
      if (activationKey) headers['X-Activation-Key'] = activationKey

      const res = await fetch(`${cleanUrl}/api/super-admin/setup-status`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error()
      await saveServerUrl(cleanUrl)
      onConnected()
    } catch (err) {
      setError(err.message || t('connectionFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card bg-base-100 shadow-xl w-full max-w-sm">
        <div class="card-body">
          <h2 class="card-title justify-center">{t('serverConfig')}</h2>
          <p class="text-sm text-center text-base-content/60">{t('serverConfigSub')}</p>

          <form onSubmit={handleSubmit} class="mt-4 space-y-4">
            <div class="form-control">
              <label class="label"><span class="label-text">{t('serverUrl')}</span></label>
              <input
                type="text"
                class="input input-bordered"
                placeholder="192.168.1.100:3000"
                value={url}
                onInput={(e) => setUrl(e.target.value)}
                required
              />
              <label class="label">
                <span class="label-text-alt text-base-content/40">{t('httpsHint') || 'HTTP allowed for local network, HTTPS required for remote'}</span>
              </label>
            </div>

            {error && <div class="alert alert-error text-sm py-2">{error}</div>}

            <button type="submit" class={`btn btn-primary w-full ${loading ? 'loading' : ''}`} disabled={loading}>
              {loading ? '' : t('connect')}
            </button>
          </form>

          <div class="mt-4 flex justify-center">
            <LangSwitcher />
          </div>
        </div>
      </div>
    </div>
  )
}
