import { useState, useRef, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import { api } from '../lib/api'
import { setAuth, batchAlerts, hasFeature, isTenantAdmin } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { LangSwitcher } from '../components/LangSwitcher'
import { TermsModal, isTermsAccepted } from '../components/TermsModal'

export default function Login() {
  const { t } = useI18n()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showTerms, setShowTerms] = useState(() => !isTermsAccepted())
  const emailRef = useRef()

  useEffect(() => { emailRef.current?.focus() }, [])

  function translateError(msg) {
    if (msg === 'plan_expired' || msg.includes('plan expired')) return t('errPlanExpired')
    if (msg.includes('account is disabled')) return t('errAccountDisabled')
    if (msg.includes('store is disabled')) return t('errStoreDisabled')
    return t('errInvalidCredentials')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.login(form)
      setAuth(data.token, data.user)
      // Auto-switch to preferred folder if saved
      const preferredFolder = localStorage.getItem('preferred_folder')
      if (preferredFolder && preferredFolder !== data.user?.tenant_id) {
        try {
          const res = await api.switchFolder({ folder_id: preferredFolder })
          const payload = JSON.parse(atob(res.token.split('.')[1]))
          setAuth(res.token, { ...data.user, tenant_id: preferredFolder, ...payload })
        } catch {
          // Preferred folder no longer accessible — clear preference
          localStorage.removeItem('preferred_folder')
        }
      }
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
    <div class="min-h-screen flex items-center justify-center bg-base-200 p-4">
      {showTerms && <TermsModal onAccept={() => setShowTerms(false)} />}
      {/* Background decoration */}
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div class="absolute -bottom-32 -left-32 w-[30rem] h-[30rem] rounded-full bg-primary/3 blur-3xl" />
      </div>

      <div class="card w-full max-w-sm bg-base-100 shadow-xl relative page-enter">
        <div class="card-body py-8 px-7">
          {/* Header */}
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-sm">
                <svg class="w-5 h-5 text-primary-content" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h1 class="font-bold text-lg leading-tight">CiPOSdz</h1>
              </div>
            </div>
            <LangSwitcher />
          </div>

          <h2 class="text-xl font-bold mb-0.5">{t('storeLogin')}</h2>
          <p class="text-base-content/50 text-sm mb-5">{t('signInManage')}</p>

          {error && (
            <div class={`alert text-sm py-2.5 px-3.5 mb-3 rounded-lg ${error.includes('disabled') ? 'alert-warning' : 'alert-error'}`}>
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} class="space-y-4">
            <label class="form-control">
              <span class="label-text">{t('username') || 'Username'}</span>
              <input ref={emailRef} type="text" class="input input-bordered w-full"
                placeholder="admin"
                value={form.email} onInput={(e) => setForm({ ...form, email: e.target.value })}
                data-search required autocomplete="username" />
            </label>
            <label class="form-control">
              <span class="label-text">{t('password')}</span>
              <input type="password" class="input input-bordered w-full"
                placeholder="••••••••"
                value={form.password} onInput={(e) => setForm({ ...form, password: e.target.value })}
                required autocomplete="current-password" />
            </label>

            <button type="submit"
              class={`btn btn-primary w-full mt-1 ${loading ? 'loading' : ''}`}
              disabled={loading}>
              {!loading && (
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              )}
              {t('signIn')}
            </button>

          </form>

          <div class="text-center mt-3 pt-3 border-t border-base-200">
            <a href="/terms" class="link link-hover text-xs text-base-content/40">
              شروط وأحكام الاستخدام
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
