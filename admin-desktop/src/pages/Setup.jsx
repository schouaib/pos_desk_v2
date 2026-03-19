import { useState } from 'preact/hooks'
import { route } from 'preact-router'
import { api } from '../lib/api'
import { setAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { LangSwitcher } from '../components/LangSwitcher'

export default function Setup() {
  const { t } = useI18n()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirm) {
      setError(t('passwordsNoMatch') || 'Passwords do not match')
      return
    }
    if (form.password.length < 8) {
      setError(t('passwordMin') || 'Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      await api.setup({ name: form.name, email: form.email, password: form.password })
      const data = await api.login({ email: form.email, password: form.password })
      setAuth(data.token, data.admin)
      route('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="min-h-screen flex items-center justify-center bg-base-200">
      <div class="card w-full max-w-md bg-base-100 shadow-xl">
        <div class="card-body">
          <div class="flex justify-end mb-1">
            <LangSwitcher />
          </div>
          <div class="text-center mb-6">
            <div class="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-3">
              <span class="text-primary-content text-2xl font-bold">A</span>
            </div>
            <h2 class="text-2xl font-bold">{t('firstTimeSetup')}</h2>
            <p class="text-base-content/60 text-sm mt-1">{t('setupSub')}</p>
          </div>

          {error && (
            <div class="alert alert-error text-sm py-2 mb-2">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} class="space-y-3">
            <label class="form-control">
              <span class="label-text text-sm font-medium">{t('adminName')}</span>
              <input class="input input-bordered input-sm"
                value={form.name}
                onInput={(e) => setForm({ ...form, name: e.target.value })}
                required />
            </label>

            <label class="form-control">
              <span class="label-text text-sm font-medium">{t('email')}</span>
              <input type="email" class="input input-bordered input-sm"
                value={form.email}
                onInput={(e) => setForm({ ...form, email: e.target.value })}
                required />
            </label>

            <label class="form-control">
              <span class="label-text text-sm font-medium">{t('password')}</span>
              <input type="password" class="input input-bordered input-sm"
                value={form.password}
                onInput={(e) => setForm({ ...form, password: e.target.value })}
                required />
            </label>

            <label class="form-control">
              <span class="label-text text-sm font-medium">{t('confirmPassword') || 'Confirm Password'}</span>
              <input type="password" class="input input-bordered input-sm"
                value={form.confirm}
                onInput={(e) => setForm({ ...form, confirm: e.target.value })}
                required />
            </label>

            <button type="submit" class={`btn btn-primary w-full mt-2 ${loading ? 'loading' : ''}`} disabled={loading}>
              {t('createAccount')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
