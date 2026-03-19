import { render } from 'preact'
import { App } from './app'
import { I18nProvider } from './lib/i18n'
import './index.css'

render(
  <I18nProvider>
    <App />
  </I18nProvider>,
  document.getElementById('app')
)
