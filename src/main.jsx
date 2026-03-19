import { render } from 'preact'
import { App } from './app'
import { I18nProvider } from './lib/i18n'
import './index.css'

// ─── Production security: disable DevTools & right-click ────────────
// Disabled in dev for debugging
// if (window.__TAURI_INTERNALS__) {
//   document.addEventListener('keydown', (e) => {
//     if (e.key === 'F12') e.preventDefault()
//     if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') e.preventDefault()
//     if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') e.preventDefault()
//     if ((e.ctrlKey || e.metaKey) && e.key === 'u') e.preventDefault()
//   })
//   document.addEventListener('contextmenu', (e) => e.preventDefault())
// }

render(
  <I18nProvider>
    <App />
  </I18nProvider>,
  document.getElementById('app')
)
