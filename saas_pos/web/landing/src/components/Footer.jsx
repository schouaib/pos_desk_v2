import { useI18n } from '../lib/i18n'
import { TENANT_URL } from '../lib/config'

export function Footer() {
  const { t } = useI18n()

  return (
    <footer class="bg-base-200 py-12 px-4">
      <div class="max-w-7xl mx-auto">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div class="md:col-span-1">
            <h3 class="text-lg font-bold text-primary mb-2">{t('brandName')}</h3>
            <p class="text-sm text-base-content/50">{t('footerTagline')}</p>
          </div>

          {/* Product */}
          <div>
            <h4 class="font-semibold text-sm mb-3">{t('footerProduct')}</h4>
            <ul class="space-y-2">
              <li><a href="#features" class="text-sm text-base-content/60 hover:text-primary transition-colors">{t('footerFeatures')}</a></li>
              <li><a href="#pricing" class="text-sm text-base-content/60 hover:text-primary transition-colors">{t('footerPricing')}</a></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 class="font-semibold text-sm mb-3">{t('footerCompany')}</h4>
            <ul class="space-y-2">
              <li><a href={`${TENANT_URL}/login`} class="text-sm text-base-content/60 hover:text-primary transition-colors">{t('footerLogin')}</a></li>
              <li><a href={`${TENANT_URL}/signup`} class="text-sm text-base-content/60 hover:text-primary transition-colors">{t('footerSignup')}</a></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 class="font-semibold text-sm mb-3">{t('footerSupport')}</h4>
            <ul class="space-y-2">
              <li><a href="#" class="text-sm text-base-content/60 hover:text-primary transition-colors">{t('footerPrivacy')}</a></li>
              <li><a href="#" class="text-sm text-base-content/60 hover:text-primary transition-colors">{t('footerTerms')}</a></li>
              <li><a href="#" class="text-sm text-base-content/60 hover:text-primary transition-colors">{t('footerContact')}</a></li>
            </ul>
          </div>
        </div>

        <div class="border-t border-base-300 pt-6">
          <p class="text-center text-sm text-base-content/40">{t('footerCopyright')}</p>
        </div>
      </div>
    </footer>
  )
}
