import { render } from 'preact'
import { App } from './app'
import { I18nProvider } from './lib/i18n'
import './index.css'

// ─── Production security: disable DevTools & right-click ────────────
if (window.__TAURI_INTERNALS__) {
  // Block DevTools shortcuts
  document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12') e.preventDefault()
    // Ctrl+Shift+I / Cmd+Option+I (DevTools)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') e.preventDefault()
    // Ctrl+Shift+J / Cmd+Option+J (Console)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') e.preventDefault()
    // Ctrl+U / Cmd+U (View Source)
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') e.preventDefault()
  })

  // Block right-click context menu
  document.addEventListener('contextmenu', (e) => e.preventDefault())
}

render(
  <I18nProvider>
    <App />
  </I18nProvider>,
  document.getElementById('app')
)
