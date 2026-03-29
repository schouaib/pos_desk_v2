import { useState, useEffect, useMemo } from 'preact/hooks'
import { Modal, openModal, closeModal } from '../../components/Modal'
import { saApi } from '../api'
import { useI18n } from '../../lib/i18n'

const ALL_FEATURES = [
  { key: 'products',           labelKey: 'featProducts',          defaultPrice: 2000 },
  { key: 'purchases',          labelKey: 'featPurchases',         defaultPrice: 2000 },
  { key: 'suppliers',          labelKey: 'featSuppliers',         defaultPrice: 1500 },
  { key: 'sales',              labelKey: 'featSales',             defaultPrice: 2000 },
  { key: 'pos',                labelKey: 'featPOS',               defaultPrice: 5000 },
  { key: 'losses',             labelKey: 'featLosses',            defaultPrice: 1000 },
  { key: 'expenses',           labelKey: 'featExpenses',          defaultPrice: 1000 },
  { key: 'retraits',           labelKey: 'featRetraits',          defaultPrice: 1000 },
  { key: 'stats',              labelKey: 'featStats',             defaultPrice: 3500 },
  { key: 'multi_barcodes',     labelKey: 'featMultiBarcodes',     defaultPrice: 2000 },
  { key: 'product_history',    labelKey: 'featProductHistory',    defaultPrice: 2000 },
  { key: 'clients',            labelKey: 'featClients',           defaultPrice: 2500 },
  { key: 'client_payments',    labelKey: 'featClientPayments',    defaultPrice: 3000 },
  { key: 'user_summary',       labelKey: 'featUserSummary',       defaultPrice: 1500 },
  { key: 'multi_folders',      labelKey: 'featMultiFolders',      defaultPrice: 5000 },
  { key: 'access_management',  labelKey: 'featAccessManagement',  defaultPrice: 5000 },
  { key: 'favorites',          labelKey: 'featFavorites',         defaultPrice: 1000 },
  { key: 'product_variants',   labelKey: 'featProductVariants',   defaultPrice: 4000 },
  { key: 'stock_transfers',    labelKey: 'featStockTransfers',    defaultPrice: 5000 },
  { key: 'product_discounts',  labelKey: 'featProductDiscounts',  defaultPrice: 2500 },
  { key: 'product_bundles',    labelKey: 'featProductBundles',    defaultPrice: 3000 },
  { key: 'batch_tracking',     labelKey: 'featBatchTracking',     defaultPrice: 5000 },
  { key: 'scale',              labelKey: 'featScale',             defaultPrice: 2500 },
  { key: 'facturation',        labelKey: 'featFacturation',       defaultPrice: 5000 },
]

const DEFAULT_PRICES = Object.fromEntries(ALL_FEATURES.map((f) => [f.key, f.defaultPrice]))

const emptyFeatures = { products: false, purchases: false, suppliers: false, sales: false, pos: false, losses: false, expenses: false, retraits: false, stats: false, multi_barcodes: false, product_history: false, clients: false, client_payments: false, user_summary: false, multi_folders: false, access_management: false, favorites: false, product_variants: false, stock_transfers: false, product_discounts: false, product_bundles: false, batch_tracking: false, scale: false, facturation: false }
const emptyPrices = Object.fromEntries(ALL_FEATURES.map((f) => [f.key, 0]))
const empty = { name: '', description: '', max_users: '0', max_products: '0', max_sales_month: '0', features: emptyFeatures, feature_prices: emptyPrices }

export default function Plans() {
  const { t } = useI18n()
  const [plans, setPlans] = useState([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const totalPrice = useMemo(() => {
    return ALL_FEATURES.reduce((sum, f) => {
      if (form.features[f.key]) {
        return sum + (parseFloat(form.feature_prices[f.key]) || 0)
      }
      return sum
    }, 0)
  }, [form.features, form.feature_prices])

  async function load() {
    try { setPlans(await saApi.listPlans()) } catch {}
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null); setForm(empty); setError(''); openModal('sa-plan-modal')
  }

  function openEdit(plan) {
    setEditing(plan)
    const prices = { ...emptyPrices }
    if (plan.feature_prices) {
      Object.keys(plan.feature_prices).forEach((k) => { prices[k] = plan.feature_prices[k] })
    } else {
      ALL_FEATURES.forEach((f) => {
        if (plan.features?.[f.key]) prices[f.key] = f.defaultPrice
      })
    }
    setForm({
      name: plan.name, description: plan.description,
      max_users: plan.max_users, max_products: plan.max_products,
      max_sales_month: plan.max_sales_month ?? 0,
      features: { ...emptyFeatures, ...plan.features },
      feature_prices: prices,
    })
    setError(''); openModal('sa-plan-modal')
  }

  function toggleFeature(key) {
    setForm((f) => {
      const enabled = !f.features[key]
      return {
        ...f,
        features: { ...f.features, [key]: enabled },
        feature_prices: {
          ...f.feature_prices,
          [key]: enabled ? (f.feature_prices[key] || DEFAULT_PRICES[key]) : 0,
        },
      }
    })
  }

  function setFeaturePrice(key, value) {
    setForm((f) => ({
      ...f,
      feature_prices: { ...f.feature_prices, [key]: value },
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const fp = {}
      ALL_FEATURES.forEach((f) => {
        if (form.features[f.key]) fp[f.key] = parseFloat(form.feature_prices[f.key]) || 0
      })
      const body = {
        ...form, price: totalPrice,
        max_users: parseInt(form.max_users), max_products: parseInt(form.max_products),
        max_sales_month: parseInt(form.max_sales_month), feature_prices: fp,
      }
      if (editing) await saApi.updatePlan(editing.id, body)
      else await saApi.createPlan(body)
      closeModal('sa-plan-modal'); load()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function toggleActive(plan) {
    try { await saApi.setPlanActive(plan.id, !plan.active); load() } catch {}
  }

  function formatDA(n) {
    return new Intl.NumberFormat('fr-DZ').format(n) + ' DA'
  }

  function printPlan(plan) {
    const enabledFeatures = ALL_FEATURES.filter((f) => plan.features?.[f.key])
    const fp = plan.feature_prices || {}
    const total = enabledFeatures.reduce((s, f) => s + (fp[f.key] || 0), 0)
    const date = new Date().toLocaleDateString('fr-DZ', { year: 'numeric', month: 'long', day: 'numeric' })

    const featRows = enabledFeatures.map((f, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${t(f.labelKey)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;">${fp[f.key] ? formatDA(fp[f.key]) : '—'}</td>
      </tr>
    `).join('')

    const html = `<!DOCTYPE html>
<html dir="auto">
<head>
  <meta charset="UTF-8">
  <title>${plan.name} — ${t('planDocument')}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
    .header h1 { font-size: 24px; color: #2563eb; margin-bottom: 4px; }
    .header .subtitle { font-size: 13px; color: #6b7280; }
    .header .date { text-align: right; font-size: 12px; color: #6b7280; }
    .header .doc-type { font-size: 16px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; }
    .plan-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
    .plan-info h2 { font-size: 20px; margin-bottom: 6px; }
    .plan-info .desc { color: #6b7280; margin-bottom: 10px; }
    .plan-info .limits { display: flex; gap: 30px; }
    .plan-info .limit-item { font-size: 12px; }
    .plan-info .limit-item strong { font-size: 14px; display: block; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #2563eb; color: white; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    thead th:last-child { text-align: right; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    .total-row { background: #eff6ff !important; }
    .total-row td { font-weight: 700; font-size: 15px; padding: 12px; border-top: 2px solid #2563eb; }
    .terms { margin-top: 30px; page-break-inside: avoid; }
    .terms h3 { font-size: 14px; font-weight: 700; margin-bottom: 10px; color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    .terms ol { padding-left: 20px; }
    .terms li { margin-bottom: 6px; font-size: 11.5px; color: #374151; }
    .signature { margin-top: 40px; display: flex; justify-content: space-between; }
    .signature .box { width: 45%; }
    .signature .box p { font-size: 12px; font-weight: 600; margin-bottom: 40px; }
    .signature .line { border-top: 1px solid #9ca3af; padding-top: 4px; font-size: 11px; color: #6b7280; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>CiPOSdz</h1>
      <div class="subtitle">${t('planDocSubtitle')}</div>
    </div>
    <div class="date">
      <div class="doc-type">${t('planDocument')}</div>
      <div>${date}</div>
      <div>Ref: ${plan.id ? plan.id.slice(-8).toUpperCase() : '—'}</div>
    </div>
  </div>

  <div class="plan-info">
    <h2>${plan.name}</h2>
    ${plan.description ? `<div class="desc">${plan.description}</div>` : ''}
    <div class="limits">
      <div class="limit-item">
        <strong>${plan.max_users === 0 ? '∞' : plan.max_users}</strong>
        ${t('maxUsers')}
      </div>
      <div class="limit-item">
        <strong>${plan.max_products === 0 ? '∞' : plan.max_products}</strong>
        ${t('maxProducts')}
      </div>
      <div class="limit-item">
        <strong>${(!plan.max_sales_month || plan.max_sales_month === 0) ? '∞' : plan.max_sales_month}</strong>
        ${t('maxSalesMonth')}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px">#</th>
        <th>${t('planFeatures')}</th>
        <th style="text-align:right;width:140px">${t('priceDa')}</th>
      </tr>
    </thead>
    <tbody>
      ${featRows}
      <tr class="total-row">
        <td colspan="2" style="text-align:right;padding-right:12px;">${t('totalPrice')}</td>
        <td style="text-align:right;padding:12px;font-family:monospace;">${formatDA(total || plan.price)}</td>
      </tr>
    </tbody>
  </table>

  <div class="terms">
    <h3>${t('termsTitle')}</h3>
    <ol>
      <li>${t('term1')}</li>
      <li>${t('term2')}</li>
      <li>${t('term3')}</li>
      <li>${t('term4')}</li>
      <li>${t('term5')}</li>
      <li>${t('term6')}</li>
      <li>${t('term7')}</li>
      <li>${t('term8')}</li>
    </ol>
  </div>

  <div class="signature">
    <div class="box">
      <p>${t('providerSignature')}</p>
      <div class="line">${t('signatureDate')}</div>
    </div>
    <div class="box">
      <p>${t('clientSignature')}</p>
      <div class="line">${t('signatureDate')}</div>
    </div>
  </div>

  <div class="footer">
    CiPOSdz — ${t('planDocFooter')}
  </div>
</body>
</html>`

    // Use Tauri print_html command, fallback to window.open for browser
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('print_html', { html })
    }).catch(() => {
      const w = window.open('', '_blank')
      if (w) { w.document.write(html); w.document.close(); w.focus(); w.print() }
    })
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('subscriptionPlans')}</h2>
        <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newPlan')}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                {[t('name'), t('priceDa'), t('maxUsers'), t('maxProducts'), t('planFeatures'), t('status'), t('actions')].map((h, i) => (
                  <th key={i} class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/70 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} class="border-b border-base-200">
                  <td class="px-3 py-2.5">
                    <div class="font-medium">{p.name}</div>
                    <div class="text-xs text-base-content/70">{p.description}</div>
                  </td>
                  <td class="px-3 py-2.5 font-medium tabular-nums">{formatDA(p.price)}</td>
                  <td class="px-3 py-2.5 tabular-nums">{p.max_users === 0 ? '∞' : p.max_users}</td>
                  <td class="px-3 py-2.5 tabular-nums">{p.max_products === 0 ? '∞' : p.max_products}</td>
                  <td class="px-3 py-2.5">
                    <div class="flex flex-wrap gap-1 max-w-xs">
                      {ALL_FEATURES.filter((f) => p.features?.[f.key]).map((f) => (
                        <span key={f.key} class="badge badge-xs badge-primary badge-outline">
                          {t(f.labelKey)}
                          {p.feature_prices?.[f.key] ? ` (${formatDA(p.feature_prices[f.key])})` : ''}
                        </span>
                      ))}
                      {!ALL_FEATURES.some((f) => p.features?.[f.key]) && (
                        <span class="text-xs text-base-content/50">—</span>
                      )}
                    </div>
                  </td>
                  <td class="px-3 py-2.5">
                    <span class={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.active ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                      {p.active ? t('active') : t('disabled')}
                    </span>
                  </td>
                  <td class="px-3 py-2.5">
                    <div class="flex gap-1">
                      <button class="btn btn-xs btn-ghost border border-base-300" onClick={() => openEdit(p)}>{t('edit')}</button>
                      <button class="btn btn-xs btn-ghost border border-base-300" onClick={() => printPlan(p)}>{t('print')}</button>
                      <button class={`btn btn-xs btn-ghost border ${p.active ? 'border-error text-error' : 'border-success text-success'}`} onClick={() => toggleActive(p)}>
                        {p.active ? t('disable') : t('enable')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr><td colSpan={7} class="px-3 py-12 text-center text-base-content/70">{t('noPlans')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal id="sa-plan-modal" title={editing ? t('editPlan') : t('newPlanTitle')}>
        {error && <div class="alert alert-error text-sm py-2 mb-3"><span>{error}</span></div>}
        <form onSubmit={handleSubmit} class="space-y-3">
          <label class="form-control">
            <span class="label-text text-sm">{t('name')}</span>
            <input class="input input-bordered input-sm" value={form.name} onInput={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label class="form-control">
            <span class="label-text text-sm">{t('description')}</span>
            <input class="input input-bordered input-sm" value={form.description} onInput={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div class="grid grid-cols-3 gap-2">
            <label class="form-control">
              <span class="label-text text-sm">{t('maxUsers')} (0=∞)</span>
              <input type="number" min="0" class="input input-bordered input-sm" value={form.max_users} onInput={(e) => setForm({ ...form, max_users: e.target.value })} required />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('maxProducts')} (0=∞)</span>
              <input type="number" min="0" class="input input-bordered input-sm" value={form.max_products} onInput={(e) => setForm({ ...form, max_products: e.target.value })} required />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('maxSalesMonth')} (0=∞)</span>
              <input type="number" min="0" class="input input-bordered input-sm" value={form.max_sales_month} onInput={(e) => setForm({ ...form, max_sales_month: e.target.value })} required />
            </label>
          </div>
          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="label-text text-sm font-medium">{t('planFeatures')}</p>
              <div class="text-sm font-bold text-primary">{t('totalPrice')}: {formatDA(totalPrice)}</div>
            </div>
            <div class="border border-base-300 rounded-lg p-3 space-y-1.5">
              {ALL_FEATURES.map((f) => (
                <div key={f.key} class="flex items-center gap-2">
                  <label class="flex items-center gap-2 cursor-pointer select-none min-w-[200px]">
                    <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked={!!form.features[f.key]} onChange={() => toggleFeature(f.key)} />
                    <span class="text-sm">{t(f.labelKey)}</span>
                  </label>
                  {form.features[f.key] && (
                    <div class="flex items-center gap-1 ml-auto">
                      <input
                        type="number" min="0" step="100"
                        class="input input-bordered input-xs w-24 text-right tabular-nums"
                        value={form.feature_prices[f.key]}
                        onInput={(e) => setFeaturePrice(f.key, e.target.value)}
                      />
                      <span class="text-xs text-base-content/70">DA</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div class="modal-action">
            <button type="submit" class={`btn btn-primary btn-sm ${loading ? 'loading' : ''}`} disabled={loading}>
              {editing ? t('saveChanges') : t('createPlan')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
