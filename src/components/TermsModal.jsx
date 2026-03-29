import { useState, useRef, useEffect } from 'preact/hooks'
import { useI18n } from '../lib/i18n'

const TERMS_ACCEPTED_KEY = 'ciposdz_terms_accepted_v1'

export function isTermsAccepted() {
  return localStorage.getItem(TERMS_ACCEPTED_KEY) === 'true'
}

export function TermsModal({ onAccept }) {
  const { t } = useI18n()
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const [checked, setChecked] = useState(false)
  const scrollRef = useRef()

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      const threshold = 100
      if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
        setScrolledToBottom(true)
      }
    }
    el.addEventListener('scroll', onScroll)
    if (el.scrollHeight <= el.clientHeight + 50) setScrolledToBottom(true)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  function handleAccept() {
    localStorage.setItem(TERMS_ACCEPTED_KEY, 'true')
    onAccept()
  }

  return (
    <div class="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-base-100 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" dir="rtl">
        {/* Header */}
        <div class="p-5 border-b border-base-300 flex items-center gap-3 shrink-0">
          <div class="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <svg class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <div>
            <h2 class="font-bold text-lg">{t('termsOfUse')}</h2>
            <p class="text-xs text-base-content/70">{t('termsMustRead')}</p>
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} class="overflow-y-auto flex-1 p-5 text-sm leading-relaxed space-y-4">
          <div class="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm">
            <p class="font-bold text-warning mb-1">{t('termsImportantNotice')}</p>
            <p class="text-base-content/80" dangerouslySetInnerHTML={{ __html: t('termsNoticeBody') }} />
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">{t('termsSoftwareNature')}</h3>
            <p>{t('termsSoftwareNatureBody')}</p>
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">{t('termsIPProtection')}</h3>
            <p>{t('termsIPProtectionBody')}</p>
          </div>

          <div>
            <h3 class="font-bold text-error mb-2">{t('termsDisclaimerBusiness')}</h3>
            <p class="mb-2">{t('termsDisclaimerBusinessBody')}</p>
            <ul class="space-y-1 pr-4 text-xs">
              <li>• {t('termsDisclaimerList1')}</li>
              <li>• {t('termsDisclaimerList2')}</li>
              <li>• {t('termsDisclaimerList3')}</li>
              <li>• {t('termsDisclaimerList4')}</li>
            </ul>
            <p class="mt-2 text-xs text-error font-semibold">{t('termsDisclaimerWarning')}</p>
          </div>

          <div>
            <h3 class="font-bold text-error mb-2">{t('termsDisclaimerData')}</h3>
            <p>{t('termsDisclaimerDataBody')}</p>
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">{t('termsAsIs')}</h3>
            <p>{t('termsAsIsBody')}</p>
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">{t('termsLiability')}</h3>
            <p>{t('termsLiabilityBody')}</p>
          </div>

          <div>
            <h3 class="font-bold text-warning mb-2">{t('termsIndemnification')}</h3>
            <p>{t('termsIndemnificationBody')}</p>
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">{t('termsWaiver')}</h3>
            <p>{t('termsWaiverBody')}</p>
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">{t('termsGoverningLaw')}</h3>
            <p>{t('termsGoverningLawBody')}</p>
          </div>

          <div class="bg-base-200 rounded-lg p-3 text-xs text-center text-base-content/70">
            <p>{t('termsSummaryNote')}</p>
          </div>

          {!scrolledToBottom && (
            <div class="text-center text-xs text-base-content/70 animate-bounce pt-2">
              {t('termsScrollDown')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div class="p-5 border-t border-base-300 shrink-0 space-y-3">
          <label class={`flex items-start gap-3 cursor-pointer ${!scrolledToBottom ? 'opacity-40 pointer-events-none' : ''}`}>
            <input
              type="checkbox"
              class="checkbox checkbox-primary checkbox-sm mt-0.5"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={!scrolledToBottom}
            />
            <span class="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('termsAcceptCheckbox') }} />
          </label>

          <div class="flex gap-2">
            <button
              class="btn btn-primary flex-1"
              disabled={!checked || !scrolledToBottom}
              onClick={handleAccept}
            >
              {t('termsAcceptButton')}
            </button>
          </div>

          <p class="text-xs text-center text-base-content/70">
            {t('termsAllRightsReserved').replace('{year}', new Date().getFullYear())}
          </p>
        </div>
      </div>
    </div>
  )
}
