import { useState, useEffect } from 'preact/hooks'
import { useI18n } from '../lib/i18n'
import { saveConfig } from '../lib/config'

export default function Setup({ onActivated }) {
  const { t } = useI18n()
  const [machineId, setMachineId] = useState('')
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('get_machine_id').then(setMachineId).catch(() => {})
      })
    }
  }, [])

  async function copyMachineId() {
    try {
      await navigator.clipboard.writeText(machineId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  async function handleActivate(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (!window.__TAURI_INTERNALS__) {
        setError('Activation requires the desktop app.')
        setLoading(false)
        return
      }
      const { invoke } = await import('@tauri-apps/api/core')
      const valid = await invoke('activate', { key: key.trim() })
      if (valid) {
        await saveConfig({
          activatedAt: new Date().toISOString(),
        })
        onActivated()
      } else {
        setError(t('invalidKey') || 'Invalid activation key.')
      }
    } catch (err) {
      const msg = err.toString()
      if (msg.includes('Rate limited')) {
        setError(t('tooManyAttempts') || 'Too many attempts. Please wait 60 seconds.')
      } else {
        setError(t('activationFailed') || 'Activation failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5">
      <div class="card bg-base-100 shadow-xl w-full max-w-md">
        <div class="card-body">
          {/* Header */}
          <div class="text-center mb-6">
            <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h1 class="text-2xl font-bold">CiPOSdz</h1>
            <p class="text-base-content/60 text-sm mt-1">
              {t('activationRequired') || 'Activate this POS terminal'}
            </p>
          </div>

          {/* Machine ID display */}
          <div class="bg-base-200 rounded-lg p-3 mb-4">
            <label class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
              {t('machineId') || 'Machine ID'}
            </label>
            <div class="flex items-center gap-2 mt-1">
              <code class="flex-1 text-sm font-mono break-all select-all">{machineId || '...'}</code>
              <button
                onClick={copyMachineId}
                class="btn btn-xs btn-ghost shrink-0"
                title={t('copy') || 'Copy'}
              >
                {copied ? (
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
            <p class="text-[10px] text-base-content/40 mt-1">
              {t('machineIdHint') || 'Send this ID to your administrator to get an activation key'}
            </p>
          </div>

          {error && (
            <div class="alert alert-error text-sm mb-4">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleActivate} class="space-y-4">
            <div class="form-control">
              <label class="label">
                <span class="label-text font-medium">{t('activationKey') || 'Activation Key'}</span>
              </label>
              <textarea
                class="textarea textarea-bordered font-mono text-xs leading-relaxed"
                placeholder={t('pasteActivationKey') || 'Paste your full activation key here...'}
                rows={3}
                value={key}
                onInput={(e) => setKey(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              class={`btn btn-primary w-full ${loading ? 'loading' : ''}`}
              disabled={loading || !key.trim()}
            >
              {loading ? (t('activating') || 'Activating...') : (t('activate') || 'Activate')}
            </button>
          </form>

          <div class="text-center mt-6">
            <span class="text-xs text-base-content/30" id="app-version">v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
