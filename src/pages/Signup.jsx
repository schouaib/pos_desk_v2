import { useState, useEffect } from 'preact/hooks'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useTurnstile } from '../lib/turnstile'
import { LangSwitcher } from '../components/LangSwitcher'

const FEATURE_KEYS = ['products', 'purchases', 'suppliers', 'sales', 'pos', 'losses', 'expenses', 'retraits', 'stats', 'multi_barcodes', 'product_history']
const FEATURE_LABEL = {
  products:        'featProducts',
  purchases:       'featPurchases',
  suppliers:       'featSuppliers',
  sales:           'featSales',
  pos:             'featPOS',
  losses:          'featLosses',
  expenses:        'featExpenses',
  retraits:        'featRetraits',
  stats:           'featStats',
  multi_barcodes:  'featMultiBarcodes',
  product_history: 'featProductHistory',
}

export default function Signup() {
  const { t } = useI18n()
  const [plans, setPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [step, setStep] = useState(1) // 1 = pick plan, 2 = fill details, 3 = pending
  const [form, setForm] = useState({
    store_name: '', email: '', password: '', confirm: '', phone: '', brand_color: '#3b82f6',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { containerRef, getToken } = useTurnstile()

  useEffect(() => {
    let cancelled = false
    api.listPublicPlans()
      .then(d => { if (!cancelled) setPlans(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  function selectPlan(plan) {
    setSelectedPlan(plan)
    setStep(2)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirm) {
      setError(t('passwordsNoMatch'))
      return
    }
    if (form.password.length < 8) {
      setError(t('passwordMin'))
      return
    }

    setLoading(true)
    try {
      const cf_token = await getToken()
      await api.signup({
        store_name: form.store_name,
        email: form.email,
        password: form.password,
        phone: form.phone,
        brand_color: form.brand_color,
        plan_id: selectedPlan.id,
        cf_token,
      })
      setStep(3)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="min-h-screen bg-base-200 py-10 px-4">
      <div class="max-w-3xl mx-auto">
        <div class="flex justify-end mb-4">
          <LangSwitcher />
        </div>
        <div class="text-center mb-8">
          <div class="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span class="text-primary-content text-2xl font-bold">P</span>
          </div>
          <h1 class="text-3xl font-bold">{t('getStarted')}</h1>
          <p class="text-base-content/80 mt-1">{t('choosePlanSub')}</p>
        </div>

        {step < 3 && (
          <ul class="steps w-full mb-8">
            <li class={`step ${step >= 1 ? 'step-primary' : ''}`}>{t('choosePlanStep')}</li>
            <li class={`step ${step >= 2 ? 'step-primary' : ''}`}>{t('storeDetailsStep')}</li>
          </ul>
        )}

        {/* Step 1 — Plan picker */}
        {step === 1 && (
          <div>
            {plans.length === 0 && (
              <div class="text-center text-base-content/70 py-12">
                <p>{t('loadingPlans')}</p>
              </div>
            )}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  class="card bg-base-100 shadow cursor-pointer hover:shadow-lg hover:border-primary border-2 border-transparent transition-all"
                  onClick={() => selectPlan(plan)}
                >
                  <div class="card-body">
                    <h2 class="card-title">{plan.name}</h2>
                    <p class="text-base-content/80 text-sm">{plan.description}</p>
                    <div class="mt-3">
                      <span class="text-3xl font-bold text-primary">${plan.price}</span>
                      <span class="text-base-content/70 text-sm">{t('perMonth')}</span>
                    </div>
                    <ul class="mt-3 space-y-1 text-sm text-base-content/80">
                      <li>{plan.max_users === 0 ? `${t('unlimited')} ${t('users')}` : `${t('upTo')} ${plan.max_users} ${t('users')}`}</li>
                      <li>{plan.max_products === 0 ? `${t('unlimited')} ${t('products')}` : `${t('upTo')} ${plan.max_products} ${t('products')}`}</li>
                      <li>{(!plan.max_sales_month || plan.max_sales_month === 0) ? `${t('unlimited')} ${t('salesPerMonth')}` : `${t('upTo')} ${plan.max_sales_month} ${t('salesPerMonth')}`}</li>
                    </ul>
                    {FEATURE_KEYS.some((k) => plan.features?.[k]) && (
                      <div class="mt-3 flex flex-wrap gap-1">
                        {FEATURE_KEYS.filter((k) => plan.features?.[k]).map((k) => (
                          <span key={k} class="badge badge-xs badge-primary badge-outline">{t(FEATURE_LABEL[k])}</span>
                        ))}
                      </div>
                    )}
                    <div class="card-actions mt-4">
                      <button class="btn btn-primary btn-sm w-full">{t('select')}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p class="text-center text-sm text-base-content/70 mt-6">
              {t('alreadyAccount')}{' '}
              <a href="/login" class="link link-primary">{t('signIn2')}</a>
            </p>
          </div>
        )}

        {/* Step 2 — Store details */}
        {step === 2 && (
          <div class="card bg-base-100 shadow max-w-md mx-auto">
            <div class="card-body">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <p class="text-sm text-base-content/80">{t('selectedPlan')}</p>
                  <p class="font-bold text-primary">{selectedPlan?.name} — ${selectedPlan?.price}{t('perMonth')}</p>
                </div>
                <button class="btn btn-xs btn-ghost" onClick={() => setStep(1)}>{t('change')}</button>
              </div>

              <div class="divider my-1" />

              {error && (
                <div class="alert alert-error text-sm py-2 mb-2">
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} class="space-y-3">
                <label class="form-control">
                  <span class="label-text text-sm font-medium">{t('storeName')}</span>
                  <input class="input input-bordered input-sm"
                    value={form.store_name}
                    onInput={(e) => setForm({ ...form, store_name: e.target.value })} required />
                </label>

                <label class="form-control">
                  <span class="label-text text-sm font-medium">{t('email')}</span>
                  <input type="email" class="input input-bordered input-sm"
                    value={form.email}
                    onInput={(e) => setForm({ ...form, email: e.target.value })} required />
                </label>

                <label class="form-control">
                  <span class="label-text text-sm font-medium">{t('phone')}</span>
                  <input type="tel" class="input input-bordered input-sm"
                    value={form.phone}
                    onInput={(e) => setForm({ ...form, phone: e.target.value })} />
                </label>

                <label class="form-control">
                  <span class="label-text text-sm font-medium">{t('password')}</span>
                  <input type="password" class="input input-bordered input-sm"
                    value={form.password}
                    onInput={(e) => setForm({ ...form, password: e.target.value })} required />
                </label>

                <label class="form-control">
                  <span class="label-text text-sm font-medium">{t('confirmPassword')}</span>
                  <input type="password" class="input input-bordered input-sm"
                    value={form.confirm}
                    onInput={(e) => setForm({ ...form, confirm: e.target.value })} required />
                </label>

                <label class="form-control">
                  <span class="label-text text-sm font-medium">{t('brandColor')}</span>
                  <div class="flex items-center gap-3">
                    <input type="color" class="w-10 h-9 rounded border cursor-pointer"
                      value={form.brand_color}
                      onInput={(e) => setForm({ ...form, brand_color: e.target.value })} />
                    <span class="text-sm font-mono text-base-content/80">{form.brand_color}</span>
                  </div>
                </label>

                <div ref={containerRef} />
                <button type="submit" class={`btn btn-primary w-full mt-2 ${loading ? 'loading' : ''}`} disabled={loading}>
                  {t('createMyStore')}
                </button>

                <p class="text-center text-sm text-base-content/70">
                  {t('alreadyAccount')}{' '}
                  <a href="/login" class="link link-primary">{t('signIn2')}</a>
                </p>
              </form>
            </div>
          </div>
        )}

        {/* Step 3 — Pending approval */}
        {step === 3 && (
          <div class="max-w-md mx-auto text-center">
            <div class="card bg-base-100 shadow">
              <div class="card-body items-center py-10">
                <div class="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 class="text-2xl font-bold">{t('pendingTitle')}</h2>
                <p class="text-base-content/80 mt-2 text-sm leading-relaxed">
                  {t('pendingDesc')}{' '}
                  <span class="font-semibold text-base-content">{form.store_name}</span>
                  <br /><br />
                  {t('pendingReview')}
                </p>
                <div class="divider" />
                <p class="text-xs text-base-content/70">
                  {t('registeredWith')} <span class="font-medium">{form.email}</span>
                </p>
                <a href="/login" class="btn btn-outline btn-sm mt-4">{t('backToLogin')}</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
