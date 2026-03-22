import { useState, useEffect, useRef } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { hasFeature } from '../lib/auth'
import { compressImage } from '../lib/imageCompress'

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

const Section = ({ title, icon, children }) => (
  <div class="card bg-base-100 shadow">
    <div class="card-body p-5">
      <h3 class="font-semibold text-base flex items-center gap-2 mb-4">
        <span class="text-primary">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  </div>
)

export default function Settings({ path }) {
  const { t } = useI18n()

  const [form, setForm] = useState({
    name: '', phone: '', address: '', logo_url: '',
    currency: 'DZD',
    default_sale_price: 1,
    use_vat: false,
    pos_expiry_warning: false,
    rc: '', nif: '', nis: '', nart: '', compte_rib: '',
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [logoPreview, setLogoPreview] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const successTimer = useRef(null)

  // Revoke blob URL when it changes or on unmount
  useEffect(() => () => { URL.revokeObjectURL(logoPreview) }, [logoPreview])
  // Clear success timer on unmount
  useEffect(() => () => { clearTimeout(successTimer.current) }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getStoreSettings()
      .then((data) => {
        if (cancelled) return
        setForm({
          name:       data.name       || '',
          phone:      data.phone      || '',
          address:    data.address    || '',
          logo_url:   data.logo_url   || '',
          currency:           data.currency           || 'DZD',
          default_sale_price: data.default_sale_price || 1,
          use_vat:            !!data.use_vat,
          pos_expiry_warning: !!data.pos_expiry_warning,
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
      await api.updateStoreSettings(form)
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

      {error && (
        <div class="alert alert-error text-sm py-2 mb-4">
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div class="alert alert-success text-sm py-2 mb-4">
          <span>{t('settingsSaved')}</span>
        </div>
      )}

      <form onSubmit={handleSave} class="space-y-4">
        {/* General Info */}
        <Section
          title={t('generalInfo')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.375.375 0 00.375-.375v-1.5a.375.375 0 00-.375-.375h-3.75a.375.375 0 00-.375.375v1.5c0 .207.168.375.375.375z" />
            </svg>
          }
        >
          {/* Logo */}
          <div class="mb-4">
            <span class="label-text text-xs block mb-1">{t('storeLogo')}</span>
            <div class="flex items-center gap-3">
              {logoSrc
                ? <img src={logoSrc} alt="logo" class="w-20 h-20 object-contain rounded-xl border border-base-300 bg-base-200 p-1" />
                : <div class="w-20 h-20 rounded-xl border-2 border-dashed border-base-300 flex items-center justify-center text-base-content/30">
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
        </Section>

        {/* Legal & Fiscal */}
        <Section
          title={t('legalInfo')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          }
        >
          <div class="flex items-center justify-between bg-base-200 rounded-lg px-4 py-3 mb-4">
            <div>
              <p class="text-sm font-medium">{t('useVAT')}</p>
              <p class="text-xs text-base-content/50">{t('useVATDesc')}</p>
            </div>
            <input type="checkbox" class="toggle toggle-primary toggle-sm"
              checked={form.use_vat}
              onChange={(e) => setForm({ ...form, use_vat: e.target.checked })} />
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
        </Section>

        {/* Currency */}
        <Section
          title={t('currencySettings')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
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
                <span class="text-base-content/60 text-xs block mb-0.5">{t('currencySymbol')}</span>
                <span class="font-bold text-primary text-lg">
                  {CURRENCIES.find(c => c.code === form.currency)?.symbol || form.currency}
                </span>
              </div>
            </div>
          </div>

          <div class="mt-3 bg-base-200 rounded-lg p-3">
            <p class="text-xs text-base-content/60 mb-1">Preview</p>
            <p class="text-sm font-medium">
              {CURRENCIES.find(c => c.code === form.currency)?.symbol || form.currency}
              {' '}1,234.56
            </p>
          </div>

          <div class="mt-3">
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
          </div>

          {hasFeature('batch_tracking') && (
            <div class="flex items-center justify-between bg-base-200 rounded-lg px-4 py-3 mt-3">
              <div>
                <p class="text-sm font-medium">{t('posExpiryWarning')}</p>
                <p class="text-xs text-base-content/50">{t('posExpiryWarningDesc')}</p>
              </div>
              <input type="checkbox" class="toggle toggle-primary toggle-sm"
                checked={form.pos_expiry_warning}
                onChange={(e) => setForm({ ...form, pos_expiry_warning: e.target.checked })} />
            </div>
          )}
        </Section>

        {/* Save button at bottom too */}
        <div class="flex justify-end">
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
