import { useI18n } from '../lib/i18n'
import { TENANT_URL } from '../lib/config'

function CheckIcon() {
  return (
    <svg class="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function MockupDashboard({ t }) {
  return (
    <div class="relative">
      {/* Main card */}
      <div class="bg-base-100 rounded-2xl shadow-lg border border-base-200 p-6 space-y-5">
        {/* Stats row */}
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-primary/5 rounded-xl p-3">
            <p class="text-xs text-base-content/50 font-medium">{t('mockupSales')}</p>
            <p class="text-2xl font-bold text-primary">1,284</p>
          </div>
          <div class="bg-success/5 rounded-xl p-3">
            <p class="text-xs text-base-content/50 font-medium">{t('mockupRevenue')}</p>
            <p class="text-2xl font-bold text-success">{t('mockupRevenueValue')}</p>
          </div>
          <div class="bg-info/5 rounded-xl p-3">
            <p class="text-xs text-base-content/50 font-medium">{t('mockupProducts')}</p>
            <p class="text-2xl font-bold text-info">846</p>
          </div>
          <div class="bg-warning/5 rounded-xl p-3">
            <p class="text-xs text-base-content/50 font-medium">{t('mockupClients')}</p>
            <p class="text-2xl font-bold text-warning">132</p>
          </div>
        </div>

        {/* Mini chart */}
        <div class="space-y-2">
          <div class="flex items-end gap-1 h-16">
            {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
              <div key={i} class="flex-1 rounded-t-sm bg-primary/20" style={{ height: `${h}%` }}>
                <div class="w-full rounded-t-sm bg-primary" style={{ height: '60%' }} />
              </div>
            ))}
          </div>
        </div>

        {/* Activity rows */}
        <div class="space-y-2">
          {[
            { name: 'VTE-001284', badge: t('mockupCompleted'), color: 'badge-success' },
            { name: 'VTE-001283', badge: t('mockupPending'), color: 'badge-warning' },
            { name: 'VTE-001282', badge: t('mockupCompleted'), color: 'badge-success' },
          ].map((item) => (
            <div key={item.name} class="flex items-center justify-between py-2 border-b border-base-200 last:border-0">
              <span class="text-sm font-medium">{item.name}</span>
              <span class={`badge badge-sm ${item.color}`}>{item.badge}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Floating accent card */}
      <div class="absolute -bottom-4 -start-4 bg-base-100 rounded-xl shadow-md border border-base-200 p-3 flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
          <svg class="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <div>
          <p class="text-xs text-base-content/50">+12.5%</p>
          <p class="text-sm font-bold text-success">{t('mockupGrowth')}</p>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  const { t } = useI18n()

  return (
    <section class="min-h-[calc(100vh-4rem)] flex items-center py-12 lg:py-0">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Text */}
          <div class="space-y-6">
            <span class="badge badge-primary badge-outline badge-lg font-medium">{t('heroBadge')}</span>
            <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight">
              {t('heroTitle1')}{' '}
              <span class="text-primary">{t('heroTitleHighlight')}</span>{' '}
              {t('heroTitle2')}
            </h1>
            <p class="text-lg text-base-content/60 max-w-xl">{t('heroSubtitle')}</p>
            <div class="flex flex-wrap gap-3">
              <a href={`${TENANT_URL}/signup`} class="btn btn-primary btn-lg">{t('heroCTA')}</a>
              <a href="#features" class="btn btn-ghost btn-lg">{t('heroSecondaryCTA')}</a>
            </div>
            <div class="flex flex-wrap gap-4 pt-2">
              {['heroTrust1', 'heroTrust2', 'heroTrust3'].map((key) => (
                <div key={key} class="flex items-center gap-1.5 text-sm text-base-content/50">
                  <CheckIcon />
                  <span>{t(key)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mockup */}
          <div class="hidden lg:block">
            <MockupDashboard t={t} />
          </div>
        </div>
      </div>
    </section>
  )
}
