import { useState } from 'preact/hooks'
import { route } from 'preact-router'
import { api } from '../lib/api'
import { setAuth, batchAlerts, hasFeature, isTenantAdmin } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useTurnstile } from '../lib/turnstile'
import { LangSwitcher } from '../components/LangSwitcher'

export default function Login() {
  const { t } = useI18n()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { containerRef, getToken } = useTurnstile()

  function translateError(msg) {
    if (msg === 'plan_expired' || msg.includes('plan expired')) return t('errPlanExpired')
    if (msg.includes('account is disabled')) return t('errAccountDisabled')
    if (msg.includes('store is disabled')) return t('errStoreDisabled')
    if (msg.includes('captcha')) return t('errCaptchaFailed') || 'Captcha verification failed'
    return t('errInvalidCredentials')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const cf_token = await getToken()
      const data = await api.login({ ...form, cf_token })
      setAuth(data.token, data.user)
      // Fetch batch expiry alerts once after login (fire and forget)
      if (isTenantAdmin() && hasFeature('batch_tracking')) {
        api.listBatchAlerts().then(items => { batchAlerts.value = items || [] }).catch(() => {})
      }
      route('/dashboard')
    } catch (err) {
      setError(translateError(err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card w-full max-w-sm bg-base-100 shadow-xl">
        <div class="card-body">
          <div class="flex justify-end mb-1">
            <LangSwitcher />
          </div>
          <h2 class="card-title text-2xl font-bold mb-1">{t('storeLogin')}</h2>
          <p class="text-base-content/60 text-sm mb-4">{t('signInManage')}</p>

          {error && (
            <div class={`alert text-sm py-2 mb-2 ${error.includes('disabled') ? 'alert-warning' : 'alert-error'}`}>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} class="space-y-3">
            <label class="form-control">
              <span class="label-text text-sm font-medium">{t('email')}</span>
              <input type="email" class="input input-bordered input-sm"
                value={form.email} onInput={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label class="form-control">
              <span class="label-text text-sm font-medium">{t('password')}</span>
              <input type="password" class="input input-bordered input-sm"
                value={form.password} onInput={(e) => setForm({ ...form, password: e.target.value })} required />
            </label>
            <div ref={containerRef} />
            <button type="submit" class={`btn btn-primary btn-sm w-full ${loading ? 'loading' : ''}`} disabled={loading}>
              {t('signIn')}
            </button>
            <p class="text-center text-sm text-base-content/50 mt-2">
              {t('noAccount')}{' '}
              <a href="/signup" class="link link-primary">{t('createStore')}</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
