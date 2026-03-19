import { useI18n } from '../lib/i18n'
import { TENANT_URL } from '../lib/config'

export function CTA() {
  const { t } = useI18n()

  return (
    <section class="py-20 px-4 bg-primary text-primary-content">
      <div class="max-w-3xl mx-auto text-center space-y-6">
        <h2 class="text-3xl sm:text-4xl font-bold">{t('ctaTitle')}</h2>
        <p class="text-primary-content/80 text-lg max-w-xl mx-auto">{t('ctaSubtitle')}</p>
        <a href={`${TENANT_URL}/signup`} class="btn btn-lg bg-white text-primary hover:bg-base-200 border-0">
          {t('ctaButton')}
        </a>
      </div>
    </section>
  )
}
