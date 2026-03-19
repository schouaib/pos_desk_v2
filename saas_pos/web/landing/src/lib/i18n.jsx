import { createContext } from 'preact'
import { useContext, useState, useEffect, useCallback, useMemo } from 'preact/hooks'
import en from './locales/en.js'

const loaders = {
  fr: () => import('./locales/fr.js').then((m) => m.default),
  ar: () => import('./locales/ar.js').then((m) => m.default),
}

const cache = { en }

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en')
  const [dict, setDict] = useState(() => cache[lang] || en)

  useEffect(() => {
    localStorage.setItem('lang', lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'

    if (cache[lang]) {
      setDict(cache[lang])
      return
    }

    const loader = loaders[lang]
    if (loader) {
      loader().then((translations) => {
        cache[lang] = translations
        setDict(translations)
      })
    }
  }, [lang])

  const t = useCallback((key) => dict[key] ?? en[key] ?? key, [dict])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, t])

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => useContext(I18nContext)
