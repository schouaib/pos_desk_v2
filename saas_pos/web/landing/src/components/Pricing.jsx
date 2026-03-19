import { useState, useEffect } from 'preact/hooks'
import { useI18n } from '../lib/i18n'
import { TENANT_URL } from '../lib/config'

const featureKeys = [
  ['products', 'planProducts'],
  ['purchases', 'planPurchases'],
  ['suppliers', 'planSuppliers'],
  ['sales', 'planSales'],
  ['pos', 'planPos'],
  ['losses', 'planLosses'],
  ['expenses', 'planExpenses'],
  ['retraits', 'planRetraits'],
  ['stats', 'planStats'],
  ['multi_barcodes', 'planMultiBarcodes'],
  ['product_history', 'planProductHistory'],
  ['clients', 'planClients'],
  ['client_payments', 'planClientPayments'],
]

function CheckIcon() {
  return (
    <svg class="w-4 h-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg class="w-4 h-4 text-base-content/20 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SkeletonCard() {
  return (
    <div class="card bg-base-100 border border-base-200 rounded-2xl p-6 animate-pulse">
      <div class="h-6 bg-base-200 rounded w-1/2 mb-4" />
      <div class="h-10 bg-base-200 rounded w-1/3 mb-6" />
      <div class="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} class="h-4 bg-base-200 rounded w-full" />
        ))}
      </div>
    </div>
  )
}

export function Pricing() {
  const { t } = useI18n()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/plans')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setPlans(res.data || [])
        else setError(t('pricingError'))
      })
      .catch(() => setError(t('pricingError')))
      .finally(() => setLoading(false))
  }, [])

  const popularIdx = plans.length > 1 ? 1 : -1

  return (
    <section id="pricing" class="py-20 px-4 bg-base-200/30">
      <div class="max-w-6xl mx-auto">
        {/* Header */}
        <div class="text-center mb-14">
          <h2 class="text-3xl sm:text-4xl font-bold mb-3">{t('pricingTitle')}</h2>
          <p class="text-base-content/60 text-lg max-w-2xl mx-auto">{t('pricingSubtitle')}</p>
        </div>

        {/* Loading */}
        {loading && (
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        )}

        {/* Error */}
        {error && <p class="text-center text-error">{error}</p>}

        {/* Plan cards */}
        {!loading && !error && (
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, idx) => (
              <div
                key={plan._id}
                class={`card bg-base-100 rounded-2xl p-6 relative transition-shadow ${
                  idx === popularIdx
                    ? 'border-2 border-primary shadow-md'
                    : 'border border-base-200 shadow-sm hover:shadow-md'
                }`}
              >
                {idx === popularIdx && (
                  <span class="badge badge-primary badge-sm absolute -top-2.5 left-1/2 -translate-x-1/2">
                    {t('pricingMostPopular')}
                  </span>
                )}

                <h3 class="text-xl font-bold mb-2">{plan.name}</h3>

                {/* Price */}
                <div class="mb-5">
                  {plan.price === 0 ? (
                    <span class="text-4xl font-extrabold">{t('pricingFree')}</span>
                  ) : (
                    <>
                      <span class="text-4xl font-extrabold">${plan.price}</span>
                      <span class="text-base-content/50 text-sm">{t('pricingPerMonth')}</span>
                    </>
                  )}
                </div>

                <div class="divider my-0" />

                {/* Limits */}
                <div class="space-y-2 py-4">
                  <div class="flex items-center gap-2 text-sm">
                    <CheckIcon />
                    <span>
                      {plan.max_users === 0 ? t('pricingUnlimited') : `${t('pricingUpTo')} ${plan.max_users}`} {t('pricingUsers')}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 text-sm">
                    <CheckIcon />
                    <span>
                      {plan.max_products === 0 ? t('pricingUnlimited') : `${t('pricingUpTo')} ${plan.max_products}`} {t('pricingProducts')}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 text-sm">
                    <CheckIcon />
                    <span>
                      {plan.max_sales_month === 0 ? t('pricingUnlimited') : `${t('pricingUpTo')} ${plan.max_sales_month}`} {t('pricingSales')}
                    </span>
                  </div>
                </div>

                <div class="divider my-0" />

                {/* Boolean features */}
                <div class="space-y-2 py-4">
                  {featureKeys.map(([fKey, tKey]) => (
                    <div key={fKey} class="flex items-center gap-2 text-sm">
                      {plan.features?.[fKey] ? <CheckIcon /> : <CrossIcon />}
                      <span class={plan.features?.[fKey] ? '' : 'text-base-content/30'}>
                        {t(tKey)}
                      </span>
                    </div>
                  ))}
                </div>

                <a href={`${TENANT_URL}/signup`} class={`btn btn-block mt-auto ${idx === popularIdx ? 'btn-primary' : 'btn-outline btn-primary'}`}>
                  {t('pricingGetStarted')}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
