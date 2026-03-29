import { useState, useEffect } from 'preact/hooks'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { toast } from './Toast'

const emptyForm = {
  name: '', barcode: '', prix_achat: 0, prix_vente_1: 0, prix_vente_2: 0, prix_vente_3: 0, vat: 0,
}

export function QuickAddProductModal({ open, onClose, onCreated }) {
  const { t } = useI18n()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [defaultSalePrice, setDefaultSalePrice] = useState(1)
  const [useVAT, setUseVAT] = useState(false)

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })) }
  function close() { setForm(emptyForm); setError(''); onClose() }

  useEffect(() => {
    api.getStoreSettings().then(d => {
      if (d) {
        setDefaultSalePrice(d.default_sale_price || 1)
        setUseVAT(!!d.use_vat)
      }
    }).catch(() => {})
  }, [])

  const priceKey = defaultSalePrice === 2 ? 'prix_vente_2' : defaultSalePrice === 3 ? 'prix_vente_3' : 'prix_vente_1'
  const priceLabel = defaultSalePrice === 2 ? t('prixVente2') : defaultSalePrice === 3 ? t('prixVente3') : t('prixVente1')

  async function generateBarcode() {
    try {
      const code = await api.generateBarcode()
      if (code) set('barcode', typeof code === 'string' ? code : code.barcode || '')
    } catch {}
  }

  async function handleSave() {
    if (!form.name.trim()) { setError(t('required')); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        barcodes: form.barcode.trim() ? [form.barcode.trim()] : [],
        prix_achat: form.prix_achat,
        prix_vente_1: form.prix_vente_1,
        prix_vente_2: form.prix_vente_2,
        prix_vente_3: form.prix_vente_3,
        vat: form.vat,
      }
      const created = await api.createProduct(payload)
      toast(t('productCreated'), 'success')
      setForm(emptyForm)
      onCreated?.(created)
      onClose()
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('plan_expired')) setError(t('errPlanExpired'))
      else if (msg.includes('product_limit')) setError(t('errProductLimit'))
      else setError(msg || t('errorOccurred'))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const margin = form.prix_achat > 0 && form[priceKey] > 0
    ? (((form[priceKey] - form.prix_achat) / form.prix_achat) * 100).toFixed(1)
    : null

  return (
    <dialog class="modal modal-bottom sm:modal-middle" open>
      <div class="modal-box w-full sm:max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div class="flex items-center justify-between px-5 pt-5 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <h3 class="font-bold text-lg">{t('quickAddProduct')}</h3>
          </div>
          <button class="btn btn-sm btn-ghost btn-circle opacity-50 hover:opacity-100" onClick={close}>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="px-5 pb-5 space-y-4">
          {error && (
            <div class="alert alert-error text-sm py-2.5 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Product Name */}
          <label class="form-control w-full">
            <div class="label py-1">
              <span class="label-text text-sm font-semibold">{t('productName')} <span class="text-error">*</span></span>
            </div>
            <input
              class="input input-bordered focus:input-primary transition-colors"
              value={form.name}
              onInput={(e) => set('name', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder={t('productName')}
              autoFocus
            />
          </label>

          {/* Barcode */}
          <div class="form-control w-full">
            <div class="label py-1">
              <span class="label-text text-sm font-semibold">{t('barcodes')}</span>
            </div>
            <div class="join w-full">
              <input
                class="input input-bordered join-item flex-1 focus:input-primary transition-colors"
                value={form.barcode}
                onInput={(e) => set('barcode', e.target.value)}
                placeholder={t('barcodes')}
              />
              <button class="btn btn-secondary join-item gap-1.5 no-animation" type="button" onClick={generateBarcode}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" /></svg>
                {t('generateBarcode')}
              </button>
            </div>
            {form.barcode && (
              <div class="mt-2 flex items-center gap-2 px-3 py-1.5 bg-base-200/50 rounded-lg">
                <span class="text-xs font-mono text-base-content/75 truncate flex-1">{form.barcode}</span>
                <button type="button" class="text-error/50 hover:text-error text-lg leading-none" onClick={() => set('barcode', '')}>×</button>
              </div>
            )}
          </div>

          {/* Pricing Card */}
          <div class="rounded-xl border border-base-300/60 overflow-hidden">
            <div class="bg-base-200/50 px-4 py-2.5 flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-base-content/60">{t('pricing')}</span>
              {margin !== null && (
                <span class={`badge badge-sm font-mono ${parseFloat(margin) >= 0 ? 'badge-success' : 'badge-error'}`}>
                  {parseFloat(margin) >= 0 ? '+' : ''}{margin}%
                </span>
              )}
            </div>
            <div class="p-4">
              <div class="grid grid-cols-2 gap-3">
                <label class="form-control">
                  <div class="label py-0.5">
                    <span class="label-text text-sm">{t('prixAchat')}</span>
                  </div>
                  <input type="number" min="0" step="any" class="input input-bordered focus:input-primary transition-colors"
                    value={form.prix_achat}
                    onInput={(e) => set('prix_achat', parseFloat(e.target.value) || 0)} />
                </label>
                <label class="form-control">
                  <div class="label py-0.5">
                    <span class="label-text text-sm font-semibold">{priceLabel} <span class="text-error">*</span></span>
                  </div>
                  <input type="number" min="0" step="any" class="input input-bordered focus:input-primary transition-colors"
                    value={form[priceKey]}
                    onInput={(e) => set(priceKey, parseFloat(e.target.value) || 0)} />
                </label>
              </div>
            </div>
          </div>

          {/* VAT — only if activated */}
          {useVAT && (
            <label class="form-control w-44">
              <div class="label py-0.5">
                <span class="label-text text-sm">{t('vatRate')}</span>
              </div>
              <div class="relative">
                <input type="number" min="0" max="100" step="any" class="input input-bordered w-full pe-10 focus:input-primary transition-colors"
                  value={form.vat}
                  onInput={(e) => set('vat', parseFloat(e.target.value) || 0)} />
                <span class="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-base-content/50 pointer-events-none font-medium">%</span>
              </div>
            </label>
          )}

          {/* Actions */}
          <div class="flex items-center justify-end gap-2 pt-2 border-t border-base-200">
            <button class="btn btn-ghost" onClick={close}>
              {t('back')}
            </button>
            <button class="btn btn-primary gap-2 min-w-[120px]" onClick={handleSave} disabled={saving}>
              {saving
                ? <span class="loading loading-spinner loading-sm" />
                : <>
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    {t('saveChanges')}
                  </>
              }
            </button>
          </div>
        </div>
      </div>
      <div class="modal-backdrop" onClick={close} />
    </dialog>
  )
}
