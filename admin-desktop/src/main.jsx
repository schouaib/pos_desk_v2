import { render } from 'preact'
import { App } from './app'
import { I18nProvider } from './lib/i18n'
import './index.css'

// ─── Production security: disable DevTools & right-click ────────────
if (import.meta.env.PROD && window.__TAURI_INTERNALS__) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F12') e.preventDefault()
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) e.preventDefault()
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) e.preventDefault()
    if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) e.preventDefault()
  })
  document.addEventListener('contextmenu', (e) => e.preventDefault())
}

render(
  <I18nProvider>
    <App />
  </I18nProvider>,
  document.getElementById('app')
)
