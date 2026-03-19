import { useState } from 'preact/hooks'
import { route } from 'preact-router'
import { api } from '../lib/api'
import { setAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { LangSwitcher } from '../components/LangSwitcher'

export default function Login() {
  const { t } = useI18n()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function mapError(msg) {
    if (msg.includes('invalid') || msg.includes('password')) return t('errInvalidCredentials')
    if (msg.includes('disabled')) return t('errAccountDisabled')
    return msg
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.login(form)
      setAuth(data.token, data.admin)
      route('/dashboard')
    } catch (err) {
      setError(mapError(err.message))
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
          <h2 class="card-title text-2xl font-bold mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            {t('superAdmin')}
          </h2>
          <p class="text-base-content/60 text-sm mb-4">{t('signInManage')}</p>

          {error && (
            <div class="alert alert-error text-sm py-2 mb-2">
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
            <button type="submit" class={`btn btn-primary btn-sm w-full ${loading ? 'loading' : ''}`} disabled={loading}>
              {t('signIn')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
