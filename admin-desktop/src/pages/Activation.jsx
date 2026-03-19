import { useState, useEffect } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '../lib/i18n'
import { LangSwitcher } from '../components/LangSwitcher'

export default function Activation({ onActivated }) {
  const { t } = useI18n()
  const [machineId, setMachineId] = useState('')
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    invoke('get_machine_id').then(setMachineId).catch(() => {})
  }, [])

  async function copyMachineId() {
    try {
      await navigator.clipboard.writeText(machineId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const valid = await invoke('activate', { key: key.trim() })
      if (valid) {
        onActivated()
      } else {
        setError(t('invalidKey'))
      }
    } catch (err) {
      // Show user-friendly message, not raw error details
      const msg = err.toString()
      if (msg.includes('Too many attempts')) {
        setError(t('tooManyAttempts') || 'Too many attempts. Please wait 60 seconds.')
      } else {
        setError(t('activationFailed') || 'Activation failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card bg-base-100 shadow-xl w-full max-w-md">
        <div class="card-body">
          <div class="flex justify-end mb-1">
            <LangSwitcher />
          </div>

          <div class="text-center mb-4">
            <div class="w-14 h-14 bg-warning/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h2 class="text-2xl font-bold">{t('activationRequired')}</h2>
            <p class="text-base-content/60 text-sm mt-1">{t('activationSub')}</p>
          </div>

          {/* Machine ID display */}
          <div class="bg-base-200 rounded-lg p-3 mb-4">
            <label class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">{t('machineId')}</label>
            <div class="flex items-center gap-2 mt-1">
              <code class="flex-1 text-sm font-mono break-all select-all">{machineId || '...'}</code>
              <button
                onClick={copyMachineId}
                class="btn btn-xs btn-ghost shrink-0"
                title={t('copy')}
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
            <p class="text-[10px] text-base-content/40 mt-1">{t('machineIdHint')}</p>
          </div>

          {error && (
            <div class="alert alert-error text-sm py-2 mb-2">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} class="space-y-4">
            <div class="form-control">
              <label class="label"><span class="label-text font-medium">{t('activationKey')}</span></label>
              <textarea
                class="textarea textarea-bordered font-mono text-xs leading-relaxed"
                placeholder="Paste your full activation key here..."
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
              {loading ? '' : t('activateBtn')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
