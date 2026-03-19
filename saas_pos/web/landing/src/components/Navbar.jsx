import { useState } from 'preact/hooks'
import { useI18n } from '../lib/i18n'
import { LangSwitcher } from './LangSwitcher'
import { TENANT_URL } from '../lib/config'

export function Navbar() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  const links = [
    { href: '#features', label: t('navFeatures') },
    { href: '#pricing', label: t('navPricing') },
    { href: '#testimonials', label: t('navTestimonials') },
  ]

  return (
    <nav class="sticky top-0 z-50 bg-base-100/80 backdrop-blur border-b border-base-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          {/* Brand */}
          <a href="/" class="text-xl font-bold text-primary">{t('brandName')}</a>

          {/* Desktop nav */}
          <div class="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <a key={l.href} href={l.href} class="text-sm font-medium text-base-content/70 hover:text-primary transition-colors">
                {l.label}
              </a>
            ))}
          </div>

          {/* Desktop actions */}
          <div class="hidden md:flex items-center gap-3">
            <LangSwitcher />
            <a href={`${TENANT_URL}/login`} class="btn btn-ghost btn-sm">{t('navLogin')}</a>
            <a href={`${TENANT_URL}/signup`} class="btn btn-primary btn-sm">{t('navSignup')}</a>
          </div>

          {/* Mobile hamburger */}
          <button class="md:hidden btn btn-ghost btn-sm btn-square" onClick={() => setOpen(!open)}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {open
                ? <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                : <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div class="md:hidden pb-4 border-t border-base-200 pt-3 flex flex-col gap-2">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} class="px-3 py-2 text-sm font-medium text-base-content/70 hover:text-primary">
                {l.label}
              </a>
            ))}
            <div class="flex items-center gap-2 px-3 pt-2">
              <LangSwitcher />
            </div>
            <div class="flex gap-2 px-3 pt-1">
              <a href={`${TENANT_URL}/login`} class="btn btn-ghost btn-sm flex-1">{t('navLogin')}</a>
              <a href={`${TENANT_URL}/signup`} class="btn btn-primary btn-sm flex-1">{t('navSignup')}</a>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
