import { useState } from 'preact/hooks'
import { useI18n } from '../lib/i18n'
import { saveServerUrl, validateUrl } from '../lib/config'
import { LangSwitcher } from '../components/LangSwitcher'

export default function ServerSetup({ onConnected }) {
  const { t } = useI18n()
  const [url, setUrl] = useState('https://localhost:3000')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const cleanUrl = url.replace(/\/+$/, '')

      // Validate URL format and HTTPS requirement
      const { valid, error: urlError } = validateUrl(cleanUrl)
      if (!valid) {
        setError(urlError)
        setLoading(false)
        return
      }

      const res = await fetch(`${cleanUrl}/api/super-admin/setup-status`, {
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
                placeholder="https://your-server.com"
                value={url}
                onInput={(e) => setUrl(e.target.value)}
                required
              />
              <label class="label">
                <span class="label-text-alt text-base-content/40">HTTPS required for remote servers</span>
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
