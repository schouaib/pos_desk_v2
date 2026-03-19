import { useI18n } from '../lib/i18n'

export function LangSwitcher() {
  const { lang, setLang } = useI18n()
  return (
    <div class="flex gap-1">
      {[['en', 'EN'], ['fr', 'FR'], ['ar', 'ع']].map(([code, label]) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          class={`btn btn-sm ${lang === code ? 'btn-primary' : 'btn-ghost'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
