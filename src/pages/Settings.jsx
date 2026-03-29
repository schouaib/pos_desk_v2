import { useState, useEffect, useRef } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { hasFeature } from '../lib/auth'
import { compressImage } from '../lib/imageCompress'
import { listPrinters } from '../lib/webusbPrint'

const CURRENCIES = [
  { code: 'DZD', symbol: 'DA', name: 'Algerian Dinar' },
  { code: 'EUR', symbol: '€',  name: 'Euro' },
  { code: 'USD', symbol: '$',  name: 'US Dollar' },
  { code: 'GBP', symbol: '£',  name: 'British Pound' },
  { code: 'MAD', symbol: 'MAD', name: 'Moroccan Dirham' },
  { code: 'TND', symbol: 'DT',  name: 'Tunisian Dinar' },
  { code: 'SAR', symbol: 'SR',  name: 'Saudi Riyal' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
]

const TABS = ['generalInfo', 'legalInfo', 'currencySettings', 'printerSettings', 'appPreferences']

export default function Settings({ path }) {
  const { t } = useI18n()

  const [form, setForm] = useState({
    name: '', phone: '', address: '', logo_url: '',
    currency: 'DZD',
    default_sale_price: 1,
    use_vat: false,
    pos_expiry_warning: false,
    max_cash_amount: 0,
    tap_rate: 2,
    ibs_rate: 19,
    default_product_mode: 'quick',
    rc: '', nif: '', nis: '', nart: '', compte_rib: '',
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [logoPreview, setLogoPreview] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [printersList, setPrintersList] = useState([])
  const [receiptPrinter, setReceiptPrinter] = useState('')
  const [labelPrinter, setLabelPrinter] = useState('')
  const [settingsTab, setSettingsTab] = useState(0)
  const [darkMode, setDarkMode] = useState(() => (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) === 'dark')
  const [textSize, setTextSize] = useState(() => (typeof localStorage !== 'undefined' && localStorage.getItem('textSize')) || 'medium')
  const [visiblePrices, setVisiblePrices] = useState({ pv1: true, pv2: true, pv3: true })
  const [posColors, setPosColors] = useState(() => {
    if (typeof localStorage === 'undefined') return {}
    const c = {}
    for (const k of ['posBg', 'posPrimary', 'posText', 'posHeader', 'posTicket', 'posSummary', 'posCheckout']) c[k] = localStorage.getItem(k) || ''
    return c
  })
  const successTimer = useRef(null)

  useEffect(() => () => { URL.revokeObjectURL(logoPreview) }, [logoPreview])
  useEffect(() => () => { clearTimeout(successTimer.current) }, [])

  // Load printers and saved preferences
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return
    listPrinters().then(({ printers }) => setPrintersList(printers)).catch(() => {})
    import('@tauri-apps/plugin-store').then(({ LazyStore }) => {
      const store = new LazyStore('printer.json')
      store.get('receipt_printer').then(v => { if (v) setReceiptPrinter(v) })
      store.get('label_printer').then(v => { if (v) setLabelPrinter(v) })
    }).catch(() => {})
  }, [])

  async function savePrinterPref(key, value) {
    try {
      const { LazyStore } = await import('@tauri-apps/plugin-store')
      const store = new LazyStore('printer.json')
      await store.set(key, value)
      await store.save()
    } catch {}
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getStoreSettings()
      .then((data) => {
        if (cancelled) return
        const vp = data.visible_prices || { pv1: true, pv2: true, pv3: true }
        setVisiblePrices(vp)
        setForm({
          name:       data.name       || '',
          phone:      data.phone      || '',
          address:    data.address    || '',
          logo_url:   data.logo_url   || '',
          currency:           data.currency           || 'DZD',
          default_sale_price: data.default_sale_price || 1,
          use_vat:            !!data.use_vat,
          pos_expiry_warning: !!data.pos_expiry_warning,
          max_cash_amount:    data.max_cash_amount || 0,
          tap_rate:           data.tap_rate || 2,
          ibs_rate:             data.ibs_rate || 19,
          default_product_mode: data.default_product_mode || 'quick',
          rc:         data.rc         || '',
          nif:        data.nif        || '',
          nis:        data.nis        || '',
          nart:       data.nart       || '',
          compte_rib: data.compte_rib || '',
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function handleLogoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const blob = await compressImage(file)
      setLogoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob) })
      const result = await api.uploadStoreLogo(blob)
      setForm((f) => ({ ...f, logo_url: result.url }))
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setLogoUploading(false)
    }
  }

  function removeLogo() {
    setLogoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return '' })
    setForm((f) => ({ ...f, logo_url: '' }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError(t('storeName') + ' is required'); return }
    setError('')
    setSuccess(false)
    setSaving(true)
    try {
      await api.updateStoreSettings({ ...form, visible_prices: visiblePrices })
      setSuccess(true)
      successTimer.current = setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Layout currentPath={path}>
        <div class="flex justify-center py-20">
          <span class="loading loading-spinner loading-lg text-primary" />
        </div>
      </Layout>
    )
  }

  const logoSrc = logoPreview || form.logo_url
  const hasPrinters = window.__TAURI_INTERNALS__
  const visibleTabs = TABS.filter((_, i) => i !== 3 || hasPrinters)

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('storeSettings')}</h2>
        <button
          class={`btn btn-primary btn-sm ${saving ? 'loading' : ''}`}
          disabled={saving}
          onClick={handleSave}
        >
          {!saving && (
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
          {t('save')}
        </button>
      </div>

      {error && <div class="alert alert-error text-sm py-2 mb-4"><span>{error}</span></div>}
      {success && <div class="alert alert-success text-sm py-2 mb-4"><span>{t('settingsSaved')}</span></div>}

      {/* Tabs */}
      <div class="flex gap-1 mb-5 bg-base-200/60 rounded-lg p-1 overflow-x-auto">
        {visibleTabs.map((key, i) => (
          <button
            key={key}
            type="button"
            onClick={() => setSettingsTab(i)}
            class={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${settingsTab === i ? 'bg-primary text-primary-content shadow-sm' : 'text-base-content/70 hover:text-base-content/80 hover:bg-base-300/50'}`}
          >
            {t(key)}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave}>
        {/* Tab 0: General Info */}
        {settingsTab === 0 && (
          <div class="card bg-base-100 shadow">
            <div class="card-body p-5 space-y-4">
              {/* Logo */}
              <div>
                <span class="label-text text-xs block mb-1">{t('storeLogo')}</span>
                <div class="flex items-center gap-3">
                  {logoSrc
                    ? <img src={logoSrc} alt="logo" class="w-20 h-20 object-contain rounded-xl border border-base-300 bg-base-200 p-1" />
                    : <div class="w-20 h-20 rounded-xl border-2 border-dashed border-base-300 flex items-center justify-center text-base-content/50">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      </div>
                  }
                  <div class="flex flex-col gap-1">
                    <label class="btn btn-sm btn-outline cursor-pointer">
                      {logoUploading
                        ? <span class="loading loading-spinner loading-xs" />
                        : logoSrc ? t('changeImage') : t('addImage')}
                      <input type="file" accept="image/*" class="hidden" onChange={handleLogoSelect} />
                    </label>
                    {logoSrc && !logoUploading && (
                      <button type="button" class="btn btn-xs btn-ghost text-error" onClick={removeLogo}>
                        {t('disable')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label class="form-control sm:col-span-2">
                  <span class="label-text text-xs">{t('storeName')} *</span>
                  <input class="input input-bordered input-sm" value={form.name} required
                    onInput={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">{t('phone')}</span>
                  <input class="input input-bordered input-sm" value={form.phone}
                    onInput={(e) => setForm({ ...form, phone: e.target.value })} />
                </label>
                <label class="form-control sm:col-span-2">
                  <span class="label-text text-xs">{t('storeAddress')}</span>
                  <textarea class="textarea textarea-bordered textarea-sm resize-none" rows={2} value={form.address}
                    onInput={(e) => setForm({ ...form, address: e.target.value })} />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Legal & Fiscal */}
        {settingsTab === 1 && (
          <div class="card bg-base-100 shadow">
            <div class="card-body p-5 space-y-4">
              <div class="flex items-center justify-between bg-base-200 rounded-lg px-4 py-3">
                <div>
                  <p class="text-sm font-medium">{t('useVAT')}</p>
                  <p class="text-xs text-base-content/70">{t('useVATDesc')}</p>
                </div>
                <input type="checkbox" class="toggle toggle-primary toggle-sm"
                  checked={form.use_vat}
                  onChange={(e) => setForm({ ...form, use_vat: e.target.checked })} />
              </div>

              <label class="form-control">
                <span class="label-text text-xs font-medium">{t('maxCashAmount')}</span>
                <span class="label-text-alt text-xs text-base-content/70 mb-1">{t('maxCashAmountDesc')}</span>
                <input type="number" step="any" min="0" class="input input-bordered input-sm font-mono w-full sm:w-64"
                  value={form.max_cash_amount}
                  onInput={(e) => setForm({ ...form, max_cash_amount: parseFloat(e.target.value) || 0 })} />
              </label>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label class="form-control">
                  <span class="label-text text-xs font-medium">{t('tapRate')}</span>
                  <select class="select select-bordered select-sm" value={form.tap_rate}
                    onChange={(e) => setForm({ ...form, tap_rate: Number(e.target.value) })}>
                    <option value={1}>1% — {t('tapProduction')}</option>
                    <option value={2}>2% — {t('tapCommerce')}</option>
                  </select>
                </label>
                <label class="form-control">
                  <span class="label-text text-xs font-medium">{t('ibsRate')}</span>
                  <select class="select select-bordered select-sm" value={form.ibs_rate}
                    onChange={(e) => setForm({ ...form, ibs_rate: Number(e.target.value) })}>
                    <option value={19}>19% — {t('ibsProduction')}</option>
                    <option value={23}>23% — {t('ibsBTP')}</option>
                    <option value={26}>26% — {t('ibsOther')}</option>
                  </select>
                </label>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label class="form-control">
                  <span class="label-text text-xs">{t('storeRC')}</span>
                  <input class="input input-bordered input-sm font-mono" value={form.rc}
                    onInput={(e) => setForm({ ...form, rc: e.target.value })} />
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">{t('storeNIF')}</span>
                  <input class="input input-bordered input-sm font-mono" value={form.nif}
                    onInput={(e) => setForm({ ...form, nif: e.target.value })} />
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">{t('storeNIS')}</span>
                  <input class="input input-bordered input-sm font-mono" value={form.nis}
                    onInput={(e) => setForm({ ...form, nis: e.target.value })} />
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">{t('storeNART')}</span>
                  <input class="input input-bordered input-sm font-mono" value={form.nart}
                    onInput={(e) => setForm({ ...form, nart: e.target.value })} />
                </label>
                <label class="form-control sm:col-span-2">
                  <span class="label-text text-xs">{t('storeRIB')}</span>
                  <input class="input input-bordered input-sm font-mono" value={form.compte_rib}
                    onInput={(e) => setForm({ ...form, compte_rib: e.target.value })} />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Currency & Pricing */}
        {settingsTab === 2 && (
          <div class="card bg-base-100 shadow">
            <div class="card-body p-5 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label class="form-control">
                  <span class="label-text text-xs">{t('currencyCode')}</span>
                  <select class="select select-bordered select-sm" value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </label>
                <div class="form-control justify-end">
                  <div class="bg-base-200 rounded-lg px-4 py-2.5 text-sm">
                    <span class="text-base-content/80 text-xs block mb-0.5">{t('currencySymbol')}</span>
                    <span class="font-bold text-primary text-lg">
                      {CURRENCIES.find(c => c.code === form.currency)?.symbol || form.currency}
                    </span>
                  </div>
                </div>
              </div>

              <div class="bg-base-200 rounded-lg p-3">
                <p class="text-xs text-base-content/80 mb-1">Preview</p>
                <p class="text-sm font-medium">
                  {CURRENCIES.find(c => c.code === form.currency)?.symbol || form.currency}
                  {' '}1,234.56
                </p>
              </div>

              <label class="form-control">
                <span class="label-text text-xs">{t('defaultSalePrice')}</span>
                <div class="join mt-1">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      class={`join-item btn btn-sm ${form.default_sale_price === n ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setForm({ ...form, default_sale_price: n })}
                    >
                      {t('pv' + n)}
                    </button>
                  ))}
                </div>
              </label>

              <div class="bg-base-200 rounded-lg px-4 py-3">
                <p class="text-sm font-medium mb-1">{t('visiblePrices')}</p>
                <p class="text-xs text-base-content/70 mb-2">{t('visiblePricesDesc')}</p>
                <div class="flex gap-4">
                  {['pv1', 'pv2', 'pv3'].map((k, i) => (
                    <label key={k} class="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" class="checkbox checkbox-primary checkbox-sm"
                        checked={visiblePrices[k]}
                        onChange={(e) => {
                          setVisiblePrices(prev => ({ ...prev, [k]: e.target.checked }))
                        }} />
                      <span class="text-sm">{t('pv' + (i + 1))}</span>
                    </label>
                  ))}
                </div>
              </div>

              {hasFeature('batch_tracking') && (
                <div class="flex items-center justify-between bg-base-200 rounded-lg px-4 py-3">
                  <div>
                    <p class="text-sm font-medium">{t('posExpiryWarning')}</p>
                    <p class="text-xs text-base-content/70">{t('posExpiryWarningDesc')}</p>
                  </div>
                  <input type="checkbox" class="toggle toggle-primary toggle-sm"
                    checked={form.pos_expiry_warning}
                    onChange={(e) => setForm({ ...form, pos_expiry_warning: e.target.checked })} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Printer Settings (Tauri only) */}
        {hasPrinters && settingsTab === 3 && (
          <div class="card bg-base-100 shadow">
            <div class="card-body p-5">
              {printersList.length === 0 ? (
                <p class="text-sm text-base-content/70">{t('noPrintersFound') || 'No printers detected'}</p>
              ) : (
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label class="form-control">
                    <span class="label-text text-xs">{t('receiptPrinter') || 'Receipt Printer'}</span>
                    <select class="select select-bordered select-sm" value={receiptPrinter}
                      onChange={(e) => {
                        setReceiptPrinter(e.target.value)
                        savePrinterPref('receipt_printer', e.target.value)
                        savePrinterPref('selected_printer', e.target.value)
                      }}>
                      <option value="">{t('defaultPrinter') || '-- Default --'}</option>
                      {printersList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs">{t('labelPrinter') || 'Label Printer'}</span>
                    <select class="select select-bordered select-sm" value={labelPrinter}
                      onChange={(e) => {
                        setLabelPrinter(e.target.value)
                        savePrinterPref('label_printer', e.target.value)
                      }}>
                      <option value="">{t('defaultPrinter') || '-- Default --'}</option>
                      {printersList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4 (or 3 if no printers): App Preferences */}
        {settingsTab === visibleTabs.indexOf('appPreferences') && visibleTabs.includes('appPreferences') && (
          <div class="card bg-base-100 shadow">
            <div class="card-body p-5 space-y-4">
              <div class="flex items-center justify-between bg-base-200 rounded-lg px-4 py-3">
                <div>
                  <p class="text-sm font-medium">{t('darkMode')}</p>
                  <p class="text-xs text-base-content/70">{t('darkModeDesc')}</p>
                </div>
                <input type="checkbox" class="toggle toggle-primary toggle-sm"
                  checked={darkMode}
                  onChange={(e) => {
                    const on = e.target.checked
                    setDarkMode(on)
                    const theme = on ? 'dark' : 'light'
                    document.documentElement.setAttribute('data-theme', theme)
                    localStorage.setItem('theme', theme)
                  }} />
              </div>

              <div class="flex items-center justify-between bg-base-200 rounded-lg px-4 py-3">
                <div>
                  <p class="text-sm font-medium">{t('textSize')}</p>
                  <p class="text-xs text-base-content/70">{t('textSizeDesc')}</p>
                </div>
                <div class="join">
                  {['small', 'medium', 'large'].map(size => (
                    <button key={size} type="button"
                      class={`join-item btn btn-sm ${textSize === size ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => {
                        setTextSize(size)
                        const sizes = { small: '14px', medium: '16px', large: '18px' }
                        document.documentElement.style.fontSize = sizes[size]
                        localStorage.setItem('textSize', size)
                      }}>
                      <span style={{ fontSize: size === 'small' ? '11px' : size === 'large' ? '15px' : '13px' }}>
                        {t('textSize_' + size)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div class="bg-base-200 rounded-lg px-4 py-3 space-y-3">
                <div class="flex items-center justify-between">
                  <p class="text-sm font-medium">{t('posColors')}</p>
                  {Object.values(posColors).some(Boolean) && (
                    <button type="button" class="btn btn-xs btn-ghost text-error"
                      onClick={() => {
                        const empty = {}
                        for (const k of ['posBg', 'posPrimary', 'posText', 'posHeader', 'posTicket', 'posSummary', 'posCheckout']) {
                          empty[k] = ''
                          localStorage.removeItem(k)
                        }
                        setPosColors(empty)
                      }}>
                      {t('resetAll')}
                    </button>
                  )}
                </div>
                <p class="text-xs text-base-content/70 -mt-1">{t('posColorsDesc')}</p>
                <div class="grid grid-cols-4 sm:grid-cols-7 gap-3">
                  {[
                    { key: 'posBg',       label: t('posBgColor'),       fallback: '#f0f1f5' },
                    { key: 'posPrimary',  label: t('posPrimaryColor'),  fallback: '#6366f1' },
                    { key: 'posText',     label: t('posTextColor'),     fallback: '#1f2937' },
                    { key: 'posHeader',   label: t('posHeaderColor'),   fallback: '#ffffff' },
                    { key: 'posTicket',   label: t('posTicketColor'),   fallback: '#ffffff' },
                    { key: 'posSummary',  label: t('posSummaryColor'),  fallback: '#ffffff' },
                    { key: 'posCheckout', label: t('posCheckoutColor'), fallback: '#6366f1' },
                  ].map(({ key, label, fallback }) => (
                    <div key={key} class="flex flex-col items-center gap-1.5">
                      <input type="color" class="w-10 h-10 rounded-lg cursor-pointer border border-base-300"
                        value={posColors[key] || fallback}
                        onInput={(e) => {
                          setPosColors(c => ({ ...c, [key]: e.target.value }))
                          localStorage.setItem(key, e.target.value)
                        }} />
                      <span class="text-xs text-base-content/70 text-center leading-tight">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div class="flex items-center justify-between bg-base-200 rounded-lg px-4 py-3">
                <div>
                  <p class="text-sm font-medium">{t('defaultProductMode')}</p>
                  <p class="text-xs text-base-content/70">{t('defaultProductModeDesc')}</p>
                </div>
                <div class="join">
                  <button type="button"
                    class={`join-item btn btn-sm ${form.default_product_mode === 'quick' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setForm({ ...form, default_product_mode: 'quick' })}>
                    {t('quick')}
                  </button>
                  <button type="button"
                    class={`join-item btn btn-sm ${form.default_product_mode === 'advanced' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setForm({ ...form, default_product_mode: 'advanced' })}>
                    {t('advanced')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save button at bottom */}
        <div class="flex justify-end mt-4">
          <button
            type="submit"
            class={`btn btn-primary ${saving ? 'loading' : ''}`}
            disabled={saving}
          >
            {!saving && (
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
            {t('save')}
          </button>
        </div>
      </form>
    </Layout>
  )
}
